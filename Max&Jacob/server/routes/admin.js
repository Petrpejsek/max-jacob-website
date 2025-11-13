const express = require('express');
const router = express.Router();
const { getAllSubmissions, getSubmissionById } = require('../db');

// Middleware pro ověření admin přístupu
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/admin/login');
}

// GET /admin/login - zobrazení login formuláře
router.get('/login', (req, res) => {
  // Pokud už je přihlášený, přesměruj na admin
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
  const adminPassword = process.env.ADMIN_PASSWORD || 'change_me';

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
  getAllSubmissions((err, submissions) => {
    if (err) {
      console.error('Error fetching submissions:', err);
      return res.status(500).send('Error loading submissions');
    }

    res.render('admin-list', { 
      submissions 
    });
  });
});

// GET /admin/:id - detail jednoho submission
router.get('/:id', requireAdmin, (req, res) => {
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
      submission 
    });
  });
});

module.exports = router;

