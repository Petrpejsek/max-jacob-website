const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getAuditJobBySlug, getAllSiteSettings } = require('../db');
const { buildViewModelV2 } = require('../helpers/auditViewModelV2');
const homepageBuilder = require('../services/homepageBuilder');

const NICHES = ['plumbing', 'roofing', 'hvac', 'electrician'];

function isValidNicheCity(value) {
  const lower = (value || '').toLowerCase();
  // Support both formats: "niche" and "city-niche" (e.g. "plumbing" or "local-plumbing")
  return NICHES.some((niche) => lower.includes(niche));
}

// Privacy Policy route
router.get('/privacy', (req, res) => {
  res.render('privacy');
});

// ASAP Plumbing Preview - Serve static assets (JS, CSS, images)
// This middleware serves assets from the preview folder with proper paths
router.use('/preview_asap_plumbing_los_angeles', express.static(
  path.join(__dirname, '../../public/previews/asap_plumbing_los_angeles'),
  { 
    maxAge: '1h',
    setHeaders: (res, filepath) => {
      // Set CORS headers for assets if needed
      if (filepath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      }
    }
  }
));

// Custom preview route for ASAP Plumbing Los Angeles (audit 615)
// This serves the main HTML file for the preview
router.get('/preview_asap_plumbing_los_angeles', (req, res) => {
  const previewPath = path.join(__dirname, '../../public/previews/asap_plumbing_los_angeles/index.html');
  
  console.log('[PREVIEW] ASAP Plumbing preview requested');
  console.log('[PREVIEW] Preview path:', previewPath);
  
  if (!fs.existsSync(previewPath)) {
    console.error('[PREVIEW] Preview file not found:', previewPath);
    return res.status(404).send('Preview not found');
  }
  
  // Read the HTML and modify asset paths to be relative to preview base
  let html = fs.readFileSync(previewPath, 'utf-8');
  
  // Fix asset paths: /assets/ -> /preview_asap_plumbing_los_angeles/assets/
  html = html.replace(/src="\/assets\//g, 'src="/preview_asap_plumbing_los_angeles/assets/');
  html = html.replace(/href="\/assets\//g, 'href="/preview_asap_plumbing_los_angeles/assets/');
  
  // Fix other root-relative paths (favicon, images, etc.)
  html = html.replace(/href="\/favicon\./g, 'href="/preview_asap_plumbing_los_angeles/favicon.');
  html = html.replace(/src="\/favicon\./g, 'src="/preview_asap_plumbing_los_angeles/favicon.');
  html = html.replace(/content="\/og-image\./g, 'content="/preview_asap_plumbing_los_angeles/og-image.');
  html = html.replace(/href="\/index\.css"/g, 'href="/preview_asap_plumbing_los_angeles/index.css"');
  
  // Set appropriate headers for HTML preview
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  
  res.send(html);
});

// Serve generated homepage proposal HTML inside iframe (public audit link scope)
router.get('/:nicheCity/:slug/homepage-proposal.html', (req, res, next) => {
  const { nicheCity, slug } = req.params;
  if (!isValidNicheCity(nicheCity)) {
    return next();
  }

  const fullSlug = `${nicheCity}/${slug}`;
  getAuditJobBySlug(fullSlug, (err, auditJob) => {
    if (err) {
      console.error('Error fetching public homepage proposal:', err);
      return res.status(500).send('Error loading homepage proposal');
    }

    if (!auditJob || !auditJob.public_page_json) {
      return res.status(404).send('Audit page not found');
    }

    if (!auditJob.homepage_proposal_html && !auditJob.homepage_proposal_data_json) {
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
        // Capture phase so we intercept before any template handlers.
        document.addEventListener('click', block, true);
        document.addEventListener('submit', block, true);
        document.addEventListener('mousedown', block, true);
        document.addEventListener('mouseup', block, true);
        document.addEventListener('pointerdown', block, true);
        document.addEventListener('pointerup', block, true);
        // Block keyboard activation of buttons/links too.
        document.addEventListener('keydown', function (e) {
          const k = e.key;
          if (k === 'Enter' || k === ' ') return block(e);
        }, true);
        window.__mjPreviewClicksBlocked = true;
      })();
    </script>
`;

      // Prefer injecting early (inside <head>) so our handler is registered first.
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (m) => `${m}${script}`);
        return html;
      }
      if (/<html[^>]*>/i.test(html)) {
        html = html.replace(/<html[^>]*>/i, (m) => `${m}<head>${script}</head>`);
        return html;
      }
      // Fallback: prepend
      return `${script}${html}`;
    };

    // Prefer rendering from saved proposal data so template improvements apply retroactively.
    const templateSlug =
      (auditJob.homepage_proposal_data_json && auditJob.homepage_proposal_data_json.job && auditJob.homepage_proposal_data_json.job.niche) ||
      auditJob.niche ||
      'plumbing';

    const renderPromise = auditJob.homepage_proposal_data_json
      ? homepageBuilder.renderTemplate(templateSlug, auditJob.homepage_proposal_data_json)
          .catch(() => auditJob.homepage_proposal_html || '')
      : Promise.resolve(auditJob.homepage_proposal_html || '');

    renderPromise
      .then((htmlRaw) => {
        const html = injectClickBlock(htmlRaw);
        // Serve the HTML with injected script
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.send(html);
      })
      .catch((renderErr) => {
        console.error('Error rendering homepage proposal:', renderErr);
        res.status(500).send('Error loading homepage proposal');
      });
  });
});

router.get('/:nicheCity/:slug', (req, res, next) => {
  const { nicheCity, slug } = req.params;
  if (!isValidNicheCity(nicheCity)) {
    return next();
  }

  const fullSlug = `${nicheCity}/${slug}`;
  getAuditJobBySlug(fullSlug, (err, auditJob) => {
    if (err) {
      console.error('Error fetching public audit page:', err);
      return res.status(500).send('Error loading audit page');
    }

    if (!auditJob || !auditJob.public_page_json) {
      return res.status(404).send('Audit page not found');
    }

    // Version detection: ?v=2 renders V2, otherwise V1
    const version = req.query.v;
    
    if (version === '2') {
      // V2: Build enhanced view model with site settings
      getAllSiteSettings((settingsErr, settings) => {
        const settingsObj = {};
        if (!settingsErr && settings) {
          settings.forEach(setting => {
            settingsObj[setting.key] = setting.value;
          });
        }
        
        const viewModel = buildViewModelV2(auditJob, settingsObj);
        res.render('audit-public-v2', {
          vm: viewModel,
          job: auditJob,
          publicSlug: fullSlug
        });
      });
    } else {
      // V1: Original template (unchanged)
      res.render('audit-public', {
        page: auditJob.public_page_json,
        job: auditJob,
        publicSlug: fullSlug
      });
    }
  });
});

module.exports = router;

