const express = require('express');
const router = express.Router();
const { insertSubmission } = require('../db');

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
      return res.status(500).json({
        success: false,
        error: 'Failed to save submission'
      });
    }

    res.json({
      success: true,
      id: result.id
    });
  });
});

module.exports = router;

