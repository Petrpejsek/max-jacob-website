const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getPersistentPublicDir } = require('../runtimePaths');
const {
  getDealByToken,
  getDealMessages,
  createDealMessage,
  createDealAttachment
} = require('../db');
const { sendDealNotificationToAdmin } = require('../services/emailService');

// ---------------------------------------------------------------------------
// Rate limiter for client message posting (anti-spam)
// ---------------------------------------------------------------------------
const clientMessageLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  message: 'Too many messages sent, please wait a few minutes.',
  standardHeaders: true,
  legacyHeaders: false
});

// ---------------------------------------------------------------------------
// Allowed MIME types (server-side whitelist)
// ---------------------------------------------------------------------------
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/heic',
  // Videos
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v', 'video/3gpp', 'video/3gpp2',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed'
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// ---------------------------------------------------------------------------
// Multer storage: store files per-deal
// ---------------------------------------------------------------------------
const dealStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Token is in req.params — populated after router matches
    // We use a temp dir keyed on token prefix; after DB lookup we rename if needed
    const token = req.params.token || 'unknown';
    const uploadDir = path.join(getPersistentPublicDir(), 'deal_assets', token.substring(0, 16));
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${uniqueSuffix}${ext}`);
  }
});

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
}

const upload = multer({
  storage: dealStorage,
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
  fileFilter
});

// ---------------------------------------------------------------------------
// Helper: get base URL from request
// ---------------------------------------------------------------------------
function getBaseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

// ---------------------------------------------------------------------------
// GET /deal/:token/messages — JSON list of messages (for polling / live updates)
// ---------------------------------------------------------------------------
router.get('/:token/messages', (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 32) return res.status(404).json({ error: 'Not found' });
  getDealByToken(token, (err, deal) => {
    if (err || !deal) return res.status(404).json({ error: 'Deal not found' });
    getDealMessages(deal.id, (msgErr, messages) => {
      if (msgErr) return res.status(500).json({ error: 'Failed to load messages' });
      res.json({ messages: messages || [] });
    });
  });
});

// ---------------------------------------------------------------------------
// GET /deal/:token — Client thread view
// ---------------------------------------------------------------------------
router.get('/:token', async (req, res) => {
  const { token } = req.params;

  if (!token || token.length < 32) {
    return res.status(404).render('error-404', { message: 'Deal not found.' });
  }

  getDealByToken(token, (err, deal) => {
    if (err || !deal) {
      return res.status(404).send('<h1>Deal not found</h1><p>This link may be invalid or expired.</p>');
    }

    getDealMessages(deal.id, (msgErr, messages) => {
      if (msgErr) {
        console.error('[DEAL] Error fetching messages:', msgErr);
        return res.status(500).send('Error loading conversation.');
      }

      res.render('deal-thread', {
        deal,
        messages,
        token,
        baseUrl: getBaseUrl(req),
        error: req.query.error || null,
        success: req.query.success || null
      });
    });
  });
});

// ---------------------------------------------------------------------------
// POST /deal/:token/messages — Client sends a message
// ---------------------------------------------------------------------------
router.post('/:token/messages', clientMessageLimiter, (req, res) => {
  const { token } = req.params;

  if (!token || token.length < 32) {
    return res.status(404).send('Not found');
  }

  getDealByToken(token, (err, deal) => {
    if (err || !deal) {
      return res.status(404).send('Deal not found');
    }

    if (deal.status === 'closed') {
      return res.redirect(`/deal/${token}?error=This+deal+is+closed.`);
    }

    // Now handle file upload
    upload.array('attachments', 10)(req, res, (uploadErr) => {
      if (uploadErr) {
        console.error('[DEAL] Upload error:', uploadErr.message);
        return res.redirect(`/deal/${token}?error=${encodeURIComponent(uploadErr.message)}`);
      }

      const body = (req.body.body || '').trim();
      const files = req.files || [];

      if (!body && files.length === 0) {
        return res.redirect(`/deal/${token}?error=Message+cannot+be+empty.`);
      }

      // Create message record
      createDealMessage({ deal_id: deal.id, sender: 'client', body: body || null }, (msgErr, msgResult) => {
        if (msgErr) {
          console.error('[DEAL] Error creating message:', msgErr);
          return res.redirect(`/deal/${token}?error=Failed+to+send+message.`);
        }

        const messageId = msgResult.id;

        // Save attachment records
        const attachmentPromises = files.map(file => {
          return new Promise((resolve, reject) => {
            // Determine relative public path for serving
            const relPath = path.relative(getPersistentPublicDir(), file.path).replace(/\\/g, '/');
            createDealAttachment({
              message_id: messageId,
              filename: relPath,
              original_name: file.originalname,
              mime_type: file.mimetype,
              size: file.size
            }, (aErr, aResult) => {
              if (aErr) reject(aErr);
              else resolve({ ...aResult, filename: relPath, original_name: file.originalname, mime_type: file.mimetype, size: file.size });
            });
          });
        });

        Promise.all(attachmentPromises)
          .then(savedAttachments => {
            // Send email notification to admin (non-blocking)
            sendDealNotificationToAdmin({
              deal,
              messageBody: body,
              attachments: savedAttachments,
              adminBaseUrl: getBaseUrl(req)
            }).catch(emailErr => {
              console.error('[DEAL] Failed to send admin notification:', emailErr);
            });

            res.redirect(`/deal/${token}?success=1`);
          })
          .catch(aErr => {
            console.error('[DEAL] Error saving attachments:', aErr);
            res.redirect(`/deal/${token}?success=1`); // message was saved; attachments failed silently
          });
      });
    });
  });
});

module.exports = router;
