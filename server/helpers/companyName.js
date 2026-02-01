function sanitizeName(s, maxLen = 200) {
  const t = (s || '').toString().trim();
  if (!t) return null;
  const cleaned = t.replace(/\s+/g, ' ').slice(0, maxLen);
  return cleaned || null;
}

function titleCaseWords(s) {
  const str = (s || '').toString().trim();
  if (!str) return str;
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      // Preserve ALLCAPS acronyms (2-4 chars) like "HVAC"
      if (/^[A-Z0-9]{2,4}$/.test(w)) return w;
      return w.length ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : w;
    })
    .join(' ')
    .trim();
}

function normalizeHtmlTitleCandidate(rawTitle) {
  const t = sanitizeName(rawTitle, 300);
  if (!t) return null;
  // Common separators: "Name | Tagline", "Name - Tagline", "Name — Tagline"
  const first =
    t.split('|')[0]
      .split(' — ')[0]
      .split(' - ')[0]
      .trim();
  return sanitizeName(first, 200);
}

function prettyNameFromDomainLabel(label) {
  const raw = sanitizeName(label, 200);
  if (!raw) return null;
  // Convert "miami-dade-plumbing" -> "Miami Dade Plumbing"
  const spaced = raw
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, '')
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitizeName(titleCaseWords(spaced), 200);
}

function deriveDomainFallbackName(inputUrl) {
  const raw = (inputUrl || '').toString().trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = (u.hostname || '').replace(/^www\./i, '');
    if (!host) return null;
    const parts = host.split('.').filter(Boolean);
    const base = parts.length <= 1 ? host : (parts.slice(0, -1).join('.') || host);
    return prettyNameFromDomainLabel(base);
  } catch {
    const hostish = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || raw;
    const base = hostish.split('.').slice(0, -1).join('.') || hostish;
    return prettyNameFromDomainLabel(base);
  }
}

function isLikelyBusinessName(name) {
  const s = sanitizeName(name, 240);
  if (!s) return false;

  // Hard limits: titles and service lists tend to be very long.
  if (s.length > 110) return false;

  // Service-list titles often contain multiple commas.
  const commaCount = (s.match(/,/g) || []).length;
  if (commaCount >= 2) return false;

  // "Service-list-ish" heuristic: many words + multiple service terms.
  const words = s.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lower = s.toLowerCase();

  const serviceTerms = [
    'emergency',
    'same day',
    'service',
    'services',
    'repair',
    'repairs',
    'installation',
    'install',
    'replacement',
    'plumbing',
    'plumber',
    'hvac',
    'electric',
    'electrical',
    'roof',
    'roofing',
    'pest control',
    'landscaping',
  ];
  const serviceHitCount = serviceTerms.reduce((acc, term) => acc + (lower.includes(term) ? 1 : 0), 0);
  if (wordCount >= 7 && serviceHitCount >= 2) return false;

  // Avoid common "page title" / generic placeholders
  const genericTitles = new Set([
    'home',
    'homepage',
    'welcome',
    'welcome to',
    'official site',
    'index',
  ]);
  if (genericTitles.has(lower)) return false;

  return true;
}

function pickCompanyNameFromSignals({ orgName, localName, webName, ogSiteName, htmlTitle, inputUrl }) {
  const candidates = [
    { value: sanitizeName(orgName), source: 'jsonld_organization' },
    { value: sanitizeName(localName), source: 'jsonld_localbusiness' },
    // Prefer OG site name over WebSite.name (OG is often curated brand)
    { value: sanitizeName(ogSiteName), source: 'og_site_name' },
    { value: sanitizeName(webName), source: 'jsonld_website' },
    // Domain fallback is safer than a long marketing title
    { value: deriveDomainFallbackName(inputUrl), source: 'domain_fallback' },
    { value: normalizeHtmlTitleCandidate(htmlTitle), source: 'html_title' },
  ];

  for (const c of candidates) {
    if (!c.value) continue;
    if (c.source === 'domain_fallback') return { name: c.value, source: c.source };
    if (isLikelyBusinessName(c.value)) return { name: c.value, source: c.source };
  }

  // Absolute last resort
  return { name: deriveDomainFallbackName(inputUrl) || 'Your Company', source: 'domain_fallback' };
}

module.exports = {
  sanitizeName,
  normalizeHtmlTitleCandidate,
  prettyNameFromDomainLabel,
  deriveDomainFallbackName,
  isLikelyBusinessName,
  pickCompanyNameFromSignals,
};

