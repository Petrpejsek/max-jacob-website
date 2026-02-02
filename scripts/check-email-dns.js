#!/usr/bin/env node

/**
 * Email DNS Configuration Checker
 * 
 * Checks SPF, DKIM, and DMARC records for maxandjacob.com
 * to ensure proper email deliverability with Resend
 */

const { spawn } = require('child_process');

const DOMAIN = 'maxandjacob.com';
const REQUIRED_SPF_INCLUDES = ['_spf.resend.com'];
const DKIM_SELECTOR = 'resend._domainkey';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function header(message) {
  console.log('');
  log('='.repeat(60), 'bold');
  log(message, 'bold');
  log('='.repeat(60), 'bold');
  console.log('');
}

/**
 * Execute dig command and return results
 */
function digQuery(query, type = 'TXT') {
  return new Promise((resolve, reject) => {
    const dig = spawn('dig', [type, query, '+short']);
    let output = '';
    let errorOutput = '';

    dig.stdout.on('data', (data) => {
      output += data.toString();
    });

    dig.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    dig.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`dig command failed: ${errorOutput}`));
      } else {
        resolve(output.trim());
      }
    });
  });
}

/**
 * Check SPF record
 */
async function checkSPF() {
  header('SPF Record Check');
  
  try {
    const spfRecords = await digQuery(DOMAIN, 'TXT');
    
    if (!spfRecords) {
      error('No TXT records found for domain');
      return false;
    }

    // Find SPF record (starts with v=spf1)
    const records = spfRecords.split('\n').map(r => r.replace(/^"|"$/g, ''));
    const spfRecord = records.find(r => r.startsWith('v=spf1'));

    if (!spfRecord) {
      error('No SPF record found');
      info('Expected: v=spf1 include:secureserver.net include:_spf.resend.com -all');
      return false;
    }

    info(`Current SPF: ${spfRecord}`);
    
    // Check for required includes
    let allPass = true;
    for (const include of REQUIRED_SPF_INCLUDES) {
      if (spfRecord.includes(include)) {
        success(`Contains required include: ${include}`);
      } else {
        error(`Missing required include: ${include}`);
        warning(`Add "include:${include}" to your SPF record`);
        allPass = false;
      }
    }

    // Check mechanism
    if (spfRecord.endsWith('-all')) {
      success('Has hard fail mechanism (-all)');
    } else if (spfRecord.endsWith('~all')) {
      warning('Has soft fail mechanism (~all) - consider changing to -all');
    } else if (spfRecord.endsWith('+all')) {
      error('Has pass all mechanism (+all) - VERY BAD for deliverability!');
      allPass = false;
    }

    return allPass;
  } catch (err) {
    error(`Failed to check SPF: ${err.message}`);
    return false;
  }
}

/**
 * Check DKIM record
 */
async function checkDKIM() {
  header('DKIM Record Check');
  
  try {
    const dkimRecord = await digQuery(`${DKIM_SELECTOR}.${DOMAIN}`, 'TXT');
    
    if (!dkimRecord) {
      error(`No DKIM record found for ${DKIM_SELECTOR}.${DOMAIN}`);
      warning('Make sure Resend domain is verified in Resend dashboard');
      return false;
    }

    // DKIM record should start with p=
    const cleanRecord = dkimRecord.replace(/^"|"$/g, '');
    if (cleanRecord.startsWith('p=')) {
      success('DKIM record exists');
      info(`DKIM selector: ${DKIM_SELECTOR}`);
      info(`DKIM value: ${cleanRecord.substring(0, 50)}...`);
      return true;
    } else {
      error('DKIM record format is invalid');
      return false;
    }
  } catch (err) {
    error(`Failed to check DKIM: ${err.message}`);
    return false;
  }
}

/**
 * Check DMARC record
 */
async function checkDMARC() {
  header('DMARC Record Check');
  
  try {
    const dmarcRecords = await digQuery(`_dmarc.${DOMAIN}`, 'TXT');
    
    if (!dmarcRecords) {
      error('No DMARC record found');
      warning('Add DMARC record: v=DMARC1; p=none; rua=mailto:postmaster@maxandjacob.com; pct=100; adkim=r; aspf=r');
      return false;
    }

    const records = dmarcRecords.split('\n').map(r => r.replace(/^"|"$/g, ''));
    const dmarcRecord = records.find(r => r.startsWith('v=DMARC1'));

    if (!dmarcRecord) {
      error('No valid DMARC record found (must start with v=DMARC1)');
      return false;
    }

    // Check for multiple DMARC records (BAD!)
    const dmarcCount = records.filter(r => r.startsWith('v=DMARC1')).length;
    if (dmarcCount > 1) {
      error(`Found ${dmarcCount} DMARC records - should only have ONE!`);
      warning('Remove duplicate DMARC records from DNS');
      return false;
    }

    info(`Current DMARC: ${dmarcRecord}`);

    // Parse DMARC policy
    const policyMatch = dmarcRecord.match(/p=(none|quarantine|reject)/);
    if (policyMatch) {
      const policy = policyMatch[1];
      if (policy === 'none') {
        success('Policy: none (monitoring mode - recommended for new setup)');
        info('After 2-4 weeks of successful sending, change to "quarantine" or "reject"');
      } else if (policy === 'quarantine') {
        success('Policy: quarantine (good for established senders)');
      } else if (policy === 'reject') {
        success('Policy: reject (strictest - best reputation)');
      }
    } else {
      error('DMARC policy (p=) not found or invalid');
      return false;
    }

    // Check alignment modes
    if (dmarcRecord.includes('adkim=r') || dmarcRecord.includes('aspf=r')) {
      success('Relaxed alignment mode (recommended)');
    } else if (dmarcRecord.includes('adkim=s') || dmarcRecord.includes('aspf=s')) {
      warning('Strict alignment mode - may cause issues with subdomains');
    }

    return true;
  } catch (err) {
    error(`Failed to check DMARC: ${err.message}`);
    return false;
  }
}

/**
 * Check MX records
 */
async function checkMX() {
  header('MX Record Check (Info Only)');
  
  try {
    const mxRecords = await digQuery(DOMAIN, 'MX');
    
    if (!mxRecords) {
      warning('No MX records found - this is OK for sending-only domain');
      return true;
    }

    info('MX records:');
    mxRecords.split('\n').forEach(record => {
      info(`  ${record}`);
    });
    
    return true;
  } catch (err) {
    warning(`Could not check MX records: ${err.message}`);
    return true; // Not critical for sending
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('');
  log('╔════════════════════════════════════════════════════════════╗', 'bold');
  log('║                                                            ║', 'bold');
  log('║        Email DNS Configuration Checker                    ║', 'bold');
  log('║        Domain: maxandjacob.com                            ║', 'bold');
  log('║        Provider: Resend                                   ║', 'bold');
  log('║                                                            ║', 'bold');
  log('╚════════════════════════════════════════════════════════════╝', 'bold');
  console.log('');

  const results = {
    spf: await checkSPF(),
    dkim: await checkDKIM(),
    dmarc: await checkDMARC(),
    mx: await checkMX()
  };

  // Summary
  header('Summary');
  
  const allPass = results.spf && results.dkim && results.dmarc;
  
  if (allPass) {
    success('All DNS records are properly configured! ✨');
    console.log('');
    log('Your emails should now have excellent deliverability.', 'green');
    log('Next steps:', 'blue');
    info('1. Send a test email from your app');
    info('2. Check Gmail "Show Original" for SPF/DKIM/DMARC=PASS');
    info('3. Test on mail-tester.com (goal: 8+/10)');
    info('4. Monitor deliverability for first 50-100 emails');
    console.log('');
  } else {
    error('Some DNS records need attention ⚠️');
    console.log('');
    log('Fix the issues above, then run this script again.', 'yellow');
    log('DNS changes can take 15 minutes to 2 hours to propagate.', 'yellow');
    console.log('');
    
    if (!results.spf) {
      log('🔧 SPF Fix:', 'bold');
      info('Update your DNS TXT record from:');
      log('  v=spf1 include:secureserver.net -all', 'red');
      info('To:');
      log('  v=spf1 include:secureserver.net include:_spf.resend.com -all', 'green');
      console.log('');
    }
    
    if (!results.dkim) {
      log('🔧 DKIM Fix:', 'bold');
      info('1. Go to Resend dashboard: https://resend.com/domains');
      info('2. Verify your domain is added and get DKIM records');
      info('3. Add the DKIM TXT record to your DNS');
      console.log('');
    }
    
    if (!results.dmarc) {
      log('🔧 DMARC Fix:', 'bold');
      info('Add/update DMARC TXT record at _dmarc.maxandjacob.com:');
      log('  v=DMARC1; p=none; rua=mailto:postmaster@maxandjacob.com; pct=100; adkim=r; aspf=r', 'green');
      console.log('');
    }
  }

  process.exit(allPass ? 0 : 1);
}

// Run
main().catch(err => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
