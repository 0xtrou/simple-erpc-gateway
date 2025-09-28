#!/usr/bin/env ts-node

import { ErrorRatesOps } from '../src/operations/ErrorRatesOps';
import { RoutingContext, UpstreamConfig, UpstreamHealth } from '../src/types';

console.log('🧪 Starting Recovery Priority Tests...\n');

// Test upstreams for recovery scenarios
const testUpstreams: UpstreamConfig[] = [
  {
    id: 'recently-failed',
    rpcUrl: 'https://recently-failed.example.com',
    type: 'full',
    priority: 1
  },
  {
    id: 'long-failed',
    rpcUrl: 'https://long-failed.example.com',
    type: 'full',
    priority: 2
  },
  {
    id: 'healthy-node',
    rpcUrl: 'https://healthy-node.example.com',
    type: 'archive',
    priority: 3
  },
  {
    id: 'recovering-node',
    rpcUrl: 'https://recovering-node.example.com',
    type: 'full',
    priority: 4
  }
];

const recoveryTestCases = [
  {
    name: 'All upstreams healthy - should pass through unchanged',
    scenario: () => {
      const health = new Map<string, UpstreamHealth>();
      const now = Date.now();

      testUpstreams.forEach(upstream => {
        health.set(upstream.id, {
          errors: [],
          totalRequests: 100,
          totalErrors: 0,
          consecutiveErrors: 0,
          lastError: null,
          lastSuccessfulRequest: now,
          isHealthy: true,
          failoverUntil: 0,
          responseTime: 100
        });
      });

      return { health, expectedRecoveries: 0, expectedAvailable: 4 };
    }
  },
  {
    name: 'Some upstreams in cooldown but improved - should recover',
    scenario: () => {
      const health = new Map<string, UpstreamHealth>();
      const now = Date.now();

      health.set('recently-failed', {
        errors: [], // No recent errors
        totalRequests: 100,
        totalErrors: 2,
        consecutiveErrors: 0,
        lastError: now - 120000, // 2 minutes ago
        lastSuccessfulRequest: now - 30000,
        isHealthy: false,
        failoverUntil: now - 1000, // Cooldown expired
        responseTime: 100
      });

      health.set('long-failed', {
        errors: Array.from({length: 50}, (_, i) => now - (i * 1000)), // Many recent errors in window
        totalRequests: 100,
        totalErrors: 50, // 50% error rate, above threshold
        consecutiveErrors: 5,
        lastError: now - 50000,
        lastSuccessfulRequest: now - 180000,
        isHealthy: false,
        failoverUntil: now - 1000, // Cooldown expired but still erroring
        responseTime: 1000
      });

      health.set('healthy-node', {
        errors: [],
        totalRequests: 50,
        totalErrors: 0,
        consecutiveErrors: 0,
        lastError: null,
        lastSuccessfulRequest: now,
        isHealthy: true,
        failoverUntil: 0,
        responseTime: 200
      });

      health.set('recovering-node', {
        errors: [], // Recently cleared errors
        totalRequests: 80,
        totalErrors: 5,
        consecutiveErrors: 0,
        lastError: now - 300000, // 5 minutes ago
        lastSuccessfulRequest: now - 10000,
        isHealthy: false,
        failoverUntil: now - 1000, // Cooldown expired
        responseTime: 150
      });

      return { health, expectedRecoveries: 2, expectedAvailable: 4 }; // recently-failed and recovering-node should recover
    }
  },
  {
    name: 'All upstreams failed with no recovery - should use last resort',
    scenario: () => {
      const health = new Map<string, UpstreamHealth>();
      const now = Date.now();

      testUpstreams.forEach(upstream => {
        health.set(upstream.id, {
          errors: [now - 1000, now - 2000, now - 3000], // Recent errors
          totalRequests: 100,
          totalErrors: 50,
          consecutiveErrors: 10,
          lastError: now - 1000,
          lastSuccessfulRequest: now - 300000,
          isHealthy: false,
          failoverUntil: now + 30000, // Still in cooldown
          responseTime: 2000
        });
      });

      return { health, expectedRecoveries: 0, expectedAvailable: 4 }; // Last resort includes all
    }
  },
  {
    name: 'No upstreams available at all - should handle gracefully',
    scenario: () => {
      const health = new Map<string, UpstreamHealth>();
      return { health, expectedRecoveries: 0, expectedAvailable: 4 }; // RecoveryFilter passes through all upstreams
    }
  },
  {
    name: 'Mixed recovery scenarios with different error rates',
    scenario: () => {
      const health = new Map<string, UpstreamHealth>();
      const now = Date.now();

      // Node with low error rate that should recover
      health.set('recently-failed', {
        errors: [], // Cleared recent errors
        totalRequests: 1000,
        totalErrors: 10, // 1% error rate
        consecutiveErrors: 0,
        lastError: now - 180000,
        lastSuccessfulRequest: now - 5000,
        isHealthy: false,
        failoverUntil: now - 1000,
        responseTime: 100
      });

      // Node with high error rate that shouldn't recover
      health.set('long-failed', {
        errors: Array.from({length: 50}, (_, i) => now - (i * 1000)), // Many recent errors
        totalRequests: 100,
        totalErrors: 50, // 50% error rate
        consecutiveErrors: 20,
        lastError: now - 500,
        lastSuccessfulRequest: now - 600000,
        isHealthy: false,
        failoverUntil: now - 1000,
        responseTime: 3000
      });

      // Healthy node
      health.set('healthy-node', {
        errors: [],
        totalRequests: 500,
        totalErrors: 2,
        consecutiveErrors: 0,
        lastError: now - 600000,
        lastSuccessfulRequest: now - 1000,
        isHealthy: true,
        failoverUntil: 0,
        responseTime: 150
      });

      // Borderline recovery case
      health.set('recovering-node', {
        errors: [], // Recently improved
        totalRequests: 200,
        totalErrors: 19, // Just under 10% error rate threshold
        consecutiveErrors: 0,
        lastError: now - 240000,
        lastSuccessfulRequest: now - 2000,
        isHealthy: false,
        failoverUntil: now - 1000,
        responseTime: 200
      });

      return { health, expectedRecoveries: 2, expectedAvailable: 4 }; // recently-failed and recovering-node should recover
    }
  }
];

async function runRecoveryTests(): Promise<void> {
  let passed = 0;
  let failed = 0;

  for (const testCase of recoveryTestCases) {
    console.log(`🧪 Testing: ${testCase.name}`);

    try {
      const { health, expectedRecoveries, expectedAvailable } = testCase.scenario();
      const errorRatesOps = new ErrorRatesOps();

      // Count initially unhealthy upstreams
      const initiallyUnhealthy = Array.from(health.values()).filter(h => !h.isHealthy).length;

      const context: RoutingContext = {
        request: {
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: ['0x123', 'latest'],
          id: 1
        },
        blockNumber: 'latest',
        nodeStatus: null,
        availableUpstreams: testUpstreams,
        upstreamHealth: health,
        config: {
          errorRateThreshold: 0.1, // 10%
          health: {
            errorRateWindowMs: 300000, // 5 minutes
            maxConsecutiveErrors: 5,
            failoverCooldownMs: 30000,
            nodeStatusTimeoutMs: 5000
          }
        } as any,
        appConfig: {} as any
      };

      const result = await errorRatesOps.execute(context);

      // Count how many upstreams were recovered (marked healthy)
      const finallyHealthy = Array.from(health.values()).filter(h => h.isHealthy).length;
      const actualRecoveries = Math.max(0, finallyHealthy - (testUpstreams.length - initiallyUnhealthy));

      console.log(`   📊 Results:`);
      console.log(`      Initially unhealthy: ${initiallyUnhealthy}`);
      console.log(`      Actually recovered: ${actualRecoveries}`);
      console.log(`      Final available upstreams: ${result.filteredUpstreams.length}`);
      console.log(`      Reason: ${result.reason}`);

      // Validate results
      let testPassed = true;
      const errors = [];

      if (Math.abs(actualRecoveries - expectedRecoveries) > 0) {
        testPassed = false;
        errors.push(`Expected ${expectedRecoveries} recoveries, got ${actualRecoveries}`);
      }

      if (result.filteredUpstreams.length !== expectedAvailable) {
        testPassed = false;
        errors.push(`Expected ${expectedAvailable} available upstreams, got ${result.filteredUpstreams.length}`);
      }

      if (testPassed) {
        console.log(`   ✅ Recovery test passed\n`);
        passed++;
      } else {
        console.log(`   ❌ Recovery test failed:`);
        errors.forEach(error => console.log(`      - ${error}`));
        console.log('');
        failed++;
      }

    } catch (error) {
      console.log(`   💥 Test execution failed: ${(error as Error).message}\n`);
      failed++;
    }
  }

  console.log(`📊 Recovery Priority Test Results:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log(`\n🎉 All Recovery Priority tests passed!`);
    process.exit(0);
  } else {
    console.log(`\n💥 ${failed} test(s) failed.`);
    process.exit(1);
  }
}

// Run tests only if this file is executed directly
if (require.main === module) {
  runRecoveryTests().catch(error => {
    console.error('Recovery test execution failed:', error);
    process.exit(1);
  });
}

export { runRecoveryTests };