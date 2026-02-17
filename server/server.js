const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Playwright browser location
// - In production, we want browsers bundled in the app (PLAYWRIGHT_BROWSERS_PATH=0)
// - In Cursor/dev, Playwright may inherit an ephemeral cache path (e.g. "cursor-sandbox-cache"),
//   which can disappear between runs and cause:
//   "browserType.launch: Executable doesn't exist ..."
// To keep local + prod stable, force bundled browsers unless the user explicitly set a different path.
(() => {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  const existing = process.env.PLAYWRIGHT_BROWSERS_PATH;

  const looksEphemeral =
    !existing ||
    String(existing).includes('cursor-sandbox-cache') ||
    String(existing).includes('/var/folders/') ||
    String(existing).includes('/tmp/') ||
    String(existing).includes('/private/var/');

  if (nodeEnv === 'production' || looksEphemeral) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
  }
})();

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const { validateSessionSecret, getHelmetConfig } = require('./middleware/security');
const { getSqliteDbPath } = require('./runtimePaths');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('=== SERVER STARTING ===');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('ADMIN_PASSWORD loaded:', process.env.ADMIN_PASSWORD ? 'YES (length: ' + process.env.ADMIN_PASSWORD.length + ')' : 'NO');
console.log('Working directory:', process.cwd());
console.log('__dirname:', __dirname);

// Trust proxy (Render / reverse proxy) - must be set BEFORE sessions/cookies
app.set('trust proxy', 1);

// Validate critical env vars before starting (production)
validateSessionSecret();

// Security headers (Helmet)
app.use(getHelmetConfig());

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Force-disable template caching so local edits in .ejs always reflect immediately,
// even if NODE_ENV or Express defaults change unexpectedly.
app.set('view cache', false);

// Request logging - ÚPLNĚ NA ZAČÁTKU
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Path:', req.path);
  next();
});

// Load routes modules
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');
const auditPublicRoutes = require('./routes/audit-public');
const presetsRoutes = require('./routes/presets');
const dealRoutes = require('./routes/deals');

// ========================================
// ALL ROUTES - ÚPLNĚ NA ZAČÁTKU!
// ========================================

// DIAGNOSTIC ENDPOINT - test, jestli Express vůbec běží
app.all('/diagnostic', (req, res) => {
  console.log('[DIAGNOSTIC] Request received:', req.method, req.originalUrl);
  res.json({
    status: 'Express server is running',
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    server: 'express',
    message: 'If you see this, Express is working!'
  });
});

// HEALTH CHECK with DB test
app.all('/health', (req, res) => {
  console.log('[HEALTH] Request received:', req.method, req.path);
  
  // Test DB connection
  const { db } = require('./db');
  db.get('SELECT 1 as test', [], (err, row) => {
    const dbOk = !err && row && row.test === 1;
    
    // Test write permissions on DB path
    const fs = require('fs');
    const dbPath = getSqliteDbPath();
    let diskWritable = false;
    try {
      fs.accessSync(path.dirname(dbPath), fs.constants.W_OK);
      diskWritable = true;
    } catch (e) {
      diskWritable = false;
    }
    
    const healthy = dbOk && diskWritable;
    
    res.status(healthy ? 200 : 503).json({ 
      status: healthy ? 'ok' : 'unhealthy',
      checks: {
        db: dbOk ? 'ok' : 'failed',
        disk: diskWritable ? 'ok' : 'readonly'
      },
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      server: 'express',
      deploy_version: 'email-fix-v4-no-spam-phrases'
    });
  });
});

// TEST ENDPOINT - direct in server.js
app.all('/api/test-direct', (req, res) => {
  console.log('[TEST-DIRECT] Request received:', req.method, req.path);
  res.json({ 
    status: 'Direct route works',
    path: '/api/test-direct',
    method: req.method,
    timestamp: new Date().toISOString(),
    server: 'express',
    port: PORT
  });
});

// API logging middleware
app.use('/api', (req, res, next) => {
  console.log('[API] Request:', req.method, req.path);
  next();
});

// Resend webhook endpoint (must be BEFORE admin routes - public endpoint)
app.post('/api/webhooks/resend', express.json(), (req, res) => {
  console.log('[RESEND WEBHOOK] Received event:', req.body.type);
  
  const { type, data } = req.body;
  const { updateEmailTracking } = require('./db');
  
  // Process email events (opened, clicked)
  if (type === 'email.opened' && data && data.email_id) {
    updateEmailTracking(data.email_id, 'opened', (err) => {
      if (err) {
        console.error('[RESEND WEBHOOK] Error updating opened tracking:', err);
      } else {
        console.log('[RESEND WEBHOOK] Email opened tracked:', data.email_id);
      }
    });
  } else if (type === 'email.clicked' && data && data.email_id) {
    updateEmailTracking(data.email_id, 'clicked', (err) => {
      if (err) {
        console.error('[RESEND WEBHOOK] Error updating clicked tracking:', err);
      } else {
        console.log('[RESEND WEBHOOK] Email clicked tracked:', data.email_id);
      }
    });
  }
  
  // Always respond 200 OK to webhook
  res.status(200).json({ received: true });
});

// Page view tracking endpoint (public)
app.post('/api/track-page-view', express.json(), (req, res) => {
  const { audit_id, clarity_session_id } = req.body;
  
  if (!audit_id) {
    return res.status(400).json({ error: 'audit_id is required' });
  }
  
  const { createPageView } = require('./db');
  
  const pageViewData = {
    audit_job_id: parseInt(audit_id, 10),
    clarity_session_id: clarity_session_id || null,
    user_agent: req.headers['user-agent'] || null,
    ip_address: req.ip || req.headers['x-forwarded-for'] || null
  };
  
  createPageView(pageViewData, (err, result) => {
    if (err) {
      console.error('[PAGE VIEW TRACKING] Error:', err);
      return res.status(500).json({ error: 'Failed to track page view' });
    }
    
    console.log('[PAGE VIEW TRACKING] Tracked view for audit #' + audit_id + (clarity_session_id ? ' (Clarity: ' + clarity_session_id + ')' : ''));
    res.status(200).json({ success: true, id: result.id });
  });
});

// ========================================
// DATABASE BACKUP ENDPOINT (for sync-db.sh)
// ========================================
// Allows downloading a safe, consistent copy of the production database.
// Auth: Bearer token (ADMIN_PASSWORD) or active admin session.
// This endpoint is used by sync-db.sh to keep local dev in sync with production.
app.get('/api/db-backup', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD;

  const isTokenAuth = token && adminPassword && token === adminPassword;
  const isSessionAuth = req.session && req.session.isAdmin;

  if (!isTokenAuth && !isSessionAuth) {
    console.log('[DB-BACKUP] Unauthorized access attempt from', req.ip);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[DB-BACKUP] Authorized backup request from', req.ip);

  const { db: dbInstance } = require('./db');
  const os = require('os');
  const tmpPath = path.join(os.tmpdir(), `maxjacob-backup-${Date.now()}.db`);

  function sendBackupFile(filePath) {
    const stat = fs.statSync(filePath);
    console.log('[DB-BACKUP] Sending backup file:', stat.size, 'bytes');

    res.set({
      'Content-Type': 'application/x-sqlite3',
      'Content-Disposition': 'attachment; filename="data.db"',
      'Content-Length': stat.size,
      'X-Backup-Timestamp': new Date().toISOString(),
      'X-Backup-Size': stat.size
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('end', () => {
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      console.log('[DB-BACKUP] Backup download completed');
    });
    stream.on('error', (streamErr) => {
      console.error('[DB-BACKUP] Stream error:', streamErr.message);
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream failed' });
      }
    });
  }

  // Strategy 1: Use VACUUM INTO for a safe, consistent backup (SQLite 3.27.0+)
  // This creates a complete, standalone copy without WAL/SHM dependencies.
  const safeTmpPath = tmpPath.replace(/'/g, "''");
  dbInstance.run(`VACUUM INTO '${safeTmpPath}'`, [], function(vacuumErr) {
    if (!vacuumErr) {
      console.log('[DB-BACKUP] VACUUM INTO succeeded');
      return sendBackupFile(tmpPath);
    }

    console.warn('[DB-BACKUP] VACUUM INTO failed:', vacuumErr.message, '- falling back to WAL checkpoint + file copy');

    // Strategy 2: Checkpoint WAL then copy the main DB file
    dbInstance.run('PRAGMA wal_checkpoint(TRUNCATE)', [], function(cpErr) {
      if (cpErr) {
        console.warn('[DB-BACKUP] WAL checkpoint warning:', cpErr.message);
      }
      try {
        const dbPath = getSqliteDbPath();
        fs.copyFileSync(dbPath, tmpPath);
        console.log('[DB-BACKUP] Fallback file copy succeeded');
        sendBackupFile(tmpPath);
      } catch (copyErr) {
        console.error('[DB-BACKUP] File copy also failed:', copyErr.message);
        return res.status(500).json({ error: 'Backup failed', message: copyErr.message });
      }
    });
  });
});

// Unsubscribe endpoint (public, must be before other routes)
app.get('/unsubscribe', (req, res) => {
  const email = req.query.email;
  
  if (!email) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error - Max & Jacob</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; text-align: center; }
          h1 { color: #dc2626; margin: 0 0 16px 0; }
          p { color: #4b5563; line-height: 1.6; }
          a { color: #4F46E5; text-decoration: none; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⚠️ Error</h1>
          <p>Email address was not specified. Please use the link from the email.</p>
          <p><a href="https://maxandjacob.com">← Back to homepage</a></p>
        </div>
      </body>
      </html>
    `);
  }
  
  // TODO: Add email to unsubscribe list in database (future implementation)
  // For now, just show confirmation page
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Unsubscribe Successful - Max & Jacob</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; text-align: center; }
        h1 { color: #16a34a; margin: 0 0 16px 0; }
        p { color: #4b5563; line-height: 1.6; margin: 12px 0; }
        .email { font-weight: 600; color: #1f2937; background: #f3f4f6; padding: 8px 12px; border-radius: 6px; display: inline-block; margin: 8px 0; }
        a { color: #4F46E5; text-decoration: none; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✅ Unsubscribe Successful</h1>
        <p>Email <span class="email">${email}</span> has been unsubscribed from our mailing list.</p>
        <p>You will no longer receive messages from Max & Jacob.</p>
        <p style="margin-top: 32px; font-size: 14px; color: #6b7280;">
          If you unsubscribed by mistake, you can contact us at <a href="mailto:jacob@maxandjacob.com">jacob@maxandjacob.com</a>
        </p>
        <p style="margin-top: 24px;">
          <a href="https://maxandjacob.com">← Back to homepage</a>
        </p>
      </div>
    </body>
    </html>
  `);
});

// Register API and Admin routes
app.use('/api', contactRoutes);
app.use('/api/presets', presetsRoutes);
app.use('/admin', adminRoutes);
app.use('/deal', dealRoutes);
app.use('/', auditPublicRoutes);

// ========================================
// STATIC FILES - ÚPLNĚ NA KOŇCI!
// ========================================

const repoRoot = path.join(__dirname, '..');
const repoPublicDir = path.join(repoRoot, 'public');
const persistentPublicDir = process.env.PUBLIC_DIR ? path.resolve(process.env.PUBLIC_DIR) : repoPublicDir;

// Ensure deal_assets directory exists on both public paths
try {
  fs.mkdirSync(path.join(repoPublicDir, 'deal_assets'), { recursive: true });
  if (persistentPublicDir !== repoPublicDir) {
    fs.mkdirSync(path.join(persistentPublicDir, 'deal_assets'), { recursive: true });
  }
} catch (e) {
  console.warn('[SERVER] Could not create deal_assets directory:', e.message);
}

console.log('[SERVER] Repo root:', repoRoot);
console.log('[SERVER] Repo public dir:', repoPublicDir);
console.log('[SERVER] Persistent public dir:', persistentPublicDir);

// Serve public assets from persistent dir first (if different), then fall back to repo /public.
// This supports production persistent storage without changing URLs.
if (persistentPublicDir && path.resolve(persistentPublicDir) !== path.resolve(repoPublicDir)) {
  app.use('/public', express.static(persistentPublicDir, { fallthrough: true, dotfiles: 'ignore' }));
}
app.use('/public', express.static(repoPublicDir, { fallthrough: false, dotfiles: 'ignore' }));

// Hardened static serving from repo root:
// - allow only safe extensions
// - block sensitive directories and dotfiles
// - prevent serving DB files or source code
const ALLOWED_STATIC_EXTS = new Set([
  '.html', '.css', '.js',
  '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico',
  '.txt'
]);
const BLOCKED_PATH_PREFIXES = [
  '/server',
  '/tests',
  '/.git',
  '/.cursor',
  '/terminals',
  '/node_modules'
];
const BLOCKED_EXTS = new Set([
  '.db', '.sqlite', '.sqlite3', '.wal', '.shm', '.env', '.ejs', '.md', '.bak', '.bak2', '.bak3'
]);

function hasDotfileSegment(urlPath) {
  return String(urlPath || '')
    .split('/')
    .some((seg) => seg && seg.startsWith('.') && seg !== '.' && seg !== '..');
}

function isAllowedRootStaticPath(urlPath) {
  const p = String(urlPath || '');
  if (!p.startsWith('/')) return false;

  // Always allow the homepage (served by express.static index.html).
  if (p === '/') return true;

  // Never serve dotfiles or anything under blocked prefixes.
  if (hasDotfileSegment(p)) return false;
  if (BLOCKED_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'))) return false;

  // /public/* is served by dedicated middleware above (persistent overlay).
  if (p === '/public' || p.startsWith('/public/')) return false;

  const ext = path.extname(p).toLowerCase();
  if (!ext) return false;
  if (BLOCKED_EXTS.has(ext)) return false;
  if (!ALLOWED_STATIC_EXTS.has(ext)) return false;

  // Defense-in-depth: block common DB filenames even if extension checks change.
  if (p.toLowerCase().includes('data.db')) return false;
  return true;
}

const rootStatic = express.static(repoRoot, { fallthrough: false, dotfiles: 'ignore', index: 'index.html' });

// Static files middleware - only if request is NOT API/admin/health/diagnostic
app.use((req, res) => {
  const skipStaticPaths = ['/api', '/admin', '/health', '/diagnostic', '/deal'];
  const shouldSkip = skipStaticPaths.some((skipPath) => req.path === skipPath || req.path.startsWith(skipPath + '/'));

  if (shouldSkip) {
    console.log('[STATIC] Skipping static files for:', req.path);
    if (!res.headersSent) {
      return res.status(404).json({
        error: 'Route not found',
        path: req.path,
        method: req.method,
        message: 'No route handler matched this path. Express server is running but this route does not exist.',
        availableRoutes: ['/health', '/diagnostic', '/api/test-direct', '/api/test', '/admin']
      });
    }
    return;
  }

  // If it's not a safe static path, do not try to serve it from disk.
  if (!isAllowedRootStaticPath(req.path)) {
    return res.status(404).send('Not found');
  }

  // Serve from repo root (index.html at /, static assets like /style.css, images, etc.)
  rootStatic(req, res, (err) => {
    if (err) {
      console.log('[STATIC] File not found:', req.path, err.message);
      if (!res.headersSent) res.status(404).send('File not found');
    }
  });
});

// Start server
// CRITICAL: On Render, server must listen on 0.0.0.0, not just localhost!
// In local dev (macOS), 0.0.0.0 can cause EPERM, so use 127.0.0.1
const listenHost = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

app.listen(PORT, listenHost, () => {
  console.log(`\n=== SERVER STARTED SUCCESSFULLY ===`);
  console.log(`Server listening on ${listenHost}:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Diagnostic: http://localhost:${PORT}/diagnostic`);
  console.log(`API Test: http://localhost:${PORT}/api/test-direct`);
  console.log(`API Routes: http://localhost:${PORT}/api/test`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`PORT: ${PORT}`);
  console.log(`Repo root: ${repoRoot}`);
  console.log(`Public (repo): ${repoPublicDir}`);
  console.log(`Public (persistent): ${persistentPublicDir}`);
  console.log(`========================================\n`);
  
  // Start memory monitoring (production diagnostics for OOM issues)
  const memoryMonitor = require('./services/memoryMonitor');
  memoryMonitor.startMonitoring();

  // One-time background PNG→JPEG conversion (runs after startup, non-blocking)
  // Skipped in production: avoids segfault/memory pressure with 10k+ files and full disk (ENOSPC)
  setImmediate(() => {
    (async () => {
      if (process.env.NODE_ENV === 'production') {
        console.log('[PNG2JPG] Skipping in production (run manually if needed).');
        return;
      }
      let sharp;
      try { sharp = require('sharp'); } catch (e) {
        console.log('[PNG2JPG] sharp not available, skipping PNG conversion:', e.message);
        return;
      }
      const { getPersistentPublicDir } = require('./runtimePaths');
      const { db } = require('./db');
      const publicDir = getPersistentPublicDir();
      const scanDirs = [
        path.join(publicDir, 'audit_screenshots'),
        path.join(publicDir, 'preaudit_screenshots')
      ];

      function collectPngs(dir, out = []) {
        if (!fs.existsSync(dir)) return out;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) collectPngs(full, out);
          else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) out.push(full);
        }
        return out;
      }

      const pngFiles = [];
      for (const d of scanDirs) collectPngs(d, pngFiles);
      if (pngFiles.length === 0) {
        console.log('[PNG2JPG] No PNG files found — nothing to convert.');
        return;
      }
      console.log(`[PNG2JPG] Starting background conversion of ${pngFiles.length} PNG files...`);

      let converted = 0, errors = 0, savedBytes = 0;
      for (const pngPath of pngFiles) {
        const jpgPath = pngPath.slice(0, -4) + '.jpg';
        try {
          const sizeBefore = fs.statSync(pngPath).size;
          await sharp(pngPath).jpeg({ quality: 80 }).toFile(jpgPath);
          const sizeAfter = fs.existsSync(jpgPath) ? fs.statSync(jpgPath).size : sizeBefore;
          savedBytes += Math.max(0, sizeBefore - sizeAfter);
          fs.unlinkSync(pngPath);
          converted++;
          if (converted % 200 === 0) {
            console.log(`[PNG2JPG] ${converted}/${pngFiles.length} done, ~${(savedBytes/1024/1024).toFixed(0)} MB freed so far`);
          }
        } catch (e) {
          try { if (fs.existsSync(jpgPath)) fs.unlinkSync(jpgPath); } catch (_) {}
          errors++;
        }
      }

      // Update DB paths
      const dbUpdates = [
        `UPDATE crawled_pages SET screenshots_json = REPLACE(screenshots_json, '.png', '.jpg') WHERE screenshots_json LIKE '%.png%'`,
        `UPDATE audit_jobs SET screenshots_json = REPLACE(screenshots_json, '.png', '.jpg') WHERE screenshots_json LIKE '%.png%'`,
        `UPDATE preaudit_results SET screenshot_hero_path = REPLACE(screenshot_hero_path, '.png', '.jpg'), screenshot_full_path = REPLACE(screenshot_full_path, '.png', '.jpg') WHERE screenshot_hero_path LIKE '%.png%' OR screenshot_full_path LIKE '%.png%'`
      ];
      for (const sql of dbUpdates) {
        await new Promise((resolve) => { db.run(sql, () => resolve()); });
      }

      console.log(`[PNG2JPG] DONE. Converted: ${converted}, Errors: ${errors}, Freed: ~${(savedBytes/1024/1024).toFixed(0)} MB`);
    })().catch(e => console.error('[PNG2JPG] Fatal:', e.message));
  });
});
