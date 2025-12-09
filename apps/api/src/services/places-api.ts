/**
 * Google Places API (New) Integration
 *
 * This service enriches provider data from Google Maps grounding with
 * detailed information including phone, hours, ratings, and reviews.
 *
 * API Documentation: https://developers.google.com/maps/documentation/places/web-service/place-details
 */

// Place Details Response Types
export interface PlaceLocation {
  latitude: number;
  longitude: number;
}

export interface PlaceDisplayName {
  text: string;
  languageCode?: string;
}

export interface PlaceOpeningHours {
  openNow: boolean;
  periods?: Array<{
    open: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }>;
  weekdayDescriptions: string[];
}

export interface PlaceDetails {
  id: string; // Place ID
  displayName: PlaceDisplayName;
  formattedAddress: string;
  location: PlaceLocation;

  // Contact Information
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;

  // Business Information
  rating?: number; // 1.0 to 5.0
  userRatingCount?: number;
  priceLevel?:
    | "PRICE_LEVEL_FREE"
    | "PRICE_LEVEL_INEXPENSIVE"
    | "PRICE_LEVEL_MODERATE"
    | "PRICE_LEVEL_EXPENSIVE"
    | "PRICE_LEVEL_VERY_EXPENSIVE";
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";

  // Hours
  currentOpeningHours?: PlaceOpeningHours;
  regularOpeningHours?: PlaceOpeningHours;
}

/**
 * Field mask for Places API requests
 * Only request fields you need to optimize costs
 *
 * Pricing tiers:
 * - Basic: id, displayName, location, formattedAddress ($0.017/request)
 * - Contact: phoneNumbers, websiteUri ($0.003/request)
 * - Atmosphere: rating, userRatingCount ($0.005/request)
 */
export const PLACE_FIELDS = {
  ESSENTIAL: ["id", "displayName", "formattedAddress", "location"],
  CONTACT: ["internationalPhoneNumber", "nationalPhoneNumber", "websiteUri"],
  BUSINESS: ["rating", "userRatingCount", "priceLevel", "businessStatus"],
  HOURS: ["currentOpeningHours", "regularOpeningHours"],
};

/**
 * Get all fields as a comma-separated string for X-Goog-FieldMask header
 */
export function getFieldMask(
  categories: (keyof typeof PLACE_FIELDS)[] = [
    "ESSENTIAL",
    "CONTACT",
    "BUSINESS",
    "HOURS",
  ],
): string {
  const fields: string[] = [];
  for (const category of categories) {
    fields.push(...PLACE_FIELDS[category]);
  }
  return fields.join(",");
}

/**
 * Fetch detailed information for a place using Google Places API (New)
 *
 * @param placeId - The place ID from Google Maps grounding (format: places/ChIJ...)
 * @param apiKey - Google Maps Platform API key
 * @param fieldMask - Optional custom field mask (defaults to all categories)
 * @returns PlaceDetails object with enriched data
 *
 * @throws Error if API request fails
 *
 * @example
 * ```typescript
 * const details = await fetchPlaceDetails(
 *   'places/ChIJN1t_tDeuEmsRUsoyG83frY4',
 *   process.env.GOOGLE_MAPS_API_KEY!
 * );
 * console.log(details.displayName.text); // "Google Sydney"
 * console.log(details.rating); // 4.6
 * ```
 */
export async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
  fieldMask?: string,
): Promise<PlaceDetails> {
  // Ensure placeId has correct format
  const formattedPlaceId = placeId.startsWith("places/")
    ? placeId
    : `places/${placeId}`;

  const url = `https://places.googleapis.com/v1/${formattedPlaceId}`;
  const mask = fieldMask || getFieldMask();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": mask,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Places API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data as PlaceDetails;
}

/**
 * Batch fetch place details for multiple place IDs
 *
 * Note: The Places API doesn't have a native batch endpoint,
 * so this function makes parallel requests
 *
 * @param placeIds - Array of place IDs
 * @param apiKey - Google Maps Platform API key
 * @param fieldMask - Optional custom field mask
 * @returns Array of PlaceDetails (null for failed requests)
 */
export async function fetchMultiplePlaceDetails(
  placeIds: string[],
  apiKey: string,
  fieldMask?: string,
): Promise<Array<PlaceDetails | null>> {
  const promises = placeIds.map(async (placeId) => {
    try {
      return await fetchPlaceDetails(placeId, apiKey, fieldMask);
    } catch (error) {
      console.error(`Failed to fetch details for ${placeId}:`, error);
      return null;
    }
  });

  return Promise.all(promises);
}

/**
 * Calculate straight-line distance between two coordinates using Haversine formula
 *
 * @param lat1 - Origin latitude
 * @param lon1 - Origin longitude
 * @param lat2 - Destination latitude
 * @param lon2 - Destination longitude
 * @returns Distance in meters and formatted text
 *
 * @example
 * ```typescript
 * const distance = calculateDistance(34.8526, -82.394, 34.8500, -82.400);
 * console.log(distance.text); // "0.7 km"
 * ```
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): { meters: number; text: string } {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const meters = R * c;

  // Format distance text
  let text: string;
  if (meters >= 1609.34) {
    // Convert to miles for US users
    const miles = meters / 1609.34;
    text = `${miles.toFixed(1)} mi`;
  } else if (meters >= 1000) {
    text = `${(meters / 1000).toFixed(1)} km`;
  } else {
    text = `${Math.round(meters)} m`;
  }

  return { meters, text };
}

/**
 * Format price level enum to human-readable string
 */
export function formatPriceLevel(priceLevel?: string): string {
  if (!priceLevel) return "Unknown";

  const levels: Record<string, string> = {
    PRICE_LEVEL_FREE: "Free",
    PRICE_LEVEL_INEXPENSIVE: "$",
    PRICE_LEVEL_MODERATE: "$$",
    PRICE_LEVEL_EXPENSIVE: "$$$",
    PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
  };

  return levels[priceLevel] || "Unknown";
}

/**
 * Check if a place is currently open
 */
export function isOpenNow(openingHours?: PlaceOpeningHours): boolean {
  return openingHours?.openNow ?? false;
}

/**
 * Get today's hours from weekday descriptions
 */
export function getTodayHours(openingHours?: PlaceOpeningHours): string | null {
  if (!openingHours?.weekdayDescriptions) return null;

  const today = new Date().getDay(); // 0 = Sunday, 6 = Saturday
  // weekdayDescriptions starts with Monday (0), so adjust index
  const adjustedDay = today === 0 ? 6 : today - 1;

  return openingHours.weekdayDescriptions[adjustedDay] || null;
}
