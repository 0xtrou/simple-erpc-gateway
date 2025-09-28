#!/usr/bin/env ts-node

import { MethodRoutingOps } from '../src/operations/MethodRoutingOps';
import { PriorityRoutingOps } from '../src/operations/PriorityRoutingOps';
import { BlockBasedRoutingOps } from '../src/operations/BlockBasedRoutingOps';
import { FallbackArchivalRoutingOps } from '../src/operations/FallbackArchivalRoutingOps';
import { ErrorRatesOps } from '../src/operations/ErrorRatesOps';
import { RoutingContext, UpstreamConfig, UpstreamHealth, LocalNodeStatus } from '../src/types';

console.log('🧪 Starting Pipeline Architecture Tests...\n');

// Mock upstream configurations for comprehensive testing
const mockUpstreams: UpstreamConfig[] = [
  {
    id: 'fast-node',
    rpcUrl: 'https://fast-node.example.com',
    type: 'full',
    priority: 1,
    ignoredMethods: ['debug_*']
  },
  {
    id: 'slow-node',
    rpcUrl: 'https://slow-node.example.com',
    type: 'full',
    priority: 2,
    ignoredMethods: ['trace_*']
  },
  {
    id: 'archive-node',
    rpcUrl: 'https://archive-node.example.com',
    type: 'archive',
    priority: 3
    // No ignoredMethods - supports everything
  },
  {
    id: 'unreliable-node',
    rpcUrl: 'https://unreliable-node.example.com',
    type: 'full',
    priority: 4,
    ignoredMethods: ['eth_getLogs']
  }
];

// Create different health scenarios
function createHealthScenario(scenario: 'all-healthy' | 'some-unhealthy' | 'all-unhealthy' | 'some-recovering'): Map<string, UpstreamHealth> {
  const health = new Map<string, UpstreamHealth>();
  const now = Date.now();

  switch (scenario) {
    case 'all-healthy':
      mockUpstreams.forEach(upstream => {
        health.set(upstream.id, {
          errors: [],
          totalRequests: 10,
          totalErrors: 0,
          consecutiveErrors: 0,
          lastError: null,
          lastSuccessfulRequest: now,
          isHealthy: true,
          failoverUntil: 0,
          responseTime: 100
        });
      });
      break;

    case 'some-unhealthy':
      mockUpstreams.forEach((upstream, index) => {
        health.set(upstream.id, {
          errors: index < 2 ? [now - 1000] : [],
          totalRequests: 10,
          totalErrors: index < 2 ? 1 : 0,
          consecutiveErrors: index < 2 ? 1 : 0,
          lastError: index < 2 ? now - 1000 : null,
          lastSuccessfulRequest: now,
          isHealthy: index >= 2, // fast-node and slow-node unhealthy
          failoverUntil: index < 2 ? now + 30000 : 0,
          responseTime: 100
        });
      });
      break;

    case 'all-unhealthy':
      mockUpstreams.forEach(upstream => {
        health.set(upstream.id, {
          errors: [now - 1000],
          totalRequests: 10,
          totalErrors: 5,
          consecutiveErrors: 5,
          lastError: now - 1000,
          lastSuccessfulRequest: now - 60000,
          isHealthy: false,
          failoverUntil: now + 30000,
          responseTime: 1000
        });
      });
      break;

    case 'some-recovering':
      mockUpstreams.forEach((upstream, index) => {
        health.set(upstream.id, {
          errors: [],
          totalRequests: 10,
          totalErrors: index < 2 ? 2 : 0,
          consecutiveErrors: 0,
          lastError: index < 2 ? now - 60000 : null,
          lastSuccessfulRequest: now,
          isHealthy: index >= 2, // Only archive and unreliable are healthy
          failoverUntil: index < 2 ? now - 1000 : 0, // Recovery time expired for first two
          responseTime: 100
        });
      });
      break;
  }

  return health;
}

const mockNodeStatus: LocalNodeStatus = {
  earliestBlockHeight: 1000000,
  latestBlockHeight: 2000000,
  catchingUp: false,
  lastUpdated: Date.now()
};

// Test scenarios for the complete pipeline
const pipelineTestCases = [
  {
    name: 'eth_getBalance with all healthy upstreams',
    method: 'eth_getBalance',
    params: ['0x123', 'latest'],
    blockNumber: 'latest' as const,
    healthScenario: 'all-healthy' as const,
    expectedFlow: [
      { op: 'RecoveryFilter', upstreamsAfter: 4 },
      { op: 'MethodRouting', upstreamsAfter: 4 }, // No method restrictions
      { op: 'HealthFiltering', upstreamsAfter: 4 }, // All healthy
      { op: 'ArchiveFilter', upstreamsAfter: 4 }, // Pass through
      { op: 'BlockBasedSelector', selection: 'fast-node' } // First non-archive
    ]
  },
  {
    name: 'debug_traceTransaction with mixed health',
    method: 'debug_traceTransaction',
    params: ['0x456'],
    blockNumber: 1500000,
    healthScenario: 'some-unhealthy' as const,
    expectedFlow: [
      { op: 'RecoveryFilter', upstreamsAfter: 4 },
      { op: 'MethodRouting', upstreamsAfter: 3 }, // Excludes fast-node (ignores debug_*)
      { op: 'HealthFiltering', upstreamsAfter: 2 }, // Only archive and unreliable healthy
      { op: 'ArchiveFilter', upstreamsAfter: 1 }, // Prefers archive for historical
      { op: 'BlockBasedSelector', selection: 'archive-node' }
    ]
  },
  {
    name: 'All upstreams unhealthy - recovery attempt',
    method: 'eth_chainId',
    params: [],
    blockNumber: null,
    healthScenario: 'all-unhealthy' as const,
    expectedFlow: [
      { op: 'RecoveryFilter', upstreamsAfter: 4 }, // Last resort - includes all
      { op: 'MethodRouting', upstreamsAfter: 4 }, // No restrictions
      { op: 'HealthFiltering', upstreamsAfter: 0 }, // All unhealthy
      { op: 'Emergency fallback', selection: 'fast-node' }
    ]
  },
  {
    name: 'Some upstreams recovering',
    method: 'eth_getBalance',
    params: ['0x789', 'latest'],
    blockNumber: 'latest' as const,
    healthScenario: 'some-recovering' as const,
    expectedFlow: [
      { op: 'RecoveryFilter', upstreamsAfter: 4 }, // Recovers fast-node and slow-node
      { op: 'MethodRouting', upstreamsAfter: 4 }, // No restrictions
      { op: 'HealthFiltering', upstreamsAfter: 4 }, // All should be healthy after recovery
      { op: 'ArchiveFilter', upstreamsAfter: 4 }, // Pass through
      { op: 'BlockBasedSelector', selection: 'fast-node' }
    ]
  },
  {
    name: 'Historical block requiring archive',
    method: 'eth_getBlockByNumber',
    params: ['0x7A120'], // Old block
    blockNumber: 500000, // Very old block
    healthScenario: 'all-healthy' as const,
    expectedFlow: [
      { op: 'RecoveryFilter', upstreamsAfter: 4 },
      { op: 'MethodRouting', upstreamsAfter: 4 },
      { op: 'HealthFiltering', upstreamsAfter: 4 },
      { op: 'ArchiveFilter', upstreamsAfter: 1 }, // Filters to only archive nodes
      { op: 'BlockBasedSelector', selection: 'archive-node' } // Old block needs archive
    ]
  }
];

async function runPipelineTests(): Promise<void> {
  let passed = 0;
  let failed = 0;

  for (const testCase of pipelineTestCases) {
    console.log(`🧪 Testing: ${testCase.name}`);

    try {
      const health = createHealthScenario(testCase.healthScenario);
      let currentUpstreams = [...mockUpstreams];

      const context: RoutingContext = {
        request: {
          jsonrpc: '2.0',
          method: testCase.method,
          params: testCase.params,
          id: 1
        },
        blockNumber: testCase.blockNumber,
        nodeStatus: mockNodeStatus,
        availableUpstreams: currentUpstreams,
      allUpstreams: currentUpstreams,
        upstreamHealth: health,
        config: {
          blockHeightBuffer: 100,
          errorRateThreshold: 0.1,
          health: {
            errorRateWindowMs: 300000,
            maxConsecutiveErrors: 3,
            failoverCooldownMs: 30000,
            nodeStatusTimeoutMs: 5000
          }
        } as any,
        appConfig: {
          historicalMethods: ['eth_getBlockByNumber', 'eth_getBlockByHash', 'debug_traceTransaction']
        } as any
      };

      // Simulate pipeline execution
      const operations = [
        new ErrorRatesOps(),
        new MethodRoutingOps(),
        new PriorityRoutingOps(),
        new FallbackArchivalRoutingOps(),
        new BlockBasedRoutingOps()
      ];

      let selectedUpstream = null;
      let flowResults = [];

      for (const operation of operations) {
        context.availableUpstreams = currentUpstreams;
        const result = await operation.execute(context);

        flowResults.push({
          operation: operation.name,
          upstreamsAfter: result.filteredUpstreams.length,
          selectedUpstream: result.selectedUpstream?.id,
          reason: result.reason
        });

        if (result.selectedUpstream) {
          selectedUpstream = result.selectedUpstream;
          break;
        }

        currentUpstreams = result.filteredUpstreams;

        if (!result.shouldContinue || currentUpstreams.length === 0) {
          break;
        }
      }

      // If no upstream selected, use first available as fallback (simulating DefaultRoutingStrategy behavior)
      if (!selectedUpstream && context.availableUpstreams.length > 0) {
        selectedUpstream = context.availableUpstreams[0];
        flowResults.push({
          operation: 'Emergency fallback',
          upstreamsAfter: context.availableUpstreams.length,
          selectedUpstream: selectedUpstream.id,
          reason: 'Last resort selection from original upstreams'
        });
      }

      // Display flow results
      console.log(`   📊 Pipeline Flow:`);
      flowResults.forEach((flow, index) => {
        console.log(`      ${index + 1}. ${flow.operation}: ${flow.upstreamsAfter} upstreams${flow.selectedUpstream ? ` → Selected: ${flow.selectedUpstream}` : ''}`);
        console.log(`         Reason: ${flow.reason}`);
      });

      // Validate expected flow
      let testPassed = true;
      let validationErrors = [];

      if (testCase.expectedFlow) {
        for (const expected of testCase.expectedFlow) {
          const actualFlow = flowResults.find(f => f.operation.includes(expected.op));

          if (!actualFlow) {
            testPassed = false;
            validationErrors.push(`Missing operation: ${expected.op}`);
            continue;
          }

          if ('upstreamsAfter' in expected && actualFlow.upstreamsAfter !== expected.upstreamsAfter) {
            testPassed = false;
            validationErrors.push(`${expected.op}: Expected ${expected.upstreamsAfter} upstreams, got ${actualFlow.upstreamsAfter}`);
          }

          if ('selection' in expected && actualFlow.selectedUpstream !== expected.selection) {
            testPassed = false;
            validationErrors.push(`${expected.op}: Expected selection ${expected.selection}, got ${actualFlow.selectedUpstream || 'none'}`);
          }
        }
      }

      if (testPassed) {
        console.log(`   ✅ Pipeline flow validated successfully\n`);
        passed++;
      } else {
        console.log(`   ❌ Pipeline flow validation failed:`);
        validationErrors.forEach(error => console.log(`      - ${error}`));
        console.log('');
        failed++;
      }

    } catch (error) {
      console.log(`   💥 Test execution failed: ${(error as Error).message}\n`);
      failed++;
    }
  }

  console.log(`📊 Pipeline Architecture Test Results:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log(`\n🎉 All Pipeline Architecture tests passed!`);
    process.exit(0);
  } else {
    console.log(`\n💥 ${failed} test(s) failed.`);
    process.exit(1);
  }
}

// Run tests only if this file is executed directly
if (require.main === module) {
  runPipelineTests().catch(error => {
    console.error('Pipeline test execution failed:', error);
    process.exit(1);
  });
}

export { runPipelineTests };