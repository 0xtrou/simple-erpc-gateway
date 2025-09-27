#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { AppConfig, DebugResponse } from '../src/types';

interface OperationTestCase {
  name: string;
  description: string;
  request: any;
  expectedPipeline: string[];
  expectedUpstreamType: 'full' | 'archive';
  shouldFailCurrently: boolean; // TDD: expect these to fail with current implementation
}

async function runOperationSequenceTests(): Promise<void> {
  // Load config
  const configPath = path.join(__dirname, '../../config.json');
  const config: AppConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const baseUrl = `http://${config.server.host}:${config.server.port}`;

  console.log('🧪 TDD: Testing Operation Sequence Logic...\n');

  const testCases: OperationTestCase[] = [
    {
      name: 'Non-Block Method Should Use Priority Routing',
      description: 'eth_getBalance should only trigger PriorityRouting',
      request: {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [config.testing.testAddress, 'latest'],
        id: 1
      },
      expectedPipeline: ['pipeline', 'PriorityRouting', 'request_proxy'],
      expectedUpstreamType: 'full',
      shouldFailCurrently: false // This should already work
    },
    {
      name: 'Recent Block Should Use BlockBased Routing',
      description: 'Recent block should skip PriorityRouting and use BlockBasedRouting',
      request: {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
        id: 2
      },
      expectedPipeline: ['pipeline', 'PriorityRouting', 'BlockBasedRouting', 'request_proxy'],
      expectedUpstreamType: 'full',
      shouldFailCurrently: false // Should now pass - PriorityRouting skips, BlockBased handles
    },
    {
      name: 'Historical Block Should Use Archival Routing',
      description: 'Old block should skip Priority, try BlockBased, then use FallbackArchivalRouting',
      request: {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: [config.testing.veryOldBlockHex, false], // Very old block
        id: 3
      },
      expectedPipeline: ['pipeline', 'PriorityRouting', 'BlockBasedRouting', 'FallbackArchivalRouting', 'request_proxy'],
      expectedUpstreamType: 'archive',
      shouldFailCurrently: false // Should now pass - full pipeline for old blocks
    },
    {
      name: 'Medium-Old Block Should Use BlockBased Routing',
      description: 'Moderately old block should skip Priority and use BlockBased for recent blocks',
      request: {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: [config.testing.historicalBlockHex, false], // Historical but recent enough for full nodes
        id: 4
      },
      expectedPipeline: ['pipeline', 'PriorityRouting', 'BlockBasedRouting', 'request_proxy'],
      expectedUpstreamType: 'full', // Recent enough for full nodes
      shouldFailCurrently: false // Should pass - BlockBased handles recent blocks
    },
    {
      name: 'Debug Trace Should Use BlockBased Routing',
      description: 'debug_traceBlockByNumber should use block-based routing for latest',
      request: {
        jsonrpc: '2.0',
        method: 'debug_traceBlockByNumber',
        params: ['latest', {}],
        id: 5
      },
      expectedPipeline: ['pipeline', 'PriorityRouting', 'BlockBasedRouting', 'request_proxy'],
      expectedUpstreamType: 'full',
      shouldFailCurrently: false // Should now pass - PriorityRouting skips, BlockBased handles
    }
  ];

  let passedTests = 0;
  let failedAsExpected = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    console.log(`📋 ${testCase.name}...`);
    console.log(`   ${testCase.description}`);
    console.log(`   Expected: ${testCase.expectedPipeline.join(' → ')}`);

    try {
      const response = await fetch(`${baseUrl}?debug=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testCase.request),
        timeout: config.testing.timeout
      });

      const result = await response.json() as DebugResponse;

      if (!result.debug) {
        console.log(`❌ ${testCase.name} - NO DEBUG INFO`);
        continue;
      }

      const actualPipeline = result.debug.strategy.pipeline;
      const actualUpstream = config.projects[0].upstreams.find((u: any) => u.id === result.debug!.context.selectedUpstream);

      console.log(`   Actual:   ${actualPipeline.join(' → ')}`);

      // Check if pipeline matches expected
      const pipelineMatches = JSON.stringify(actualPipeline) === JSON.stringify(testCase.expectedPipeline);

      // Check if upstream type matches
      const upstreamTypeMatches = actualUpstream?.type === testCase.expectedUpstreamType;

      if (pipelineMatches && upstreamTypeMatches) {
        if (testCase.shouldFailCurrently) {
          console.log(`🚨 ${testCase.name} - UNEXPECTED PASS (should fail with current implementation)`);
        } else {
          console.log(`✅ ${testCase.name} - PASS`);
          passedTests++;
        }
      } else {
        if (testCase.shouldFailCurrently) {
          console.log(`📍 ${testCase.name} - EXPECTED FAILURE (TDD)`);
          console.log(`      Pipeline mismatch: expected ${testCase.expectedPipeline.join(' → ')}, got ${actualPipeline.join(' → ')}`);
          if (!upstreamTypeMatches) {
            console.log(`      Upstream type mismatch: expected ${testCase.expectedUpstreamType}, got ${actualUpstream?.type}`);
          }
          failedAsExpected++;
        } else {
          console.log(`❌ ${testCase.name} - UNEXPECTED FAILURE`);
          console.log(`      Pipeline mismatch: expected ${testCase.expectedPipeline.join(' → ')}, got ${actualPipeline.join(' → ')}`);
        }
      }

    } catch (error) {
      console.log(`❌ ${testCase.name} - ERROR: ${(error as Error).message}`);
    }

    console.log('');
  }

  // Summary
  console.log(`🏁 TDD Operation Sequence Tests Completed!`);
  console.log(`   Passed: ${passedTests}/${totalTests}`);
  console.log(`   Expected Failures (TDD): ${failedAsExpected}/${totalTests}`);
  console.log(`   Total Expected Behavior: ${passedTests + failedAsExpected}/${totalTests}`);

  if (passedTests + failedAsExpected === totalTests) {
    console.log(`   ✅ All tests behaved as expected (some failures expected for TDD)`);
    process.exit(0);
  } else {
    console.log(`   ❌ Unexpected test behavior detected`);
    process.exit(1);
  }
}

if (require.main === module) {
  runOperationSequenceTests().catch((error) => {
    console.error('TDD test runner error:', error);
    process.exit(1);
  });
}

export { runOperationSequenceTests };