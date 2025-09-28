#!/usr/bin/env ts-node

console.log('🧪 Testing Debug Instrumentation with Filtering...\n');

import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:1099';

async function testDebugInstrumentation(): Promise<void> {
  try {
    // Test a method that will be filtered by some upstreams
    const response = await fetch(`${SERVER_URL}?debug=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'debug_traceBlockByNumber',
        params: ['latest'],
        id: 1
      }),
      timeout: 10000
    } as any);

    const result = await response.json();

    if (result.debug && result.debug.strategy && result.debug.strategy.events) {
      console.log('✅ Debug information present');
      console.log(`📊 Pipeline Events (${result.debug.strategy.events.length} total):\n`);

      result.debug.strategy.events.forEach((event: any, index: number) => {
        if (event.action === 'start') {
          console.log(`${index + 1}. 🔄 ${event.operation} START:`);
          console.log(`   Available upstreams: ${event.data.availableUpstreams?.join(', ') || 'none'}`);
          console.log(`   Healthy upstreams: ${event.data.healthyUpstreams?.join(', ') || 'none'}`);
        } else if (event.action === 'result') {
          console.log(`${index + 1}. ✅ ${event.operation} RESULT:`);
          console.log(`   Raw data:`, JSON.stringify(event.data, null, 2));
          if (event.data.filteredUpstreams) {
            console.log(`   Filtered upstreams: ${event.data.filteredUpstreams.join(', ')}`);
          } else {
            console.log(`   Filtered upstreams: MISSING`);
          }
          if (event.data.selectedUpstream) {
            console.log(`   Selected upstream: ${event.data.selectedUpstream}`);
          }
          console.log(`   Reason: ${event.data.reason}`);
          console.log(`   Should continue: ${event.data.shouldContinue}`);
          if (event.duration !== undefined) {
            console.log(`   Duration: ${event.duration}ms`);
          }
        } else if (event.action === 'error') {
          console.log(`${index + 1}. ❌ ${event.operation} ERROR:`);
          console.log(`   Error: ${event.data.message}`);
        }
        console.log('');
      });

      // Validate the pipeline flow
      const operations = result.debug.strategy.events
        .filter((e: any) => e.action === 'result' && e.operation !== 'request_proxy' && e.operation !== 'pipeline')
        .map((e: any) => ({
          operation: e.operation,
          filteredCount: e.data.filteredUpstreams?.length || 0,
          selectedUpstream: e.data.selectedUpstream
        }));

      console.log('📈 Pipeline Flow Summary:');
      operations.forEach((op: any, index: number) => {
        if (op.selectedUpstream) {
          console.log(`   ${index + 1}. ${op.operation}: Selected ${op.selectedUpstream} (pipeline stopped)`);
        } else {
          console.log(`   ${index + 1}. ${op.operation}: Filtered to ${op.filteredCount} upstreams`);
        }
      });

      console.log(`\n🎯 Final Result: ${result.debug.context?.selectedUpstream || 'No selection'}`);
      console.log(`⏱️  Total Duration: ${result.debug.totalDuration}ms`);

      console.log('\n✅ Debug instrumentation test completed successfully!');
    } else {
      console.log('❌ No debug information found in response');
      console.log('Response:', JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.log('⚠️  Server not available for instrumentation test');
    console.log('   Please start the server with: npm run dev');
    console.log(`   Error: ${(error as Error).message}`);
  }
}

// Run test only if this file is executed directly
if (require.main === module) {
  testDebugInstrumentation().catch(error => {
    console.error('Debug instrumentation test failed:', error);
    process.exit(1);
  });
}

export { testDebugInstrumentation };