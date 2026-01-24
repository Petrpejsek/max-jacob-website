const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getPersistentPublicDir } = require('../runtimePaths');
const {
  createNichePreset,
  getAllNichePresets,
  getNichePresetById,
  updateNichePreset,
  deleteNichePreset
} = require('../db');

function publicRefToFsPath(publicRef) {
  const s = String(publicRef || '').trim();
  if (!s) return null;
  const stripped = s.replace(/^\/?public\//, '');
  return path.join(getPersistentPublicDir(), stripped);
}

// Middleware pro ověření admin přístupu
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(getPersistentPublicDir(), 'presets');
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: slug-timestamp.ext
    const slug = req.body.slug || 'preset';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${slug}-${timestamp}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG, JPEG, and WEBP are allowed.'));
    }
  }
});

// GET /api/presets - list all presets
router.get('/', requireAdmin, (req, res) => {
  getAllNichePresets((err, presets) => {
    if (err) {
      console.error('Error fetching presets:', err);
      return res.status(500).json({ error: 'Failed to fetch presets' });
    }
    res.json({ presets: presets || [] });
  });
});

// GET /api/presets/:id - get one preset
router.get('/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  getNichePresetById(id, (err, preset) => {
    if (err) {
      console.error('Error fetching preset:', err);
      return res.status(500).json({ error: 'Failed to fetch preset' });
    }
    if (!preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    res.json({ preset });
  });
});

// POST /api/presets - create new preset
router.post('/', requireAdmin, upload.single('concept_image'), (req, res) => {
  console.log('[PRESET CREATE] Request body:', req.body);
  console.log('[PRESET CREATE] File:', req.file ? req.file.filename : 'none');

  const { slug, display_name, default_headline, default_primary_cta, default_secondary_cta, default_city } = req.body;

  if (!slug || !display_name) {
    console.log('[PRESET CREATE] Missing required fields');
    return res.status(400).json({ error: 'slug and display_name are required' });
  }

  // Parse bullets if provided (JSON string from FormData)
  let bullets = [];
  if (req.body.default_bullets_json) {
    try {
      bullets = JSON.parse(req.body.default_bullets_json);
      console.log('[PRESET CREATE] Parsed bullets:', bullets);
    } catch (e) {
      console.log('[PRESET CREATE] Failed to parse bullets as JSON, splitting by delimiters');
      // If not JSON, try splitting by newline or comma
      bullets = req.body.default_bullets_json.split(/[\n,]/).filter(b => b.trim()).slice(0, 3);
    }
  }

  const conceptImageUrl = req.file ? `public/presets/${req.file.filename}` : null;

  const data = {
    slug,
    display_name,
    concept_image_url: conceptImageUrl,
    default_headline: default_headline || null,
    default_primary_cta: default_primary_cta || null,
    default_secondary_cta: default_secondary_cta || null,
    default_city: default_city || null,
    default_bullets_json: bullets
  };

  console.log('[PRESET CREATE] Data to insert:', data);

  createNichePreset(data, (err, result) => {
    if (err) {
      console.error('[PRESET CREATE] Database error:', err);
      // Clean up uploaded file if database insert fails
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Preset with this slug already exists' });
      }
      return res.status(500).json({ error: 'Failed to create preset', details: err.message });
    }
    console.log('[PRESET CREATE] Success, ID:', result.id);
    res.status(201).json({ id: result.id, message: 'Preset created successfully' });
  });
});

// PUT /api/presets/:id - update preset
router.put('/:id', requireAdmin, upload.single('concept_image'), (req, res) => {
  const id = req.params.id;
  const { slug, display_name, default_headline, default_primary_cta, default_secondary_cta, default_city } = req.body;

  const updates = {};
  if (slug) updates.slug = slug;
  if (display_name) updates.display_name = display_name;
  if (default_headline !== undefined) updates.default_headline = default_headline;
  if (default_primary_cta !== undefined) updates.default_primary_cta = default_primary_cta;
  if (default_secondary_cta !== undefined) updates.default_secondary_cta = default_secondary_cta;
  if (default_city !== undefined) updates.default_city = default_city;

  // Parse bullets if provided
  if (req.body.default_bullets_json) {
    try {
      updates.default_bullets_json = JSON.parse(req.body.default_bullets_json);
    } catch (e) {
      updates.default_bullets_json = req.body.default_bullets_json.split(/[\n,]/).filter(b => b.trim()).slice(0, 3);
    }
  }

  // Handle image upload
  if (req.file) {
    // First get old preset to delete old image
    getNichePresetById(id, (err, oldPreset) => {
      if (!err && oldPreset && oldPreset.concept_image_url) {
        const oldPath = publicRefToFsPath(oldPreset.concept_image_url);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
    });
    updates.concept_image_url = `public/presets/${req.file.filename}`;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updateNichePreset(id, updates, (err, result) => {
    if (err) {
      console.error('Error updating preset:', err);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Preset with this slug already exists' });
      }
      return res.status(500).json({ error: 'Failed to update preset' });
    }
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    res.json({ message: 'Preset updated successfully' });
  });
});

// DELETE /api/presets/:id - delete preset
router.delete('/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  // First get preset to delete associated image
  getNichePresetById(id, (err, preset) => {
    if (err) {
      console.error('Error fetching preset for deletion:', err);
      return res.status(500).json({ error: 'Failed to delete preset' });
    }

    if (!preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    // Delete from database
    deleteNichePreset(id, (deleteErr) => {
      if (deleteErr) {
        console.error('Error deleting preset:', deleteErr);
        return res.status(500).json({ error: 'Failed to delete preset' });
      }

      // Delete associated image if exists
      if (preset.concept_image_url) {
        const imagePath = publicRefToFsPath(preset.concept_image_url);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      res.json({ message: 'Preset deleted successfully' });
    });
  });
});

module.exports = router;

