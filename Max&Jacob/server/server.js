require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Debug: log all API requests (PŘED static files, aby se API routes neprepisovaly)
app.use('/api', (req, res, next) => {
  console.log('[API Request]', req.method, req.path, req.body ? JSON.stringify(req.body).substring(0, 100) : '');
  next();
});

// Routes (PŘED static files!)
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');

app.use('/api', contactRoutes);
app.use('/admin', adminRoutes);

// Static files - servirování současného webu (PO routes, aby se nepřepisovaly API routes)
app.use(express.static(path.join(__dirname, '..')));

// Start server
app.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});


