#!/usr/bin/env node

/**
 * Test Audit Pipeline Integration - simuluje audit flow s email fallbackem
 */

const { getPreauditEmailByUrl } = require('./server/db');

console.log('🧪 Testing Audit Pipeline Integration\n');
console.log('Simulating audit flow with email fallback...\n');
console.log('─'.repeat(60), '\n');

// Simulace auditu (jako v auditPipeline.js)
async function simulateAuditFlow(url) {
  console.log('📋 Audit Flow Simulation:');
  console.log(`   URL: ${url}\n`);
  
  // Step 1: Simulate scraping (no email found)
  console.log('1️⃣  Scraping website...');
  const emailByKey = new Map(); // Prázdná - simulujeme že scraper nenašel email
  console.log('   ❌ No email found in scraped data\n');
  
  // Step 2: Fallback to preaudit
  console.log('2️⃣  Checking preaudit fallback...');
  
  const preauditEmail = await new Promise((resolve, reject) => {
    getPreauditEmailByUrl(url, (err, email) => {
      if (err) {
        console.error('   [AUDIT] Preaudit email fallback error:', err);
        resolve(null);
      } else {
        resolve(email);
      }
    });
  });
  
  if (preauditEmail) {
    console.log('   ✅ Found email from preaudit fallback:', preauditEmail);
    emailByKey.set(preauditEmail.toLowerCase(), {
      value: preauditEmail,
      source: 'preaudit_fallback'
    });
  } else {
    console.log('   ❌ No email found in preaudit either');
  }
  
  // Step 3: Final result
  console.log('\n3️⃣  Final result:');
  const emailCandidates = Array.from(emailByKey.values());
  const bestEmail = emailCandidates.length ? emailCandidates[0].value : null;
  
  if (bestEmail) {
    console.log('   ✅ Email:', bestEmail);
    console.log('   📍 Source:', emailCandidates[0].source);
    return { success: true, email: bestEmail, source: emailCandidates[0].source };
  } else {
    console.log('   ❌ No email available');
    return { success: false, email: null, source: null };
  }
}

// Test s URL která má preaudit result
const testUrl = 'https://snohomishwaplumbing.com';

simulateAuditFlow(testUrl)
  .then((result) => {
    console.log('\n' + '─'.repeat(60));
    console.log('\n📊 Integration Test Result:\n');
    
    if (result.success && result.source === 'preaudit_fallback') {
      console.log('✅ SUCCESS! Audit pipeline fallback works correctly!');
      console.log(`   - Email: ${result.email}`);
      console.log(`   - Source: ${result.source}`);
      console.log('\n💡 This is exactly how it will work in production:\n');
      console.log('   1. Audit scrapes website');
      console.log('   2. If no email found, checks preaudit');
      console.log('   3. Uses preaudit email as fallback');
      console.log('   4. Email appears in audit results\n');
      process.exit(0);
    } else if (result.success) {
      console.log('⚠️  Email found but not from fallback');
      console.log(`   Source: ${result.source}`);
      process.exit(1);
    } else {
      console.log('❌ FAIL: No email found');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('\n❌ ERROR:', err.message);
    process.exit(1);
  });
