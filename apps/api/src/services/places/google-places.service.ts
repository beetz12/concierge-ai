import axios, { AxiosError } from "axios";

/**
 * Google Places API service for searching and retrieving place details
 * Uses the new Google Places API (New) REST API
 */

export interface PlaceSearchResult {
  placeId: string;
  name: string;
  formattedAddress: string;
  rating?: number;
  userRatingsTotal?: number;
  location: { latitude: number; longitude: number };
  businessStatus?: string;
  googleMapsUri?: string;
}

export interface PlaceDetails extends PlaceSearchResult {
  phone?: string;
  internationalPhone?: string;
  openingHours?: {
    openNow?: boolean;
    weekdayText?: string[];
  };
  website?: string;
}

export interface TextSearchParams {
  query: string;
  coordinates?: { latitude: number; longitude: number };
  radiusMeters?: number;
  pageToken?: string;
}

export interface TextSearchResponse {
  places: PlaceSearchResult[];
  nextPageToken?: string;
}

export interface Provider {
  placeId: string;
  [key: string]: any;
}

export interface EnrichedProvider extends Provider {
  phone?: string;
  internationalPhone?: string;
  openingHours?: {
    openNow?: boolean;
    weekdayText?: string[];
  };
  website?: string;
  distance?: number;
}

export class GooglePlacesService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://places.googleapis.com/v1";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_PLACES_API_KEY || "";

    if (!this.apiKey) {
      throw new Error("GOOGLE_PLACES_API_KEY is required");
    }
  }

  /**
   * Search for places using text query
   * @param query - The search query (e.g., "plumbers in Greenville SC")
   * @param coordinates - Optional location bias
   * @param radiusMeters - Optional search radius in meters (default: 50000 / ~31 miles)
   * @param pageToken - Optional token for pagination
   * @returns Search results with up to 20 places
   */
  async textSearch(
    query: string,
    coordinates?: { latitude: number; longitude: number },
    radiusMeters: number = 50000,
    pageToken?: string,
  ): Promise<TextSearchResponse> {
    try {
      const url = `${this.baseUrl}/places:searchText`;

      const requestBody: any = {
        textQuery: query,
        maxResultCount: 20,
      };

      // Add location bias if coordinates provided
      if (coordinates) {
        requestBody.locationBias = {
          circle: {
            center: {
              latitude: coordinates.latitude,
              longitude: coordinates.longitude,
            },
            radius: radiusMeters,
          },
        };
      }

      // Add page token for pagination
      if (pageToken) {
        requestBody.pageToken = pageToken;
      }

      const response = await axios.post(url, requestBody, {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.rating",
            "places.userRatingCount",
            "places.businessStatus",
            "places.googleMapsUri",
            "nextPageToken",
          ].join(","),
        },
      });

      // DEBUG: Log raw API response to see if ratings are being returned
      if (response.data.places && response.data.places.length > 0) {
        const sample = response.data.places.slice(0, 3);
        console.log("DEBUG Places API raw response (first 3):", JSON.stringify(sample, null, 2));
        const ratingsFound = response.data.places.filter((p: any) => p.rating !== undefined).length;
        console.log(`DEBUG Ratings found: ${ratingsFound}/${response.data.places.length} places have ratings`);
      }

      const places: PlaceSearchResult[] = (response.data.places || []).map(
        (place: any) => ({
          placeId: place.id,
          name: place.displayName?.text || "",
          formattedAddress: place.formattedAddress || "",
          rating: place.rating,
          userRatingsTotal: place.userRatingCount,
          location: {
            latitude: place.location?.latitude || 0,
            longitude: place.location?.longitude || 0,
          },
          businessStatus: place.businessStatus,
          googleMapsUri: place.googleMapsUri,
        }),
      );

      return {
        places,
        nextPageToken: response.data.nextPageToken,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        console.error("Google Places API text search error:", {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
          message: axiosError.message,
        });
        throw new Error(`Places API search failed: ${axiosError.message}`);
      }
      throw error;
    }
  }

  /**
   * Get detailed information for a specific place
   * @param placeId - The Google Place ID
   * @returns Detailed place information including phone, hours, website
   */
  async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    try {
      const url = `${this.baseUrl}/places/${placeId}`;

      const response = await axios.get(url, {
        headers: {
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": [
            "id",
            "displayName",
            "formattedAddress",
            "location",
            "rating",
            "userRatingCount",
            "businessStatus",
            "googleMapsUri",
            "nationalPhoneNumber",
            "internationalPhoneNumber",
            "regularOpeningHours",
            "currentOpeningHours",
            "websiteUri",
          ].join(","),
        },
      });

      const place = response.data;

      // Parse opening hours
      const openingHours =
        place.currentOpeningHours || place.regularOpeningHours;
      const parsedHours = openingHours
        ? {
            openNow: openingHours.openNow,
            weekdayText: this.parseOpeningHours(
              openingHours.weekdayDescriptions || [],
            ),
          }
        : undefined;

      return {
        placeId: place.id,
        name: place.displayName?.text || "",
        formattedAddress: place.formattedAddress || "",
        rating: place.rating,
        userRatingsTotal: place.userRatingCount,
        location: {
          latitude: place.location?.latitude || 0,
          longitude: place.location?.longitude || 0,
        },
        businessStatus: place.businessStatus,
        googleMapsUri: place.googleMapsUri,
        phone: place.nationalPhoneNumber,
        internationalPhone: place.internationalPhoneNumber,
        openingHours: parsedHours,
        website: place.websiteUri,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        console.error(`Failed to get details for place ${placeId}:`, {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
          message: axiosError.message,
        });
        // Return null instead of throwing - graceful degradation
        return null;
      }
      console.error(
        `Unexpected error getting place details for ${placeId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param from - Starting coordinates
   * @param to - Ending coordinates
   * @returns Distance in miles (rounded to 1 decimal place)
   */
  calculateDistance(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(to.latitude - from.latitude);
    const dLon = this.toRadians(to.longitude - from.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(from.latitude)) *
        Math.cos(this.toRadians(to.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Enrich provider data with full details from Google Places API
   * Processes providers in batches with rate limiting
   * @param providers - Array of providers with placeId
   * @param userCoordinates - User's location for distance calculation
   * @returns Enriched providers with phone, hours, distance, etc.
   */
  async enrichProviders<T extends Provider>(
    providers: T[],
    userCoordinates?: { latitude: number; longitude: number },
  ): Promise<EnrichedProvider[]> {
    const enrichedProviders: EnrichedProvider[] = [];
    const batchSize = 5;
    const delayMs = 200;

    console.log(
      `Enriching ${providers.length} providers in batches of ${batchSize}...`,
    );

    // Process in batches to respect rate limits
    for (let i = 0; i < providers.length; i += batchSize) {
      const batch = providers.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (provider) => {
          try {
            const details = await this.getPlaceDetails(provider.placeId);

            if (!details) {
              console.warn(
                `No details found for provider: ${provider.placeId}`,
              );
              return { ...provider };
            }

            const enriched: EnrichedProvider = {
              ...provider,
              phone: details.phone,
              internationalPhone: details.internationalPhone,
              openingHours: details.openingHours,
              website: details.website,
            };

            // Add distance if user coordinates provided
            if (userCoordinates && details.location) {
              enriched.distance = this.calculateDistance(
                userCoordinates,
                details.location,
              );
            }

            return enriched;
          } catch (error) {
            console.error(
              `Failed to enrich provider ${provider.placeId}:`,
              error,
            );
            // Return original provider if enrichment fails
            return { ...provider };
          }
        }),
      );

      enrichedProviders.push(...batchResults);

      // Add delay between batches (except for last batch)
      if (i + batchSize < providers.length) {
        await this.delay(delayMs);
      }
    }

    console.log(`Successfully enriched ${enrichedProviders.length} providers`);
    return enrichedProviders;
  }

  /**
   * Parse opening hours into readable format
   * @param weekdayDescriptions - Array of weekday descriptions from API
   * @returns Formatted array like ["Mon: 8:00 AM - 6:00 PM", ...]
   */
  private parseOpeningHours(weekdayDescriptions: string[]): string[] {
    if (!weekdayDescriptions || weekdayDescriptions.length === 0) {
      return [];
    }

    // API returns format like "Monday: 8:00 AM – 6:00 PM"
    // Convert to "Mon: 8:00 AM - 6:00 PM"
    return weekdayDescriptions.map((desc) => {
      const dayMap: Record<string, string> = {
        Monday: "Mon",
        Tuesday: "Tue",
        Wednesday: "Wed",
        Thursday: "Thu",
        Friday: "Fri",
        Saturday: "Sat",
        Sunday: "Sun",
      };

      let formatted = desc;
      Object.entries(dayMap).forEach(([full, abbr]) => {
        formatted = formatted.replace(full, abbr);
      });

      // Replace long dash with standard hyphen
      formatted = formatted.replace(/–/g, "-");

      return formatted;
    });
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Delay execution for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export a singleton instance
export const googlePlacesService = new GooglePlacesService();
