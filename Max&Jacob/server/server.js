require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
// Render používá PORT z environment variable, ne výchozí 3000
const PORT = process.env.PORT || 3000;
console.log('Starting server...');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Working directory:', process.cwd());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dní
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Trust proxy (pro správné IP adresy za reverse proxy)
app.set('trust proxy', 1);

// Debug: log all requests for diagnosis
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Path:', req.path);
  console.log('Starts with /api?', req.path.startsWith('/api'));
  console.log('Starts with /admin?', req.path.startsWith('/admin'));
  console.log('Is /health?', req.path === '/health');
  next();
});

// Routes - REGISTRUJEME JE ÚPLNĚ NA ZAČÁTKU, PŘED VŠÍM!
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');

// Test endpoint directly in server.js - NA ZAČÁTKU
app.get('/api/test-direct', (req, res) => {
  console.log('[Test Direct] Received request - WORKING!');
  res.json({ 
    status: 'Direct route works',
    path: '/api/test-direct',
    timestamp: new Date().toISOString(),
    server: 'working'
  });
});

// Health check endpoint - NA ZAČÁTKU
app.get('/health', (req, res) => {
  console.log('[Health Check] Received request - WORKING!');
  res.json({ 
    status: 'ok', 
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    server: 'working'
  });
});

// Debug: log all API requests
app.use('/api', (req, res, next) => {
  console.log('=== API REQUEST RECEIVED ===');
  console.log('[API Request]', req.method, req.path);
  console.log('[API Request] Full URL:', req.originalUrl);
  console.log('[API Request] Body:', req.body ? JSON.stringify(req.body).substring(0, 200) : 'empty');
  next();
});

// Routes - PŘED static files!
app.use('/api', contactRoutes);
app.use('/admin', adminRoutes);

// Static files - JEN pro non-API/admin/health routes
// Použijeme vlastní middleware, který explicitně kontroluje path
app.use((req, res, next) => {
  // Pokud je to API, admin nebo health route, NEPOKRAČUJEME ke static files
  if (req.path.startsWith('/api') || req.path.startsWith('/admin') || req.path === '/health') {
    console.log('[Static Files] SKIPPING for:', req.path);
    // Pokud jsme se dostali sem, znamená to, že žádný route neodpověděl
    // Vrátíme 404
    return res.status(404).json({ 
      error: 'Route not found',
      path: req.path,
      method: req.method,
      message: 'API route was not handled by any route handler'
    });
  }
  
  // Pro všechny ostatní cesty zkusíme servovat static file
  console.log('[Static Files] Trying to serve:', req.path);
  const staticFileHandler = express.static(path.join(__dirname, '..'), {
    fallthrough: false // Pokud soubor neexistuje, vrátíme 404
  });
  
  staticFileHandler(req, res, (err) => {
    if (err) {
      console.log('[Static Files] File not found:', req.path);
      return res.status(404).send('File not found');
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API test: http://localhost:${PORT}/api/test`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`PORT from env: ${process.env.PORT || 'not set, using default 3000'}`);
});


