const { Resend } = require('resend');

// Initialize Resend client with API key from environment
const resend = new Resend(process.env.RESEND_API_KEY);

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
    // Validate Resend API key exists
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not configured in environment variables');
    }

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

module.exports = { sendEmail };
