/**
 * Test Gemini Integration
 * Run: npm run dev src/test-gemini.ts
 */

import 'dotenv/config';
import { searchLegalPrecedent, buildLegalQuery, testGeminiConnection } from './gemini.js';

async function main() {
  console.log('🧪 Testing Gemini Integration\n');

  // Test 1: Connection
  console.log('Test 1: Connection Check');
  const connected = await testGeminiConnection();
  if (!connected) {
    console.error('❌ Failed to connect to Gemini');
    process.exit(1);
  }
  console.log('');

  // Test 2: Circular Definition Query
  console.log('Test 2: Circular Definition Search');
  const circularQuery = buildLegalQuery(
    'circular_definition',
    '"Material Adverse Effect" means any event having a material adverse effect.'
  );
  console.log('Query:', circularQuery.substring(0, 100) + '...\n');

  const result1 = await searchLegalPrecedent(circularQuery);
  console.log('Answer:', result1.answer.substring(0, 200) + '...');
  console.log('Citations found:', result1.citations.length);

  if (result1.citations.length > 0) {
    console.log('\nTop citations:');
    result1.citations.slice(0, 3).forEach((cite, i) => {
      console.log(`  ${i + 1}. ${cite.title} (${cite.year || 'unknown year'})`);
      console.log(`     ${cite.url}`);
    });
  }
  console.log('');

  // Test 3: MAC Clause Query
  console.log('Test 3: MAC Clause Search');
  const macQuery = buildLegalQuery(
    'vague_mac',
    'Borrower shall maintain reasonable financial condition.'
  );

  const result2 = await searchLegalPrecedent(macQuery);
  console.log('Answer:', result2.answer.substring(0, 200) + '...');
  console.log('Citations found:', result2.citations.length);
  console.log('');

  // Test 4: LIBOR Reference Query
  console.log('Test 4: Outdated Reference Search');
  const liborQuery = buildLegalQuery(
    'outdated_reference',
    'Interest rate shall be LIBOR plus 2.5%'
  );

  const result3 = await searchLegalPrecedent(liborQuery);
  console.log('Answer:', result3.answer.substring(0, 200) + '...');
  console.log('Citations found:', result3.citations.length);
  console.log('');

  console.log('✅ All tests completed successfully!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
