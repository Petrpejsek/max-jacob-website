/**
 * URL utilities shared across pipelines.
 *
 * Goal: accept human-entered website URLs robustly (with/without scheme),
 * normalize for storage/deduplication, and reject dangerous/non-web schemes.
 */
 
function normalizeWebsiteUrl(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Remove common accidental wrapping.
  s = s.replace(/^<+/, '').replace(/>+$/, '').trim();

  // Remove internal whitespace (copy/paste often inserts newlines/spaces).
  s = s.replace(/\s+/g, '');

  // Add scheme if missing.
  // - "//example.com" -> "https://example.com"
  // - "example.com" -> "https://example.com"
  // - "http://..." or "https://..." stays
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s);
  if (!hasScheme) {
    if (s.startsWith('//')) s = `https:${s}`;
    else s = `https://${s}`;
  }

  let url;
  try {
    url = new URL(s);
  } catch (e) {
    // Keep error message short and user-friendly.
    throw new Error('Invalid website URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Website URL must start with http:// or https://');
  }

  // Strip hash and common tracking params.
  url.hash = '';
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach((k) =>
    url.searchParams.delete(k)
  );

  // Normalize hostname casing and trim trailing slash (except root).
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}

module.exports = { normalizeWebsiteUrl };

