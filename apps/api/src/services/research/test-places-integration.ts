/**
 * Quick test to verify Places API integration
 * Run: pnpm tsx apps/api/src/services/research/test-places-integration.ts
 */

import { DirectResearchClient } from './direct-research.client.js';

const logger = {
  info: (obj: any, msg?: string) => console.log('[INFO]', msg || '', obj),
  debug: (obj: any, msg?: string) => console.log('[DEBUG]', msg || '', obj),
  error: (obj: any, msg?: string) => console.error('[ERROR]', msg || '', obj),
  warn: (obj: any, msg?: string) => console.warn('[WARN]', msg || '', obj),
};

async function testResearch() {
  console.log('🧪 Testing Research API Enhancement\n');

  const client = new DirectResearchClient(logger);

  console.log('📍 Testing: Find plumbers in Greenville SC\n');

  const result = await client.research({
    service: 'plumbers',
    location: 'Greenville SC',
    minRating: 4.0,
    maxDistance: 15,
    requirePhone: true,
    minReviewCount: 10,
  });

  console.log('\n✅ Results:');
  console.log('Status:', result.status);
  console.log('Method:', result.method);
  console.log('Total Found:', result.totalFound || 'N/A');
  console.log('After Filtering:', result.filteredCount || 'N/A');
  console.log('Returned:', result.providers.length);
  console.log('\nReasoning:', result.reasoning, '\n');

  if (result.providers.length > 0) {
    console.log('📋 Top 3 Providers:\n');
    result.providers.slice(0, 3).forEach((provider, idx) => {
      console.log(`${idx + 1}. ${provider.name}`);
      console.log('   Rating:', provider.rating, '⭐', `(${provider.reviewCount || 'N/A'} reviews)`);
      console.log('   Distance:', provider.distanceText || 'N/A');
      console.log('   Phone:', provider.phone || 'N/A');
      console.log('   Open Now:', provider.isOpenNow ? 'Yes ✅' : 'No ❌');
      console.log('   Address:', provider.address);
      console.log('   Source:', provider.source);
      if (provider.hoursOfOperation && provider.hoursOfOperation.length > 0) {
        console.log('   Hours:', provider.hoursOfOperation[0]);
      }
      console.log('');
    });
  }
}

testResearch().catch(console.error);
