# Email Sending Implementation - Setup Guide

## ✅ What Was Implemented

### 1. Backend Infrastructure
- **Email Service** (`server/services/emailService.js`): Resend API integration
- **Database**: New `email_logs` table to track all sent emails
- **API Endpoint**: `POST /admin/audits/:id/send-email` with validation and rate limiting
- **CRUD Functions**: `createEmailLog()`, `getEmailLogsByJobId()` in `db.js`

### 2. Frontend UI
- **Email Form** in audit detail page with:
  - Recipient email input (prefilled from scrape data)
  - Subject input (prefilled as "BusinessName x Max & Jacob")
  - HTML/Plain text format checkbox
  - Send button with loading states
  - Status messages (success/error)
- **LocalStorage**: Remembers last format preference (HTML/Plain)

### 3. Features
- Real-time email sending via Resend API
- Email format validation
- Rate limiting (reuses existing `auditJobLimiter`)
- Complete email logging (recipient, subject, format, status, resend_id, errors)
- Visual feedback with auto-hide messages

---

## 🚀 Setup Instructions

### Step 1: Create Resend Account

1. Go to [resend.com](https://resend.com)
2. Sign up (free tier: 100 emails/day, 3,000/month)
3. Verify your email

### Step 2: Add Domain to Resend

1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter: `maxandjacob.com`
4. Follow DNS verification instructions:
   - Add SPF, DKIM, and DMARC records to your domain DNS settings
   - Wait for verification (can take a few minutes to 24 hours)

### Step 3: Get API Key

1. In Resend dashboard, go to **API Keys**
2. Click **Create API Key**
3. Name it: `Max&Jacob Production`
4. Select permissions: **Full access** (or just "Send emails")
5. Copy the API key (starts with `re_...`)

### Step 4: Add to Environment

Add this line to your `.env` file:

```bash
RESEND_API_KEY=re_your_actual_api_key_here
```

⚠️ **Important**: Replace `re_your_actual_api_key_here` with your real API key from Step 3.

### Step 5: Configure "From" Address

In `server/services/emailService.js`, the from address is set to:

```javascript
from: 'jacob@maxandjacob.com'
```

Make sure this email is:
1. Associated with your verified domain in Resend
2. The email you want customers to see as sender

To change it, edit line 22 in `emailService.js`.

### Step 6: Restart Server

```bash
# Local development
npm start

# Or if using dev.sh
./dev.sh
```

The server will now load the `RESEND_API_KEY` from `.env`.

---

## 🧪 Testing

### 1. Check Setup

1. Go to any audit detail page: `https://maxandjacob.com/admin/audits/3`
2. Click **Show Email** button
3. You should see:
   - Email form with recipient and subject inputs
   - HTML/Plain text checkbox
   - **📧 Send Email** button

### 2. Send Test Email

1. Enter your own email as recipient (for testing)
2. Check the subject
3. Choose format (HTML recommended)
4. Click **📧 Send Email**
5. Look for success message: **"✅ Email sent successfully to your@email.com"**

### 3. Check Inbox

1. Open your email client
2. You should receive the audit email within seconds
3. Verify:
   - Subject is correct
   - Email body looks good (HTML formatted if you selected HTML)
   - Links work
   - Signature is present

### 4. Check Resend Dashboard

1. Go to Resend dashboard → **Emails**
2. You should see your sent email in the list
3. Click it to see delivery status

### 5. Check Database

The sent email is logged in `email_logs` table:

```sql
SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 5;
```

You should see:
- `recipient_email`: who received it
- `subject`: email subject
- `format`: 'html' or 'plain'
- `status`: 'sent' or 'failed'
- `resend_id`: ID from Resend API
- `sent_at`: timestamp

---

## 📊 Database Schema

### email_logs Table

| Column           | Type     | Description                          |
|------------------|----------|--------------------------------------|
| id               | INTEGER  | Primary key                          |
| audit_job_id     | INTEGER  | Foreign key to audit_jobs            |
| sent_at          | DATETIME | When email was sent                  |
| recipient_email  | TEXT     | Customer email address               |
| subject          | TEXT     | Email subject line                   |
| format           | TEXT     | 'html' or 'plain'                    |
| status           | TEXT     | 'sent' or 'failed'                   |
| resend_id        | TEXT     | ID from Resend API (for tracking)   |
| error_message    | TEXT     | Error if sending failed              |

---

## 🔧 Troubleshooting

### "RESEND_API_KEY not configured"

**Problem**: API key missing from environment.

**Solution**: 
1. Check `.env` file exists in project root
2. Verify line: `RESEND_API_KEY=re_...`
3. Restart server

### "Failed to send email: Domain not verified"

**Problem**: Domain verification incomplete in Resend.

**Solution**:
1. Go to Resend dashboard → Domains
2. Check verification status for `maxandjacob.com`
3. Add missing DNS records if needed
4. Wait for verification (up to 24 hours)

### "Invalid email address format"

**Problem**: Recipient email is invalid or empty.

**Solution**:
- Check email has `@` and domain
- Remove spaces
- Use real email address

### Email not arriving

**Problem**: Email sent but not received.

**Solution**:
1. Check spam/junk folder
2. Check Resend dashboard for delivery status
3. Verify recipient email is correct
4. Check domain DNS records are correct

### Button disabled or grayed out

**Problem**: Recipient or subject is empty.

**Solution**: Fill both fields before clicking Send.

---

## 💡 Usage Tips

### 1. Format Selection

- **HTML**: Best for customers (formatted, clickable links, signature)
- **Plain Text**: Use if HTML has issues or customer prefers plain text

### 2. Testing Strategy

1. Always test with your own email first
2. Check HTML rendering in different email clients (Gmail, Outlook, Apple Mail)
3. Verify all links work before sending to customers

### 3. Monitoring

- Check `email_logs` table regularly
- Monitor Resend dashboard for delivery rates
- Watch for failed sends and investigate errors

### 4. Rate Limits

- Free tier: 100 emails/day, 3,000/month
- Endpoint has rate limiting via `auditJobLimiter`
- Upgrade Resend plan if sending more emails

---

## 📝 Next Improvements (Optional)

1. **Email History UI**: Show sent emails in audit detail page
2. **Templates**: Save custom email templates
3. **Scheduling**: Schedule emails for later
4. **Tracking**: Open rates, click rates (Resend supports this)
5. **Attachments**: Send PDFs with emails
6. **BCC**: Copy emails to team
7. **Reply-To**: Set different reply address

---

## 🎉 You're Done!

Once you complete Steps 1-6 above, the email sending functionality is ready to use!

**Quick checklist**:
- [ ] Resend account created
- [ ] Domain verified in Resend
- [ ] API key added to `.env`
- [ ] Server restarted
- [ ] Test email sent successfully
- [ ] Email received in inbox

If you have any issues, check the Troubleshooting section above.
