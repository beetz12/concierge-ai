import { GoogleGenAI } from "@google/genai";
import { GooglePlacesService } from "./places/google-places.service.js";
import { ProviderEnrichmentService } from "./research/enrichment.service.js";

// Types matching frontend interfaces
export interface Provider {
  id: string;
  name: string;
  phone?: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
  distance?: number;
  distanceText?: string;
  hoursOfOperation?: string;
  isOpenNow?: boolean;
  googleMapsUri?: string;
  reason?: string;
  source?: "Google Maps" | "User Input";
  placeId?: string;
  internationalPhone?: string;
  website?: string;
}

export interface InteractionLog {
  timestamp: string;
  stepName: string;
  detail: string;
  transcript?: { speaker: string; text: string }[];
  status: "success" | "warning" | "error" | "info";
}

export interface SearchProvidersResult {
  providers: Provider[];
  totalFound?: number;
  filteredCount?: number;
  logs: InteractionLog;
}

export interface SelectBestProviderResult {
  selectedId: string | null;
  reasoning: string;
}

export interface SearchProvidersOptions {
  minRating?: number;
  maxDistance?: number;
  requirePhone?: boolean;
  minReviewCount?: number;
  maxResults?: number;  // Maximum number of providers to return (default: 10)
  minEnrichedResults?: number;  // Minimum providers with phone after enrichment (default: 3)
}

// Initialize GoogleGenAI client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey });
};

// Lazy-initialized Places service
let placesService: GooglePlacesService | null = null;
const getPlacesService = (): GooglePlacesService | null => {
  if (placesService === null) {
    try {
      placesService = new GooglePlacesService();
    } catch (error) {
      console.warn("Google Places API not available:", error);
      return null;
    }
  }
  return placesService;
};

// Lazy-initialized Enrichment service
let enrichmentService: ProviderEnrichmentService | null = null;
const getEnrichmentService = (): ProviderEnrichmentService => {
  if (enrichmentService === null) {
    enrichmentService = new ProviderEnrichmentService();
  }
  return enrichmentService;
};

// Helper to sanitize JSON strings from model output
const cleanJson = (text: string): string => {
  if (!text) return "[]";

  const match = text.match(/(\[|\{)[\s\S]*(\]|\})/);
  if (match) {
    return match[0];
  }
  return text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
};

// Calculate distance between two coordinates (Haversine formula)
const calculateDistance = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((from.latitude * Math.PI) / 180) *
      Math.cos((to.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
};

/**
 * Step 1: Search for providers using Google Places API (primary) with Maps Grounding fallback
 * Now returns up to 10 providers with comprehensive data
 */
export const searchProviders = async (
  query: string,
  location: string,
  coordinates?: { latitude: number; longitude: number },
  options: SearchProvidersOptions = {}
): Promise<SearchProvidersResult> => {
  const { minRating = 4.0, maxDistance = 25, requirePhone = false, minReviewCount, maxResults = 10, minEnrichedResults = 3 } = options;

  // Default to Greenville, SC coordinates if not provided
  const latLng = coordinates || { latitude: 34.8526, longitude: -82.394 };

  try {
    // PRIMARY: Try Google Places API first
    const places = getPlacesService();
    if (places) {
      try {
        const searchQuery = `${query} near ${location}`;
        const searchResponse = await places.textSearch(searchQuery, latLng, 50000);

        if (searchResponse.places.length > 0) {
          // Transform to Provider format with distance calculation
          let providers: Provider[] = searchResponse.places.map((place, index) => {
            const distanceMiles = calculateDistance(latLng, place.location);
            return {
              id: place.placeId || `places-${Date.now()}-${index}`,
              name: place.name,
              address: place.formattedAddress,
              rating: place.rating,
              reviewCount: place.userRatingsTotal,
              distance: distanceMiles,
              distanceText: `${distanceMiles} mi`,
              googleMapsUri: place.googleMapsUri,
              source: "Google Maps" as const,
              reason: `Highly rated ${query} in ${location}`,
              placeId: place.placeId, // Store placeId for enrichment
            };
          });

          // Apply initial filters (NOT phone - we'll enrich first)
          providers = providers.filter((p) => {
            if (minRating && (p.rating === undefined || p.rating < minRating)) return false;
            if (maxDistance && p.distance && p.distance > maxDistance) return false;
            if (minReviewCount && (p.reviewCount === undefined || p.reviewCount < minReviewCount)) return false;
            return true;
          });

          // Sort by distance (closest first)
          providers.sort((a, b) => (a.distance || 999) - (b.distance || 999));

          // Use shared enrichment service for phone/hours data
          // Cast to shared Provider type (compatible fields)
          const enrichService = getEnrichmentService();
          const enrichmentResult = await enrichService.enrich(providers as any, {
            coordinates: latLng,
            maxToEnrich: requirePhone ? Math.max(maxResults, 5) : maxResults,
            requirePhone,
            minEnrichedResults,
          });

          // Get enriched providers and limit to maxResults
          // Map back to gemini.ts Provider format (convert hoursOfOperation array to string)
          let topProviders: Provider[] = enrichmentResult.providers.slice(0, maxResults).map(p => ({
            ...p,
            source: p.source as Provider["source"],
            hoursOfOperation: Array.isArray(p.hoursOfOperation)
              ? p.hoursOfOperation.join(', ')
              : p.hoursOfOperation,
          }));

          console.log(`Enrichment stats:`, enrichmentResult.stats);

          return {
            providers: topProviders,
            totalFound: searchResponse.places.length,
            filteredCount: topProviders.length,
            logs: {
              timestamp: new Date().toISOString(),
              stepName: "Market Research",
              detail: `Found ${topProviders.length} providers via Google Places API (${searchResponse.places.length} total, enriched with phone data).`,
              status: topProviders.length > 0 ? "success" : "warning",
            },
          };
        }
      } catch (placesError) {
        console.error("Google Places API search failed, falling back to Maps grounding:", placesError);
      }
    }

    // FALLBACK: Use Google Maps Grounding
    const ai = getAiClient();
    const prompt = `Find 10-15 top-rated ${query} near ${location}.
Only include providers with ratings of ${minRating} or higher.
For each provider, include: name, address, phone number (if available), rating.
Return a pure JSON array with these fields: name, address, phone, rating.
Do not include any markdown formatting.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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

    const groundingChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    let providers: Provider[] = [];

    if (groundingChunks) {
      groundingChunks.forEach((chunk: any, index: number) => {
        if (chunk.maps) {
          providers.push({
            id: `prov-${Date.now()}-${index}`,
            name: chunk.maps.title || "Unknown Provider",
            address: chunk.maps.placeAddress || "Address not available",
            phone: chunk.maps.phoneNumber,
            rating: chunk.maps.rating || 4.5,
            source: "Google Maps",
            reason: `Highly rated ${query} in ${location}`,
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
              phone: p.phone,
              rating: p.rating,
              source: "Google Maps",
              reason: `Recommended ${query} in ${location}`,
            });
          });
        }
      } catch (e) {
        console.error("Failed to parse JSON fallback", e, response.text);
      }
    }

    // Remove duplicates and apply filters
    const uniqueProviders = providers
      .filter((v, i, a) => a.findIndex((v2) => v2.name === v.name) === i)
      .filter((p) => {
        if (minRating && (p.rating === undefined || p.rating < minRating)) return false;
        if (requirePhone && !p.phone) return false;
        return true;
      })
      .slice(0, maxResults);

    return {
      providers: uniqueProviders,
      totalFound: providers.length,
      filteredCount: uniqueProviders.length,
      logs: {
        timestamp: new Date().toISOString(),
        stepName: "Market Research",
        detail: `Identified ${uniqueProviders.length} potential candidates in ${location}.`,
        status: uniqueProviders.length > 0 ? "success" : "warning",
      },
    };
  } catch (error: any) {
    console.error("searchProviders error:", error);
    return {
      providers: [],
      logs: {
        timestamp: new Date().toISOString(),
        stepName: "Market Research",
        detail: `Failed to find providers: ${error.message}`,
        status: "error",
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
  isDirect: boolean,
): Promise<InteractionLog> => {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";

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
        responseMimeType: "application/json",
      },
    });

    const data = JSON.parse(cleanJson(response.text || "{}"));

    return {
      timestamp: new Date().toISOString(),
      stepName: isDirect
        ? `Calling ${providerName}`
        : `Vetting ${providerName}`,
      detail: data.summary,
      transcript: data.transcript,
      status:
        data.outcome === "positive"
          ? "success"
          : data.outcome === "negative"
            ? "error"
            : "warning",
    };
  } catch (error: any) {
    console.error("simulateCall error:", error);
    return {
      timestamp: new Date().toISOString(),
      stepName: `Calling ${providerName}`,
      detail: "Call failed to connect or dropped.",
      status: "error",
    };
  }
};

/**
 * Step 3: Analyze all results and pick a winner
 */
export const selectBestProvider = async (
  requestTitle: string,
  interactions: InteractionLog[],
  providers: Provider[],
): Promise<SelectBestProviderResult> => {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";

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
      config: { responseMimeType: "application/json" },
    });

    const data = JSON.parse(cleanJson(response.text || "{}"));

    return {
      selectedId: data.selectedProviderId,
      reasoning: data.reasoning,
    };
  } catch (error: any) {
    console.error("selectBestProvider error:", error);
    return { selectedId: null, reasoning: "AI Analysis failed." };
  }
};

/**
 * Step 4: Schedule appointment (Simulated)
 */
export const scheduleAppointment = async (
  providerName: string,
  details: string,
): Promise<InteractionLog> => {
  // Simulate scheduling delay
  await new Promise((r) => setTimeout(r, 1500));

  return {
    timestamp: new Date().toISOString(),
    stepName: "Booking Appointment",
    detail: `Appointment confirmed with ${providerName}. Confirmation email sent to user.`,
    status: "success",
  };
};
