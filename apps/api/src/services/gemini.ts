import { GoogleGenAI } from '@google/genai';

// Types matching frontend interfaces
export interface Provider {
  id: string;
  name: string;
  phone?: string;
  rating?: number;
  address?: string;
  source?: 'Google Maps' | 'User Input';
}

export interface InteractionLog {
  timestamp: string;
  stepName: string;
  detail: string;
  transcript?: { speaker: string; text: string }[];
  status: 'success' | 'warning' | 'error' | 'info';
}

export interface SearchProvidersResult {
  providers: Provider[];
  logs: InteractionLog;
}

export interface SelectBestProviderResult {
  selectedId: string | null;
  reasoning: string;
}

// Initialize GoogleGenAI client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }
  return new GoogleGenAI({ apiKey });
};

// Helper to sanitize JSON strings from model output
const cleanJson = (text: string): string => {
  if (!text) return '[]';

  const match = text.match(/(\[|\{)[\s\S]*(\]|\})/);
  if (match) {
    return match[0];
  }
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

/**
 * Step 1: Search for providers using Google Maps Grounding
 */
export const searchProviders = async (
  query: string,
  location: string,
  coordinates?: { latitude: number; longitude: number }
): Promise<SearchProvidersResult> => {
  try {
    const ai = getAiClient();
    const prompt = `Find 3-4 top-rated ${query} near ${location}. Return a pure JSON array of objects with these exact fields: name, address, rating (number). Do not include any markdown formatting.`;

    // Default to Greenville, SC coordinates if not provided
    const latLng = coordinates || { latitude: 34.8526, longitude: -82.394 };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng,
          },
        },
      },
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const providers: Provider[] = [];

    if (groundingChunks) {
      groundingChunks.forEach((chunk: any, index: number) => {
        if (chunk.maps) {
          providers.push({
            id: `prov-${Date.now()}-${index}`,
            name: chunk.maps.title || 'Unknown Provider',
            address: chunk.maps.placeAddress || 'Address not available',
            rating: 4.5,
            source: 'Google Maps',
          });
        }
      });
    }

    // Fallback to parsing text response if no grounding chunks
    if (providers.length === 0 && response.text) {
      try {
        const cleanedText = cleanJson(response.text);
        const parsed = JSON.parse(cleanedText);
        if (Array.isArray(parsed)) {
          parsed.forEach((p, idx) => {
            providers.push({
              id: `prov-${Date.now()}-${idx}`,
              name: p.name,
              address: p.address,
              rating: p.rating,
              source: 'Google Maps',
            });
          });
        }
      } catch (e) {
        console.error('Failed to parse JSON fallback', e, response.text);
      }
    }

    // Remove duplicates and limit to 3 providers
    const uniqueProviders = providers
      .filter((v, i, a) => a.findIndex((v2) => v2.name === v.name) === i)
      .slice(0, 3);

    return {
      providers: uniqueProviders,
      logs: {
        timestamp: new Date().toISOString(),
        stepName: 'Market Research',
        detail: `Identified ${uniqueProviders.length} potential candidates in ${location}.`,
        status: uniqueProviders.length > 0 ? 'success' : 'warning',
      },
    };
  } catch (error: any) {
    console.error('searchProviders error:', error);
    return {
      providers: [],
      logs: {
        timestamp: new Date().toISOString(),
        stepName: 'Market Research',
        detail: `Failed to find providers: ${error.message}`,
        status: 'error',
      },
    };
  }
};

/**
 * Step 2: Simulate a phone call to a provider
 */
export const simulateCall = async (
  providerName: string,
  userCriteria: string,
  isDirect: boolean
): Promise<InteractionLog> => {
  const ai = getAiClient();
  const model = 'gemini-2.5-flash';

  const systemInstruction = `You are a simulator that generates a realistic phone conversation transcript between an AI Receptionist (calling on behalf of a client) and a Service Provider (${providerName}).

  Client Needs: ${userCriteria}

  Rules:
  1. The Provider should answer professionally but might be busy.
  2. The AI Receptionist must ask about availability, rates, and the specific criteria.
  3. The Provider's answers should be realistic (sometimes they are available, sometimes booked, sometimes expensive).
  4. Return ONLY the JSON object.
  `;

  const prompt = `Generate a transcript.
  Output JSON format:
  {
    "outcome": "positive" | "negative" | "neutral",
    "summary": "Short summary of findings (e.g., Available Tuesday, $150/hr).",
    "transcript": [
      {"speaker": "AI", "text": "..."},
      {"speaker": "Provider", "text": "..."}
    ]
  }`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const data = JSON.parse(cleanJson(response.text || '{}'));

    return {
      timestamp: new Date().toISOString(),
      stepName: isDirect ? `Calling ${providerName}` : `Vetting ${providerName}`,
      detail: data.summary,
      transcript: data.transcript,
      status: data.outcome === 'positive' ? 'success' : data.outcome === 'negative' ? 'error' : 'warning',
    };
  } catch (error: any) {
    console.error('simulateCall error:', error);
    return {
      timestamp: new Date().toISOString(),
      stepName: `Calling ${providerName}`,
      detail: 'Call failed to connect or dropped.',
      status: 'error',
    };
  }
};

/**
 * Step 3: Analyze all results and pick a winner
 */
export const selectBestProvider = async (
  requestTitle: string,
  interactions: InteractionLog[],
  providers: Provider[]
): Promise<SelectBestProviderResult> => {
  const ai = getAiClient();
  const model = 'gemini-2.5-flash';

  const prompt = `
    I have researched providers for: "${requestTitle}".
    Here are the logs from my calls:
    ${JSON.stringify(interactions)}

    Here is the list of providers mapped to those calls (by name):
    ${JSON.stringify(providers)}

    Select the best provider ID based on the positive outcomes and criteria match.
    If none are good, return null.

    Return JSON:
    {
      "selectedProviderId": "string or null",
      "reasoning": "Explanation of why this provider was chosen over others."
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const data = JSON.parse(cleanJson(response.text || '{}'));

    return {
      selectedId: data.selectedProviderId,
      reasoning: data.reasoning,
    };
  } catch (error: any) {
    console.error('selectBestProvider error:', error);
    return { selectedId: null, reasoning: 'AI Analysis failed.' };
  }
};

/**
 * Step 4: Schedule appointment (Simulated)
 */
export const scheduleAppointment = async (
  providerName: string,
  details: string
): Promise<InteractionLog> => {
  // Simulate scheduling delay
  await new Promise((r) => setTimeout(r, 1500));

  return {
    timestamp: new Date().toISOString(),
    stepName: 'Booking Appointment',
    detail: `Appointment confirmed with ${providerName}. Confirmation email sent to user.`,
    status: 'success',
  };
};
