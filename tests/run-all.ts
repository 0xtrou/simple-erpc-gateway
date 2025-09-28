#!/usr/bin/env node

import { runIntegrationTests } from './integration.test';
import { runInstrumentationTests } from './instrumentation.test';
import { runDebugTests } from './debug.test';
import { runTests as runMethodRoutingTests } from './method-routing.test';
import { runIntegrationTests as runMethodRoutingIntegrationTests } from './method-routing-integration.test';
import { runPipelineTests } from './pipeline-architecture.test';
import { runRecoveryTests } from './recovery-priority.test';
import { runOperationSequenceTests } from './operation-sequence.test';
import { testDebugInstrumentation } from './debug-instrumentation.test';
import { runBatchRequestTests } from './batch.test';
import { runNodeTimeoutTests } from './node-timeout.test';

async function runAllTests(): Promise<void> {
  console.log('🚀 Running All Test Suites...\n');

  let totalSuites = 0;
  let passedSuites = 0;

  try {
    console.log('════════════════════════════════════════');
    console.log('📊 INSTRUMENTATION UNIT TESTS');
    console.log('════════════════════════════════════════');
    await runInstrumentationTests();
    passedSuites++;
  } catch (error) {
    console.error('❌ Instrumentation tests failed:', (error as Error).message);
  }
  totalSuites++;

  try {
    console.log('\n════════════════════════════════════════');
    console.log('🔗 INTEGRATION TESTS');
    console.log('════════════════════════════════════════');
    await runIntegrationTests();
    passedSuites++;
  } catch (error) {
    console.error('❌ Integration tests failed:', (error as Error).message);
  }
  totalSuites++;

  try {
    console.log('\n════════════════════════════════════════');
    console.log('🎯 METHOD ROUTING UNIT TESTS');
    console.log('════════════════════════════════════════');
    await runMethodRoutingTests();
    passedSuites++;
  } catch (error) {
    console.error('❌ Method routing tests failed:', (error as Error).message);
  }
  totalSuites++;

  try {
    console.log('\n════════════════════════════════════════');
    console.log('🎯 METHOD ROUTING INTEGRATION TESTS');
    console.log('════════════════════════════════════════');
    await runMethodRoutingIntegrationTests();
    passedSuites++;
  } catch (error) {
    console.error('❌ Method routing integration tests failed:', (error as Error).message);
  }
  totalSuites++;

  try {
    console.log('\n════════════════════════════════════════');
    console.log('🏗️  PIPELINE ARCHITECTURE TESTS');
    console.log('════════════════════════════════════════');
    await runPipelineTests();
    passedSuites++;
  } catch (error) {
    console.error('❌ Pipeline architecture tests failed:', (error as Error).message);
  }
  totalSuites++;

  try {
    console.log('\n════════════════════════════════════════');
    console.log('🔄 RECOVERY PRIORITY TESTS');
    console.log('════════════════════════════════════════');
    await runRecoveryTests();
    passedSuites++;
  } catch (error) {
    console.error('❌ Recovery priority tests failed:', (error as Error).message);
  }
  totalSuites++;

  try {
    console.log('\n════════════════════════════════════════');
    console.log('🐛 DEBUG MODE TESTS');
    console.log('════════════════════════════════════════');
    await runDebugTests();
    passedSuites++;
  } catch (error) {
    console.error('❌ Debug tests failed:', (error as Error).message);
  }
  totalSuites++;

  try {
    console.log('\n════════════════════════════════════════');
    console.log('🔬 OPERATION SEQUENCE TESTS');
    console.log('════════════════════════════════════════');
    await runOperationSequenceTests();
    passedSuites++;
  } catch (error) {
    console.error('❌ Operation sequence tests failed:', (error as Error).message);
  }
  totalSuites++;

  try {
    console.log('\n════════════════════════════════════════');
    console.log('🛠️  DEBUG INSTRUMENTATION TESTS');
    console.log('════════════════════════════════════════');
    await testDebugInstrumentation();
    passedSuites++;
  } catch (error) {
    console.error('❌ Debug instrumentation tests failed:', (error as Error).message);
  }
  totalSuites++;

  try {
    console.log('\n════════════════════════════════════════');
    console.log('📦 BATCH REQUEST TESTS');
    console.log('════════════════════════════════════════');
    await runBatchRequestTests();
    passedSuites++;
  } catch (error) {
    console.error('❌ Batch request tests failed:', (error as Error).message);
  }
  totalSuites++;

  try {
    console.log('\n════════════════════════════════════════');
    console.log('⏰ NODE TIMEOUT TESTS');
    console.log('════════════════════════════════════════');
    await runNodeTimeoutTests();
    passedSuites++;
  } catch (error) {
    console.error('❌ Node timeout tests failed:', (error as Error).message);
  }
  totalSuites++;

  console.log('\n════════════════════════════════════════');
  console.log('📈 FINAL RESULTS');
  console.log('════════════════════════════════════════');
  console.log(`Test Suites: ${passedSuites}/${totalSuites} passed`);

  if (passedSuites === totalSuites) {
    console.log('🎉 ALL TEST SUITES PASSED!');
    process.exit(0);
  } else {
    console.log(`💥 ${totalSuites - passedSuites} test suite(s) failed`);
    process.exit(1);
  }
}

if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}