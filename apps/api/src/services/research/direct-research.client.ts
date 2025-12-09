/**
 * Direct Research Client
 * Uses Google Gemini with Maps grounding for provider research
 * Fallback when Kestra is unavailable (production environments)
 */

import { GoogleGenAI } from "@google/genai";
import { GooglePlacesService } from "../places/google-places.service.js";
import type { ResearchRequest, ResearchResult, Provider } from "./types.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

interface FilterCriteria {
  minRating?: number;
  maxDistance?: number;
  requirePhone?: boolean;
  minReviewCount?: number;
}

/**
 * Helper to sanitize JSON strings from model output
 */
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

/**
 * Get coordinates for common locations (fallback if geocoding not available)
 */
const getCoordinates = (
  location: string,
): { latitude: number; longitude: number } => {
  const locationLower = location.toLowerCase();

  // Common locations - extend as needed
  const coordinates: Record<string, { latitude: number; longitude: number }> = {
    "greenville sc": { latitude: 34.8526, longitude: -82.394 },
    greenville: { latitude: 34.8526, longitude: -82.394 },
    "atlanta ga": { latitude: 33.749, longitude: -84.388 },
    atlanta: { latitude: 33.749, longitude: -84.388 },
    "charlotte nc": { latitude: 35.2271, longitude: -80.8431 },
    charlotte: { latitude: 35.2271, longitude: -80.8431 },
  };

  for (const [key, coords] of Object.entries(coordinates)) {
    if (locationLower.includes(key)) {
      return coords;
    }
  }

  // Default to Greenville, SC
  return { latitude: 34.8526, longitude: -82.394 };
};

export class DirectResearchClient {
  private ai: GoogleGenAI;
  private model = "gemini-2.5-flash";
  private placesService: GooglePlacesService | null = null;

  constructor(private logger: Logger) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    this.ai = new GoogleGenAI({ apiKey });

    // Lazy-initialize Places service (handles missing API key gracefully)
    try {
      this.placesService = new GooglePlacesService();
      this.logger.info(
        { service: "google_places" },
        "Google Places API available",
      );
    } catch (error) {
      this.logger.warn(
        { error },
        "Google Places API not available, will use Maps grounding fallback",
      );
    }
  }

  /**
   * Research providers using Google Places API (primary) with fallback to Maps grounding
   */
  async research(request: ResearchRequest): Promise<ResearchResult> {
    this.logger.info(
      {
        service: request.service,
        location: request.location,
        hasPlacesAPI: !!this.placesService,
      },
      "Starting provider research",
    );

    try {
      // PRIMARY: Try Google Places API first (if available)
      if (this.placesService) {
        try {
          const placesResult = await this.searchWithPlacesAPI(request);

          if (placesResult.providers.length > 0) {
            return placesResult;
          }

          this.logger.warn(
            { request },
            "Places API returned no results, falling back to Maps grounding",
          );
        } catch (placesError) {
          this.logger.error(
            { error: placesError, request },
            "Places API search failed, falling back to Maps grounding",
          );
        }
      }

      // FALLBACK: Use Maps grounding
      const providers = await this.searchWithMapsGrounding(request);

      if (providers.length === 0) {
        this.logger.warn(
          { request },
          "No providers found via Maps grounding, trying JSON fallback",
        );
        const fallbackProviders = await this.searchWithJsonFallback(request);

        return {
          status: fallbackProviders.length > 0 ? "success" : "error",
          method: "direct_gemini",
          providers: fallbackProviders,
          reasoning:
            fallbackProviders.length > 0
              ? `Found ${fallbackProviders.length} providers via Gemini (JSON fallback)`
              : "No providers found",
          error:
            fallbackProviders.length === 0
              ? "No providers found in search area"
              : undefined,
          totalFound: fallbackProviders.length,
          filteredCount: fallbackProviders.length,
        };
      }

      return {
        status: "success",
        method: "direct_gemini",
        providers,
        reasoning: `Found ${providers.length} providers via Gemini Maps grounding`,
        totalFound: providers.length,
        filteredCount: providers.length,
      };
    } catch (error) {
      this.logger.error({ error, request }, "Direct research failed");

      return {
        status: "error",
        method: "direct_gemini",
        providers: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Search using Google Places API (primary method)
   */
  private async searchWithPlacesAPI(
    request: ResearchRequest,
  ): Promise<ResearchResult> {
    const {
      service,
      location,
      minRating = 4.0,
      maxDistance,
      requirePhone,
      minReviewCount,
    } = request;

    this.logger.info(
      { service, location, minRating },
      "Searching with Places API",
    );

    // Get coordinates for location-based search
    const coordinates = request.coordinates || getCoordinates(location);

    // Build search query
    const query = `${service} near ${location}`;

    // Call Places API text search
    const searchResponse = await this.placesService!.textSearch(
      query,
      coordinates,
      50000, // 50km radius
    );

    this.logger.info(
      { totalFound: searchResponse.places.length },
      "Places API search completed",
    );

    // Transform to Provider format and calculate distances
    const providers: Provider[] = searchResponse.places.map((result, index) => {
      // Calculate distance from user coordinates
      const distanceMiles = coordinates
        ? this.placesService!.calculateDistance(coordinates, result.location)
        : undefined;

      const distanceText = distanceMiles ? `${distanceMiles} mi` : undefined;

      return {
        id: result.placeId || `places-${Date.now()}-${index}`,
        name: result.name,
        phone: undefined, // Basic search doesn't include phone
        internationalPhone: undefined, // Will be enriched later if needed
        rating: result.rating,
        reviewCount: result.userRatingsTotal,
        address: result.formattedAddress,
        distance: distanceMiles,
        distanceText,
        hoursOfOperation: undefined, // Basic search doesn't include hours
        isOpenNow: undefined, // Will be enriched later if needed
        placeId: result.placeId,
        googleMapsUri: result.googleMapsUri,
        website: undefined, // Will be enriched later if needed
        source: "google_places",
        reason: `Highly rated ${service} in ${location}${distanceText ? ` (${distanceText})` : ""}`,
      };
    });

    // Apply filters
    const criteria: FilterCriteria = {
      minRating,
      maxDistance,
      requirePhone,
      minReviewCount,
    };

    const filtered = this.filterProviders(providers, criteria);

    // Sort by distance (closest first)
    const sorted = filtered.sort((a, b) => {
      if (a.distance === undefined || b.distance === undefined) return 0;
      return a.distance - b.distance;
    });

    // Return top 10
    const top10 = sorted.slice(0, 10);

    this.logger.info(
      {
        totalFound: providers.length,
        afterFilters: filtered.length,
        returned: top10.length,
      },
      "Places API results filtered and sorted",
    );

    return {
      status: top10.length > 0 ? "success" : "error",
      method: "google_places",
      providers: top10,
      reasoning: `Found ${top10.length} providers via Google Places API (${providers.length} total, ${filtered.length} after filtering)`,
      totalFound: providers.length,
      filteredCount: top10.length,
    };
  }

  /**
   * Filter providers based on criteria
   * NOTE: Phone filtering is handled by enrichment service, not here
   */
  private filterProviders(
    providers: Provider[],
    criteria: FilterCriteria,
  ): Provider[] {
    let filtered = [...providers];

    // Filter by minimum rating
    if (criteria.minRating !== undefined) {
      filtered = filtered.filter(
        (p) => p.rating !== undefined && p.rating >= criteria.minRating!,
      );
    }

    // Filter by maximum distance
    if (criteria.maxDistance !== undefined) {
      filtered = filtered.filter(
        (p) => p.distance === undefined || p.distance <= criteria.maxDistance!,
      );
    }

    // Filter by minimum review count
    if (criteria.minReviewCount !== undefined) {
      filtered = filtered.filter(
        (p) =>
          p.reviewCount !== undefined &&
          p.reviewCount >= criteria.minReviewCount!,
      );
    }

    return filtered;
  }

  /**
   * Search using Google Maps grounding (fallback method)
   */
  private async searchWithMapsGrounding(
    request: ResearchRequest,
  ): Promise<Provider[]> {
    const { service, location, minRating = 4.0 } = request;

    const prompt = `Find the top 10 highly rated ${service} near ${location}.
    Only include providers with ratings of ${minRating} or higher.
    For each provider, include: name, address, phone number (if available), rating.
    Return a pure JSON array with these fields: name, address, phone, rating.`;

    const coordinates = getCoordinates(location);

    this.logger.debug(
      {
        prompt,
        coordinates,
        model: this.model,
      },
      "Calling Gemini with Maps grounding",
    );

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: coordinates,
          },
        },
      },
    });

    const groundingChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const providers: Provider[] = [];

    if (groundingChunks) {
      this.logger.debug(
        {
          chunkCount: groundingChunks.length,
        },
        "Processing grounding chunks",
      );

      groundingChunks.forEach((chunk: any, index: number) => {
        if (chunk.maps) {
          providers.push({
            id: `gemini-maps-${Date.now()}-${index}`,
            name: chunk.maps.title || "Unknown Provider",
            address: chunk.maps.placeAddress || "Address not available",
            phone: chunk.maps.phoneNumber,
            rating: chunk.maps.rating || minRating,
            source: "gemini_maps",
            reason: `Highly rated ${service} in ${location}`,
          });
        }
      });
    }

    return this.deduplicateProviders(providers).slice(0, 10);
  }

  /**
   * Fallback: Parse JSON response from model text
   */
  private async searchWithJsonFallback(
    request: ResearchRequest,
  ): Promise<Provider[]> {
    const { service, location, minRating = 4.0 } = request;

    const prompt = `Find the top 10 ${service} near ${location} with ratings of ${minRating}+.
    Return ONLY a JSON array with this exact structure (no markdown):
    [
      {
        "name": "Provider Name",
        "address": "Full Address",
        "phone": "Phone Number",
        "rating": 4.5,
        "reason": "Why this provider is recommended"
      }
    ]`;

    this.logger.debug({ prompt }, "Calling Gemini for JSON fallback");

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const providers: Provider[] = [];

    if (response.text) {
      try {
        const cleanedText = cleanJson(response.text);
        const parsed = JSON.parse(cleanedText);

        if (Array.isArray(parsed)) {
          parsed.forEach((p, idx) => {
            providers.push({
              id: `gemini-json-${Date.now()}-${idx}`,
              name: p.name || "Unknown Provider",
              address: p.address || "Address not available",
              phone: p.phone,
              rating: p.rating || minRating,
              reason: p.reason || `Recommended ${service} in ${location}`,
              source: "gemini_maps",
            });
          });
        }
      } catch (e) {
        this.logger.error(
          { error: e, responseText: response.text },
          "Failed to parse JSON fallback",
        );
      }
    }

    return this.deduplicateProviders(providers).slice(0, 10);
  }

  /**
   * Remove duplicate providers by name
   */
  private deduplicateProviders(providers: Provider[]): Provider[] {
    const seen = new Set<string>();
    return providers.filter((p) => {
      const normalized = p.name.toLowerCase().trim();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }
}
