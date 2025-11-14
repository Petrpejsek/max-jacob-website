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

// Routes (PŘED static files!) - kritické pro správné fungování
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');

// Debug: log all API requests (PŘED routes, aby se všechny API requests logovaly)
app.use('/api', (req, res, next) => {
  console.log('=== API REQUEST RECEIVED ===');
  console.log('[API Request]', req.method, req.path);
  console.log('[API Request] Full URL:', req.originalUrl);
  console.log('[API Request] Headers:', JSON.stringify(req.headers));
  console.log('[API Request] Body:', req.body ? JSON.stringify(req.body).substring(0, 200) : 'empty');
  console.log('[API Request] IP:', req.ip);
  next();
});

app.use('/api', contactRoutes);
app.use('/admin', adminRoutes);

// Health check endpoint (PO routes, ale před static files)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Static files - servirování současného webu (NA KOŇCI, jako catch-all)
// Pouze pro GET requesty, které nejsou API, admin nebo health
app.get('*', (req, res, next) => {
  // Pokud je to API nebo admin route, přeskočíme static files (mělo by být už obslouženo)
  if (req.path.startsWith('/api') || req.path.startsWith('/admin') || req.path === '/health') {
    console.log('[Static Files] Skipping static files for:', req.path);
    return next(); // Možná 404, ale nebudeme servovat static file
  }
  // Jinak servuj static file
  console.log('[Static Files] Serving static file:', req.path);
  express.static(path.join(__dirname, '..'))(req, res, (err) => {
    if (err) {
      console.error('[Static Files] Error serving:', req.path, err.message);
      next();
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


