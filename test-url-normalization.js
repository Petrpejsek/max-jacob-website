#!/usr/bin/env node

const { getPreauditEmailByUrl } = require('./server/db');

// Test různých variant URL
const urlVariants = [
  'https://snohomishwaplumbing.com',
  'https://snohomishwaplumbing.com/',
  'http://snohomishwaplumbing.com',
  'http://snohomishwaplumbing.com/',
  'https://www.snohomishwaplumbing.com',
  'https://www.snohomishwaplumbing.com/'
];

const expectedEmail = 'contact@mcauliffeplumbing.com';

console.log('🧪 Testing URL Normalization\n');
console.log('Expected email:', expectedEmail);
console.log('─'.repeat(60), '\n');

let testsCompleted = 0;
let successCount = 0;
const totalTests = urlVariants.length;

urlVariants.forEach((url, index) => {
  getPreauditEmailByUrl(url, (err, email) => {
    testsCompleted++;
    
    if (err) {
      console.log(`❌ [${index + 1}/${totalTests}] ${url}`);
      console.log(`   Error: ${err.message}\n`);
    } else if (email === expectedEmail) {
      successCount++;
      console.log(`✅ [${index + 1}/${totalTests}] ${url}`);
      console.log(`   Email: ${email}\n`);
    } else if (email) {
      console.log(`⚠️  [${index + 1}/${totalTests}] ${url}`);
      console.log(`   Unexpected email: ${email}\n`);
    } else {
      console.log(`❌ [${index + 1}/${totalTests}] ${url}`);
      console.log(`   No email found (should have found it)\n`);
    }
    
    if (testsCompleted === totalTests) {
      console.log('─'.repeat(60));
      console.log(`\n📊 Results: ${successCount}/${totalTests} tests passed`);
      
      if (successCount === totalTests) {
        console.log('✅ URL normalization works perfectly!\n');
        process.exit(0);
      } else {
        console.log('⚠️  Some URL variants failed - check normalization logic\n');
        process.exit(1);
      }
    }
  });
});

setTimeout(() => {
  console.error('\n❌ Test timeout');
  process.exit(1);
}, 10000);
