const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getPersistentPublicDir } = require('../runtimePaths');
const { normalizeWebsiteUrl } = require('../helpers/urlUtils');
const {
  getAllSubmissions,
  getSubmissionById,
  deleteSubmission,
  getAllWebProjectSubmissions,
  getWebProjectSubmissionById,
  deleteWebProjectSubmission,
  createAuditJob,
  getAuditJobs,
  getAuditJobById,
  updateAuditJob,
  deleteAuditJob,
  getAuditJobByUrl,
  getAuditRunLogs,
  getActivePromptTemplates,
  createPromptTemplateVersion,
  getCrawledPagesByJobId,
  getLighthouseReportsByJobId,
  getAllAssistants,
  getAssistantById,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  getAssistantRunsByJobId,
  getAssistantRunById,
  getAllSiteSettings,
  setSiteSetting,
  createEmailLog,
  getEmailLogsByJobId,
  getAllEmailLogsStatus,

  // Presets (needed for Preaudits dropdown)
  getAllNichePresets,

  // Preaudits
  createPreauditSearch,
  getPreauditSearchById,
  getAllPreauditSearches,
  updatePreauditSearch,
  deletePreauditSearch,
  getPreauditResultsBySearchId,
  getPreauditResultById,
  updatePreauditResult,
  getPreauditCountsBySearchId,
  deletePreauditResult,
  addToBlacklist
} = require('../db');
const auditPipeline = require('../services/auditPipeline');
const preauditPipeline = require('../services/preauditPipeline');
const { collectDiagnostics } = require('../services/diagnostics');
const { loginLimiter, auditJobLimiter } = require('../middleware/security');
const { auditQueue } = require('../services/auditQueue');
const { getMemorySnapshot, logMemoryDelta } = require('../services/memoryMonitor');
const { sendEmail } = require('../services/emailService');
const { checkEmailHealth } = require('../services/emailHealthCheck');
const { getTestEmail, getTestResults } = require('../services/mailTesterService');

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert HTML email to plain text for better deliverability
 * @param {string} html - HTML content
 * @param {string} recipientEmail - Recipient email for unsubscribe link
 * @returns {string} Plain text version
 */
function generatePlainTextFromHtml(html, recipientEmail) {
  if (!html) return '';
  
  let text = html;
  
  // Remove DOCTYPE, html, head, body tags
  text = text.replace(/<!DOCTYPE[^>]*>/gi, '');
  text = text.replace(/<html[^>]*>/gi, '');
  text = text.replace(/<\/html>/gi, '');
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  text = text.replace(/<body[^>]*>/gi, '');
  text = text.replace(/<\/body>/gi, '');
  
  // Convert links to plain text with URL
  text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)');
  
  // Convert headings
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1\n' + '='.repeat(50) + '\n');
  
  // Convert paragraphs
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n');
  
  // Convert line breaks
  text = text.replace(/<br[^>]*>/gi, '\n');
  
  // Convert list items
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n');
  text = text.replace(/<ul[^>]*>/gi, '\n');
  text = text.replace(/<\/ul>/gi, '\n');
  
  // Remove all other HTML tags
  text = text.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&middot;/g, '·');
  
  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Multiple newlines to max 2
  text = text.replace(/  +/g, ' '); // Multiple spaces to single
  text = text.trim();
  
  // Add unsubscribe link at the end (REQUIRED for deliverability!)
  if (recipientEmail) {
    const baseUrl = process.env.BASE_URL || 'https://maxandjacob.com';
    const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(recipientEmail)}`;
    text += `\n\n---\nYou received this email because we analyzed your website. If you'd like to stop receiving emails from us, unsubscribe here: ${unsubscribeUrl}\n\nMax & Jacob · maxandjacob.com`;
  }
  
  return text;
}

// Add unsubscribe footer to HTML email (REQUIRED for deliverability!)
function addUnsubscribeFooterToHtml(html, recipientEmail) {
  if (!html || !recipientEmail) return html;
  
  const baseUrl = process.env.BASE_URL || 'https://maxandjacob.com';
  const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(recipientEmail)}`;
  
  // Check if unsubscribe link already exists
  if (html.includes('unsubscribe') || html.includes('Unsubscribe')) {
    return html; // Already has unsubscribe, don't duplicate
  }
  
  // Footer HTML (Gmail-friendly, simple design)
  const footer = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-family: Arial, sans-serif;">
      <p style="font-size: 12px; line-height: 1.5; color: #999; margin: 0 0 8px 0;">
        You received this email because we analyzed your website and wanted to share a complimentary audit.
        <a href="${unsubscribeUrl}" style="color: #6a82fb; text-decoration: underline;">Unsubscribe</a>
      </p>
      <p style="font-size: 12px; color: #999; margin: 0;">
        Max &amp; Jacob · <a href="https://maxandjacob.com" style="color: #6a82fb; text-decoration: none;">maxandjacob.com</a>
      </p>
    </div>`;
  
  // Try to insert before </body> or </html>, or just append
  if (html.includes('</body>')) {
    return html.replace('</body>', `${footer}</body>`);
  } else if (html.includes('</html>')) {
    return html.replace('</html>', `${footer}</html>`);
  } else {
    return html + footer;
  }
}

function ensureAuditLinkBlockInEmailHtml(emailHtmlRaw, { auditUrl, companyLabel }) {
  if (!emailHtmlRaw) return emailHtmlRaw;
  if (!auditUrl) return emailHtmlRaw;

  const label = companyLabel ? `Audit - ${companyLabel}` : 'Audit';
  const block =
    `<p style="margin: 20px 0;">` +
    `<strong style="font-size: 16px;">${escapeHtml(label)}</strong><br>` +
    `<a href="${escapeHtml(auditUrl)}" style="color: #4F46E5; text-decoration: none;">${escapeHtml(auditUrl)}</a>` +
    `</p>`;

  let html = String(emailHtmlRaw);
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(html);
  if (!looksLikeHtml) {
    html = `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(html)}</div>`;
  }

  // If the email already contains our label, don't duplicate it.
  if (html.includes('Audit - ') && html.includes(auditUrl)) return html;

  // If a plain URL is present, replace first occurrence; otherwise append.
  const idx = html.indexOf(auditUrl);
  if (idx !== -1) return html.replace(auditUrl, block);
  return `${html}\n${block}`;
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(getPersistentPublicDir(), 'team');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // IMPORTANT: do NOT rely on req.body here (multipart field order is not guaranteed).
    // Use route param if available; fall back to body only if present.
    const member = req.params?.member || req.body?.member || 'unknown';
    const ext = path.extname(file.originalname);
    cb(null, `${member}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Wrap multer so errors always return JSON (prevents HTML error pages breaking fetch().json()).
function uploadSingleJson(fieldName) {
  return function (req, res, next) {
    upload.single(fieldName)(req, res, (err) => {
      if (!err) return next();

      const isMulterError = err && err.name === 'MulterError';
      let status = 400;
      let code = isMulterError ? err.code : 'upload_error';
      let message = err.message || 'Upload failed';

      if (isMulterError && err.code === 'LIMIT_FILE_SIZE') {
        message = 'File is too large (max 5MB).';
      }

      return res.status(status).json({
        error: code,
        message
      });
    });
  };
}

// Middleware pro ověření admin přístupu
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  // For AJAX/JSON requests, do NOT redirect (fetch would receive HTML and silently fail).
  // Instead return a 401 JSON payload so the UI can show a clear "session expired" message.
  const accept = (req.headers.accept || '').toLowerCase();
  const wantsJson =
    accept.includes('application/json') ||
    req.xhr ||
    (req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';

  if (wantsJson) {
    return res.status(401).json({
      error: 'not_authenticated',
      message: 'Admin session expired. Please log in again.',
      login_url: '/admin/login'
    });
  }

  return res.redirect('/admin/login');
}

// GET /admin/login - display login form
router.get('/login', (req, res) => {
  // If already logged in, redirect to admin
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin');
  }
  
  res.render('login', { 
    error: null 
  });
});

// POST /admin/login - zpracování přihlášení
router.post('/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('ADMIN_PASSWORD is not set');
    return res.status(500).send('Admin password is not configured');
  }

  if (password === adminPassword) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }

  res.render('login', { 
    error: 'Wrong password' 
  });
});

// GET /admin/logout - odhlášení
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/admin/login');
  });
});

// GET /admin - seznam všech submissions
router.get('/', requireAdmin, (req, res) => {
  // Načtení obou typů submissions
  getAllSubmissions((err, contactSubmissions) => {
    if (err) {
      console.error('Error fetching contact submissions:', err);
      contactSubmissions = [];
    }

    getAllWebProjectSubmissions((err, webProjectSubmissions) => {
      if (err) {
        console.error('Error fetching web-project submissions:', err);
        webProjectSubmissions = [];
      }
      getAuditJobs((err, auditJobs) => {
        if (err) {
          console.error('Error fetching audit jobs:', err);
          auditJobs = [];
        }

        res.render('admin-list', { 
          contactSubmissions: contactSubmissions || [],
          webProjectSubmissions: webProjectSubmissions || [],
          auditJobs: auditJobs || []
        });
      });
    });
  });
});

// GET /admin/diagnostics - runtime parity diagnostics (copy JSON and diff local vs prod)
router.get('/diagnostics', requireAdmin, async (req, res) => {
  try {
    const diag = await collectDiagnostics();
    res.render('admin-diagnostics', { diag });
  } catch (err) {
    console.error('[DIAGNOSTICS] Failed to collect diagnostics:', err);
    return res.status(500).send('Failed to collect diagnostics');
  }
});

// GET /admin/email-health - Email Health Dashboard
router.get('/email-health', requireAdmin, (req, res) => {
  res.render('admin-email-health');
});

// GET /admin/api/diagnostics - JSON diagnostics for automation
router.get('/api/diagnostics', requireAdmin, async (req, res) => {
  try {
    const diag = await collectDiagnostics();
    return res.json(diag);
  } catch (err) {
    console.error('[DIAGNOSTICS] Failed to collect diagnostics:', err);
    return res.status(500).json({ error: 'diagnostics_failed', message: err.message });
  }
});

// POST /admin/api/test-deliverability/:auditId/start - Start mail-tester.com test
router.post('/api/test-deliverability/:auditId/start', requireAdmin, auditJobLimiter, async (req, res) => {
  const auditId = req.params.auditId;
  
  try {
    console.log(`[TEST-DELIVERABILITY] Starting test for audit ${auditId}`);
    
    // Get test email from mail-tester.com
    const { email: testEmail, testId } = await getTestEmail();
    
    console.log(`[TEST-DELIVERABILITY] Got test email: ${testEmail}, testId: ${testId}`);
    
    // Get audit email content
    const { getAuditJob } = require('../db');
    const audit = await new Promise((resolve, reject) => {
      getAuditJob(auditId, (err, job) => {
        if (err) reject(err);
        else resolve(job);
      });
    });
    
    if (!audit) {
      return res.status(404).json({ 
        success: false, 
        error: 'Audit not found' 
      });
    }
    
    // Prepare email content
    const htmlBody = audit.email_html || '<p>Test email from Max & Jacob</p>';
    const subject = `${audit.company_name || audit.niche || 'Test'} x Max & Jacob`;
    
    // Add unsubscribe footer (using existing function)
    const htmlWithFooter = addUnsubscribeFooterToHtml(htmlBody, testEmail);
    const textBody = generatePlainTextFromHtml(htmlWithFooter, testEmail);
    
    // Send email to mail-tester
    console.log(`[TEST-DELIVERABILITY] Sending email to ${testEmail}`);
    
    const sendResult = await sendEmail({
      to: testEmail,
      subject: subject,
      html: htmlWithFooter,
      text: textBody
    });
    
    if (!sendResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to send test email',
        details: sendResult.error
      });
    }
    
    console.log(`[TEST-DELIVERABILITY] Email sent successfully, resend_id: ${sendResult.id}`);
    
    // Return test info
    res.json({
      success: true,
      testId,
      testEmail,
      resultsUrl: `https://www.mail-tester.com/${testId}`,
      message: 'Test email sent! Results will be available in ~30 seconds.'
    });
    
  } catch (error) {
    console.error(`[TEST-DELIVERABILITY] Error starting test for audit ${auditId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start deliverability test'
    });
  }
});

// GET /admin/api/test-deliverability/:testId/results - Get mail-tester.com results
router.get('/api/test-deliverability/:testId/results', requireAdmin, async (req, res) => {
  const testId = req.params.testId;
  
  try {
    console.log(`[TEST-DELIVERABILITY] Fetching results for test ${testId}`);
    
    const results = await getTestResults(testId);
    
    if (!results.ready) {
      return res.json({
        success: true,
        ready: false,
        message: 'Test results not ready yet. Please wait...'
      });
    }
    
    console.log(`[TEST-DELIVERABILITY] Results ready: Score ${results.score}/10`);
    
    res.json({
      success: true,
      ready: true,
      score: results.score,
      details: results.details,
      resultsUrl: results.resultsUrl
    });
    
  } catch (error) {
    console.error(`[TEST-DELIVERABILITY] Error getting results for test ${testId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get test results'
    });
  }
});

// GET /admin/audits - seznam audit jobs
router.get('/audits', requireAdmin, (req, res) => {
  getAuditJobs((err, auditJobs) => {
    if (err) {
      console.error('Error fetching audit jobs:', err);
      auditJobs = [];
    }

    // Get email sent status for all jobs
    getAllEmailLogsStatus((emailErr, emailStatusMap) => {
      if (emailErr) {
        console.error('Error fetching email status:', emailErr);
        emailStatusMap = {};
      }

      // Get page views status
      const { getAllPageViewsStatus } = require('../db');
      getAllPageViewsStatus((pageViewErr, pageViewStatusMap) => {
        if (pageViewErr) {
          console.error('Error fetching page views:', pageViewErr);
          pageViewStatusMap = {};
        }

        // Enrich each job with email info and page views
        const enrichedJobs = (auditJobs || []).map(job => {
          let hasEmail = false;
          try {
            const scrape = job.scrape_result_json;
            hasEmail = !!(scrape && scrape.contacts && scrape.contacts.emails && scrape.contacts.emails.length > 0);
          } catch (_) {}
          
          const emailStatus = emailStatusMap[job.id] || { sent: false, opens: 0, clicks: 0 };
          const pageViewStatus = pageViewStatusMap[job.id] || { views: 0, lastViewed: null, claritySessionId: null };
          
          return {
            ...job,
            hasEmail,
            emailSent: emailStatus.sent,
            emailOpens: emailStatus.opens,
            emailClicks: emailStatus.clicks,
            pageViews: pageViewStatus.views,
            lastPageView: pageViewStatus.lastViewed,
            claritySessionId: pageViewStatus.claritySessionId
          };
        });

        res.render('admin-audits-list', {
          auditJobs: enrichedJobs
        });
      });
    });
  });
});

// GET /admin/audits/new - create new audit and redirect to detail
router.get('/audits/new', requireAdmin, (req, res) => {
  const payload = {
    input_url: '',
    niche: '', // Empty - MUST be selected before running audit
    city: '', // Empty - will be auto-detected from scraped data
    company_name: null,
    brand_logo_url: null,
    preset_id: null,
    status: 'draft'
  };

  createAuditJob(payload, (err, result) => {
    if (err) {
      console.error('Error creating audit job:', err);
      return res.status(500).send('Error creating audit job');
    }
    return res.redirect(`/admin/audits/${result.id}`);
  });
});

// GET /admin/audits/:id/status - get job status (for polling)
router.get('/audits/:id/status', requireAdmin, (req, res) => {
  const id = req.params.id;

  getAuditJobById(id, (err, auditJob) => {
    if (err) {
      console.error('Error fetching audit job status:', err);
      return res.status(500).json({ error: 'Error loading status' });
    }

    if (!auditJob) {
      return res.status(404).json({ error: 'Audit job not found' });
    }

    res.json({
      status: auditJob.status,
      updated_at: auditJob.updated_at,
      error_message: auditJob.error_message || null
    });
  });
});

// GET /admin/audits/:id - detail audit job
router.get('/audits/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  
  // Memory logging: before loading large JSON
  const memBefore = getMemorySnapshot();

  getAuditJobById(id, (err, auditJob) => {
    if (err) {
      console.error('Error fetching audit job:', err);
      return res.status(500).send('Error loading audit job');
    }

    if (!auditJob) {
      return res.status(404).send('Audit job not found');
    }

    getAuditRunLogs(id, (logErr, runLogs) => {
      if (logErr) {
        console.error('Error fetching audit run logs:', logErr);
        runLogs = [];
      }

      getActivePromptTemplates((promptErr, promptTemplates) => {
        if (promptErr) {
          console.error('Error fetching prompt templates:', promptErr);
          promptTemplates = [];
        }

        const promptsByName = {};
        (promptTemplates || []).forEach((template) => {
          promptsByName[template.name] = template;
        });

        // Fetch crawled pages (Scraper v3)
        getCrawledPagesByJobId(id, (crawledErr, crawledPages) => {
          if (crawledErr) {
            console.error('Error fetching crawled pages:', crawledErr);
            crawledPages = [];
          }

          // Fetch lighthouse reports (Scraper v3)
          getLighthouseReportsByJobId(id, (lighthouseErr, lighthouseReports) => {
            if (lighthouseErr) {
              console.error('Error fetching lighthouse reports:', lighthouseErr);
              lighthouseReports = [];
            }

            // Fetch assistant runs (LLM Assistants v1)
            getAssistantRunsByJobId(id, (assistantRunsErr, assistantRuns) => {
              if (assistantRunsErr) {
                console.error('Error fetching assistant runs:', assistantRunsErr);
                assistantRuns = [];
              }

              // Memory logging: after loading all data
              const memAfter = getMemorySnapshot();
              logMemoryDelta(`GET /admin/audits/${id}`, memBefore, memAfter);

              const baseOrigin = `${req.protocol}://${req.get('host')}`;
              const auditUrl = auditJob.public_page_slug ? `${baseOrigin}/${auditJob.public_page_slug}?v=2` : null;
              const companyLabel =
                (auditJob.company_name && String(auditJob.company_name).trim()) ||
                (auditJob.llm_context_json && auditJob.llm_context_json.company_profile && auditJob.llm_context_json.company_profile.name) ||
                '';
              if (auditJob && auditJob.email_html) {
                auditJob.email_html = ensureAuditLinkBlockInEmailHtml(auditJob.email_html, { auditUrl, companyLabel });
              }

              res.render('admin-audit-detail', {
                auditJob,
                runLogs: runLogs || [],
                promptTemplates: promptsByName,
                publicUrl: auditJob.public_page_slug ? `/${auditJob.public_page_slug}` : null,
                baseOrigin,
                crawledPages: crawledPages || [],
                lighthouseReports: lighthouseReports || [],
                assistantRuns: assistantRuns || []
              });
            });
          });
        });
      });
    });
  });
});

// POST /audits - create new audit job (this route shouldn't be used anymore with the new flow)
router.post('/audits', requireAdmin, (req, res) => {
  const payload = {
    input_url: req.body.input_url || null,
    niche: req.body.niche || null,
    city: req.body.city || null,
    company_name: req.body.company_name || null,
    brand_logo_url: req.body.brand_logo_url || null,
    preset_id: req.body.preset_id ? parseInt(req.body.preset_id) : null,
    status: 'draft'
  };

  createAuditJob(payload, (err, result) => {
    if (err) {
      console.error('Error creating audit job:', err);
      return res.status(500).send('Error creating audit job');
    }
    return res.redirect(`/admin/audits/${result.id}`);
  });
});

// POST /admin/audits/:id/process - full pipeline (rate-limited, responds immediately)
router.post('/audits/:id/process', requireAdmin, auditJobLimiter, async (req, res) => {
  const id = req.params.id;
  const accept = (req.headers.accept || '').toLowerCase();
  const wantsJson =
    accept.includes('application/json') ||
    req.xhr ||
    (req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
  
  // Memory logging: before audit starts
  const memBefore = getMemorySnapshot();
  console.log('[AUDIT PROCESS] Starting for job', id);
  console.log('[AUDIT PROCESS] Body:', {
    input_url: req.body.input_url,
    preset_id: req.body.preset_id,
    brand_logo_url: req.body.brand_logo_url ? 'provided' : 'empty',
    force: req.body.force || false
  });

  const inputUpdate = {
    input_url: req.body.input_url,
    brand_logo_url: req.body.brand_logo_url || null,
    preset_id: req.body.preset_id ? parseInt(req.body.preset_id) : null
  };
  
  // Note: niche and city are NOT updated here
  // They will be automatically set from preset in auditPipeline.processAuditJob()

  // Remove empty/undefined fields
  Object.keys(inputUpdate).forEach(key => {
    if (inputUpdate[key] === undefined || inputUpdate[key] === '') {
      delete inputUpdate[key];
    }
  });

  // Normalize/validate the website URL early (prevents scraper "Invalid URL" failures).
  if (inputUpdate.input_url) {
    try {
      inputUpdate.input_url = normalizeWebsiteUrl(inputUpdate.input_url);
    } catch (e) {
      const message = (e && e.message) ? String(e.message) : 'Invalid website URL';
      if (wantsJson) {
        return res.status(400).json({ error: 'invalid_url', message });
      }
      return res.status(400).send(message);
    }
  }

  console.log('[AUDIT PROCESS] Input update:', inputUpdate);

  updateAuditJob(id, inputUpdate, (err) => {
    if (err) {
      console.error('[AUDIT PROCESS] Error updating audit input:', err);
      if (wantsJson) {
        return res.status(500).json({ error: 'update_failed', message: err.message });
      }
      return res.status(500).send('Error updating audit job: ' + err.message);
    }
    
    console.log('[AUDIT PROCESS] Input updated successfully');
    
    // Check for duplicate URLs (unless force flag is set)
    const forceProcess = req.body.force === 'true' || req.body.force === true;
    
    if (!forceProcess && inputUpdate.input_url) {
      console.log('[AUDIT PROCESS] Checking for duplicate URLs...');
      
      getAuditJobByUrl(inputUpdate.input_url, (dupErr, duplicates) => {
        if (dupErr) {
          console.error('[AUDIT PROCESS] Error checking duplicates:', dupErr);
          // Continue anyway if duplicate check fails
        } else {
          // Filter out the current job
          const otherJobs = (duplicates || []).filter(job => job.id !== parseInt(id));
          
          if (otherJobs.length > 0) {
            console.log('[AUDIT PROCESS] Found', otherJobs.length, 'duplicate(s) for URL:', inputUpdate.input_url);
            
            // Return duplicate detection response
            if (wantsJson) {
              return res.status(200).json({
                duplicate_detected: true,
                duplicate_jobs: otherJobs.map(job => ({
                  id: job.id,
                  niche: job.niche,
                  city: job.city,
                  company_name: job.company_name,
                  status: job.status,
                  created_at: job.created_at
                })),
                current_job_id: parseInt(id)
              });
            }
            // For non-JSON requests, just continue (fallback)
          }
        }
        
        // No duplicates or check failed - proceed with processing
        proceedWithProcessing();
      });
    } else {
      // Force flag is set or no URL to check - proceed immediately
      if (forceProcess) {
        console.log('[AUDIT PROCESS] Force flag set - skipping duplicate check');
      }
      proceedWithProcessing();
    }
    
    function proceedWithProcessing() {
      console.log('[AUDIT PROCESS] Marking job as scraping...');
      
      // IMPORTANT: set status immediately so the reloaded admin page shows the loader
      // and starts polling even if the pipeline starts a moment later.
      updateAuditJob(id, { status: 'scraping', error_message: null }, (statusErr) => {
        if (statusErr) {
          console.error('[AUDIT PROCESS] Failed to set status=scraping for job', id, statusErr);
          if (wantsJson) {
            return res.status(500).json({
              error: 'status_update_failed',
              message: statusErr.message || String(statusErr)
            });
          }
        }

        console.log('[AUDIT PROCESS] Queueing pipeline for job', id);

        const pipelineConfig = {
          settings: {
            ux_name: req.body.ux_name,
            ux_model: req.body.ux_model,
            ux_temperature: Number(req.body.ux_temperature),
            web_name: req.body.web_name,
            web_model: req.body.web_model,
            web_temperature: Number(req.body.web_temperature),
            email_name: req.body.email_name,
            email_model: req.body.email_model,
            email_temperature: Number(req.body.email_temperature)
          },
          promptOverrides: {
            ux: req.body.prompt_ux,
            web: req.body.prompt_web,
            email: req.body.prompt_email
          }
        };

        // Run pipeline in a concurrency-limited queue (Playwright + LLM is heavy)
        auditQueue
          .enqueue(() => auditPipeline.processAuditJob(id, pipelineConfig), Number(id))
          .then(() => {
            console.log('[AUDIT PROCESS] Pipeline completed successfully for job', id);
          })
          .catch((pipelineErr) => {
            console.error('[AUDIT PROCESS] Pipeline error for job', id, ':', pipelineErr);
            // Best-effort: ensure UI sees failure
            updateAuditJob(
              id,
              { status: 'failed', error_message: String(pipelineErr && pipelineErr.message ? pipelineErr.message : pipelineErr) },
              () => {}
            );
          });

        // Respond immediately (job runs in background)
        // Memory logging: after queueing (before heavy work starts)
        const memAfter = getMemorySnapshot();
        logMemoryDelta(`POST /admin/audits/${id}/process (queued)`, memBefore, memAfter);
        
        if (wantsJson) {
          return res.status(202).json({ ok: true, jobId: Number(id), queued: true });
        }
        // Redirect for classic form submits
        res.redirect(`/admin/audits/${id}`);
      });
    }
  });
});

// POST /admin/audits/:id/run-llm - LLM only
router.post('/audits/:id/run-llm', requireAdmin, async (req, res) => {
  const id = req.params.id;
  auditPipeline.runLlmOnly(id, {
    settings: {
      ux_name: req.body.ux_name,
      ux_model: req.body.ux_model,
      ux_temperature: Number(req.body.ux_temperature),
      web_name: req.body.web_name,
      web_model: req.body.web_model,
      web_temperature: Number(req.body.web_temperature),
      email_name: req.body.email_name,
      email_model: req.body.email_model,
      email_temperature: Number(req.body.email_temperature)
    },
    promptOverrides: {
      ux: req.body.prompt_ux,
      web: req.body.prompt_web,
      email: req.body.prompt_email
    }
  }).then(() => {
    res.redirect(`/admin/audits/${id}`);
  }).catch((pipelineErr) => {
    console.error('Audit LLM error:', pipelineErr);
    res.redirect(`/admin/audits/${id}`);
  });
});

// POST /admin/audits/:id/regenerate-email
router.post('/audits/:id/regenerate-email', requireAdmin, async (req, res) => {
  const id = req.params.id;
  auditPipeline.regenerateEmail(id, {
    settings: {
      email_name: req.body.email_name,
      email_model: req.body.email_model,
      email_temperature: Number(req.body.email_temperature)
    },
    promptOverrides: {
      email: req.body.prompt_email
    }
  }).then(() => {
    res.redirect(`/admin/audits/${id}`);
  }).catch((pipelineErr) => {
    console.error('Regenerate email error:', pipelineErr);
    res.redirect(`/admin/audits/${id}`);
  });
});

// POST /admin/audits/:id/send-email - Send email to customer
router.post('/audits/:id/send-email', requireAdmin, auditJobLimiter, async (req, res) => {
  const id = req.params.id;
  const { recipient, subject, format, html_body, plain_body } = req.body;

  try {
    // Validation
    if (!recipient || !subject) {
      return res.status(400).json({ 
        success: false, 
        error: 'Recipient and subject are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email address format' 
      });
    }

    // Validate format
    if (!['html', 'plain'].includes(format)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Format must be "html" or "plain"' 
      });
    }

    // Get email body based on format
    let htmlBody = html_body;
    let textBody = plain_body;
    
    // Validate that we have content
    if (format === 'html' && (!htmlBody || htmlBody.trim() === '')) {
      return res.status(400).json({ 
        success: false, 
        error: 'HTML email body is empty' 
      });
    }
    if (format === 'plain' && (!textBody || textBody.trim() === '')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Plain text email body is empty' 
      });
    }

    // CRITICAL: Add unsubscribe footer to HTML (REQUIRED for deliverability!)
    // This ensures ALL emails have unsubscribe link, even custom ones from admin UI
    if (htmlBody) {
      htmlBody = addUnsubscribeFooterToHtml(htmlBody, recipient);
    }
    
    // Generate plain text version from HTML if not provided (improves deliverability)
    // This function also adds unsubscribe link to plain text
    if (!textBody && htmlBody) {
      textBody = generatePlainTextFromHtml(htmlBody, recipient);
    } else if (textBody && !textBody.includes('unsubscribe')) {
      // If plain text is provided but doesn't have unsubscribe, add it
      const baseUrl = process.env.BASE_URL || 'https://maxandjacob.com';
      const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(recipient)}`;
      textBody += `\n\n---\nYou received this email because we analyzed your website. If you'd like to stop receiving emails from us, unsubscribe here: ${unsubscribeUrl}\n\nMax & Jacob · maxandjacob.com`;
    }

    // Send email via Resend (with BOTH html and text for best deliverability)
    const sendResult = await sendEmail({
      to: recipient,
      subject: subject,
      html: htmlBody,
      text: textBody
    });

    // Log to database
    createEmailLog({
      audit_job_id: parseInt(id),
      recipient_email: recipient,
      subject: subject,
      format: format,
      status: sendResult.success ? 'sent' : 'failed',
      resend_id: sendResult.id || null,
      error_message: sendResult.error || null
    }, (logErr, logResult) => {
      if (logErr) {
        console.error('Error logging email send:', logErr);
      }
    });

    // Return response
    if (sendResult.success) {
      res.json({ 
        success: true, 
        message: `Email sent successfully to ${recipient}`,
        resend_id: sendResult.id
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: sendResult.error || 'Failed to send email'
      });
    }

  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    });
  }
});

// POST /admin/audits/:id/regenerate-email - Regenerate email with updated unsubscribe links
router.post('/audits/:id/regenerate-email', requireAdmin, auditJobLimiter, async (req, res) => {
  const id = req.params.id;
  
  try {
    console.log(`[REGENERATE EMAIL] Starting for audit ID ${id}`);
    
    // Call the existing regenerateEmail function from auditPipeline
    await auditPipeline.regenerateEmail(id);
    
    console.log(`[REGENERATE EMAIL] Successfully regenerated for audit ID ${id}`);
    
    res.json({ 
      success: true, 
      message: 'Email regenerated successfully with updated unsubscribe links'
    });
    
  } catch (error) {
    console.error(`[REGENERATE EMAIL] Error for audit ID ${id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to regenerate email'
    });
  }
});

// POST /admin/audits/:id/regenerate-public
router.post('/audits/:id/regenerate-public', requireAdmin, async (req, res) => {
  const id = req.params.id;
  auditPipeline.regeneratePublicPage(id).then(() => {
    res.redirect(`/admin/audits/${id}`);
  }).catch((pipelineErr) => {
    console.error('Regenerate public page error:', pipelineErr);
    res.redirect(`/admin/audits/${id}`);
  });
});

// POST /admin/audits/:id/regenerate-evidence-pack-v2
router.post('/audits/:id/regenerate-evidence-pack-v2', requireAdmin, async (req, res) => {
  const id = req.params.id;
  auditPipeline.regenerateEvidencePackV2(id).then((result) => {
    console.log(`Evidence Pack v2 regenerated with ${result.warnings_count} warnings`);
    res.redirect(`/admin/audits/${id}`);
  }).catch((pipelineErr) => {
    console.error('Regenerate Evidence Pack v2 error:', pipelineErr);
    res.redirect(`/admin/audits/${id}`);
  });
});

// DELETE /admin/api/audits/:id - Delete audit job and all related data
router.delete('/api/audits/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  
  deleteAuditJob(id, (err, result) => {
    if (err) {
      console.error('Error deleting audit job:', err);
      return res.status(500).json({ 
        error: 'delete_failed',
        message: 'Failed to delete audit job: ' + err.message 
      });
    }
    
    if (result.changes === 0) {
      return res.status(404).json({ 
        error: 'not_found',
        message: 'Audit job not found' 
      });
    }
    
    console.log('[ADMIN] Successfully deleted audit job', id);
    res.json({ success: true, deleted_id: Number(id) });
  });
});

// DELETE /admin/api/contact-submissions/:id - Delete contact submission
router.delete('/api/contact-submissions/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  
  deleteSubmission(id, (err, result) => {
    if (err) {
      console.error('Error deleting contact submission:', err);
      return res.status(500).json({ 
        error: 'delete_failed',
        message: 'Failed to delete contact submission: ' + err.message 
      });
    }
    
    if (result.changes === 0) {
      return res.status(404).json({ 
        error: 'not_found',
        message: 'Contact submission not found' 
      });
    }
    
    console.log('[ADMIN] Successfully deleted contact submission', id);
    res.json({ success: true, deleted_id: Number(id) });
  });
});

// DELETE /admin/api/web-project-submissions/:id - Delete web project submission
router.delete('/api/web-project-submissions/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  
  deleteWebProjectSubmission(id, (err, result) => {
    if (err) {
      console.error('Error deleting web project submission:', err);
      return res.status(500).json({ 
        error: 'delete_failed',
        message: 'Failed to delete web project submission: ' + err.message 
      });
    }
    
    if (result.changes === 0) {
      return res.status(404).json({ 
        error: 'not_found',
        message: 'Web project submission not found' 
      });
    }
    
    console.log('[ADMIN] Successfully deleted web project submission', id);
    res.json({ success: true, deleted_id: Number(id) });
  });
});

// ==================== LLM ASSISTANTS V1 ROUTES ====================

// POST /admin/audits/:id/run-assistant - Run single assistant
router.post('/audits/:id/run-assistant', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { assistant_key } = req.body;
  
  try {
    // Load job to check dependencies
    const { checkAssistantDependencies } = require('../services/payloadBuilders');
    
    getAuditJobById(id, async (err, job) => {
      if (err || !job) {
        return res.status(404).json({ error: 'Audit job not found' });
      }
      
      // Check dependencies
      const canRun = checkAssistantDependencies(assistant_key, {
        job,
        evidence_pack_v2: job.evidence_pack_v2_json,
        raw_dump: job.raw_dump_json,
        screenshots: job.screenshots_json,
        llm_context: job.llm_context_json,
        ux_audit_json: job.assistant_outputs_json?.ux_audit_json,
        local_seo_audit_json: job.assistant_outputs_json?.local_seo_audit_json,
        offer_copy_json: job.assistant_outputs_json?.offer_copy_json
      });
      
      if (!canRun.can_run) {
        return res.status(400).json({ 
          error: `Cannot run ${assistant_key}. Missing dependencies: ${canRun.missing.join(', ')}` 
        });
      }
      
      // Mark job as evaluating and run assistant in background (do not block request)
      updateAuditJob(id, { status: 'evaluating' }, () => {});

      const payload_data = {
        job,
        evidence_pack_v2: job.evidence_pack_v2_json,
        raw_dump: job.raw_dump_json,
        screenshots: job.screenshots_json,
        llm_context: job.llm_context_json,
        ux_audit_json: job.assistant_outputs_json?.ux_audit_json,
        local_seo_audit_json: job.assistant_outputs_json?.local_seo_audit_json,
        offer_copy_json: job.assistant_outputs_json?.offer_copy_json
      };
      
      setImmediate(async () => {
        try {
          await auditPipeline.runSingleAssistant(Number(id), assistant_key, payload_data);
          updateAuditJob(id, { status: 'ready' }, () => {});
        } catch (bgErr) {
          console.error('Background single assistant error:', bgErr);
          updateAuditJob(id, { status: 'failed', error_message: bgErr.message }, () => {});
        }
      });

      // If called via fetch/AJAX, respond JSON; otherwise redirect
      if ((req.headers.accept || '').includes('application/json')) {
        return res.status(202).json({ ok: true, started: true });
      }
      return res.redirect(`/admin/audits/${id}`);
    });
  } catch (error) {
    console.error('Run single assistant error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/audits/:id/run-full-pipeline - Run all 6 assistants (queued)
router.post('/audits/:id/run-full-pipeline', requireAdmin, auditJobLimiter, async (req, res) => {
  const { id } = req.params;
  
  // Memory logging: before pipeline starts
  const memBefore = getMemorySnapshot();
  
  try {
    // Mark job as evaluating and run pipeline in background (do not block request)
    updateAuditJob(id, { status: 'evaluating' }, () => {});

    setImmediate(async () => {
      try {
        await auditPipeline.runAssistantsPipeline(Number(id), {
          settings: req.body.settings || {}
        });
        updateAuditJob(id, { status: 'ready' }, () => {});
      } catch (bgErr) {
        console.error('Background pipeline error:', bgErr);
        updateAuditJob(id, { status: 'failed', error_message: bgErr.message }, () => {});
      }
    });

    // Memory logging: after queueing
    const memAfter = getMemorySnapshot();
    logMemoryDelta(`POST /admin/audits/${id}/run-full-pipeline (queued)`, memBefore, memAfter);

    if ((req.headers.accept || '').includes('application/json')) {
      return res.status(202).json({ ok: true, started: true });
    }
    return res.redirect(`/admin/audits/${id}`);
  } catch (error) {
    console.error('Run full pipeline error:', error);
    res.redirect(`/admin/audits/${id}`);
  }
});

// GET /admin/audits/:id/assistant-runs - List assistant runs for polling UI
router.get('/audits/:id/assistant-runs', requireAdmin, (req, res) => {
  const { id } = req.params;
  getAssistantRunsByJobId(id, (err, runs) => {
    if (err) {
      console.error('Error fetching assistant runs:', err);
      return res.status(500).json({ error: 'Failed to fetch assistant runs' });
    }
    return res.json({ runs: runs || [] });
  });
});

// GET /admin/audits/:id/assistant-run/:runId/payload - View request/response payloads
router.get('/audits/:id/assistant-run/:runId/payload', requireAdmin, (req, res) => {
  const { runId } = req.params;
  
  getAssistantRunById(runId, (err, run) => {
    if (err || !run) {
      return res.status(404).json({ error: 'Assistant run not found' });
    }
    
    res.json({
      run_id: run.id,
      assistant_key: run.assistant_key,
      model: run.model,
      temperature: run.temperature,
      status: run.status,
      error: run.error,
      started_at: run.started_at,
      finished_at: run.finished_at,
      request_payload: run.request_payload_json,
      response_text: run.response_text || null,
      response: run.response_json,
      token_usage: run.token_usage_json
    });
  });
});

// ==================== HOMEPAGE PROPOSAL ROUTES ====================

// GET /admin/audits/:id/homepage-preview - View homepage proposal preview
router.get('/audits/:id/homepage-preview', requireAdmin, (req, res) => {
  const { id } = req.params;
  
  getAuditJobById(id, (err, job) => {
    if (err) {
      console.error('Error loading job:', err);
      return res.status(500).send('Failed to load audit job');
    }
    
    if (!job) {
      return res.status(404).send('Audit job not found');
    }
    
    if (!job.homepage_proposal_html) {
      return res.status(404).send('Homepage proposal not generated yet. Run the audit pipeline first.');
    }
    
    // Parse proposal data
    const proposalData = job.homepage_proposal_data_json;
    
    res.render('admin-homepage-preview', {
      job,
      proposalData
    });
  });
});

// GET /admin/audits/:id/homepage-proposal.html - Serve rendered HTML for iframe
router.get('/audits/:id/homepage-proposal.html', requireAdmin, (req, res) => {
  const { id } = req.params;
  
  getAuditJobById(id, (err, job) => {
    if (err) {
      console.error('Error loading job:', err);
      return res.status(500).send('Failed to load audit job');
    }
    
    if (!job) {
      return res.status(404).send('Audit job not found');
    }
    
    if (!job.homepage_proposal_html && !job.homepage_proposal_data_json) {
      return res.status(404).send('Homepage proposal not generated yet.');
    }
    
    // Inject click-blocking script into the HTML (deterministic; prevents "sometimes clickable" after refresh)
    const injectClickBlock = (inputHtml) => {
      let html = String(inputHtml || '');
      const MARK = '__MJ_PREVIEW_CLICKBLOCK__';
      if (html.includes(MARK)) return html;

      const script = `
    <script>
      /* ${MARK} */
      (function () {
        function block(e) {
          try { e.preventDefault(); } catch (_) {}
          try { e.stopPropagation(); } catch (_) {}
          try { e.stopImmediatePropagation(); } catch (_) {}
          return false;
        }
        document.addEventListener('click', block, true);
        document.addEventListener('submit', block, true);
        document.addEventListener('mousedown', block, true);
        document.addEventListener('mouseup', block, true);
        document.addEventListener('pointerdown', block, true);
        document.addEventListener('pointerup', block, true);
        document.addEventListener('keydown', function (e) {
          const k = e.key;
          if (k === 'Enter' || k === ' ') return block(e);
        }, true);
        window.__mjPreviewClicksBlocked = true;
      })();
    </script>
`;

      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (m) => `${m}${script}`);
        return html;
      }
      if (/<html[^>]*>/i.test(html)) {
        html = html.replace(/<html[^>]*>/i, (m) => `${m}<head>${script}</head>`);
        return html;
      }
      return `${script}${html}`;
    };

    // Prefer rendering from saved proposal data so template improvements apply retroactively.
    const homepageBuilder = require('../services/homepageBuilder');
    const templateSlug =
      (job.homepage_proposal_data_json && job.homepage_proposal_data_json.job && job.homepage_proposal_data_json.job.niche) ||
      job.niche ||
      'plumbing';

    const renderPromise = job.homepage_proposal_data_json
      ? homepageBuilder.renderTemplate(templateSlug, job.homepage_proposal_data_json)
          .catch(() => job.homepage_proposal_html || '')
      : Promise.resolve(job.homepage_proposal_html || '');

    renderPromise
      .then((htmlRaw) => {
        const html = injectClickBlock(htmlRaw);
        // Serve the HTML with injected script
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      })
      .catch((renderErr) => {
        console.error('Error rendering homepage proposal:', renderErr);
        res.status(500).send('Failed to load homepage proposal');
      });
  });
});

// POST /admin/audits/:id/regenerate-homepage - Regenerate homepage proposal
router.post('/audits/:id/regenerate-homepage', requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const job = await new Promise((resolve, reject) => {
      getAuditJobById(id, (err, job) => {
        if (err) return reject(err);
        resolve(job);
      });
    });
    
    if (!job) {
      return res.status(404).send('Audit job not found');
    }
    
    if (!job.preset_id) {
      return res.status(400).send('No preset configured for this job');
    }
    
    // Import homepage builder
    const homepageBuilder = require('../services/homepageBuilder');
    const { getCrawledPagesByJobId } = require('../db');
    
    // Load crawled pages
    const crawledPages = await new Promise((resolve, reject) => {
      getCrawledPagesByJobId(id, (err, pages) => {
        if (err) return reject(err);
        resolve(pages);
      });
    });
    
    if (!crawledPages || crawledPages.length === 0) {
      return res.status(400).send('No crawled pages found. Run scraper first.');
    }
    
    // Load preset
    const { getNichePresetById } = require('../db');
    const preset = await new Promise((resolve, reject) => {
      getNichePresetById(job.preset_id, (err, preset) => {
        if (err) return reject(err);
        resolve(preset);
      });
    });
    
    if (!preset) {
      return res.status(404).send('Preset not found');
    }
    
    const templateSlug = preset.homepage_template_path || preset.slug;
    
    // Build template data
    const templateData = await homepageBuilder.buildTemplateData(job, crawledPages);
    
    // Render template
    const proposalHtml = await homepageBuilder.renderTemplate(templateSlug, templateData);
    
    // Save to database
    await new Promise((resolve, reject) => {
      updateAuditJob(id, {
        homepage_proposal_html: proposalHtml,
        homepage_proposal_data_json: templateData
      }, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    
    // Redirect back to preview
    res.redirect(`/admin/audits/${id}/homepage-preview`);
    
  } catch (error) {
    console.error('Error regenerating homepage:', error);
    res.status(500).send(`Failed to regenerate homepage: ${error.message}`);
  }
});

// POST /admin/audits/:id/update-prompts
router.post('/audits/:id/update-prompts', requireAdmin, (req, res) => {
  const updates = [];
  if (req.body.prompt_ux) {
    updates.push({ name: 'ux_specialist', content: req.body.prompt_ux });
  }
  if (req.body.prompt_web) {
    updates.push({ name: 'web_designer', content: req.body.prompt_web });
  }
  if (req.body.prompt_email) {
    updates.push({ name: 'email_copy', content: req.body.prompt_email });
  }

  if (updates.length === 0) {
    return res.redirect(`/admin/audits/${req.params.id}`);
  }

  let remaining = updates.length;
  let hadError = false;

  updates.forEach((item) => {
    createPromptTemplateVersion(item.name, item.content, (err) => {
      if (err) {
        console.error('Error updating prompt template:', err);
        hadError = true;
      }
      remaining -= 1;
      if (remaining === 0) {
        if (hadError) {
          return res.status(500).send('Error updating prompts');
        }
        return res.redirect(`/admin/audits/${req.params.id}`);
      }
    });
  });
});

// GET /admin/contact/:id - detail contact submission
router.get('/contact/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  getSubmissionById(id, (err, submission) => {
    if (err) {
      console.error('Error fetching submission:', err);
      return res.status(500).send('Error loading submission');
    }

    if (!submission) {
      return res.status(404).send('Submission not found');
    }

    res.render('admin-detail', { 
      submission,
      submissionType: 'contact'
    });
  });
});

// GET /admin/web-project/:id - detail web-project submission
router.get('/web-project/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  getWebProjectSubmissionById(id, (err, submission) => {
    if (err) {
      console.error('Error fetching web-project submission:', err);
      return res.status(500).send('Error loading submission');
    }

    if (!submission) {
      return res.status(404).send('Submission not found');
    }

    res.render('admin-web-project-detail', { 
      submission 
    });
  });
});

// GET /admin/team-photos - Team photos management page
router.get('/team-photos', requireAdmin, (req, res) => {
  getAllSiteSettings((err, settings) => {
    if (err) {
      console.error('Error fetching site settings:', err);
      return res.status(500).send('Error loading settings');
    }

    // Convert array to object for easier access in template
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });

    res.render('admin-team-photos', {
      settings: settingsObj
    });
  });
});

function cleanupOtherTeamPhotoExtensions(member, keepFilename) {
  const uploadDir = path.join(getPersistentPublicDir(), 'team');
  const exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  exts.forEach((ext) => {
    const filename = `${member}${ext}`;
    if (keepFilename && filename === keepFilename) return;
    const p = path.join(uploadDir, filename);
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) {
      // Best-effort cleanup; don't fail upload on delete issues.
      console.warn('[TEAM PHOTOS] cleanup failed:', p, e.message);
    }
  });
}

// POST /admin/team-photos/upload/:member - Upload team photo
router.post('/team-photos/upload/:member', requireAdmin, uploadSingleJson('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const member = req.params.member;
  if (!member || !['jacob', 'max'].includes(member)) {
    return res.status(400).json({ error: 'Invalid team member' });
  }

  const photoPath = `/public/team/${req.file.filename}`;
  const settingKey = `team_${member}_photo`;

  // If they switch file type (jpg -> png), ensure old one doesn't hang around.
  cleanupOtherTeamPhotoExtensions(member, req.file.filename);

  setSiteSetting(settingKey, photoPath, (err) => {
    if (err) {
      console.error('Error saving setting:', err);
      return res.status(500).json({ error: 'Error saving photo path' });
    }

    res.json({
      success: true,
      message: `${member}'s photo uploaded successfully`,
      path: photoPath
    });
  });
});

// Backward-compatible endpoint (older admin UI). NOTE: can still be affected by field order.
router.post('/team-photos/upload', requireAdmin, uploadSingleJson('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const member = req.body.member;
  if (!member || !['jacob', 'max'].includes(member)) return res.status(400).json({ error: 'Invalid team member' });
  const photoPath = `/public/team/${req.file.filename}`;
  const settingKey = `team_${member}_photo`;
  cleanupOtherTeamPhotoExtensions(member, req.file.filename);
  setSiteSetting(settingKey, photoPath, (err) => {
    if (err) return res.status(500).json({ error: 'Error saving photo path' });
    res.json({ success: true, message: `${member}'s photo uploaded successfully`, path: photoPath });
  });
});

// ==================== AI ASSISTANTS API ====================

// GET /admin/assistants - Assistant Configuration Management Page
router.get('/assistants', requireAdmin, (req, res) => {
  getAllAssistants((err, assistants) => {
    if (err) {
      console.error('Error getting assistants:', err);
      return res.status(500).send('Failed to load assistants');
    }
    res.render('admin-assistants', { assistants });
  });
});

// GET /admin/api/assistants - Get all assistants
router.get('/api/assistants', requireAdmin, (req, res) => {
  getAllAssistants((err, assistants) => {
    if (err) {
      console.error('Error getting assistants:', err);
      return res.status(500).json({ error: 'Failed to get assistants' });
    }
    res.json({ assistants });
  });
});

// GET /admin/api/assistants/:id - Get one assistant
router.get('/api/assistants/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  getAssistantById(id, (err, assistant) => {
    if (err) {
      console.error('Error getting assistant:', err);
      return res.status(500).json({ error: 'Failed to get assistant' });
    }
    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }
    res.json({ assistant });
  });
});

// POST /admin/api/assistants - Vytvořit nového asistenta
router.post('/api/assistants', requireAdmin, (req, res) => {
  const { name, key, model, temperature, prompt, sort_order } = req.body;
  
  if (!name || !key || !model || temperature === undefined || !prompt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const data = {
    name,
    key,
    model,
    temperature: parseFloat(temperature),
    prompt,
    sort_order: sort_order || 999
  };
  
  createAssistant(data, (err, result) => {
    if (err) {
      console.error('Error creating assistant:', err);
      if (err.message && err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Assistant with this key already exists' });
      }
      return res.status(500).json({ error: 'Failed to create assistant' });
    }
    res.json({ success: true, id: result.id });
  });
});

// PUT /admin/api/assistants/:id - Aktualizovat asistenta
router.put('/api/assistants/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const body = req.body || {};

  // Backward compatible: allow partial updates from the admin UI (model/temp/prompt only).
  // We merge with existing assistant fields so DB update stays consistent.
  getAssistantById(id, (loadErr, existing) => {
    if (loadErr) {
      console.error('Error loading assistant for update:', loadErr);
      return res.status(500).json({ error: 'Failed to load assistant' });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    const merged = {
      name: body.name || existing.name,
      key: body.key || existing.key,
      model: body.model || existing.model,
      temperature:
        body.temperature !== undefined
          ? parseFloat(body.temperature)
          : existing.temperature,
      prompt: body.prompt !== undefined ? body.prompt : existing.prompt,
      sort_order:
        body.sort_order !== undefined
          ? body.sort_order
          : existing.sort_order
    };

    if (!merged.name || !merged.key || !merged.model || !Number.isFinite(merged.temperature) || merged.prompt === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    updateAssistant(id, merged, (err, result) => {
      if (err) {
        console.error('Error updating assistant:', err);
        if (err.message && err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Assistant with this key already exists' });
        }
        return res.status(500).json({ error: 'Failed to update assistant' });
      }
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Assistant not found' });
      }
      res.json({ success: true });
    });
  });
});

// DELETE /admin/api/assistants/:id - Smazat asistenta
router.delete('/api/assistants/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  
  deleteAssistant(id, (err, result) => {
    if (err) {
      console.error('Error deleting assistant:', err);
      return res.status(500).json({ error: 'Failed to delete assistant' });
    }
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Assistant not found' });
    }
    res.json({ success: true });
  });
});

// POST /admin/api/backup - Create database backup
router.post('/api/backup', requireAdmin, (req, res) => {
  const { exec } = require('child_process');
  const backupScript = path.join(__dirname, '../../scripts/backup-db.sh');
  
  console.log('[ADMIN] Manual backup triggered');
  
  exec(`bash ${backupScript}`, (error, stdout, stderr) => {
    if (error) {
      console.error('[ADMIN] Backup failed:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message,
        output: stderr || stdout
      });
    }
    
    console.log('[ADMIN] Backup completed successfully');
    console.log(stdout);
    
    res.json({ 
      success: true, 
      message: 'Backup completed successfully',
      output: stdout
    });
  });
});

// ==================== PREAUDIT ROUTES ====================

// GET /admin/preaudits - Preaudit management page
router.get('/preaudits', requireAdmin, (req, res) => {
  getAllPreauditSearches((err, searches) => {
    if (err) {
      console.error('Error fetching preaudit searches:', err);
      searches = [];
    }

    getAllNichePresets((presetErr, presets) => {
      if (presetErr) {
        console.error('Error fetching niche presets:', presetErr);
        presets = [];
      }

      res.render('admin-preaudits', {
        searches: searches || [],
        presets: presets || []
      });
    });
  });
});

// POST /admin/api/preaudits/search - Start new preaudit search
router.post('/api/preaudits/search', requireAdmin, auditJobLimiter, async (req, res) => {
  const { niche, city, count } = req.body;

  // Validation
  if (!niche || !count) {
    return res.status(400).json({
      success: false,
      error: 'niche and count are required'
    });
  }

  const requestedCount = parseInt(count);
  if (isNaN(requestedCount) || requestedCount < 1 || requestedCount > 50) {
    return res.status(400).json({
      success: false,
      error: 'count must be between 1 and 50'
    });
  }

  console.log('[PREAUDIT] Creating new search:', { niche, city, count: requestedCount });

  try {
    // Create search record
    const result = await new Promise((resolve, reject) => {
      createPreauditSearch({
        niche,
        city: city || null,
        requested_count: requestedCount,
        status: 'pending'
      }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    const searchId = result.id;
    console.log('[PREAUDIT] Search created, ID:', searchId);

    // Run pipeline in background
    setImmediate(async () => {
      try {
        await preauditPipeline.runPreauditSearch(searchId);
        console.log('[PREAUDIT] Pipeline completed for search', searchId);
      } catch (pipelineErr) {
        console.error('[PREAUDIT] Pipeline error for search', searchId, ':', pipelineErr);
      }
    });

    // Return immediately
    res.status(202).json({
      success: true,
      searchId: searchId,
      status: 'pending',
      message: 'Search started in background'
    });

  } catch (error) {
    console.error('[PREAUDIT] Error creating search:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /admin/api/preaudits/:searchId/status - Get search status (for polling)
router.get('/api/preaudits/:searchId/status', requireAdmin, (req, res) => {
  const { searchId } = req.params;

  getPreauditSearchById(searchId, (err, search) => {
    if (err) {
      console.error('Error fetching preaudit search status:', err);
      return res.status(500).json({ error: 'Failed to fetch status' });
    }

    if (!search) {
      return res.status(404).json({ error: 'Search not found' });
    }

    getPreauditCountsBySearchId(searchId, (cntErr, counts) => {
      if (cntErr) {
        console.error('Error fetching preaudit counts:', cntErr);
      }

      const safeCounts = counts || {
        total_count: 0,
        green_count: search.green_count,
        red_count: search.red_count,
        skipped_count: 0,
        error_count: 0
      };

      res.json({
        status: search.status,
        // Target requested by user (for progress/UI)
        found_count: search.requested_count,
        green_count: safeCounts.green_count,
        red_count: safeCounts.red_count,
        skipped_count: safeCounts.skipped_count,
        error_count: safeCounts.error_count,
        total_count: safeCounts.total_count,
        error_message: search.error_message
      });
    });
  });
});

// GET /admin/api/preaudits/:searchId/results - Get search results
router.get('/api/preaudits/:searchId/results', requireAdmin, (req, res) => {
  const { searchId } = req.params;

  getPreauditResultsBySearchId(searchId, (err, results) => {
    if (err) {
      console.error('Error fetching preaudit results:', err);
      return res.status(500).json({ error: 'Failed to fetch results' });
    }

    // Separate green and red results
    // - green: only valid results (exclude converted_to_audit and skipped)
    // - red: only true no-email results (exclude skipped/errors)
    const greenResults = (results || []).filter(r => r.has_email === 1 && r.status === 'valid');
    const redResults = (results || []).filter(r => r.has_email === 0 && r.status === 'no_email');
    const skippedResults = (results || []).filter(r => (r.status || '').startsWith('skipped_'));
    const errorResults = (results || []).filter(r => r.status === 'error');

    res.json({
      green: greenResults,
      red: redResults,
      // Diagnostics (optional)
      skipped: skippedResults,
      errors: errorResults
    });
  });
});

// POST /admin/api/preaudits/:resultId/proceed - Convert result to audit
router.post('/api/preaudits/:resultId/proceed', requireAdmin, async (req, res) => {
  const { resultId } = req.params;

  try {
    // Get preaudit result
    const result = await new Promise((resolve, reject) => {
      getPreauditResultById(resultId, (err, result) => {
        if (err) reject(err);
        else if (!result) reject(new Error('Result not found'));
        else resolve(result);
      });
    });

    if (!result.has_email) {
      return res.status(400).json({
        success: false,
        error: 'Cannot proceed with result without email'
      });
    }

    // Get search data to get niche and city
    const search = await new Promise((resolve, reject) => {
      getPreauditSearchById(result.search_id, (err, search) => {
        if (err) reject(err);
        else if (!search) reject(new Error('Search not found'));
        else resolve(search);
      });
    });

    // Get preset ID from niche
    const preset = await new Promise((resolve, reject) => {
      getAllNichePresets((err, presets) => {
        if (err) reject(err);
        else {
          const foundPreset = (presets || []).find(p => p.slug === search.niche);
          resolve(foundPreset);
        }
      });
    });

    console.log('[PREAUDIT] Converting result to audit:', {
      url: result.url,
      niche: search.niche,
      city: search.city,
      email: result.email
    });

    // audit_jobs.city is NOT NULL in your DB, but Preaudits city is optional.
    // If user didn't provide a city, treat it as USA-wide search.
    const cityForAudit = (search.city && String(search.city).trim()) ? String(search.city).trim() : 'USA';

    // Create audit job
    const auditJob = await new Promise((resolve, reject) => {
      createAuditJob({
        input_url: result.url,
        niche: search.niche,
        city: cityForAudit,
        company_name: result.title || null,
        brand_logo_url: null,
        preset_id: preset ? preset.id : null,
        status: 'ready_to_check'
      }, (err, job) => {
        if (err) reject(err);
        else resolve(job);
      });
    });

    console.log('[PREAUDIT] Audit job created, ID:', auditJob.id);

    // Mark preaudit result as processed (DO NOT DELETE - user wants to keep records!)
    await new Promise((resolve, reject) => {
      updatePreauditResult(resultId, {
        status: 'converted_to_audit'
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('[PREAUDIT] Preaudit result marked as converted');

    res.json({
      success: true,
      auditJobId: auditJob.id,
      message: 'Audit job created successfully'
    });

  } catch (error) {
    console.error('[PREAUDIT] Error in proceed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /admin/api/preaudits/:resultId - Delete preaudit result (move to blacklist)
router.delete('/api/preaudits/:resultId', requireAdmin, async (req, res) => {
  const { resultId } = req.params;

  try {
    // Get result
    const result = await new Promise((resolve, reject) => {
      getPreauditResultById(resultId, (err, result) => {
        if (err) reject(err);
        else if (!result) reject(new Error('Result not found'));
        else resolve(result);
      });
    });

    // Get search data
    const search = await new Promise((resolve, reject) => {
      getPreauditSearchById(result.search_id, (err, search) => {
        if (err) reject(err);
        else resolve(search);
      });
    });

    // Add to blacklist
    const { addToBlacklist } = require('../db');
    await new Promise((resolve, reject) => {
      addToBlacklist(result.url, {
        niche: search ? search.niche : null,
        city: search ? search.city : null,
        reason: 'manually_removed'
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Delete result
    await new Promise((resolve, reject) => {
      deletePreauditResult(resultId, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('[PREAUDIT] Result deleted and blacklisted:', result.url);

    res.json({
      success: true,
      message: 'Result deleted and added to blacklist'
    });

  } catch (error) {
    console.error('[PREAUDIT] Error deleting result:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /admin/api/preaudits/search/:searchId - Delete entire search
router.delete('/api/preaudits/search/:searchId', requireAdmin, (req, res) => {
  const { searchId } = req.params;

  deletePreauditSearch(searchId, (err, result) => {
    if (err) {
      console.error('Error deleting preaudit search:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete search'
      });
    }

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Search not found'
      });
    }

    console.log('[PREAUDIT] Search deleted:', searchId);

    res.json({
      success: true,
      message: 'Search deleted successfully'
    });
  });
});

// GET /admin/api/email-health - Check email deliverability configuration
router.get('/api/email-health', requireAdmin, async (req, res) => {
  try {
    console.log('[EMAIL HEALTH] Running email health check...');
    
    const healthReport = await checkEmailHealth();
    
    console.log('[EMAIL HEALTH] Check completed:', healthReport.overall.status);
    
    res.json({
      success: true,
      ...healthReport
    });
  } catch (error) {
    console.error('[EMAIL HEALTH] Error running health check:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to run email health check',
      overall: {
        status: 'error',
        message: 'Health check failed to run',
        timestamp: new Date().toISOString()
      }
    });
  }
});

module.exports = router;


