#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { AppConfig } from '../src/types';

interface TestCase {
  name: string;
  url: string;
  method: 'GET' | 'POST';
  body?: any;
  expectedStatus?: number;
  description: string;
}

async function runIntegrationTests(): Promise<void> {
  // Load config
  const configPath = path.join(__dirname, '../../config.json');
  const config: AppConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const baseUrl = `http://${config.server.host}:${config.server.port}`;

  console.log('🧪 Running Integration Tests...\n');

  // Test cases using configuration values
  const testCases: TestCase[] = [
    {
      name: 'Health Check',
      description: 'Verify health endpoint returns upstream status',
      url: `${baseUrl}/health`,
      method: 'GET',
      expectedStatus: 200
    },
    {
      name: 'Metrics Check',
      description: 'Verify metrics endpoint returns system metrics',
      url: `${baseUrl}/metrics`,
      method: 'GET',
      expectedStatus: 200
    },
    {
      name: 'Latest Block Request',
      description: 'Should route to cheap node for latest block',
      url: baseUrl,
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
        id: 1
      },
      expectedStatus: 200
    },
    {
      name: 'Historical Block Request',
      description: 'Should route to archive node for historical block',
      url: baseUrl,
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: [config.testing.historicalBlockHex, false],
        id: 2
      },
      expectedStatus: 200
    },
    {
      name: 'Balance Check',
      description: 'Should route to cheap node for balance query',
      url: baseUrl,
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [config.testing.testAddress, 'latest'],
        id: 3
      },
      expectedStatus: 200
    },
    {
      name: 'Debug Trace',
      description: 'Should handle debug trace with block-based routing',
      url: baseUrl,
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        method: 'debug_traceBlockByNumber',
        params: ['latest', {}],
        id: 4
      },
      expectedStatus: 200
    },
    {
      name: 'Pre-EVM Block Request',
      description: 'Should handle pre-EVM block requests without routing to incompatible upstreams',
      url: baseUrl,
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: ['0x1234567890123456789012345678901234567890', '0x8329E27'], // Block 137535015 (pre-EVM)
        id: 5
      },
      expectedStatus: 200
    },
    {
      name: 'Invalid Method',
      description: 'Should return error for invalid JSON-RPC method',
      url: baseUrl,
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        method: 'invalid_method',
        params: [],
        id: 6
      },
      expectedStatus: 200
    }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    try {
      console.log(`📋 ${testCase.name}...`);
      console.log(`   ${testCase.description}`);

      const options: any = {
        method: testCase.method,
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: config.testing.timeout
      };

      if (testCase.body) {
        options.body = JSON.stringify(testCase.body);
      }

      const response = await fetch(testCase.url, options);
      const result = await response.json() as any;

      // Check expected status if specified
      const expectedStatus = testCase.expectedStatus || 200;
      if (response.status === expectedStatus) {
        console.log(`✅ ${testCase.name} - SUCCESS (${response.status})`);

        if (testCase.name === 'Health Check') {
          console.log(`   Upstreams: ${Object.keys(result.upstreams || {}).length}`);
          console.log(`   Local node: ${result.localNode ? 'Connected' : 'Disconnected'}`);
        } else if (testCase.name === 'Metrics Check') {
          console.log(`   Config included: ${result.config ? 'Yes' : 'No'}`);
          console.log(`   Upstreams: ${Object.keys(result.upstreams || {}).length}`);
        } else if (testCase.body) {
          console.log(`   Method: ${testCase.body.method}`);
          console.log(`   Response: ${result.error ? 'Error' : 'Success'}`);
          if (result.error) {
            console.log(`   Error code: ${result.error.code}`);
          }
        }

        passedTests++;
      } else {
        console.log(`❌ ${testCase.name} - STATUS MISMATCH`);
        console.log(`   Expected: ${expectedStatus}, Got: ${response.status}`);
        console.log(`   Response: ${JSON.stringify(result)}`);
      }

    } catch (error) {
      console.log(`❌ ${testCase.name} - ERROR`);
      console.log(`   ${(error as Error).message}`);
    }
    console.log('');
  }

  // Summary
  console.log(`🏁 Integration Tests Completed!`);
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
  runIntegrationTests().catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

export { runIntegrationTests };