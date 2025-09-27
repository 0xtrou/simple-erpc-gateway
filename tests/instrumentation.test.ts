#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { InstrumentationService } from '../src/services/InstrumentationService';
import { RoutingContext, UpstreamConfig, UpstreamHealth, AppConfig } from '../src/types';

async function runInstrumentationTests(): Promise<void> {
  console.log('🧪 Running InstrumentationService Unit Tests...\n');

  // Load config for test data
  const configPath = path.join(__dirname, '../../config.json');
  const config: AppConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const instrumentation = InstrumentationService.getInstance();
  let passedTests = 0;
  let totalTests = 0;

  // Test singleton pattern
  console.log('📋 Testing Singleton Pattern...');
  totalTests++;
  const instrumentation2 = InstrumentationService.getInstance();
  if (instrumentation === instrumentation2) {
    console.log('✅ Singleton pattern works correctly');
    passedTests++;
  } else {
    console.log('❌ Singleton pattern failed');
  }
  console.log('');

  // Test request ID generation
  console.log('📋 Testing Request ID Generation...');
  totalTests++;
  const requestId1 = instrumentation.generateRequestId();
  const requestId2 = instrumentation.generateRequestId();
  if (requestId1 !== requestId2 && requestId1.startsWith('req_') && requestId2.startsWith('req_')) {
    console.log('✅ Request ID generation works correctly');
    console.log(`   Generated IDs: ${requestId1}, ${requestId2}`);
    passedTests++;
  } else {
    console.log('❌ Request ID generation failed');
    console.log(`   IDs: ${requestId1}, ${requestId2}`);
  }
  console.log('');

  // Test debug mode enabled
  console.log('📋 Testing Debug Mode Enabled...');
  totalTests++;
  const requestId = instrumentation.generateRequestId();
  const context = instrumentation.startRequest(requestId, true);

  if (context.isDebugEnabled && context.requestId === requestId && context.events.length > 0) {
    console.log('✅ Debug mode enabled correctly');
    console.log(`   Context: ${JSON.stringify({ requestId: context.requestId, isDebugEnabled: context.isDebugEnabled, eventsCount: context.events.length })}`);
    passedTests++;
  } else {
    console.log('❌ Debug mode enabled failed');
    console.log(`   Context: ${JSON.stringify(context)}`);
  }
  console.log('');

  // Test debug mode disabled
  console.log('📋 Testing Debug Mode Disabled...');
  totalTests++;
  const requestId3 = instrumentation.generateRequestId();
  const context3 = instrumentation.startRequest(requestId3, false);

  if (!context3.isDebugEnabled && context3.requestId === requestId3) {
    console.log('✅ Debug mode disabled correctly');
    console.log(`   Context: ${JSON.stringify({ requestId: context3.requestId, isDebugEnabled: context3.isDebugEnabled })}`);
    passedTests++;
  } else {
    console.log('❌ Debug mode disabled failed');
    console.log(`   Context: ${JSON.stringify(context3)}`);
  }
  console.log('');

  // Test event logging
  console.log('📋 Testing Event Logging...');
  totalTests++;
  const requestId4 = instrumentation.generateRequestId();
  instrumentation.startRequest(requestId4, true);

  // Create mock routing context using config values
  const mockUpstream: UpstreamConfig = config.projects[0].upstreams[0]; // Use first upstream from config

  const mockHealth: UpstreamHealth = {
    errors: [],
    totalRequests: 10,
    totalErrors: 0,
    consecutiveErrors: 0,
    lastError: null,
    lastSuccessfulRequest: Date.now(),
    isHealthy: true,
    failoverUntil: 0,
    responseTime: 100
  };

  const mockRoutingContext: RoutingContext = {
    request: {
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
      id: 1
    },
    blockNumber: 'latest',
    nodeStatus: {
      earliestBlockHeight: config.testing.historicalBlockNumber,
      latestBlockHeight: config.testing.historicalBlockNumber + 1000,
      catchingUp: false,
      lastUpdated: Date.now()
    },
    availableUpstreams: [mockUpstream],
    upstreamHealth: new Map([[mockUpstream.id, mockHealth]]),
    config: config.projects[0]
  };

  const startTime = instrumentation.logOperationStart(requestId4, 'TestOperation', mockRoutingContext);

  // Add a small delay to ensure duration is measurable
  await new Promise(resolve => setTimeout(resolve, 1));

  instrumentation.logOperationResult(requestId4, 'TestOperation', {
    upstream: mockUpstream,
    reason: 'Test reason',
    shouldContinue: false
  }, startTime);

  instrumentation.logRequestProxy(requestId4, mockUpstream.id, true);

  const debugInfo = instrumentation.finishRequest(requestId4, mockRoutingContext);

  if (debugInfo && debugInfo.strategy.events.length >= 3) {
    console.log('✅ Event logging works correctly');
    console.log(`   Events logged: ${debugInfo.strategy.events.length}`);
    console.log(`   Pipeline: ${debugInfo.strategy.pipeline.join(' → ')}`);
    console.log(`   Selected upstream: ${debugInfo.context.selectedUpstream}`);
    console.log(`   Duration: ${debugInfo.totalDuration}ms`);
    passedTests++;
  } else {
    console.log('❌ Event logging failed');
    console.log(`   Debug info: ${JSON.stringify(debugInfo, null, 2)}`);
  }
  console.log('');

  // Test error logging
  console.log('📋 Testing Error Logging...');
  totalTests++;
  const requestId5 = instrumentation.generateRequestId();
  instrumentation.startRequest(requestId5, true);

  const errorStartTime = instrumentation.logOperationStart(requestId5, 'ErrorOperation', mockRoutingContext);
  instrumentation.logOperationError(requestId5, 'ErrorOperation', new Error('Test error'), errorStartTime);

  const errorDebugInfo = instrumentation.finishRequest(requestId5, mockRoutingContext);

  if (errorDebugInfo && errorDebugInfo.strategy.events.some((e: any) => e.action === 'error')) {
    console.log('✅ Error logging works correctly');
    const errorEvent = errorDebugInfo.strategy.events.find((e: any) => e.action === 'error');
    console.log(`   Error event: ${JSON.stringify(errorEvent?.data)}`);
    passedTests++;
  } else {
    console.log('❌ Error logging failed');
    console.log(`   Debug info: ${JSON.stringify(errorDebugInfo, null, 2)}`);
  }
  console.log('');

  // Test disabled debug mode (no events should be logged)
  console.log('📋 Testing Disabled Debug Mode...');
  totalTests++;
  const requestId6 = instrumentation.generateRequestId();
  instrumentation.startRequest(requestId6, false);

  instrumentation.logEvent(requestId6, 'TestOp', 'start', { test: 'data' });
  const disabledDebugInfo = instrumentation.finishRequest(requestId6, mockRoutingContext);

  if (!disabledDebugInfo) {
    console.log('✅ Disabled debug mode works correctly (no debug info returned)');
    passedTests++;
  } else {
    console.log('❌ Disabled debug mode failed (debug info was returned)');
    console.log(`   Unexpected debug info: ${JSON.stringify(disabledDebugInfo)}`);
  }
  console.log('');

  // Test performance within reasonable bounds
  console.log('📋 Testing Performance...');
  totalTests++;
  const perfStart = Date.now();
  const requestId7 = instrumentation.generateRequestId();
  instrumentation.startRequest(requestId7, true);

  for (let i = 0; i < 100; i++) {
    instrumentation.logEvent(requestId7, `Operation${i}`, 'start', { iteration: i });
  }

  const perfDebugInfo = instrumentation.finishRequest(requestId7, mockRoutingContext);
  const perfEnd = Date.now();
  const totalPerfTime = perfEnd - perfStart;

  if (totalPerfTime < config.testing.timeout && perfDebugInfo && perfDebugInfo.strategy.events.length > 100) {
    console.log('✅ Performance test passed');
    console.log(`   Logged 100+ events in ${totalPerfTime}ms`);
    console.log(`   Events count: ${perfDebugInfo.strategy.events.length}`);
    passedTests++;
  } else {
    console.log('❌ Performance test failed');
    console.log(`   Time: ${totalPerfTime}ms, Events: ${perfDebugInfo?.strategy.events.length || 0}`);
  }
  console.log('');

  // Summary
  console.log(`🏁 InstrumentationService Tests Completed!`);
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
  runInstrumentationTests().catch((error) => {
    console.error('Instrumentation test runner error:', error);
    process.exit(1);
  });
}

export { runInstrumentationTests };