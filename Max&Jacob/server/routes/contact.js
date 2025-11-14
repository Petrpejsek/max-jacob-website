const express = require('express');
const router = express.Router();
const { insertSubmission, insertWebProjectSubmission } = require('../db');

// Test endpoint - ověření, že routes fungují
router.get('/test', (req, res) => {
  res.json({ 
    status: 'Contact routes are working',
    path: '/api/test',
    timestamp: new Date().toISOString()
  });
});

// POST /api/contact-submissions
router.post('/contact-submissions', (req, res) => {
  const { email, name, company, website, zip_code, needs_help_with, industry, budget_range, timeline, message, has_attachment, selected_package } = req.body;

  // Validace required polí
  if (!email || !message) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: email and message are required'
    });
  }

  // Základní validace emailu
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format'
    });
  }

  // Připravení dat pro uložení
  const submissionData = {
    email,
    name,
    company,
    website,
    zip_code,
    needs_help_with,
    industry,
    budget_range,
    timeline,
    message,
    has_attachment: has_attachment || false,
    ip_address: req.ip,
    selected_package
  };

  // Uložení do databáze
  insertSubmission(submissionData, (err, result) => {
    if (err) {
      console.error('Error inserting submission:', err);
      console.error('Submission data:', JSON.stringify(submissionData, null, 2));
      return res.status(500).json({
        success: false,
        error: 'Failed to save submission: ' + err.message
      });
    }

    console.log('Contact submission saved successfully with ID:', result.id);
    res.json({
      success: true,
      id: result.id
    });
  });
});

// POST /api/web-project-submissions
router.post('/web-project-submissions', (req, res) => {
  console.log('[WEB-PROJECT] Received request');
  console.log('[WEB-PROJECT] Body:', JSON.stringify(req.body, null, 2));
  
  const {
    company_name,
    current_website,
    contacts,
    main_goal,
    target_audience,
    pages_needed,
    estimated_pages,
    main_sections,
    required_languages,
    features,
    custom_features,
    visual_identity,
    liked_websites,
    business_description,
    content_help,
    hosting_domain,
    technical_requirements,
    deadline,
    has_branding_files,
    has_content_files
  } = req.body;

  // Validace - musí být alespoň company_name nebo první contact s emailem
  if (!company_name && (!contacts || !Array.isArray(contacts) || !contacts[0] || !contacts[0].email)) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: company name or contact email is required'
    });
  }

  // Validace emailu z contacts, pokud existuje
  if (contacts && Array.isArray(contacts) && contacts.length > 0 && contacts[0].email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contacts[0].email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format in contacts'
      });
    }
  }

  // Připravení dat pro uložení
  const submissionData = {
    company_name,
    current_website,
    contacts,
    main_goal,
    target_audience,
    pages_needed,
    estimated_pages,
    main_sections,
    required_languages,
    features,
    custom_features,
    visual_identity,
    liked_websites,
    business_description,
    content_help,
    hosting_domain,
    technical_requirements,
    deadline,
    has_branding_files: has_branding_files || false,
    has_content_files: has_content_files || false,
    ip_address: req.ip
  };

  console.log('[WEB-PROJECT] Prepared submission data:', JSON.stringify(submissionData, null, 2));
  
  // Uložení do databáze
  insertWebProjectSubmission(submissionData, (err, result) => {
    if (err) {
      console.error('[WEB-PROJECT] ERROR inserting submission:', err);
      console.error('[WEB-PROJECT] Error code:', err.code);
      console.error('[WEB-PROJECT] Error message:', err.message);
      console.error('[WEB-PROJECT] Submission data:', JSON.stringify(submissionData, null, 2));
      return res.status(500).json({
        success: false,
        error: 'Failed to save submission: ' + (err.message || String(err))
      });
    }

    console.log('[WEB-PROJECT] Submission saved successfully with ID:', result.id);
    res.json({
      success: true,
      id: result.id
    });
  });
});

module.exports = router;

