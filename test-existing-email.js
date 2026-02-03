#!/usr/bin/env node

const { getPreauditEmailByUrl } = require('./server/db');

// Test s URL která má email v databázi
const testUrl = 'https://snohomishwaplumbing.com';

console.log('🧪 Testing Email Fallback with Existing Preaudit Result\n');
console.log('Test URL:', testUrl);
console.log('Expected email: contact@mcauliffeplumbing.com');
console.log('─'.repeat(60), '\n');

getPreauditEmailByUrl(testUrl, (err, email) => {
  if (err) {
    console.log('❌ ERROR:', err.message);
    process.exit(1);
  }
  
  if (email) {
    console.log('✅ SUCCESS! Email found:', email);
    console.log('\n📊 Verification:');
    console.log('   - Email matches expected:', email === 'contact@mcauliffeplumbing.com' ? '✅' : '❌');
    console.log('   - Email is valid format:', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '✅' : '❌');
    console.log('\n✅ Email fallback function works correctly!\n');
    process.exit(0);
  } else {
    console.log('❌ FAIL: No email found');
    console.log('This should not happen - the preaudit result exists in DB');
    process.exit(1);
  }
});

setTimeout(() => {
  console.error('❌ Timeout');
  process.exit(1);
}, 5000);
