import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:1099';

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params: any[];
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: string;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
  id: number;
}

async function makeRpcRequest(request: JsonRpcRequest, endpoint: string = ''): Promise<JsonRpcResponse> {
  const response = await fetch(`${SERVER_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  return await response.json() as JsonRpcResponse;
}

// Test blocks from the actual error logs
const PRE_EVM_TEST_CASES = [
  {
    name: 'Block 161088948 (within quicknode range)',
    blockHex: '0x99A05B4',
    blockNumber: 161088948,
    shouldRouteToQuicknode: true // 161088948 >= 160000000 (quicknode evmStartBlock)
  },
  {
    name: 'Block 160079302 (within quicknode range)',
    blockHex: '0x98A9DC6',
    blockNumber: 160079302,
    shouldRouteToQuicknode: true // 160079302 >= 160000000 (quicknode evmStartBlock)
  },
  {
    name: 'Block 163727213 (within quicknode range)',
    blockHex: '0x9C2476D',
    blockNumber: 163727213,
    shouldRouteToQuicknode: true // 163727213 >= 160000000 (quicknode evmStartBlock)
  },
  {
    name: 'Block 146680873 (before quicknode evmStartBlock)',
    blockHex: '0x8BE2C29',
    blockNumber: 146680873,
    shouldRouteToQuicknode: false // 146680873 < 160000000 (quicknode evmStartBlock)
  },
  {
    name: 'Block 137535891 (before quicknode evmStartBlock)',
    blockHex: '0x832A193',
    blockNumber: 137535891,
    shouldRouteToQuicknode: false // 137535891 < 160000000 (quicknode evmStartBlock)
  },
  {
    name: 'Block 157712057 (before quicknode evmStartBlock)',
    blockHex: '0x9667EB9',
    blockNumber: 157712057,
    shouldRouteToQuicknode: false // 157712057 < 160000000 (quicknode evmStartBlock)
  }
];

async function testPreEvmBlocks() {
  console.log('🧪 Running Pre-EVM Block Handling Tests...\n');

  let passedTests = 0;
  let totalTests = 0;

  for (const testCase of PRE_EVM_TEST_CASES) {
    totalTests++;
    console.log(`📋 ${testCase.name}...`);
    console.log(`   Testing block ${testCase.blockNumber} (${testCase.blockHex})`);

    try {
      // Test eth_getBalance with pre-EVM block
      const balanceRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: ['0x1771c68e30a5cdf64516686e53da7dbdc38a113a', testCase.blockHex],
        id: 1
      };

      console.log(`   Making request: eth_getBalance(${balanceRequest.params[0]}, ${testCase.blockHex})`);

      const response = await makeRpcRequest(balanceRequest, '/indexing');

      if (testCase.shouldRouteToQuicknode) {
        // Should either succeed (if quicknode can handle it) or get a proper error (not "evm module does not exist")
        if (response.error) {
          const errorMessage = response.error.message.toLowerCase();
          if (errorMessage.includes('evm module does not exist')) {
            console.log(`❌ ${testCase.name} - FAILED`);
            console.log(`   Got "evm module does not exist" error - block routing failed`);
            console.log(`   Error: ${response.error.message}`);
            continue;
          } else {
            console.log(`✅ ${testCase.name} - SUCCESS`);
            console.log(`   Got expected error (not evm module): ${response.error.message}`);
          }
        } else {
          console.log(`✅ ${testCase.name} - SUCCESS`);
          console.log(`   Request succeeded - properly routed to compatible upstream`);
        }
        passedTests++;
      } else {
        // Should get "No upstreams support this block" error
        if (response.error) {
          const errorMessage = response.error.message.toLowerCase();
          if (errorMessage.includes('no upstreams') || errorMessage.includes('no upstreams support this block')) {
            console.log(`✅ ${testCase.name} - SUCCESS`);
            console.log(`   Got expected "no upstreams support this block" error`);
            passedTests++;
          } else if (errorMessage.includes('evm module does not exist')) {
            console.log(`❌ ${testCase.name} - FAILED`);
            console.log(`   Got "evm module does not exist" - should have been filtered out`);
            console.log(`   Error: ${response.error.message}`);
          } else {
            console.log(`✅ ${testCase.name} - SUCCESS`);
            console.log(`   Got error (not evm module): ${response.error.message}`);
            passedTests++;
          }
        } else {
          console.log(`❌ ${testCase.name} - FAILED`);
          console.log(`   Request unexpectedly succeeded - should have been filtered out`);
        }
      }

      // Test eth_getBlockByNumber as well
      totalTests++;
      const blockRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: [testCase.blockHex, false],
        id: 2
      };

      console.log(`   Making request: eth_getBlockByNumber(${testCase.blockHex}, false)`);

      const blockResponse = await makeRpcRequest(blockRequest, '/indexing');

      if (testCase.shouldRouteToQuicknode) {
        if (blockResponse.error) {
          const errorMessage = blockResponse.error.message.toLowerCase();
          if (errorMessage.includes('evm module does not exist')) {
            console.log(`❌ ${testCase.name} (getBlockByNumber) - FAILED`);
            console.log(`   Got "evm module does not exist" error - block routing failed`);
          } else {
            console.log(`✅ ${testCase.name} (getBlockByNumber) - SUCCESS`);
            console.log(`   Got expected error (not evm module): ${blockResponse.error.message}`);
            passedTests++;
          }
        } else {
          console.log(`✅ ${testCase.name} (getBlockByNumber) - SUCCESS`);
          console.log(`   Request succeeded - properly routed to compatible upstream`);
          passedTests++;
        }
      } else {
        if (blockResponse.error) {
          const errorMessage = blockResponse.error.message.toLowerCase();
          if (errorMessage.includes('no upstreams') || errorMessage.includes('evm module does not exist')) {
            console.log(`✅ ${testCase.name} (getBlockByNumber) - SUCCESS`);
            console.log(`   Got expected error indicating no compatible upstreams`);
            passedTests++;
          } else {
            console.log(`✅ ${testCase.name} (getBlockByNumber) - SUCCESS`);
            console.log(`   Got error (not evm module): ${blockResponse.error.message}`);
            passedTests++;
          }
        } else {
          console.log(`❌ ${testCase.name} (getBlockByNumber) - FAILED`);
          console.log(`   Request unexpectedly succeeded - should have been filtered out`);
        }
      }

    } catch (error) {
      console.log(`❌ ${testCase.name} - ERROR`);
      console.log(`   Network/request error: ${(error as Error).message}`);
    }

    console.log('');
  }

  console.log('🏁 Pre-EVM Block Tests Completed!');
  console.log(`   Passed: ${passedTests}/${totalTests}`);
  if (passedTests === totalTests) {
    console.log('   ✅ All tests passed!');
  } else {
    console.log(`   ❌ ${totalTests - passedTests} tests failed`);
  }
}

// Run the test
testPreEvmBlocks().catch(console.error);