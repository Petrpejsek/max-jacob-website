/**
 * Search Service - Serper.dev API Integration
 * 
 * Provides Google and Bing search capabilities via Serper.dev API
 * - Supports geo-targeting (city-based searches)
 * - Rate limiting and error handling
 * - Retry logic with exponential backoff
 */

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const SERPER_API_URL = 'https://google.serper.dev/search';

const DEFAULT_EXCLUDED_DOMAINS = [
  // Social / forums
  'reddit.com',
  'facebook.com',
  'youtube.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  // Directories / lead-gen marketplaces
  'yelp.com',
  'angi.com',
  'homeadvisor.com',
  'thumbtack.com',
  'yellowpages.com'
];

const EXCLUDED_HOSTNAME_SUFFIXES = [
  '.gov',
  '.edu',
  '.mil'
];

function buildQueryWithExclusions(baseQuery) {
  const q = String(baseQuery || '').trim();
  if (!q) return q;

  // IMPORTANT:
  // Serper can reject queries with operators/negations (400 "Query not allowed").
  // We do exclusions via post-filtering instead of query operators.
  return q;
}

function getHostname(url) {
  try {
    const u = new URL(url);
    return (u.hostname || '').replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function hostnameMatches(hostname, domain) {
  if (!hostname) return false;
  const d = String(domain || '').toLowerCase();
  return hostname === d || hostname.endsWith('.' + d);
}

function hostnameHasExcludedSuffix(hostname) {
  if (!hostname) return false;
  return EXCLUDED_HOSTNAME_SUFFIXES.some((suf) => hostname.endsWith(String(suf).toLowerCase()));
}

function normalizeUrlForDedup(url) {
  try {
    const u = new URL(url);
    const host = (u.hostname || '').replace(/^www\./i, '').toLowerCase();
    const path = (u.pathname || '').replace(/\/+$/, '');
    return `https://${host}${path}`;
  } catch {
    return String(url || '').trim().toLowerCase();
  }
}

/**
 * Execute search via Serper.dev API
 * @param {string} query - Search query (e.g. "plumbing miami")
 * @param {object} options - Search options
 * @param {string} options.engine - 'google' or 'bing' (default: 'google')
 * @param {string} options.location - City/region for geo-targeting (e.g. "Miami, FL, United States")
 * @param {number} options.num - Number of results (default: 10, max: 100)
 * @param {number} options.page - Page number (default: 1)
 * @returns {Promise<object>} Search results
 */
async function search(query, options = {}) {
  if (!SERPER_API_KEY) {
    throw new Error('SERPER_API_KEY not configured. Please add it to your .env file.');
  }

  const {
    engine = 'google',
    location = null,
    num = 10,
    page = 1
  } = options;

  // Build request payload
  const payload = {
    q: query,
    num: Math.min(num, 100), // Serper limit is 100
    page: page
  };

  // Add location if provided (geo-targeting)
  if (location) {
    payload.location = location;
  }

  console.log('[SEARCH SERVICE] Query:', query);
  console.log('[SEARCH SERVICE] Options:', { engine, location, num, page });
  console.log('[SEARCH SERVICE] Payload:', payload);

  try {
    const response = await fetch(SERPER_API_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Serper API error (${response.status}) for query="${query}": ${errorText}`);
    }

    const data = await response.json();
    console.log('[SEARCH SERVICE] Results:', data.organic?.length || 0, 'organic results');

    return data;
  } catch (error) {
    console.error('[SEARCH SERVICE] Error:', error);
    throw error;
  }
}

/**
 * Search with retry logic (exponential backoff)
 * @param {string} query - Search query
 * @param {object} options - Search options
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<object>} Search results
 */
async function searchWithRetry(query, options = {}, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await search(query, options);
    } catch (error) {
      lastError = error;
      console.error(`[SEARCH SERVICE] Attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`[SEARCH SERVICE] Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw new Error(`Search failed after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Extract organic results from Serper response
 * @param {object} response - Serper API response
 * @returns {Array} Array of organic results with { url, title, snippet, position }
 */
function extractOrganicResults(response) {
  if (!response || !response.organic) {
    return [];
  }

  const raw = response.organic || [];
  const filtered = raw.filter((result) => {
    const url = result.link || result.url;
    if (!url) return false;
    const host = getHostname(url);
    if (hostnameHasExcludedSuffix(host)) {
      console.log('[SEARCH SERVICE] Filtered out excluded TLD:', url);
      return false;
    }
    const isExcluded = DEFAULT_EXCLUDED_DOMAINS.some((d) => hostnameMatches(host, d));
    if (isExcluded) {
      console.log('[SEARCH SERVICE] Filtered out excluded domain:', url);
    }
    return !isExcluded;
  });

  console.log('[SEARCH SERVICE] Organic raw:', raw.length, 'filtered:', filtered.length);

  return filtered.map((result, index) => ({
    url: result.link || result.url,
    title: result.title || '',
    description: result.snippet || '',
    position: result.position || index + 1
  }));
}

/**
 * Build geo-targeted location string
 * @param {string} city - City name (e.g. "Miami")
 * @param {string} state - State abbreviation (e.g. "FL") - optional
 * @param {string} country - Country (default: "United States")
 * @returns {string} Location string for Serper API
 */
function buildLocation(city, state = null, country = 'United States') {
  if (!city) return null;
  
  const parts = [city];
  if (state) parts.push(state);
  parts.push(country);
  
  return parts.join(', ');
}

/**
 * Search for businesses by niche and city
 * @param {string} niche - Business niche (e.g. "plumbing")
 * @param {string} city - City name (e.g. "Miami")
 * @param {number} count - Number of results (default: 10)
 * @returns {Promise<Array>} Array of business results
 */
async function searchBusinesses(niche, city, count = 10) {
  const baseQuery = city ? `${niche} ${city}` : niche;
  const query = buildQueryWithExclusions(baseQuery);
  const location = city ? buildLocation(city) : null;
  
  console.log('[SEARCH SERVICE] Searching businesses:', { niche, city, count, query });

  const MAX_PAGES = 5;
  const perPage = Math.min(100, Math.max(20, count * 3));

  const out = [];
  const seen = new Set();

  for (let page = 1; page <= MAX_PAGES && out.length < count; page++) {
    const response = await searchWithRetry(query, {
      engine: 'google',
      location,
      num: perPage,
      page
    });

    const results = extractOrganicResults(response);
    if (results.length === 0) break;

    for (const r of results) {
      const key = normalizeUrlForDedup(r.url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= count) break;
    }
  }

  console.log('[SEARCH SERVICE] Returning', out.length, '/', count, 'businesses');
  return out.slice(0, count);
}

/**
 * Validate Serper API key
 * @returns {Promise<boolean>} True if API key is valid
 */
async function validateApiKey() {
  if (!SERPER_API_KEY) {
    return false;
  }

  try {
    await search('test', { num: 1 });
    return true;
  } catch (error) {
    console.error('[SEARCH SERVICE] API key validation failed:', error.message);
    return false;
  }
}

module.exports = {
  search,
  searchWithRetry,
  extractOrganicResults,
  buildLocation,
  searchBusinesses,
  validateApiKey
};
