const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  getAllSubmissions,
  getSubmissionById,
  getAllWebProjectSubmissions,
  getWebProjectSubmissionById,
  createAuditJob,
  getAuditJobs,
  getAuditJobById,
  updateAuditJob,
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
  setSiteSetting
} = require('../db');
const auditPipeline = require('../services/auditPipeline');

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../public/team');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const member = req.body.member || 'unknown';
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
router.post('/login', (req, res) => {
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

// GET /admin/audits - seznam audit jobs
router.get('/audits', requireAdmin, (req, res) => {
  getAuditJobs((err, auditJobs) => {
    if (err) {
      console.error('Error fetching audit jobs:', err);
      auditJobs = [];
    }

    res.render('admin-audits-list', {
      auditJobs: auditJobs || []
    });
  });
});

// GET /admin/audits/new - create new audit and redirect to detail
router.get('/audits/new', requireAdmin, (req, res) => {
  const payload = {
    input_url: '',
    niche: 'plumbing',
    city: 'Miami',
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

              res.render('admin-audit-detail', {
                auditJob,
                runLogs: runLogs || [],
                promptTemplates: promptsByName,
                publicUrl: auditJob.public_page_slug ? `/${auditJob.public_page_slug}` : null,
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

// POST /admin/audits/:id/process - full pipeline
router.post('/audits/:id/process', requireAdmin, async (req, res) => {
  const id = req.params.id;
  
  console.log('[AUDIT PROCESS] Starting for job', id);
  console.log('[AUDIT PROCESS] Body:', {
    input_url: req.body.input_url,
    preset_id: req.body.preset_id,
    brand_logo_url: req.body.brand_logo_url ? 'provided' : 'empty'
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

  console.log('[AUDIT PROCESS] Input update:', inputUpdate);

  updateAuditJob(id, inputUpdate, (err) => {
    if (err) {
      console.error('[AUDIT PROCESS] Error updating audit input:', err);
      return res.status(500).send('Error updating audit job: ' + err.message);
    }
    
    console.log('[AUDIT PROCESS] Input updated successfully, starting pipeline...');
    
    auditPipeline.processAuditJob(id, {
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
      console.log('[AUDIT PROCESS] Pipeline completed successfully');
      res.redirect(`/admin/audits/${id}`);
    }).catch((pipelineErr) => {
      console.error('[AUDIT PROCESS] Pipeline error:', pipelineErr);
      res.redirect(`/admin/audits/${id}`);
    });
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

// POST /admin/audits/:id/run-full-pipeline - Run all 6 assistants
router.post('/audits/:id/run-full-pipeline', requireAdmin, async (req, res) => {
  const { id } = req.params;
  
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

// POST /admin/team-photos/upload - Upload team photo
router.post('/team-photos/upload', requireAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const member = req.body.member;
  if (!member || !['jacob', 'max'].includes(member)) {
    return res.status(400).json({ error: 'Invalid team member' });
  }

  const photoPath = `/public/team/${req.file.filename}`;
  const settingKey = `team_${member}_photo`;

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

// GET /admin/:id - detail (fallback - zkusí oba typy)
router.get('/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  // Nejdřív zkusíme contact submission
  getSubmissionById(id, (err, submission) => {
    if (err || !submission) {
      // Pokud nenajdeme, zkusíme web-project
      getWebProjectSubmissionById(id, (err, webProjectSubmission) => {
        if (err) {
          console.error('Error fetching submission:', err);
          return res.status(500).send('Error loading submission');
        }

        if (!webProjectSubmission) {
          return res.status(404).send('Submission not found');
        }

        res.render('admin-web-project-detail', { 
          submission: webProjectSubmission 
        });
      });
    } else {
      res.render('admin-detail', { 
        submission,
        submissionType: 'contact'
      });
    }
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
  
  updateAssistant(id, data, (err, result) => {
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

module.exports = router;


