/**
 * Security middleware for production
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

/**
 * Rate limiter for admin login
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Only count failed attempts
});

/**
 * Rate limiter for audit job creation
 */
const auditJobLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // Max 3 audit jobs per minute
  message: { error: 'Too many audit requests. Please wait before creating more.' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Helmet configuration for security headers
 */
function getHelmetConfig() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Needed for EJS + inline scripts
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "http:"], // Allow external images (screenshots)
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    frameguard: {
      action: 'sameorigin' // Allow iframes from same origin (homepage preview)
    },
    noSniff: true,
    xssFilter: true
  });
}

/**
 * Validate SESSION_SECRET in production
 */
function validateSessionSecret() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SESSION_SECRET) {
      console.error('FATAL: SESSION_SECRET must be set in production!');
      process.exit(1);
    }
    if (process.env.SESSION_SECRET === 'fallback-secret-change-in-production') {
      console.error('FATAL: SESSION_SECRET is still using fallback value!');
      process.exit(1);
    }
    if (process.env.SESSION_SECRET.length < 32) {
      console.error('FATAL: SESSION_SECRET must be at least 32 characters!');
      process.exit(1);
    }
  }
}

module.exports = {
  loginLimiter,
  auditJobLimiter,
  getHelmetConfig,
  validateSessionSecret
};
