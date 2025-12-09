/**
 * Example: Integrating Google Places API with existing Gemini service
 *
 * This file demonstrates how to update the searchProviders function
 * to enrich provider data with Places API
 */

import { GoogleGenAI } from "@google/genai";
import {
  fetchPlaceDetails,
  calculateDistance,
  isOpenNow,
  getTodayHours,
  formatPriceLevel,
  type PlaceDetails,
} from "./services/places-api";

// Enhanced Provider interface with all available data
export interface EnhancedProvider {
  // Basic info (from grounding)
  id: string;
  name: string;
  placeId?: string;
  mapsUri?: string;

  // Contact information (from Places API)
  phone?: string;
  internationalPhone?: string;
  website?: string;

  // Business information (from Places API)
  rating?: number;
  reviewCount?: number;
  priceLevel?: string; // Formatted: $, $$, $$$, $$$$
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";

  // Location & Distance
  address?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  distance?: {
    meters: number;
    text: string; // e.g., "2.3 mi"
  };

  // Hours of operation (from Places API)
  openingHours?: {
    openNow: boolean;
    todayHours?: string; // e.g., "Monday: 9:00 AM – 5:00 PM"
    weekdayText?: string[];
  };

  // Metadata
  source: "Google Maps" | "User Input";
  enriched: boolean; // True if Places API data was successfully fetched
}

export interface InteractionLog {
  timestamp: string;
  stepName: string;
  detail: string;
  transcript?: { speaker: string; text: string }[];
  status: "success" | "warning" | "error" | "info";
}

export interface SearchProvidersResult {
  providers: EnhancedProvider[];
  logs: InteractionLog;
}

/**
 * Step 1: Search for providers using Google Maps Grounding + Places API Enrichment
 */
export async function searchProvidersEnhanced(
  query: string,
  location: string,
  coordinates?: { latitude: number; longitude: number },
): Promise<SearchProvidersResult> {
  try {
    // Initialize Gemini client
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!mapsApiKey) throw new Error("GOOGLE_MAPS_API_KEY not configured");

    const ai = new GoogleGenAI({ apiKey });

    // Default to Greenville, SC if no coordinates provided
    const latLng = coordinates || { latitude: 34.8526, longitude: -82.394 };

    // Optimized prompt for Google Maps grounding
    const prompt = `You are a local business research assistant with access to Google Maps data.

Task: Find the top 3-4 ${query} near ${location} (${latLng.latitude}, ${latLng.longitude}).

Search Criteria:
- Only include businesses that are currently operational
- Prioritize higher-rated businesses (4.0+ stars preferred)
- Include businesses with recent reviews
- Focus on businesses within 10 miles of the specified location

For each business you find, provide:
1. The official business name
2. A brief explanation of why this business is a good match
3. Any standout features or specialties

Use Google Maps to find accurate, up-to-date information about local businesses.`;

    console.log("🔍 Searching with Gemini + Maps grounding...");

    // Step 1: Get grounded results from Gemini
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: { latLng },
        },
      },
    });

    const groundingChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks;

    if (!groundingChunks || groundingChunks.length === 0) {
      return {
        providers: [],
        logs: {
          timestamp: new Date().toISOString(),
          stepName: "Market Research",
          detail:
            "No providers found with Maps grounding. The query may be too specific or the location may not have matching businesses.",
          status: "warning",
        },
      };
    }

    console.log(`✅ Found ${groundingChunks.length} grounding chunks`);

    const providers: EnhancedProvider[] = [];

    // Step 2: Enrich each provider with Places API data
    for (let i = 0; i < groundingChunks.length; i++) {
      const chunk = groundingChunks[i];

      if (!chunk.maps?.placeId) {
        console.warn(`⚠️  Chunk ${i} missing placeId, skipping enrichment`);
        continue;
      }

      const { placeId, uri, title } = chunk.maps;

      try {
        console.log(`📍 Enriching: ${title} (${placeId})`);

        // Fetch detailed information from Places API
        const placeDetails: PlaceDetails = await fetchPlaceDetails(
          placeId,
          mapsApiKey,
        );

        // Calculate distance from user location
        const distance = calculateDistance(
          latLng.latitude,
          latLng.longitude,
          placeDetails.location.latitude,
          placeDetails.location.longitude,
        );

        // Build enhanced provider object
        const provider: EnhancedProvider = {
          id: `prov-${Date.now()}-${i}`,
          name: placeDetails.displayName.text,
          placeId,
          mapsUri: uri,

          // Contact info
          phone: placeDetails.nationalPhoneNumber,
          internationalPhone: placeDetails.internationalPhoneNumber,
          website: placeDetails.websiteUri,

          // Business info
          rating: placeDetails.rating,
          reviewCount: placeDetails.userRatingCount,
          priceLevel: formatPriceLevel(placeDetails.priceLevel),
          businessStatus: placeDetails.businessStatus,

          // Location
          address: placeDetails.formattedAddress,
          location: placeDetails.location,
          distance,

          // Hours
          openingHours: placeDetails.currentOpeningHours
            ? {
                openNow: isOpenNow(placeDetails.currentOpeningHours),
                todayHours:
                  getTodayHours(placeDetails.currentOpeningHours) || undefined,
                weekdayText:
                  placeDetails.currentOpeningHours.weekdayDescriptions,
              }
            : undefined,

          // Metadata
          source: "Google Maps",
          enriched: true,
        };

        providers.push(provider);

        console.log(`✅ Enriched: ${provider.name}`);
        console.log(`   📍 ${distance.text} away`);
        console.log(
          `   ⭐ ${provider.rating || "N/A"} (${provider.reviewCount || 0} reviews)`,
        );
        console.log(`   📞 ${provider.phone || "No phone"}`);
        console.log(
          `   ${provider.openingHours?.openNow ? "🟢 Open now" : "🔴 Closed"}`,
        );
      } catch (error) {
        console.error(`❌ Failed to enrich ${title}:`, error);

        // Fallback to basic data from grounding
        providers.push({
          id: `prov-${Date.now()}-${i}`,
          name: title,
          placeId,
          mapsUri: uri,
          source: "Google Maps",
          enriched: false,
        });
      }
    }

    // Sort by distance (closest first)
    providers.sort((a, b) => {
      if (!a.distance || !b.distance) return 0;
      return a.distance.meters - b.distance.meters;
    });

    // Limit to top 3 providers
    const topProviders = providers.slice(0, 3);

    // Generate summary for logs
    const enrichedCount = topProviders.filter((p) => p.enriched).length;
    const avgRating =
      topProviders
        .filter((p) => p.rating)
        .reduce((sum, p) => sum + (p.rating || 0), 0) / topProviders.length;

    const detail = `Found ${topProviders.length} providers in ${location}. ${enrichedCount} enriched with ratings, hours, and contact info. Average rating: ${avgRating.toFixed(1)}★`;

    return {
      providers: topProviders,
      logs: {
        timestamp: new Date().toISOString(),
        stepName: "Market Research",
        detail,
        status: topProviders.length > 0 ? "success" : "warning",
      },
    };
  } catch (error: any) {
    console.error("❌ searchProvidersEnhanced error:", error);
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
}

/**
 * Example usage in API endpoint
 */
export async function exampleUsage() {
  const result = await searchProvidersEnhanced("plumbers", "Greenville, SC", {
    latitude: 34.8526,
    longitude: -82.394,
  });

  console.log("\n📊 Search Results:");
  console.log("==================");

  result.providers.forEach((provider, index) => {
    console.log(`\n${index + 1}. ${provider.name}`);
    console.log(`   📍 ${provider.address}`);
    console.log(`   🗺️  ${provider.distance?.text} away`);
    console.log(
      `   ⭐ ${provider.rating || "N/A"} (${provider.reviewCount || 0} reviews)`,
    );
    console.log(`   📞 ${provider.phone || "No phone available"}`);
    console.log(`   💰 ${provider.priceLevel || "N/A"}`);
    console.log(
      `   ${provider.openingHours?.openNow ? "🟢 Open now" : "🔴 Closed"}`,
    );

    if (provider.openingHours?.todayHours) {
      console.log(`   🕒 ${provider.openingHours.todayHours}`);
    }

    if (provider.website) {
      console.log(`   🌐 ${provider.website}`);
    }
  });

  console.log(`\n${result.logs.detail}`);
}

// Uncomment to test:
// exampleUsage();
