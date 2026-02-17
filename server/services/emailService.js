const { Resend } = require('resend');

// Lazy-init Resend client so server can start even when RESEND_API_KEY is not set (e.g. deploy before env is configured)
let resendClient = null;
function getResend() {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY not configured in environment variables');
    resendClient = new Resend(key);
  }
  return resendClient;
}

/**
 * Send email via Resend API
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.html] - HTML email body
 * @param {string} [options.text] - Plain text email body
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    const resend = getResend();

    // Send email via Resend
    // NOTE: Resend Node SDK returns { data, error } (v4+).
    //
    // DELIVERABILITY NOTES (Feb 2026):
    // - NO Precedence:bulk (tells Gmail "this is bulk" → spam)
    // - NO List-Unsubscribe headers (signals "marketing email" for cold outreach;
    //   unsubscribe link in email body is sufficient for CAN-SPAM compliance)
    // - FROM name is personal "Jacob Liesner" (not "Jacob from Max & Jacob"
    //   which mimics SaaS/marketing tool patterns Gmail recognizes)
    const result = await resend.emails.send({
      from: 'Jacob Liesner <jacob@maxandjacob.com>',
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
      reply_to: 'jacob@maxandjacob.com',
      tags: [
        { name: 'category', value: 'audit-outreach' }
      ]
    });

    // Normalize response shape across SDK versions
    const data = (result && result.data) ? result.data : result;
    const err = (result && result.error) ? result.error : null;

    if (err) {
      const msg = (typeof err === 'string')
        ? err
        : (err.message || err.name || 'Unknown Resend error');
      throw new Error(msg);
    }

    const id = data && data.id ? String(data.id) : null;
    if (!id) {
      throw new Error('Resend did not return an email id (cannot track opens/clicks)');
    }

    return { success: true, id };
  } catch (error) {
    console.error('Email sending error:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown error sending email'
    };
  }
}

/**
 * Send notification to jacob@maxandjacob.com when a client posts a message in a deal thread.
 * @param {Object} options
 * @param {Object} options.deal - Deal row (id, title, client_name, client_email)
 * @param {string} options.messageBody - Text of the client's message
 * @param {Array}  options.attachments - Array of attachment objects (may be empty)
 * @param {string} options.adminBaseUrl - Base URL of the admin panel (e.g. https://app.maxandjacob.com)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendDealNotificationToAdmin({ deal, messageBody, attachments = [], adminBaseUrl }) {
  const adminLink = `${adminBaseUrl}/admin/deals/${deal.id}`;
  const preview = messageBody ? messageBody.substring(0, 300) : '(no text — see attachments)';
  const attachmentHtml = attachments.length
    ? `<p style="color:#6b7280;font-size:14px;">${attachments.length} attachment(s): ${attachments.map(a => escapeEmailText(a.original_name)).join(', ')}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <h2 style="color:#111827;margin:0 0 8px 0;">New message from ${escapeEmailText(deal.client_name)}</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 20px 0;">Deal: <strong>${escapeEmailText(deal.title)}</strong></p>
    <div style="background:#f9fafb;border-left:4px solid #6366f1;padding:16px;border-radius:6px;margin-bottom:20px;">
      <p style="color:#374151;margin:0;white-space:pre-wrap;">${escapeEmailText(preview)}${messageBody && messageBody.length > 300 ? '…' : ''}</p>
    </div>
    ${attachmentHtml}
    <a href="${adminLink}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">Open deal thread</a>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;">From: ${escapeEmailText(deal.client_name)} &lt;${escapeEmailText(deal.client_email)}&gt;</p>
  </div>
</body>
</html>`;

  return sendEmail({
    to: 'jacob@maxandjacob.com',
    subject: `[Deal] ${deal.client_name} replied — ${deal.title}`,
    html
  });
}

/**
 * Send notification to the client when Jacob/admin posts a message in a deal thread.
 * @param {Object} options
 * @param {Object} options.deal - Deal row (id, title, client_name, client_email, magic_token)
 * @param {string} options.messageBody - Text of the admin's message
 * @param {Array}  options.attachments - Array of attachment objects (may be empty)
 * @param {string} options.baseUrl - Base URL of the site (e.g. https://app.maxandjacob.com)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendDealNotificationToClient({ deal, messageBody, attachments = [], baseUrl }) {
  const threadLink = `${baseUrl}/deal/${deal.magic_token}`;
  const preview = messageBody ? messageBody.substring(0, 400) : '(no text — see attachments)';
  const attachmentHtml = attachments.length
    ? `<p style="color:#6b7280;font-size:14px;">${attachments.length} attachment(s): ${attachments.map(a => escapeEmailText(a.original_name)).join(', ')}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <h2 style="color:#111827;margin:0 0 8px 0;">You have a new message</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 4px 0;">Hi ${escapeEmailText(deal.client_name)},</p>
    <p style="color:#6b7280;font-size:14px;margin:0 0 20px 0;">Jacob from Max &amp; Jacob sent you a message in your deal thread:</p>
    <div style="background:#f9fafb;border-left:4px solid #10b981;padding:16px;border-radius:6px;margin-bottom:20px;">
      <p style="color:#374151;margin:0;white-space:pre-wrap;">${escapeEmailText(preview)}${messageBody && messageBody.length > 400 ? '…' : ''}</p>
    </div>
    ${attachmentHtml}
    <a href="${threadLink}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">View conversation</a>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;">This link is unique to you — no password needed. Reply directly in the thread.</p>
    <p style="color:#9ca3af;font-size:12px;">Max &amp; Jacob — <a href="https://maxandjacob.com" style="color:#9ca3af;">maxandjacob.com</a></p>
  </div>
</body>
</html>`;

  return sendEmail({
    to: deal.client_email,
    subject: `New message from Jacob — ${deal.title}`,
    html
  });
}

function escapeEmailText(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { sendEmail, sendDealNotificationToAdmin, sendDealNotificationToClient };
