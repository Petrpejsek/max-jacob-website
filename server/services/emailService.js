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
    const result = await resend.emails.send({
      from: 'jacob@maxandjacob.com', // Must be configured in Resend dashboard
      to,
      subject,
      html: html || undefined,
      text: text || undefined
    });

    return { success: true, id: result.id };
  } catch (error) {
    console.error('Email sending error:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown error sending email'
    };
  }
}

module.exports = { sendEmail };
