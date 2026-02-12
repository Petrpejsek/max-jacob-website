# Email Template - Final Version (Feb 12, 2026)

## Deployed Version (Production)

This is the **final approved email template** used for customer outreach.

---

## Email Text (Human-Friendly, Short, Trustworthy)

### Subject
```
{Company Name} x Max & Jacob
```

### Body (HTML)
```
Hi {Company Name} — Jacob here from Max & Jacob.

I created a quick free audit of your website. No login required, just a safe preview:

[Audit - {Company Name}]  (blue link, opens in new tab)

If it's useful, we can also design a new homepage concept for you in 48 hours — completely free. Just fill out a short brief. No commitment, no sales calls.

Jacob Liesner
Max & Jacob
jacob@maxandjacob.com

---
Max & Jacob · 1221 Brickell Ave, Suite 900, Miami, FL 33131 · maxandjacob.com
```

### Body (Plain Text)
```
Hi {Company Name} — Jacob here from Max & Jacob.

I created a quick free audit of your website. No login required, just a safe preview:
{audit-url}

If it's useful, we can also design a new homepage concept for you in 48 hours — completely free. Just fill out a short brief. No commitment, no sales calls.

Jacob Liesner
Max & Jacob
jacob@maxandjacob.com
```

---

## Key Design Principles

1. **Short & Human**: Sounds like a person wrote it, not a template
2. **Trust Signals**: 
   - "free audit"
   - "no login required"
   - "safe preview"
   - "completely free"
   - "no commitment, no sales calls"
3. **Clear Value**: 48h homepage concept design offer
4. **Simple Link**: Just "Audit - {Company}" in blue, opens in new tab
5. **No Issue Lists**: No "Top Issues Found" or bullet points in email body

---

## What NOT to Include

❌ "Quick diagnosis for..."  
❌ "🚨 Top Issues Found:"  
❌ Issue lists with bullets  
❌ "lead magnet rebuild"  
❌ Technical jargon  
❌ "We're a team of devs..."  
❌ Multiple CTAs or buttons  

---

## Technical Details

### Email Headers (from emailService.js)
```javascript
from: 'Jacob from Max & Jacob <jacob@maxandjacob.com>'
reply_to: 'jacob@maxandjacob.com'
headers: {
  'List-Unsubscribe': '<https://maxandjacob.com/unsubscribe?email=...>, <mailto:jacob@maxandjacob.com?subject=Unsubscribe>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  // NOTE: NO 'Precedence: bulk' (causes spam filtering)
}
```

### Audit Link Format
```html
<a href="{auditUrl}" target="_blank" rel="noopener" style="color:#2563eb;font-size:16px;font-weight:700;text-decoration:underline;">
  Audit - {Company Name}
</a>
```

- `target="_blank"` → opens in new tab (critical for iframe preview)
- `rel="noopener"` → security best practice
- Blue color (#2563eb)
- Bold (700 weight)
- Underlined

---

## Where This Template Lives

### Pipeline Generation
**File:** `server/services/copyTemplates.js`  
**Function:** `generateOutreachEmail(job, llmContext, topIssues)`

- Used by Template Audit Engine when processing new audits
- Saves to `auditJob.email_html` in database

### Admin UI Fallback
**File:** `server/views/admin-audit-detail.ejs`  
**Variables:** `mjFallbackHtml`, `mjFallbackPlain`

- Used when `auditJob.email_html` is missing or invalid
- Also used for old audits created before this template

---

## Admin UI Email Preview

Email HTML is rendered in a **sandboxed iframe** to prevent DOM corruption:

```html
<iframe
  id="outreachEmailHtmlIframe"
  style="width: 100%; height: 560px; border: 0;"
  sandbox="allow-popups allow-popups-to-escape-sandbox"
  referrerpolicy="no-referrer"
></iframe>
```

- Iframe isolates email HTML from admin page DOM
- `sandbox` flags allow links to open in new tabs
- Prevents CSS/layout breakage on admin page

---

## Version History

| Date | Commit | Change |
|------|--------|--------|
| Feb 12, 2026 | c399127 | Fix: open audit in new tab + rewrite for trust/clarity |
| Feb 12, 2026 | 02c5eeb | Replace "Top Issues" template with human 48h preview note |
| Feb 12, 2026 | 41f2063 | Fix admin UI to prefer pipeline email over hardcoded fallback |
| Feb 12, 2026 | c67d182 | Remove Precedence:bulk header + add Miami address |

---

## Testing Checklist

Before sending to customers, verify:

- [ ] Email preview renders correctly in admin UI (no layout breakage)
- [ ] Audit link opens in **new tab** (not inside iframe)
- [ ] Audit link goes to correct `/{public_slug}?v=2` URL
- [ ] Company name is correctly substituted
- [ ] Footer contains Miami address
- [ ] No "Top Issues" content appears
- [ ] Text sounds human and trustworthy
- [ ] Send test to personal Gmail → lands in **inbox** (not spam)

---

**Status:** ✅ DEPLOYED TO PRODUCTION  
**Last Updated:** February 12, 2026  
**Approved By:** User (via Cursor AI fixes)
