#!/usr/bin/env node

import { runIntegrationTests } from './integration.test';
import { runInstrumentationTests } from './instrumentation.test';
import { runDebugTests } from './debug.test';

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
    console.log('🐛 DEBUG MODE TESTS');
    console.log('════════════════════════════════════════');
    await runDebugTests();
    passedSuites++;
  } catch (error) {
    console.error('❌ Debug tests failed:', (error as Error).message);
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