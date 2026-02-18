/**
 * Email Verifier — validates deliverability BEFORE sending.
 *
 * Three-layer check:
 *   1. Syntax — format, disposable domain, role-based address
 *   2. MX lookup — domain has a live mail server
 *   3. SMTP probe — mailbox exists (optional, off by default — some servers block)
 */

const dns = require('dns');
const net = require('net');

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'mailnesia.com', 'maildrop.cc', 'trashmail.com',
  'fakeinbox.com', '10minutemail.com', 'temp-mail.org', 'emailondeck.com',
  'getnada.com', 'mohmal.com', 'tempail.com', 'burnermail.io',
  'inboxkitten.com', 'crazymailing.com'
]);

const ROLE_PREFIXES = new Set([
  'info', 'admin', 'support', 'help', 'sales', 'contact', 'office',
  'hello', 'team', 'marketing', 'billing', 'abuse', 'postmaster',
  'webmaster', 'hostmaster', 'noreply', 'no-reply', 'donotreply',
  'mailer-daemon'
]);

/**
 * Full verification pipeline.
 * @param {string} email
 * @param {{ skipSmtp?: boolean }} opts
 * @returns {Promise<{
 *   email: string,
 *   valid: boolean,
 *   checks: { syntax: boolean, mx: boolean, smtp: boolean|null },
 *   risk: 'low'|'medium'|'high'|'invalid',
 *   reason: string|null,
 *   mxHost: string|null,
 *   isRoleBased: boolean,
 *   isDisposable: boolean
 * }>}
 */
async function verifyEmail(email, opts = {}) {
  const skipSmtp = opts.skipSmtp !== false; // SMTP off by default
  const normalized = String(email || '').toLowerCase().trim();

  const result = {
    email: normalized,
    valid: false,
    checks: { syntax: false, mx: false, smtp: null },
    risk: 'invalid',
    reason: null,
    mxHost: null,
    isRoleBased: false,
    isDisposable: false
  };

  // --- 1. Syntax ---
  const syntaxCheck = checkSyntax(normalized);
  result.checks.syntax = syntaxCheck.valid;
  result.isRoleBased = syntaxCheck.isRoleBased;
  result.isDisposable = syntaxCheck.isDisposable;

  if (!syntaxCheck.valid) {
    result.reason = syntaxCheck.reason;
    return result;
  }

  try {
    // --- 2. MX lookup ---
    const domain = normalized.split('@')[1];
    const mxCheck = await checkMX(domain);
    result.checks.mx = mxCheck.valid;
    result.mxHost = mxCheck.host;

    if (!mxCheck.valid) {
      result.reason = mxCheck.reason;
      return result;
    }

    // --- 3. SMTP probe (optional) ---
    if (!skipSmtp && mxCheck.host) {
      const smtpCheck = await checkSMTP(normalized, mxCheck.host);
      result.checks.smtp = smtpCheck.valid;
      if (!smtpCheck.valid) {
        result.reason = smtpCheck.reason;
        result.risk = 'high';
        result.valid = false;
        return result;
      }
    }
  } catch (err) {
    // DNS or network error — treat as valid to avoid blocking legitimate sends
    console.error('[EMAIL-VERIFIER] Network error during verification:', err.message);
    result.checks.mx = true;
    result.reason = `verification network error: ${err.message}`;
  }

  // --- Assign risk ---
  result.valid = true;
  if (result.isDisposable) {
    result.risk = 'high';
    result.reason = 'disposable domain';
    result.valid = false;
  } else if (result.isRoleBased) {
    result.risk = 'medium';
    result.reason = 'role-based address (info@, support@, etc.)';
  } else {
    result.risk = 'low';
  }

  return result;
}

// ——— Syntax ———

function checkSyntax(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'empty', isRoleBased: false, isDisposable: false };
  }

  const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}$/;
  if (!pattern.test(email)) {
    return { valid: false, reason: 'invalid format', isRoleBased: false, isDisposable: false };
  }

  if (email.length < 5 || email.length > 254) {
    return { valid: false, reason: 'invalid length', isRoleBased: false, isDisposable: false };
  }

  const [local, domain] = email.split('@');

  const isDisposable = DISPOSABLE_DOMAINS.has(domain);
  const isRoleBased = ROLE_PREFIXES.has(local);

  if (/^\d+(\.\d+)+$/.test(domain)) {
    return { valid: false, reason: 'version-like domain', isRoleBased, isDisposable };
  }

  const spamDomains = ['example.com', 'test.com', 'sample.com', 'placeholder.com',
    'yoursite.com', 'yourdomain.com', 'domain.com', 'email.com', 'website.com'];
  if (spamDomains.includes(domain)) {
    return { valid: false, reason: 'placeholder domain', isRoleBased, isDisposable };
  }

  if (local.startsWith('noreply') || local.startsWith('no-reply') || local.startsWith('donotreply')) {
    return { valid: false, reason: 'noreply address', isRoleBased: true, isDisposable };
  }

  return { valid: true, reason: null, isRoleBased, isDisposable };
}

// ——— MX lookup ———

function checkMX(domain, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(val);
    };

    const timer = setTimeout(() => {
      finish({ valid: true, host: null, reason: 'MX lookup timed out (treating as valid)' });
    }, timeoutMs);

    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        // Fallback: check A record (some small domains accept mail on A)
        dns.resolve4(domain, (errA, addrsA) => {
          if (errA || !addrsA || addrsA.length === 0) {
            finish({ valid: false, host: null, reason: `domain "${domain}" has no MX or A records — mail cannot be delivered` });
          } else {
            finish({ valid: true, host: domain, reason: 'no MX but A record exists (risky)' });
          }
        });
        return;
      }

      // Sort by priority (lowest = preferred)
      addresses.sort((a, b) => a.priority - b.priority);
      finish({ valid: true, host: addresses[0].exchange, reason: null });
    });
  });
}

// ——— SMTP probe ———

function checkSMTP(email, mxHost, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch (_) { /* already closed */ }
      resolve(val);
    };

    const socket = net.createConnection(25, mxHost);

    const timer = setTimeout(() => {
      finish({ valid: true, reason: 'smtp timeout (treating as valid)' });
    }, timeoutMs);

    let step = 0;
    let response = '';

    socket.setEncoding('utf8');

    socket.on('data', (data) => {
      response += data;

      if (step === 0 && response.includes('220')) {
        step = 1;
        socket.write(`EHLO maxandjacob.com\r\n`);
        response = '';
      } else if (step === 1 && response.includes('250')) {
        step = 2;
        socket.write(`MAIL FROM:<verify@maxandjacob.com>\r\n`);
        response = '';
      } else if (step === 2 && response.includes('250')) {
        step = 3;
        socket.write(`RCPT TO:<${email}>\r\n`);
        response = '';
      } else if (step === 3) {
        if (response.includes('250')) {
          finish({ valid: true, reason: null });
        } else if (response.includes('550') || response.includes('553') || response.includes('511')) {
          finish({ valid: false, reason: 'mailbox does not exist (SMTP 5xx)' });
        } else {
          finish({ valid: true, reason: 'ambiguous SMTP response' });
        }
      }
    });

    socket.on('error', () => {
      finish({ valid: true, reason: 'smtp connection failed (treating as valid)' });
    });
  });
}

/**
 * Batch verify an array of emails.
 * @param {string[]} emails
 * @param {{ skipSmtp?: boolean, concurrency?: number }} opts
 * @returns {Promise<Array>}
 */
async function verifyEmails(emails, opts = {}) {
  const concurrency = opts.concurrency || 5;
  const results = [];

  for (let i = 0; i < emails.length; i += concurrency) {
    const batch = emails.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(e => verifyEmail(e, opts))
    );
    results.push(...batchResults);
  }

  return results;
}

module.exports = { verifyEmail, verifyEmails, checkMX, checkSyntax };
