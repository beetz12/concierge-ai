/**
 * Provider Enrichment Service
 *
 * Wraps GooglePlacesService with research-specific logic:
 * - Handles providers WITH and WITHOUT placeId gracefully
 * - Applies phone filtering AFTER enrichment (not before)
 * - Returns enrichment statistics
 * - Lazy-initializes Places API (gracefully handles missing API key)
 */

import { GooglePlacesService } from "../places/google-places.service.js";
import type { Provider } from "./types.js";

export interface EnrichmentOptions {
  coordinates?: { latitude: number; longitude: number };
  minEnrichedResults?: number; // default: 3
  maxToEnrich?: number; // default: 10
  requirePhone?: boolean; // default: true
}

export interface EnrichmentResult {
  providers: Provider[];
  stats: {
    totalInput: number;
    enrichedCount: number;
    withPhoneCount: number;
    skippedNoPlaceId: number;
    durationMs: number;
  };
}

export class ProviderEnrichmentService {
  private placesService: GooglePlacesService | null = null;
  private initError: string | null = null;

  constructor() {
    // Lazy-initialize GooglePlacesService
    try {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (apiKey) {
        this.placesService = new GooglePlacesService(apiKey);
      } else {
        this.initError = "GOOGLE_PLACES_API_KEY not configured";
        console.warn(
          "ProviderEnrichmentService: Google Places API key not found - enrichment disabled",
        );
      }
    } catch (error) {
      this.initError =
        error instanceof Error ? error.message : "Unknown initialization error";
      console.error("Failed to initialize GooglePlacesService:", error);
    }
  }

  /**
   * Check if Places API enrichment is available
   */
  isAvailable(): boolean {
    return this.placesService !== null && this.initError === null;
  }

  /**
   * Enrich providers with detailed information from Google Places API
   *
   * Process flow:
   * 1. Partition providers: those with placeId vs those without
   * 2. Enrich providers that have placeId (in batches)
   * 3. Merge enriched data: phone, internationalPhone, hoursOfOperation, isOpenNow, website
   * 4. Apply requirePhone filter AFTER enrichment
   * 5. Return enriched providers + statistics
   *
   * @param providers - Array of providers to enrich
   * @param options - Enrichment options
   * @returns Enriched providers and statistics
   */
  async enrich(
    providers: Provider[],
    options: EnrichmentOptions = {},
  ): Promise<EnrichmentResult> {
    const startTime = Date.now();

    // Default options
    const {
      coordinates,
      minEnrichedResults = 3,
      maxToEnrich = 10,
      requirePhone = true,
    } = options;

    const stats = {
      totalInput: providers.length,
      enrichedCount: 0,
      withPhoneCount: 0,
      skippedNoPlaceId: 0,
      durationMs: 0,
    };

    // If Places API not available, return original providers
    if (!this.isAvailable()) {
      console.warn(
        "Enrichment skipped - Places API not available:",
        this.initError,
      );
      stats.durationMs = Date.now() - startTime;
      return { providers, stats };
    }

    try {
      // Partition providers: with placeId vs without
      const providersWithPlaceId = providers.filter((p) => p.placeId);
      const providersWithoutPlaceId = providers.filter((p) => !p.placeId);

      stats.skippedNoPlaceId = providersWithoutPlaceId.length;

      console.log(
        `Enrichment: ${providersWithPlaceId.length} with placeId, ${providersWithoutPlaceId.length} without`,
      );

      // Limit how many we enrich (rate limit protection)
      const toEnrich = providersWithPlaceId.slice(0, maxToEnrich);

      if (toEnrich.length === 0) {
        console.warn("No providers with placeId to enrich");
        stats.durationMs = Date.now() - startTime;
        return { providers, stats };
      }

      // Enrich providers in batches (handled by GooglePlacesService)
      console.log(`Enriching ${toEnrich.length} providers...`);

      // Convert Provider[] to format expected by GooglePlacesService
      const enrichableProviders = toEnrich.map((p) => ({
        placeId: p.placeId!,
        ...p,
      }));

      const enrichedResults = await this.placesService!.enrichProviders(
        enrichableProviders,
        coordinates,
      );

      // Merge enriched data back into Provider format
      const enrichedProviders = enrichedResults.map((enriched) => {
        const original = providers.find((p) => p.placeId === enriched.placeId);

        return {
          ...original,
          ...enriched,
          // Map GooglePlacesService fields to Provider fields
          phone: enriched.phone,
          internationalPhone: enriched.internationalPhone,
          hoursOfOperation: enriched.openingHours?.weekdayText,
          isOpenNow: enriched.openingHours?.openNow,
          website: enriched.website,
          distance: enriched.distance,
        } as Provider;
      });

      stats.enrichedCount = enrichedProviders.length;

      // Combine enriched + unenriched + without placeId
      const allProviders = [
        ...enrichedProviders,
        ...providersWithPlaceId.slice(maxToEnrich), // Not enriched due to limit
        ...providersWithoutPlaceId,
      ];

      // Apply phone filter AFTER enrichment
      let finalProviders = allProviders;
      if (requirePhone) {
        const withPhone = allProviders.filter((p) => p.phone);
        const withoutPhone = allProviders.filter((p) => !p.phone);

        stats.withPhoneCount = withPhone.length;

        console.log(
          `Phone filter: ${withPhone.length} with phone, ${withoutPhone.length} without`,
        );

        // Ensure we have minimum results
        if (withPhone.length < minEnrichedResults) {
          console.warn(
            `Only ${withPhone.length} providers with phone (min: ${minEnrichedResults}) - including providers without phone`,
          );
          finalProviders = allProviders;
        } else {
          finalProviders = withPhone;
        }
      } else {
        stats.withPhoneCount = allProviders.filter((p) => p.phone).length;
      }

      stats.durationMs = Date.now() - startTime;

      console.log(`Enrichment complete:`, stats);

      return {
        providers: finalProviders,
        stats,
      };
    } catch (error) {
      console.error("Enrichment failed - returning original providers:", error);

      // Return original providers on error
      stats.durationMs = Date.now() - startTime;
      return { providers, stats };
    }
  }
}

// Export singleton instance
export const providerEnrichmentService = new ProviderEnrichmentService();
