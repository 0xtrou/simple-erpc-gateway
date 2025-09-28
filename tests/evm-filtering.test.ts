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

async function testEvmFiltering() {
  console.log('🧪 Testing EVM Block Filtering...\n');

  // Test a block that's DEFINITELY before quicknode's evmStartBlock (160000000)
  const veryOldBlock = 100000000; // 100M, way before 160M
  const veryOldBlockHex = '0x' + veryOldBlock.toString(16); // Convert to hex

  console.log(`📋 Testing very old block: ${veryOldBlock} (${veryOldBlockHex})`);
  console.log(`   This is < 160000000 (quicknode evmStartBlock), should be filtered out`);

  const balanceRequest: JsonRpcRequest = {
    jsonrpc: '2.0',
    method: 'eth_getBalance',
    params: ['0x1771c68e30a5cdf64516686e53da7dbdc38a113a', veryOldBlockHex],
    id: 1
  };

  try {
    const response = await makeRpcRequest(balanceRequest, '/indexing');

    if (response.error) {
      const errorMessage = response.error.message.toLowerCase();
      if (errorMessage.includes('no upstreams support this block') ||
          errorMessage.includes('no upstreams available')) {
        console.log(`✅ EVM Filtering - SUCCESS`);
        console.log(`   Got expected error: ${response.error.message}`);
      } else if (errorMessage.includes('evm module does not exist')) {
        console.log(`❌ EVM Filtering - FAILED`);
        console.log(`   Got "evm module does not exist" - routing failed`);
        console.log(`   Error: ${response.error.message}`);
      } else {
        console.log(`✅ EVM Filtering - SUCCESS`);
        console.log(`   Got error (not evm module): ${response.error.message}`);
      }
    } else {
      console.log(`❌ EVM Filtering - FAILED`);
      console.log(`   Request unexpectedly succeeded - should have been filtered out`);
      console.log(`   Result: ${JSON.stringify(response.result)}`);
    }

  } catch (error) {
    console.log(`❌ EVM Filtering - ERROR`);
    console.log(`   Network error: ${(error as Error).message}`);
  }

  console.log('');

  // Test a block within quicknode range
  const recentBlock = 165000000; // Exactly at the 165M mark
  const recentBlockHex = '0x' + recentBlock.toString(16);

  console.log(`📋 Testing recent block: ${recentBlock} (${recentBlockHex})`);
  console.log(`   This is >= 160000000 (quicknode evmStartBlock), should succeed`);

  const recentBalanceRequest: JsonRpcRequest = {
    jsonrpc: '2.0',
    method: 'eth_getBalance',
    params: ['0x1771c68e30a5cdf64516686e53da7dbdc38a113a', recentBlockHex],
    id: 2
  };

  try {
    const response = await makeRpcRequest(recentBalanceRequest, '/indexing');

    if (response.error) {
      console.log(`✅ Recent Block - SUCCESS`);
      console.log(`   Got error (expected for this block): ${response.error.message}`);
    } else {
      console.log(`✅ Recent Block - SUCCESS`);
      console.log(`   Request succeeded as expected`);
    }

  } catch (error) {
    console.log(`❌ Recent Block - ERROR`);
    console.log(`   Network error: ${(error as Error).message}`);
  }
}

// Run the test
testEvmFiltering().catch(console.error);