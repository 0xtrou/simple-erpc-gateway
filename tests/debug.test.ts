#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { AppConfig, DebugResponse } from '../src/types';

interface DebugTestCase {
  name: string;
  body: any;
  expectedUpstreamType?: 'full' | 'archive';
  expectedOperations?: string[];
  description: string;
}

async function runDebugTests(): Promise<void> {
  // Load config (from dist/tests/ to root)
  const configPath = path.join(__dirname, '../../config.json');
  const config: AppConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const baseUrl = `http://${config.server.host}:${config.server.port}`;

  console.log('🧪 Running Debug Mode Tests...\n');

  const testCases: DebugTestCase[] = [
    {
      name: 'Priority Routing - Latest Block',
      description: 'Should use PriorityRoutingOps to select cheap node for latest block',
      body: {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
        id: 1
      },
      expectedUpstreamType: 'full',
      expectedOperations: ['PriorityRouting', 'pipeline']
    },
    {
      name: 'Block-Based Routing - Latest Block',
      description: 'Should use BlockBasedRoutingOps for latest block with cheap node',
      body: {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false], // Latest block - should use cheap node
        id: 2
      },
      expectedUpstreamType: 'full',
      expectedOperations: ['BlockBasedRouting']
    },
    {
      name: 'Archive Fallback - Historical Block',
      description: 'Should use FallbackArchivalRoutingOps for old block requiring archive node',
      body: {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: [config.testing.veryOldBlockHex, false],
        id: 3
      },
      expectedUpstreamType: 'archive',
      expectedOperations: ['FallbackArchivalRouting']
    },
    {
      name: 'Priority Routing - Non-Block Method',
      description: 'Should use PriorityRoutingOps for methods without block parameters',
      body: {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [config.testing.testAddress, 'latest'],
        id: 4
      },
      expectedUpstreamType: 'full',
      expectedOperations: ['PriorityRouting']
    },
    {
      name: 'Debug Trace - Block-Based',
      description: 'Should handle debug_traceBlockByNumber with block-based routing',
      body: {
        jsonrpc: '2.0',
        method: 'debug_traceBlockByNumber',
        params: ['latest', {}],
        id: 5
      },
      expectedOperations: ['PriorityRouting', 'BlockBasedRouting']
    }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    console.log(`📋 ${testCase.name}...`);
    console.log(`   ${testCase.description}`);

    try {
      const response = await fetch(`${baseUrl}?debug=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testCase.body),
        timeout: config.testing.timeout
      });

      const result = await response.json() as DebugResponse;

      if (!response.ok) {
        console.log(`❌ ${testCase.name} - REQUEST FAILED (${response.status})`);
        console.log(`   Error: ${JSON.stringify(result)}`);
        continue;
      }

      // Validate debug information is present
      if (!result.debug) {
        console.log(`❌ ${testCase.name} - NO DEBUG INFO`);
        console.log(`   Response missing debug information`);
        continue;
      }

      let testPassed = true;
      const issues: string[] = [];

      // Validate request ID format
      if (!result.debug.requestId.startsWith('req_')) {
        issues.push('Invalid request ID format');
        testPassed = false;
      }

      // Validate duration is reasonable
      if (result.debug.totalDuration < config.testing.minDurationMs ||
          result.debug.totalDuration > config.testing.maxDurationMs) {
        issues.push(`Unreasonable duration: ${result.debug.totalDuration}ms`);
        testPassed = false;
      }

      // Validate pipeline operations
      if (result.debug.strategy.pipeline.length === 0) {
        issues.push('No pipeline operations recorded');
        testPassed = false;
      }

      // Validate events
      if (result.debug.strategy.events.length === 0) {
        issues.push('No events recorded');
        testPassed = false;
      }

      // Validate context
      if (!result.debug.context.availableUpstreams || result.debug.context.availableUpstreams.length === 0) {
        issues.push('No available upstreams in context');
        testPassed = false;
      }

      // Validate expected operations (if specified)
      if (testCase.expectedOperations) {
        const recordedOperations = result.debug.strategy.pipeline;
        const missingOperations = testCase.expectedOperations.filter(
          expected => !recordedOperations.includes(expected)
        );
        if (missingOperations.length > 0) {
          issues.push(`Missing expected operations: ${missingOperations.join(', ')}`);
          testPassed = false;
        }
      }

      // Validate upstream type (if specified)
      if (testCase.expectedUpstreamType && result.debug?.context.selectedUpstream) {
        const selectedUpstream = config.projects[0].upstreams.find((u: any) => u.id === result.debug!.context.selectedUpstream);
        if (!selectedUpstream || selectedUpstream.type !== testCase.expectedUpstreamType) {
          issues.push(`Expected ${testCase.expectedUpstreamType} upstream, got ${selectedUpstream?.type || 'unknown'}`);
          testPassed = false;
        }
      }

      if (testPassed) {
        console.log(`✅ ${testCase.name} - SUCCESS`);
        console.log(`   Request ID: ${result.debug.requestId}`);
        console.log(`   Duration: ${result.debug.totalDuration}ms`);
        console.log(`   Pipeline: ${result.debug.strategy.pipeline.join(' → ')}`);
        console.log(`   Selected Upstream: ${result.debug.context.selectedUpstream}`);
        console.log(`   Events: ${result.debug.strategy.events.length} logged`);

        // Show key decision events
        const decisionEvents = result.debug.strategy.events.filter(e =>
          e.action === 'result' && e.data.upstream
        );
        if (decisionEvents.length > 0) {
          console.log(`   Key Decision: ${decisionEvents[0].operation} - ${decisionEvents[0].data.reason}`);
        }

        passedTests++;
      } else {
        console.log(`❌ ${testCase.name} - VALIDATION FAILED`);
        issues.forEach(issue => console.log(`   - ${issue}`));
      }

    } catch (error) {
      console.log(`❌ ${testCase.name} - ERROR`);
      console.log(`   ${(error as Error).message}`);
    }

    console.log('');
  }

  // Test error scenarios
  console.log('📋 Testing Error Scenarios with Debug...');

  try {
    const errorResponse = await fetch(`${baseUrl}?debug=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'invalid_method',
        params: [],
        id: 999
      }),
      timeout: config.testing.timeout
    });

    const errorResult = await errorResponse.json() as DebugResponse;

    if (errorResult.debug) {
      console.log(`✅ Error scenario with debug - SUCCESS`);
      console.log(`   Error debug info captured with ${errorResult.debug.strategy.events.length} events`);
      passedTests++;
    } else {
      console.log(`❌ Error scenario with debug - FAILED`);
      console.log(`   No debug info in error response`);
    }
    totalTests++;
  } catch (error) {
    console.log(`❌ Error scenario test failed: ${(error as Error).message}`);
    totalTests++;
  }

  console.log('');

  // Summary
  console.log(`🏁 Debug Tests Completed!`);
  console.log(`   Passed: ${passedTests}/${totalTests}`);
  if (passedTests === totalTests) {
    console.log(`   ✅ All tests passed!`);
    process.exit(0);
  } else {
    console.log(`   ❌ ${totalTests - passedTests} tests failed`);
    process.exit(1);
  }
}

if (require.main === module) {
  runDebugTests().catch((error) => {
    console.error('Debug test runner error:', error);
    process.exit(1);
  });
}

export { runDebugTests };