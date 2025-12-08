/**
 * Gemini Endpoints Verification Test
 * This script tests all 4 Gemini endpoints to ensure they are working correctly
 */

import 'dotenv/config';

const API_BASE_URL = 'http://localhost:8000/api/v1/gemini';

interface TestResult {
  endpoint: string;
  status: 'PASS' | 'FAIL';
  statusCode?: number;
  message: string;
  response?: any;
  error?: string;
}

const results: TestResult[] = [];

async function testEndpoint(
  name: string,
  path: string,
  body: any
): Promise<TestResult> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (response.ok) {
      return {
        endpoint: name,
        status: 'PASS',
        statusCode: response.status,
        message: 'Endpoint responded successfully',
        response: data,
      };
    } else {
      return {
        endpoint: name,
        status: 'FAIL',
        statusCode: response.status,
        message: 'Endpoint returned error',
        error: JSON.stringify(data),
      };
    }
  } catch (error: any) {
    return {
      endpoint: name,
      status: 'FAIL',
      message: 'Request failed',
      error: error.message,
    };
  }
}

async function runTests() {
  console.log('🧪 Starting Gemini Endpoints Verification...\n');
  console.log(`Testing API at: ${API_BASE_URL}\n`);

  // Test 1: POST /search-providers
  console.log('1️⃣  Testing POST /search-providers...');
  const test1 = await testEndpoint('POST /search-providers', '/search-providers', {
    query: 'plumber',
    location: 'Greenville, SC',
    coordinates: {
      latitude: 34.8526,
      longitude: -82.394,
    },
  });
  results.push(test1);
  console.log(`   ${test1.status} - ${test1.message}`);
  if (test1.status === 'PASS') {
    console.log(`   Found ${test1.response?.providers?.length || 0} providers`);
  }
  console.log('');

  // Test 2: POST /simulate-call
  console.log('2️⃣  Testing POST /simulate-call...');
  const test2 = await testEndpoint('POST /simulate-call', '/simulate-call', {
    providerName: 'Test Plumbing Co.',
    userCriteria: 'Need emergency leak repair, available today',
    isDirect: false,
  });
  results.push(test2);
  console.log(`   ${test2.status} - ${test2.message}`);
  if (test2.status === 'PASS') {
    console.log(`   Call status: ${test2.response?.status || 'unknown'}`);
    console.log(`   Detail: ${test2.response?.detail || 'N/A'}`);
  }
  console.log('');

  // Test 3: POST /select-best-provider
  console.log('3️⃣  Testing POST /select-best-provider...');
  const test3 = await testEndpoint(
    'POST /select-best-provider',
    '/select-best-provider',
    {
      requestTitle: 'Find emergency plumber',
      interactions: [
        {
          timestamp: new Date().toISOString(),
          stepName: 'Calling Provider A',
          detail: 'Available today at 2pm, $150 service fee',
          status: 'success',
        },
        {
          timestamp: new Date().toISOString(),
          stepName: 'Calling Provider B',
          detail: 'Fully booked this week',
          status: 'error',
        },
      ],
      providers: [
        {
          id: 'prov-1',
          name: 'Provider A',
          phone: '555-0001',
          rating: 4.5,
          address: '123 Main St',
          source: 'Google Maps',
        },
        {
          id: 'prov-2',
          name: 'Provider B',
          phone: '555-0002',
          rating: 4.8,
          address: '456 Oak Ave',
          source: 'Google Maps',
        },
      ],
    }
  );
  results.push(test3);
  console.log(`   ${test3.status} - ${test3.message}`);
  if (test3.status === 'PASS') {
    console.log(`   Selected: ${test3.response?.selectedId || 'None'}`);
    console.log(`   Reasoning: ${test3.response?.reasoning || 'N/A'}`);
  }
  console.log('');

  // Test 4: POST /schedule-appointment
  console.log('4️⃣  Testing POST /schedule-appointment...');
  const test4 = await testEndpoint('POST /schedule-appointment', '/schedule-appointment', {
    providerName: 'Test Plumbing Co.',
    details: 'Tuesday at 2pm - Emergency leak repair',
  });
  results.push(test4);
  console.log(`   ${test4.status} - ${test4.message}`);
  if (test4.status === 'PASS') {
    console.log(`   Status: ${test4.response?.status || 'unknown'}`);
    console.log(`   Detail: ${test4.response?.detail || 'N/A'}`);
  }
  console.log('');

  // Summary
  console.log('━'.repeat(60));
  console.log('📊 Test Summary:\n');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  results.forEach((result, index) => {
    const icon = result.status === 'PASS' ? '✅' : '❌';
    console.log(
      `${icon} ${index + 1}. ${result.endpoint} - ${result.status} (${result.statusCode || 'N/A'})`
    );
    if (result.status === 'FAIL' && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('');
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('━'.repeat(60));

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ All endpoints verified successfully!');
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
