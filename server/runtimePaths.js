const path = require('path');

/**
 * Centralized runtime paths for production safety.
 *
 * Defaults assume the app is started from repo root:
 *   node server/server.js
 *
 * Override via env vars in production:
 * - PUBLIC_DIR: absolute path to persistent public assets root (served at /public)
 * - DB_PATH: absolute path to SQLite database file
 */

function getRepoRoot() {
  // Allow override for unusual process managers
  return process.env.REPO_ROOT ? path.resolve(process.env.REPO_ROOT) : process.cwd();
}

function getRepoPublicDir() {
  return path.join(getRepoRoot(), 'public');
}

function getPersistentPublicDir() {
  return process.env.PUBLIC_DIR ? path.resolve(process.env.PUBLIC_DIR) : getRepoPublicDir();
}

function getSqliteDbPath() {
  // Default stays backward-compatible for local dev, but production should set DB_PATH.
  return process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(getRepoRoot(), 'data.db');
}

module.exports = {
  getRepoRoot,
  getRepoPublicDir,
  getPersistentPublicDir,
  getSqliteDbPath
};

