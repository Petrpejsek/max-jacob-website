function sanitizeName(s, maxLen = 200) {
  const t = (s || '').toString().trim();
  if (!t) return null;
  const cleaned = t.replace(/\s+/g, ' ').slice(0, maxLen);
  return cleaned || null;
}

function stripMaxJacobSuffix(s) {
  const t = sanitizeName(s, 400);
  if (!t) return null;
  // Remove outreach-subject style suffixes like "x Max & Jacob" (and common variants)
  return t
    .replace(/\s*[x×]\s*max\s*&\s*jacob\s*$/i, '')
    .replace(/\s*-\s*max\s*&\s*jacob\s*$/i, '')
    .replace(/\s*—\s*max\s*&\s*jacob\s*$/i, '')
    .replace(/\s*\|\s*max\s*&\s*jacob\s*$/i, '')
    .trim();
}

function stripPhoneLikeText(s) {
  const t = sanitizeName(s, 400);
  if (!t) return null;
  // Remove telephone emoji and common phone patterns.
  // Examples: "📞 (813) 443-5820", "(813)443-5820", "813-443-5820", "813.443.5820"
  const phoneRe = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
  return t
    .replace(/📞/g, ' ')
    .replace(phoneRe, ' ')
    // Clean up dangling punctuation left after phone removal
    .replace(/\(\s*\)/g, ' ')
    .replace(/\[\s*\]/g, ' ')
    .replace(/[()]+$/g, ' ')
    .replace(/[-–—|•·]+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAfterCommonSeparators(s) {
  const t = sanitizeName(s, 400);
  if (!t) return null;
  // Split on common marketing separators (spaced versions only).
  // Keep only the first segment, which is typically the brand name.
  const parts = t.split(/\s+\|\s+|\s+—\s+|\s+–\s+|\s+-\s+|\s+•\s+|\s+·\s+/);
  return sanitizeName(parts[0], 240);
}

function stripDirectoryStylePrefix(s) {
  const t = sanitizeName(s, 400);
  if (!t) return null;
  // Directory/listing titles often look like "Plumbers Tampa: Olin Plumbing ..."
  // If left side looks like a service/location phrase, prefer the right side.
  const idx = t.indexOf(':');
  if (idx <= 0 || idx > 50) return t;
  const left = t.slice(0, idx).trim();
  const right = t.slice(idx + 1).trim();
  if (!right) return t;

  const leftLower = left.toLowerCase();
  const serviceTerms = [
    'plumber',
    'plumbers',
    'plumbing',
    'hvac',
    'electric',
    'electrical',
    'roof',
    'roofing',
    'pest',
    'landscaping',
    'contractor',
    'contractors',
  ];
  const looksServicey = serviceTerms.some((term) => leftLower.includes(term));
  const looksDirectoryy = /\b(best|top|near me|in\s+[a-z]|[a-z]+\s+[a-z]+)\b/i.test(left);
  if (looksServicey || looksDirectoryy) return right;
  return t;
}

function normalizeCompanyNameCandidate(raw) {
  let s = sanitizeName(raw, 400);
  if (!s) return null;

  // Remove obvious outreach suffix leakage first
  s = stripMaxJacobSuffix(s) || s;

  // Prefer brand-only segment over location/service suffixes
  s = stripAfterCommonSeparators(s) || s;

  // Handle directory-style prefixes ("Plumbers Tampa: ...")
  s = stripDirectoryStylePrefix(s) || s;

  // Remove phone-like text last (so it doesn't break separator detection)
  s = stripPhoneLikeText(s) || s;

  // Final cleanup
  s = sanitizeName(s, 200);
  return s || null;
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
  return normalizeCompanyNameCandidate(first);
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
  const s = normalizeCompanyNameCandidate(name);
  if (!s) return false;

  // Hard limits: titles and service lists tend to be very long.
  if (s.length > 110) return false;

  // Reject obvious non-company artifacts
  if (/\bmax\s*&\s*jacob\b/i.test(s)) return false;
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(s)) return false;
  if (/[|]/.test(s)) return false;
  if (/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(s)) return false;

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
    { value: normalizeCompanyNameCandidate(orgName), source: 'jsonld_organization' },
    { value: normalizeCompanyNameCandidate(localName), source: 'jsonld_localbusiness' },
    // Prefer OG site name over WebSite.name (OG is often curated brand)
    { value: normalizeCompanyNameCandidate(ogSiteName), source: 'og_site_name' },
    { value: normalizeCompanyNameCandidate(webName), source: 'jsonld_website' },
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
  normalizeCompanyNameCandidate,
  normalizeHtmlTitleCandidate,
  prettyNameFromDomainLabel,
  deriveDomainFallbackName,
  isLikelyBusinessName,
  pickCompanyNameFromSignals,
};

