#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

async function runBatchRequestTests(): Promise<void> {
  // Load config (from dist/tests/ to root)
  const configPath = path.join(__dirname, '../../config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const baseUrl = `http://${config.server.host}:${config.server.port}`;

  console.log('🧪 Running Batch Request Tests...\n');

  const testCases = [
    {
      name: 'Valid Single Item Batch',
      description: 'Should handle batch with single valid request',
      body: [
        {
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [config.testing.testAddress, 'latest'],
          id: 1
        }
      ],
      expectedStatus: 200,
      expectedResponseType: 'array',
      expectedLength: 1,
      shouldHaveErrors: false
    },
    {
      name: 'Valid Multi-Item Batch',
      description: 'Should handle batch with multiple valid requests',
      body: [
        {
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [config.testing.testAddress, 'latest'],
          id: 1
        },
        {
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: ['latest', false],
          id: 2
        },
        {
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: [config.testing.historicalBlockHex, false],
          id: 3
        }
      ],
      expectedStatus: 200,
      expectedResponseType: 'array',
      expectedLength: 3,
      shouldHaveErrors: false
    },
    {
      name: 'Mixed Valid/Invalid Batch',
      description: 'Should reject batch with malformed requests (strict validation)',
      body: [
        {
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [config.testing.testAddress, 'latest'],
          id: 1
        },
        {
          jsonrpc: '2.0',
          // missing method field - this makes the entire batch invalid
          params: ['latest', false],
          id: 2
        }
      ],
      expectedStatus: 400,
      expectedResponseType: 'object',
      shouldHaveErrors: true
    },
    {
      name: 'Valid Batch with Method Errors',
      description: 'Should process valid batch with individual method-not-found errors',
      body: [
        {
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [config.testing.testAddress, 'latest'],
          id: 1
        },
        {
          jsonrpc: '2.0',
          method: 'invalid_method',
          params: [],
          id: 2
        }
      ],
      expectedStatus: 200,
      expectedResponseType: 'array',
      expectedLength: 2,
      shouldHaveErrors: true,
      expectedErrorCount: 1 // One for invalid method, balance should succeed
    },
    {
      name: 'Empty Batch Array',
      description: 'Should reject empty batch array',
      body: [],
      expectedStatus: 400,
      expectedResponseType: 'object',
      shouldHaveErrors: true
    },
    {
      name: 'Invalid JSON-RPC Version',
      description: 'Should reject batch with invalid jsonrpc version',
      body: [
        {
          jsonrpc: '1.0', // invalid version
          method: 'eth_getBalance',
          params: [config.testing.testAddress, 'latest'],
          id: 1
        }
      ],
      expectedStatus: 400,
      expectedResponseType: 'object',
      shouldHaveErrors: true
    },
    {
      name: 'Missing Method Field',
      description: 'Should reject batch with missing method field',
      body: [
        {
          jsonrpc: '2.0',
          params: [config.testing.testAddress, 'latest'],
          id: 1
        }
      ],
      expectedStatus: 400,
      expectedResponseType: 'object',
      shouldHaveErrors: true
    },
    {
      name: 'Batch with Debug Mode',
      description: 'Should include debug info for batch requests when debug=1',
      body: [
        {
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [config.testing.testAddress, 'latest'],
          id: 1
        }
      ],
      url: `${baseUrl}/indexing/?debug=1`,
      expectedStatus: 200,
      expectedResponseType: 'array',
      expectedLength: 1,
      shouldHaveErrors: false,
      shouldHaveDebugInfo: true
    },
    {
      name: 'Large Batch Request',
      description: 'Should handle larger batch with multiple requests',
      body: Array.from({ length: 10 }, (_, i) => ({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [config.testing.testAddress, 'latest'],
        id: i + 1
      })),
      expectedStatus: 200,
      expectedResponseType: 'array',
      expectedLength: 10,
      shouldHaveErrors: false
    },
    {
      name: 'Batch with Different Methods',
      description: 'Should handle batch with different RPC methods',
      body: [
        {
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [config.testing.testAddress, 'latest'],
          id: 1
        },
        {
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: ['latest', false],
          id: 2
        },
        {
          jsonrpc: '2.0',
          method: 'debug_traceBlockByNumber',
          params: ['latest', {}],
          id: 3
        }
      ],
      expectedStatus: 200,
      expectedResponseType: 'array',
      expectedLength: 3,
      shouldHaveErrors: false
    }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    try {
      console.log(`📋 ${testCase.name}...`);
      console.log(`   ${testCase.description}`);

      const url = testCase.url || `${baseUrl}/indexing/`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testCase.body),
        timeout: config.testing.timeout
      });

      const result = await response.json();

      // Check status code
      if (response.status !== testCase.expectedStatus) {
        console.log(`❌ ${testCase.name} - STATUS MISMATCH`);
        console.log(`   Expected: ${testCase.expectedStatus}, Got: ${response.status}`);
        continue;
      }

      // Check response type (array vs object)
      const isArray = Array.isArray(result);
      const actualType = isArray ? 'array' : 'object';

      if (actualType !== testCase.expectedResponseType) {
        console.log(`❌ ${testCase.name} - RESPONSE TYPE MISMATCH`);
        console.log(`   Expected: ${testCase.expectedResponseType}, Got: ${actualType}`);
        continue;
      }

      // Check array length for batch responses
      if (testCase.expectedLength && isArray && result.length !== testCase.expectedLength) {
        console.log(`❌ ${testCase.name} - RESPONSE LENGTH MISMATCH`);
        console.log(`   Expected: ${testCase.expectedLength}, Got: ${result.length}`);
        continue;
      }

      // Check for errors
      let hasErrors = false;
      let errorCount = 0;

      if (isArray) {
        // Batch response - check each item
        for (const item of result) {
          if (item.error) {
            hasErrors = true;
            errorCount++;
          }
        }
      } else {
        // Single error response
        if (result.error) {
          hasErrors = true;
          errorCount = 1;
        }
      }

      if (testCase.shouldHaveErrors !== hasErrors) {
        console.log(`❌ ${testCase.name} - ERROR EXPECTATION MISMATCH`);
        console.log(`   Expected errors: ${testCase.shouldHaveErrors}, Got errors: ${hasErrors}`);
        continue;
      }

      if (testCase.expectedErrorCount && errorCount !== testCase.expectedErrorCount) {
        console.log(`❌ ${testCase.name} - ERROR COUNT MISMATCH`);
        console.log(`   Expected: ${testCase.expectedErrorCount}, Got: ${errorCount}`);
        continue;
      }

      // Check debug info if expected
      if (testCase.shouldHaveDebugInfo) {
        const hasDebugInfo = isArray && result.length > 0 && result[0].debug;
        if (!hasDebugInfo) {
          console.log(`❌ ${testCase.name} - MISSING DEBUG INFO`);
          console.log(`   Expected debug info but none found`);
          continue;
        }
      }

      console.log(`✅ ${testCase.name} - SUCCESS`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Response type: ${actualType}`);

      if (isArray) {
        console.log(`   Items: ${result.length}`);
        if (hasErrors) {
          console.log(`   Errors: ${errorCount}/${result.length}`);
        }
        if (testCase.shouldHaveDebugInfo && result[0]?.debug) {
          console.log(`   Debug info: ${result[0].debug.strategy.pipeline.join(' → ')}`);
        }
      } else {
        if (hasErrors) {
          console.log(`   Error: ${result.error.code} - ${result.error.message}`);
        }
      }

      passedTests++;

    } catch (error) {
      console.log(`❌ ${testCase.name} - ERROR`);
      console.log(`   ${(error as Error).message}`);
    }

    console.log('');
  }

  // Summary
  console.log(`🏁 Batch Request Tests Completed!`);
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
  runBatchRequestTests().catch((error) => {
    console.error('Batch test runner error:', error);
    process.exit(1);
  });
}

export { runBatchRequestTests };