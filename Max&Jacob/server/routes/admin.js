const express = require('express');
const router = express.Router();
const { getAllSubmissions, getSubmissionById, getAllWebProjectSubmissions, getWebProjectSubmissionById } = require('../db');

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

      res.render('admin-list', { 
        contactSubmissions: contactSubmissions || [],
        webProjectSubmissions: webProjectSubmissions || []
      });
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

module.exports = router;


