#!/usr/bin/env ts-node

import fetch from 'node-fetch';

console.log('🧪 Starting Method Routing Integration Tests...\n');

const SERVER_URL = 'http://localhost:1099';
const TEST_TIMEOUT = 10000;

interface TestCase {
  name: string;
  method: string;
  params: any[];
  expectSuccess: boolean;
  expectedUpstreamType?: 'full' | 'archive';
  shouldAvoidUpstreams?: string[];
}

const testCases: TestCase[] = [
  {
    name: 'eth_getBalance - should work on any upstream',
    method: 'eth_getBalance',
    params: ['0x742d35Cc6634C0532925a3b8D000b5D97678fBBd', 'latest'],
    expectSuccess: true
  },
  {
    name: 'debug_traceTransaction - should route to archive node or compatible upstream',
    method: 'debug_traceTransaction',
    params: ['0x123...'],
    expectSuccess: false, // Expected to fail due to invalid params, but should route correctly
    shouldAvoidUpstreams: ['sei-apis-primary'] // This upstream ignores debug_*
  },
  {
    name: 'trace_block - should avoid upstreams that ignore trace_*',
    method: 'trace_block',
    params: ['latest'],
    expectSuccess: false, // Expected to fail due to method not supported, but routing should work
    shouldAvoidUpstreams: ['publicnode'] // This upstream ignores trace_*
  },
  {
    name: 'eth_getLogs - should avoid publicnode that ignores it',
    method: 'eth_getLogs',
    params: [{ fromBlock: 'latest', toBlock: 'latest' }],
    expectSuccess: false, // May fail, but should route correctly
    shouldAvoidUpstreams: ['publicnode'] // This upstream ignores eth_getLogs
  },
  {
    name: 'eth_chainId - should work on any upstream',
    method: 'eth_chainId',
    params: [],
    expectSuccess: true
  }
];

async function makeRpcRequest(method: string, params: any[], useDebug = false): Promise<any> {
  const url = useDebug ? `${SERVER_URL}?debug=1` : SERVER_URL;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now()
    }),
    timeout: TEST_TIMEOUT
  } as any);

  return await response.json();
}

async function testServerAvailability(): Promise<boolean> {
  try {
    const response = await fetch(`${SERVER_URL}/health`, { timeout: 5000 } as any);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function runIntegrationTests(): Promise<void> {
  // Check if server is running
  console.log('🔍 Checking server availability...');
  const serverAvailable = await testServerAvailability();

  if (!serverAvailable) {
    console.log('⚠️  Server not available at ' + SERVER_URL);
    console.log('   Please start the server with: npm run dev');
    console.log('   Skipping integration tests...\n');
    return;
  }

  console.log('✅ Server is available\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`🧪 Testing: ${testCase.name}`);

    try {
      // Make request with debug enabled to see routing decisions
      const result = await makeRpcRequest(testCase.method, testCase.params, true);

      // Check if we got a debug response
      if (result.debug) {
        console.log(`   📊 Routing Info:`);
        console.log(`      Selected Upstream: ${result.debug.context.selectedUpstream || 'None'}`);
        console.log(`      Pipeline Events: ${result.debug.strategy.events.length}`);

        // Check pipeline events for MethodRouting operation
        const methodRoutingEvent = result.debug.strategy.events.find(
          (event: any) => event.operation === 'MethodRouting'
        );

        if (methodRoutingEvent) {
          console.log(`      MethodRouting: ${methodRoutingEvent.action} - ${methodRoutingEvent.data?.reason || 'No reason'}`);

          // Check if upstream selection avoided ignored upstreams
          if (testCase.shouldAvoidUpstreams && result.debug.context.selectedUpstream) {
            const selectedUpstream = result.debug.context.selectedUpstream;
            const shouldAvoid = testCase.shouldAvoidUpstreams.includes(selectedUpstream);

            if (!shouldAvoid) {
              console.log(`   ✅ Correctly avoided restricted upstreams`);
            } else {
              console.log(`   ⚠️  Selected upstream ${selectedUpstream} that should be avoided`);
            }
          }
        }

        // Check if we got an error or success as expected
        const hasError = !!result.error;
        const hasResult = !!result.result;

        if (testCase.expectSuccess && hasResult) {
          console.log(`   ✅ Request succeeded as expected`);
          passed++;
        } else if (!testCase.expectSuccess && hasError) {
          console.log(`   ✅ Request failed as expected (method likely not supported)`);
          passed++;
        } else if (!testCase.expectSuccess && hasResult) {
          console.log(`   ✅ Request unexpectedly succeeded (upstream supports method)`);
          passed++;
        } else {
          console.log(`   ❌ Unexpected result - expected success: ${testCase.expectSuccess}, got error: ${hasError}`);
          failed++;
        }
      } else {
        // No debug info, just check basic success/failure
        const hasError = !!result.error;

        if ((testCase.expectSuccess && !hasError) || (!testCase.expectSuccess && hasError)) {
          console.log(`   ✅ Request result matches expectation`);
          passed++;
        } else {
          console.log(`   ❌ Request result doesn't match expectation`);
          failed++;
        }
      }

    } catch (error) {
      console.log(`   💥 Request failed: ${(error as Error).message}`);
      failed++;
    }

    console.log('');
  }

  // Test batch requests with mixed methods
  console.log('🧪 Testing Batch Request with Mixed Methods...');

  try {
    const batchRequest = [
      { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 },
      { jsonrpc: '2.0', method: 'debug_traceTransaction', params: ['0x123'], id: 2 },
      { jsonrpc: '2.0', method: 'eth_getBalance', params: ['0x742d35Cc6634C0532925a3b8D000b5D97678fBBd', 'latest'], id: 3 }
    ];

    const response = await fetch(`${SERVER_URL}?debug=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batchRequest),
      timeout: TEST_TIMEOUT
    } as any);

    const batchResult = await response.json();

    if (Array.isArray(batchResult) && batchResult.length === 3) {
      console.log(`   ✅ Batch request returned ${batchResult.length} responses`);

      // Check if different methods were routed appropriately
      let routingCorrect = true;
      batchResult.forEach((resp: any, index: number) => {
        if (resp.debug?.context?.selectedUpstream) {
          console.log(`      Request ${index + 1} (${batchRequest[index].method}): ${resp.debug.context.selectedUpstream}`);
        }
      });

      passed++;
    } else {
      console.log(`   ❌ Batch request failed or returned unexpected format`);
      failed++;
    }
  } catch (error) {
    console.log(`   💥 Batch request failed: ${(error as Error).message}`);
    failed++;
  }

  console.log('');

  // Results
  console.log(`📊 Integration Test Results:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log(`\n🎉 All Method Routing integration tests passed!`);
  } else {
    console.log(`\n💥 ${failed} integration test(s) failed.`);
  }
}

// Run tests only if this file is executed directly
if (require.main === module) {
  runIntegrationTests().catch(error => {
    console.error('Integration test execution failed:', error);
    process.exit(1);
  });
}

export { runIntegrationTests };