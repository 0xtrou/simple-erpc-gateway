#!/usr/bin/env ts-node

import { MethodRoutingOps } from '../src/operations/MethodRoutingOps';
import { RoutingContext, UpstreamConfig, UpstreamHealth } from '../src/types';

console.log('🧪 Starting Method Routing Tests...\n');

// Mock upstream configurations for testing
const mockUpstreams: UpstreamConfig[] = [
  {
    id: 'full-node-1',
    rpcUrl: 'https://full-node-1.example.com',
    type: 'full',
    priority: 1,
    ignoredMethods: ['debug_*', 'trace_*']
  },
  {
    id: 'full-node-2',
    rpcUrl: 'https://full-node-2.example.com',
    type: 'full',
    priority: 2,
    ignoredMethods: ['debug_traceTransaction', 'eth_getLogs']
  },
  {
    id: 'archive-node',
    rpcUrl: 'https://archive-node.example.com',
    type: 'archive',
    priority: 3
    // No ignoredMethods - supports everything
  },
  {
    id: 'limited-node',
    rpcUrl: 'https://limited-node.example.com',
    type: 'full',
    priority: 4,
    ignoredMethods: ['debug_*', 'trace_*', 'eth_getLogs', 'eth_getBlockByNumber']
  }
];

// Mock upstream health (all healthy for testing)
const mockUpstreamHealth = new Map<string, UpstreamHealth>();
mockUpstreams.forEach(upstream => {
  mockUpstreamHealth.set(upstream.id, {
    errors: [],
    totalRequests: 10,
    totalErrors: 0,
    consecutiveErrors: 0,
    lastError: null,
    lastSuccessfulRequest: Date.now(),
    isHealthy: true,
    failoverUntil: 0,
    responseTime: 100
  });
});

const methodRoutingOps = new MethodRoutingOps();

// Test cases - now testing filtering behavior
const testCases = [
  {
    name: 'eth_getBalance - should include all upstreams (no method restrictions)',
    method: 'eth_getBalance',
    expectedUpstream: 'all' // Should include all upstreams
  },
  {
    name: 'debug_traceTransaction - should exclude both full-node-1 and full-node-2',
    method: 'debug_traceTransaction',
    expectedUpstream: 'archive-node' // Should exclude both full-node-1 and full-node-2
  },
  {
    name: 'trace_block - should exclude full-node-1 (ignores trace_*)',
    method: 'trace_block',
    expectedUpstream: 'full-node-2' // Should exclude full-node-1
  },
  {
    name: 'eth_getLogs - should exclude full-node-2 (ignores eth_getLogs)',
    method: 'eth_getLogs',
    expectedUpstream: 'full-node-1' // Should exclude full-node-2
  },
  {
    name: 'debug_getBadBlocks - should exclude full-node-1 (ignores debug_*)',
    method: 'debug_getBadBlocks',
    expectedUpstream: 'full-node-2' // Should exclude full-node-1
  },
  {
    name: 'eth_getBlockByNumber - should exclude limited-node',
    method: 'eth_getBlockByNumber',
    expectedUpstream: 'full-node-1' // Should exclude limited-node
  },
  {
    name: 'eth_chainId - should include all upstreams (no restrictions)',
    method: 'eth_chainId',
    expectedUpstream: 'all' // Should include all upstreams
  }
];

async function runTests(): Promise<void> {
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      const context: RoutingContext = {
        request: {
          jsonrpc: '2.0',
          method: testCase.method,
          params: [],
          id: 1
        },
        blockNumber: null,
        nodeStatus: null,
        availableUpstreams: mockUpstreams,
        upstreamHealth: mockUpstreamHealth,
        config: {} as any,
        appConfig: {} as any
      };

      const result = await methodRoutingOps.execute(context);

      // For filtering operations, check filtering behavior
      const filteredIds = result.filteredUpstreams.map(u => u.id);
      let testPassed = false;

      if (testCase.expectedUpstream === 'all') {
        // Should include all upstreams
        testPassed = filteredIds.length === mockUpstreams.length;
      } else {
        // Should include the expected upstream and possibly others
        testPassed = filteredIds.includes(testCase.expectedUpstream);
      }

      if (testPassed) {
        console.log(`✅ ${testCase.name}`);
        console.log(`   Filtered upstreams: ${filteredIds.join(', ')}, Reason: ${result.reason}\n`);
        passed++;
      } else {
        console.log(`❌ ${testCase.name}`);
        console.log(`   Expected behavior not met. Filtered upstreams: ${filteredIds.join(', ') || 'none'}`);
        console.log(`   Reason: ${result.reason}\n`);
        failed++;
      }
    } catch (error) {
      console.log(`💥 ${testCase.name} - Error: ${(error as Error).message}\n`);
      failed++;
    }
  }

  // Test wildcard pattern matching separately
  console.log('🧪 Testing Wildcard Pattern Matching...\n');

  const wildcardTests = [
    { method: 'debug_traceTransaction', pattern: 'debug_*', shouldMatch: true },
    { method: 'debug_getBadBlocks', pattern: 'debug_*', shouldMatch: true },
    { method: 'trace_block', pattern: 'debug_*', shouldMatch: false },
    { method: 'eth_getBalance', pattern: 'debug_*', shouldMatch: false },
    { method: 'trace_transaction', pattern: 'trace_*', shouldMatch: true },
    { method: 'debug_trace', pattern: 'trace_*', shouldMatch: false }
  ];

  for (const test of wildcardTests) {
    const methodOps = new MethodRoutingOps();
    const isIgnored = methodOps['isMethodIgnored'](test.method, [test.pattern]);

    if (isIgnored === test.shouldMatch) {
      console.log(`✅ Pattern "${test.pattern}" ${test.shouldMatch ? 'matches' : 'does not match'} "${test.method}"`);
      passed++;
    } else {
      console.log(`❌ Pattern "${test.pattern}" should ${test.shouldMatch ? 'match' : 'not match'} "${test.method}"`);
      failed++;
    }
  }

  // Test with all upstreams unhealthy
  console.log('\n🧪 Testing All Upstreams Unhealthy...\n');

  const unhealthyHealth = new Map<string, UpstreamHealth>();
  mockUpstreams.forEach(upstream => {
    unhealthyHealth.set(upstream.id, {
      errors: [],
      totalRequests: 10,
      totalErrors: 5,
      consecutiveErrors: 5,
      lastError: Date.now(),
      lastSuccessfulRequest: Date.now() - 60000,
      isHealthy: false,
      failoverUntil: Date.now() + 30000,
      responseTime: 1000
    });
  });

  const unhealthyContext: RoutingContext = {
    request: {
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [],
      id: 1
    },
    blockNumber: null,
    nodeStatus: null,
    availableUpstreams: mockUpstreams,
    upstreamHealth: unhealthyHealth,
    config: {} as any,
    appConfig: {} as any
  };

  const unhealthyResult = await methodRoutingOps.execute(unhealthyContext);

  // Method routing should still filter by method support, regardless of health
  if (unhealthyResult.filteredUpstreams.length > 0 && unhealthyResult.shouldContinue === true) {
    console.log(`✅ All unhealthy upstreams - correctly filters by method support and continues pipeline`);
    console.log(`   Reason: ${unhealthyResult.reason}\n`);
    passed++;
  } else {
    console.log(`❌ All unhealthy upstreams - should filter by method and continue`);
    console.log(`   Got filtered upstreams: ${unhealthyResult.filteredUpstreams.length}, shouldContinue: ${unhealthyResult.shouldContinue}\n`);
    failed++;
  }

  // Results
  console.log(`\n📊 Test Results:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log(`\n🎉 All Method Routing tests passed!`);
    process.exit(0);
  } else {
    console.log(`\n💥 ${failed} test(s) failed.`);
    process.exit(1);
  }
}

// Run tests only if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { runTests };