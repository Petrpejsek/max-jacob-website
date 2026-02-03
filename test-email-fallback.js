#!/usr/bin/env node

/**
 * Test Email Fallback - Verifikace že preaudit email fallback funguje
 */

const { getPreauditEmailByUrl } = require('./server/db');

// Test URL (ta z tvého příkladu)
const testUrl = 'https://mainplumbingmiami.com/';

console.log('🧪 Testing Email Fallback Implementation\n');
console.log('Test URL:', testUrl);
console.log('─'.repeat(60));

// Test normalizace URL (různé varianty)
const urlVariants = [
  'https://mainplumbingmiami.com/',
  'https://mainplumbingmiami.com',
  'http://mainplumbingmiami.com/',
  'http://mainplumbingmiami.com',
  'https://www.mainplumbingmiami.com/',
  'https://www.mainplumbingmiami.com'
];

console.log('\n📋 Testing URL variants...\n');

let testsCompleted = 0;
const totalTests = urlVariants.length;

urlVariants.forEach((url, index) => {
  getPreauditEmailByUrl(url, (err, email) => {
    testsCompleted++;
    
    if (err) {
      console.log(`❌ [${index + 1}/${totalTests}] ${url}`);
      console.log(`   Error: ${err.message}\n`);
    } else if (email) {
      console.log(`✅ [${index + 1}/${totalTests}] ${url}`);
      console.log(`   Email found: ${email}\n`);
    } else {
      console.log(`⚠️  [${index + 1}/${totalTests}] ${url}`);
      console.log(`   No email found (preaudit result may not exist yet)\n`);
    }
    
    // Po dokončení všech testů
    if (testsCompleted === totalTests) {
      console.log('─'.repeat(60));
      console.log('\n✅ Test completed!\n');
      console.log('💡 To test full flow:');
      console.log('   1. Run preaudit search for this URL');
      console.log('   2. Confirm the result (creates audit job)');
      console.log('   3. Check audit logs for: "[AUDIT V3] ✓ Found email from preaudit fallback"');
      console.log('   4. Verify email appears in audit results\n');
      
      process.exit(0);
    }
  });
});

// Timeout po 10 sekundách
setTimeout(() => {
  console.error('\n❌ Test timeout - something went wrong');
  process.exit(1);
}, 10000);
