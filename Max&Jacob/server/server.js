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

// Load routes
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');

// HEALTH CHECK - ÚPLNĚ NA ZAČÁTKU, PŘED VŠÍM
app.get('/health', (req, res) => {
  console.log('[HEALTH] Request received');
  res.json({ 
    status: 'ok', 
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// TEST ENDPOINT - ÚPLNĚ NA ZAČÁTKU
app.get('/api/test-direct', (req, res) => {
  console.log('[TEST-DIRECT] Request received');
  res.json({ 
    status: 'Direct route works',
    path: '/api/test-direct',
    timestamp: new Date().toISOString()
  });
});

// API logging middleware
app.use('/api', (req, res, next) => {
  console.log('[API] Request:', req.method, req.path);
  next();
});

// Register routes - PŘED static files
app.use('/api', contactRoutes);
app.use('/admin', adminRoutes);

// Static files - POUZE PRO NON-API/ADMIN/HEALTH ROUTES
// Použijeme conditional middleware
app.use((req, res, next) => {
  // Pokud je to API, admin nebo health, NIKDY neservuj static file
  if (req.path.startsWith('/api') || req.path.startsWith('/admin') || req.path === '/health') {
    console.log('[STATIC] Skipping - this is an API/admin/health route');
    // Pokud jsme se sem dostali, žádný route handler neodpověděl
    // To znamená, že route neexistuje
    if (!res.headersSent) {
      res.status(404).json({
        error: 'Route not found',
        path: req.path,
        method: req.method
      });
    }
    return;
  }
  
  // Pro ostatní cesty zkus servovat static file
  console.log('[STATIC] Attempting to serve:', req.path);
  express.static(path.join(__dirname, '..'))(req, res, (err) => {
    if (err) {
      console.log('[STATIC] Error:', err.message);
      if (!res.headersSent) {
        res.status(404).send('File not found');
      }
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n=== SERVER STARTED ===`);
  console.log(`Server běží na portu ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`API Test: http://localhost:${PORT}/api/test-direct`);
  console.log(`API Routes: http://localhost:${PORT}/api/test`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`========================\n`);
});
