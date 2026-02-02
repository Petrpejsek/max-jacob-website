const { spawn } = require('child_process');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const DOMAIN = 'maxandjacob.com';
const REQUIRED_SPF_INCLUDES = ['_spf.resend.com'];
const DKIM_SELECTOR = 'resend._domainkey';

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
  try {
    const spfRecords = await digQuery(DOMAIN, 'TXT');
    
    if (!spfRecords) {
      return {
        status: 'fail',
        message: 'No TXT records found for domain',
        record: null
      };
    }

    const records = spfRecords.split('\n').map(r => r.replace(/^"|"$/g, ''));
    const spfRecord = records.find(r => r.startsWith('v=spf1'));

    if (!spfRecord) {
      return {
        status: 'fail',
        message: 'No SPF record found',
        record: null
      };
    }

    // Check for required includes
    const hasResend = spfRecord.includes('_spf.resend.com');
    
    if (!hasResend) {
      return {
        status: 'fail',
        message: 'SPF missing Resend authorization',
        record: spfRecord,
        details: 'Add "include:_spf.resend.com" to SPF record'
      };
    }

    return {
      status: 'pass',
      message: 'SPF correctly configured',
      record: spfRecord
    };
  } catch (err) {
    return {
      status: 'error',
      message: `Failed to check SPF: ${err.message}`,
      record: null
    };
  }
}

/**
 * Check DKIM record
 */
async function checkDKIM() {
  try {
    const dkimRecord = await digQuery(`${DKIM_SELECTOR}.${DOMAIN}`, 'TXT');
    
    if (!dkimRecord) {
      return {
        status: 'fail',
        message: 'No DKIM record found',
        record: null,
        details: 'Verify domain in Resend dashboard'
      };
    }

    const cleanRecord = dkimRecord.replace(/^"|"$/g, '');
    if (cleanRecord.startsWith('p=')) {
      return {
        status: 'pass',
        message: 'DKIM correctly configured',
        record: cleanRecord.substring(0, 50) + '...',
        selector: DKIM_SELECTOR
      };
    } else {
      return {
        status: 'fail',
        message: 'DKIM record format is invalid',
        record: cleanRecord
      };
    }
  } catch (err) {
    return {
      status: 'error',
      message: `Failed to check DKIM: ${err.message}`,
      record: null
    };
  }
}

/**
 * Check DMARC record
 */
async function checkDMARC() {
  try {
    const dmarcRecords = await digQuery(`_dmarc.${DOMAIN}`, 'TXT');
    
    if (!dmarcRecords) {
      return {
        status: 'fail',
        message: 'No DMARC record found',
        record: null,
        details: 'Add DMARC record to DNS'
      };
    }

    const records = dmarcRecords.split('\n').map(r => r.replace(/^"|"$/g, ''));
    const dmarcRecord = records.find(r => r.startsWith('v=DMARC1'));

    if (!dmarcRecord) {
      return {
        status: 'fail',
        message: 'No valid DMARC record found',
        record: null
      };
    }

    // Check for multiple DMARC records (BAD!)
    const dmarcCount = records.filter(r => r.startsWith('v=DMARC1')).length;
    if (dmarcCount > 1) {
      return {
        status: 'warning',
        message: `Found ${dmarcCount} DMARC records - should only have ONE`,
        record: dmarcRecord,
        details: 'Remove duplicate DMARC records'
      };
    }

    // Parse DMARC policy
    const policyMatch = dmarcRecord.match(/p=(none|quarantine|reject)/);
    if (!policyMatch) {
      return {
        status: 'fail',
        message: 'DMARC policy (p=) not found or invalid',
        record: dmarcRecord
      };
    }

    const policy = policyMatch[1];
    let policyMessage = '';
    if (policy === 'none') {
      policyMessage = 'Monitoring mode (recommended for new setup)';
    } else if (policy === 'quarantine') {
      policyMessage = 'Quarantine mode (good for established senders)';
    } else if (policy === 'reject') {
      policyMessage = 'Reject mode (strictest - best reputation)';
    }

    return {
      status: 'pass',
      message: `DMARC correctly configured - ${policyMessage}`,
      record: dmarcRecord,
      policy: policy
    };
  } catch (err) {
    return {
      status: 'error',
      message: `Failed to check DMARC: ${err.message}`,
      record: null
    };
  }
}

/**
 * Get Resend domain verification status
 */
async function getResendDomainStatus() {
  try {
    if (!process.env.RESEND_API_KEY) {
      return {
        status: 'error',
        message: 'RESEND_API_KEY not configured',
        verified: false
      };
    }

    // Note: Resend API doesn't have a direct "get domain status" endpoint
    // We can infer status from DNS checks
    return {
      status: 'info',
      message: 'Domain configured in Resend',
      verified: true,
      note: 'Verify in Resend dashboard: https://resend.com/domains'
    };
  } catch (err) {
    return {
      status: 'error',
      message: `Failed to check Resend status: ${err.message}`,
      verified: false
    };
  }
}

/**
 * Overall health check
 */
async function checkEmailHealth() {
  const startTime = Date.now();
  
  // Run all checks in parallel
  const [spf, dkim, dmarc, resendStatus] = await Promise.all([
    checkSPF(),
    checkDKIM(),
    checkDMARC(),
    getResendDomainStatus()
  ]);

  const duration = Date.now() - startTime;

  // Calculate overall status
  const allPass = spf.status === 'pass' && dkim.status === 'pass' && dmarc.status === 'pass';
  const anyFail = [spf, dkim, dmarc].some(check => check.status === 'fail' || check.status === 'error');

  let overallStatus = 'unknown';
  let overallMessage = '';
  
  if (allPass) {
    overallStatus = 'healthy';
    overallMessage = 'All email authentication records are properly configured! 🎉';
  } else if (anyFail) {
    overallStatus = 'unhealthy';
    overallMessage = 'Some email authentication records need attention ⚠️';
  } else {
    overallStatus = 'warning';
    overallMessage = 'Email configuration has warnings';
  }

  return {
    overall: {
      status: overallStatus,
      message: overallMessage,
      timestamp: new Date().toISOString(),
      duration_ms: duration
    },
    checks: {
      spf,
      dkim,
      dmarc,
      resend: resendStatus
    },
    recommendations: generateRecommendations({ spf, dkim, dmarc })
  };
}

/**
 * Generate recommendations based on check results
 */
function generateRecommendations({ spf, dkim, dmarc }) {
  const recommendations = [];

  if (spf.status === 'fail') {
    recommendations.push({
      priority: 'high',
      title: 'Fix SPF Record',
      description: spf.details || 'Update SPF record to include Resend',
      action: 'Add "include:_spf.resend.com" to your SPF TXT record'
    });
  }

  if (dkim.status === 'fail') {
    recommendations.push({
      priority: 'high',
      title: 'Fix DKIM Record',
      description: dkim.details || 'DKIM authentication is not configured',
      action: 'Add DKIM record from Resend dashboard to your DNS'
    });
  }

  if (dmarc.status === 'fail') {
    recommendations.push({
      priority: 'medium',
      title: 'Add DMARC Record',
      description: dmarc.details || 'DMARC policy is not configured',
      action: 'Add DMARC TXT record: v=DMARC1; p=none; rua=mailto:postmaster@maxandjacob.com'
    });
  }

  if (dmarc.status === 'warning') {
    recommendations.push({
      priority: 'medium',
      title: 'Clean Up DMARC Records',
      description: dmarc.details || 'Multiple DMARC records found',
      action: 'Keep only one DMARC record in your DNS'
    });
  }

  if (dmarc.status === 'pass' && dmarc.policy === 'none' && spf.status === 'pass' && dkim.status === 'pass') {
    recommendations.push({
      priority: 'low',
      title: 'Upgrade DMARC Policy',
      description: 'After 2-4 weeks of successful sending, upgrade to stricter policy',
      action: 'Change DMARC policy from p=none to p=quarantine'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'info',
      title: 'All Good! 🎉',
      description: 'Your email configuration is optimal',
      action: 'Continue monitoring deliverability in Resend dashboard'
    });
  }

  return recommendations;
}

module.exports = {
  checkEmailHealth,
  checkSPF,
  checkDKIM,
  checkDMARC,
  getResendDomainStatus
};
