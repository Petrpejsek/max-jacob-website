require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('=== SERVER STARTING ===');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Working directory:', process.cwd());
console.log('__dirname:', __dirname);

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Trust proxy
app.set('trust proxy', 1);

// Request logging - ÚPLNĚ NA ZAČÁTKU
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Path:', req.path);
  next();
});

// Load routes modules
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');

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

// HEALTH CHECK
app.all('/health', (req, res) => {
  console.log('[HEALTH] Request received:', req.method, req.path);
  res.json({ 
    status: 'ok', 
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    server: 'express'
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
app.use('/admin', adminRoutes);

// ========================================
// STATIC FILES - ÚPLNĚ NA KOŇCI!
// ========================================

const staticPath = path.join(__dirname, '..');
console.log('[SERVER] Static files path:', staticPath);

// Static files middleware - pouze pokud request NENÍ API/admin/health/diagnostic
app.use((req, res, next) => {
  // Explicitní seznam paths, které NIKDY neservujeme jako static files
  const skipStaticPaths = ['/api', '/admin', '/health', '/diagnostic'];
  const shouldSkip = skipStaticPaths.some(skipPath => req.path.startsWith(skipPath) || req.path === skipPath);
  
  if (shouldSkip) {
    console.log('[STATIC] Skipping static files for:', req.path);
    // Pokud jsme se sem dostali a žádný route neodpověděl, je to 404
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
  
  // Pro ostatní cesty zkus servovat static file
  console.log('[STATIC] Attempting to serve static file:', req.path);
  const staticMiddleware = express.static(staticPath, { fallthrough: false });
  
  staticMiddleware(req, res, (err) => {
    if (err) {
      console.log('[STATIC] File not found:', req.path, err.message);
      if (!res.headersSent) {
        res.status(404).send('File not found');
      }
    }
  });
});

// Start server
// KRITICKÉ: Na Renderu musí server naslouchat na 0.0.0.0, ne jen localhost!
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=== SERVER STARTED SUCCESSFULLY ===`);
  console.log(`Server naslouchá na 0.0.0.0:${PORT}`);
  console.log(`Health: http://0.0.0.0:${PORT}/health`);
  console.log(`Diagnostic: http://0.0.0.0:${PORT}/diagnostic`);
  console.log(`API Test: http://0.0.0.0:${PORT}/api/test-direct`);
  console.log(`API Routes: http://0.0.0.0:${PORT}/api/test`);
  console.log(`Admin: http://0.0.0.0:${PORT}/admin`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`PORT: ${PORT}`);
  console.log(`Static files path: ${staticPath}`);
  console.log(`========================================\n`);
});
