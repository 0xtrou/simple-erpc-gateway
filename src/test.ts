#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { AppConfig } from './types';

async function testRPC(): Promise<void> {
  // Load config
  const configPath = path.join(__dirname, '../config.json');
  const config: AppConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const baseUrl = `http://${config.server.host}:${config.server.port}`;

  console.log('🧪 Testing Simple eRPC Gateway (TypeScript)...\n');

  // Test cases
  const testCases = [
    {
      name: 'Health Check',
      url: `${baseUrl}/health`,
      method: 'GET'
    },
    {
      name: 'Latest Block (should use cheap node)',
      url: baseUrl,
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
        id: 1
      }
    },
    {
      name: 'Historical Block (should use archive)',
      url: baseUrl,
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['0xa1e8400', false], // Block 169464832
        id: 2
      }
    },
    {
      name: 'Balance Check (should use cheap node)',
      url: baseUrl,
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: ['0x0000000000000000000000000000000000000000', 'latest'],
        id: 3
      }
    },
    {
      name: 'Debug Trace (block-based routing)',
      url: baseUrl,
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        method: 'debug_traceBlockByNumber',
        params: ['latest', {}],
        id: 4
      }
    },
    {
      name: 'Metrics',
      url: `${baseUrl}/metrics`,
      method: 'GET'
    }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`📋 ${testCase.name}...`);

      const options: any = {
        method: testCase.method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (testCase.body) {
        options.body = JSON.stringify(testCase.body);
      }

      const response = await fetch(testCase.url, options);
      const result = await response.json() as any;

      if (response.ok) {
        console.log(`✅ ${testCase.name} - SUCCESS`);
        if (testCase.name === 'Health Check') {
          console.log(`   Upstreams: ${Object.keys(result.upstreams).length}`);
          console.log(`   Local node: ${result.localNode ? 'Connected' : 'Disconnected'}`);
        } else if (testCase.body) {
          console.log(`   Method: ${testCase.body.method}`);
          console.log(`   Response: ${result.error ? 'Error' : 'Success'}`);
        }
      } else {
        console.log(`❌ ${testCase.name} - FAILED (${response.status})`);
        console.log(`   Error: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      console.log(`❌ ${testCase.name} - ERROR`);
      console.log(`   ${(error as Error).message}`);
    }
    console.log('');
  }

  console.log('🏁 Test completed!\n');
}

if (require.main === module) {
  testRPC().catch(console.error);
}

export { testRPC };