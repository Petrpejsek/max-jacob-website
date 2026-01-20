const express = require('express');
const router = express.Router();
const { getAuditJobBySlug, getAllSiteSettings } = require('../db');
const { buildViewModelV2 } = require('../helpers/auditViewModelV2');

const NICHES = ['plumbing', 'roofing', 'hvac', 'electrician'];

function isValidNicheCity(value) {
  const lower = (value || '').toLowerCase();
  return NICHES.some((niche) => lower.startsWith(niche));
}

// Privacy Policy route
router.get('/privacy', (req, res) => {
  res.render('privacy');
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
          job: auditJob
        });
      });
    } else {
      // V1: Original template (unchanged)
      res.render('audit-public', {
        page: auditJob.public_page_json,
        job: auditJob
      });
    }
  });
});

module.exports = router;

