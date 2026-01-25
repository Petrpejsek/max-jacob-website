const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Render production fix: ensure Playwright uses browsers installed within the app (node_modules),
// not an external cache path that may be missing at runtime.
if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}

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
      server: 'express'
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

// Register API and Admin routes
app.use('/api', contactRoutes);
app.use('/api/presets', presetsRoutes);
app.use('/admin', adminRoutes);
app.use('/', auditPublicRoutes);

// ========================================
// STATIC FILES - ÚPLNĚ NA KOŇCI!
// ========================================

const repoRoot = path.join(__dirname, '..');
const repoPublicDir = path.join(repoRoot, 'public');
const persistentPublicDir = process.env.PUBLIC_DIR ? path.resolve(process.env.PUBLIC_DIR) : repoPublicDir;

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
  const skipStaticPaths = ['/api', '/admin', '/health', '/diagnostic'];
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=== SERVER STARTED SUCCESSFULLY ===`);
  console.log(`Server listening on 0.0.0.0:${PORT}`);
  console.log(`Health: http://0.0.0.0:${PORT}/health`);
  console.log(`Diagnostic: http://0.0.0.0:${PORT}/diagnostic`);
  console.log(`API Test: http://0.0.0.0:${PORT}/api/test-direct`);
  console.log(`API Routes: http://0.0.0.0:${PORT}/api/test`);
  console.log(`Admin: http://0.0.0.0:${PORT}/admin`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`PORT: ${PORT}`);
  console.log(`Repo root: ${repoRoot}`);
  console.log(`Public (repo): ${repoPublicDir}`);
  console.log(`Public (persistent): ${persistentPublicDir}`);
  console.log(`========================================\n`);
  
  // Start memory monitoring (production diagnostics for OOM issues)
  const memoryMonitor = require('./services/memoryMonitor');
  memoryMonitor.startMonitoring();
});
