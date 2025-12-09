/**
 * Example usage of GooglePlacesService
 * This file demonstrates how to use the service methods
 */

import { GooglePlacesService } from "./google-places.service.js";

/**
 * Example 1: Basic text search
 */
async function exampleTextSearch() {
  const service = new GooglePlacesService();

  // Search for plumbers in Greenville, SC
  const result = await service.textSearch(
    "plumbers in Greenville SC",
    { latitude: 34.8526, longitude: -82.394 }, // Greenville, SC coordinates
    50000, // 50km radius
  );

  console.log("Search Results:");
  console.log(`Found ${result.places.length} places`);
  console.log(`Next page token: ${result.nextPageToken || "None"}`);

  result.places.forEach((place, index) => {
    console.log(`\n${index + 1}. ${place.name}`);
    console.log(`   Address: ${place.formattedAddress}`);
    console.log(
      `   Rating: ${place.rating} (${place.userRatingsTotal} reviews)`,
    );
    console.log(`   Place ID: ${place.placeId}`);
  });

  return result;
}

/**
 * Example 2: Get place details
 */
async function exampleGetDetails(placeId: string) {
  const service = new GooglePlacesService();

  const details = await service.getPlaceDetails(placeId);

  if (details) {
    console.log("\nPlace Details:");
    console.log(`Name: ${details.name}`);
    console.log(`Phone: ${details.phone || "Not available"}`);
    console.log(`Website: ${details.website || "Not available"}`);
    console.log(`Open now: ${details.openingHours?.openNow ? "Yes" : "No"}`);

    if (details.openingHours?.weekdayText) {
      console.log("Hours:");
      details.openingHours.weekdayText.forEach((hour) => {
        console.log(`  ${hour}`);
      });
    }
  } else {
    console.log("Could not fetch details for place");
  }

  return details;
}

/**
 * Example 3: Calculate distance
 */
function exampleCalculateDistance() {
  const service = new GooglePlacesService();

  const from = { latitude: 34.8526, longitude: -82.394 }; // Greenville, SC
  const to = { latitude: 35.2271, longitude: -80.8431 }; // Charlotte, NC

  const distance = service.calculateDistance(from, to);

  console.log(`\nDistance from Greenville to Charlotte: ${distance} miles`);

  return distance;
}

/**
 * Example 4: Enrich providers with full details
 */
async function exampleEnrichProviders() {
  const service = new GooglePlacesService();
  const userCoordinates = { latitude: 34.8526, longitude: -82.394 };

  // First, get basic search results
  const searchResult = await service.textSearch(
    "restaurants in Greenville SC",
    userCoordinates,
    10000, // 10km radius
  );

  console.log(`\nFound ${searchResult.places.length} restaurants`);

  // Convert to provider format
  const basicProviders = searchResult.places.map((place) => ({
    placeId: place.placeId,
    name: place.name,
    address: place.formattedAddress,
  }));

  // Enrich with full details (phone, hours, website, distance)
  console.log("\nEnriching providers with full details...");
  const enrichedProviders = await service.enrichProviders(
    basicProviders,
    userCoordinates,
  );

  console.log("\nEnriched Providers:");
  enrichedProviders.slice(0, 3).forEach((provider, index) => {
    console.log(`\n${index + 1}. ${provider.name}`);
    console.log(`   Phone: ${provider.phone || "Not available"}`);
    console.log(`   Website: ${provider.website || "Not available"}`);
    console.log(
      `   Distance: ${provider.distance ? `${provider.distance} mi` : "Unknown"}`,
    );
    console.log(
      `   Open now: ${provider.openingHours?.openNow ? "Yes" : "No"}`,
    );
  });

  return enrichedProviders;
}

/**
 * Example 5: Pagination
 */
async function examplePagination() {
  const service = new GooglePlacesService();
  const allPlaces = [];

  let nextPageToken: string | undefined;
  let pageNumber = 1;

  do {
    console.log(`\nFetching page ${pageNumber}...`);

    const result = await service.textSearch(
      "coffee shops in Greenville SC",
      { latitude: 34.8526, longitude: -82.394 },
      50000,
      nextPageToken,
    );

    allPlaces.push(...result.places);
    nextPageToken = result.nextPageToken;
    pageNumber++;

    // Add delay between requests to respect rate limits
    if (nextPageToken) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } while (nextPageToken && pageNumber <= 3); // Limit to 3 pages

  console.log(`\nTotal places found: ${allPlaces.length}`);

  return allPlaces;
}

// Export examples
export {
  exampleTextSearch,
  exampleGetDetails,
  exampleCalculateDistance,
  exampleEnrichProviders,
  examplePagination,
};

/**
 * Run all examples (uncomment to test)
 */
// async function runAllExamples() {
//   try {
//     console.log('=== Example 1: Text Search ===');
//     const searchResult = await exampleTextSearch();
//
//     if (searchResult.places.length > 0) {
//       console.log('\n=== Example 2: Place Details ===');
//       await exampleGetDetails(searchResult.places[0].placeId);
//     }
//
//     console.log('\n=== Example 3: Calculate Distance ===');
//     exampleCalculateDistance();
//
//     console.log('\n=== Example 4: Enrich Providers ===');
//     await exampleEnrichProviders();
//
//     console.log('\n=== Example 5: Pagination ===');
//     await examplePagination();
//   } catch (error) {
//     console.error('Error running examples:', error);
//   }
// }
