/**
 * Render/production safety: ensure Playwright browsers are installed.
 *
 * Problem (Render):
 * - Playwright may look for browsers in /opt/render/cache/ms-playwright (or similar)
 * - If browsers aren't downloaded during build, runtime fails with:
 *   "browserType.launch: Executable doesn't exist ..."
 *
 * Fix:
 * - On Linux + production, download Chromium during install.
 * - Force PLAYWRIGHT_BROWSERS_PATH=0 so browsers live inside node_modules and
 *   are available in runtime (no dependency on Render cache).
 */
const { execSync } = require('child_process');

function shouldInstall() {
  // Only do this on Linux production builds (Render).
  if (process.platform !== 'linux') return false;
  if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') return false;
  return true;
}

function main() {
  if (!shouldInstall()) {
    console.log('[postinstall] Skipping Playwright browser install (not linux production).');
    return;
  }

  console.log('[postinstall] Installing Playwright Chromium for production...');

  // Ensure browsers are installed inside node_modules (bundled with the app),
  // rather than in a cache directory that may not exist at runtime.
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' };

  try {
    execSync('npx playwright install chromium', { stdio: 'inherit', env });
    console.log('[postinstall] Playwright Chromium install complete.');
  } catch (err) {
    console.error('[postinstall] Playwright Chromium install FAILED.');
    process.exit(1);
  }
}

main();

