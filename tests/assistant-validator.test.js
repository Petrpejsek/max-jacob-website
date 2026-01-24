const assert = require('assert');

const { validateAssistantOutput } = require('../server/services/outputValidator');

function validateOk(assistant_key, requiresEvidence, output_json) {
  const assistant = {
    key: assistant_key,
    requires_evidence_refs: requiresEvidence ? 1 : 0
  };
  const res = validateAssistantOutput(assistant, output_json);
  assert(res.valid, `Expected valid output for ${assistant_key}. Errors: ${res.errors.join('; ')}`);
}

function validateBad(assistant_key, requiresEvidence, output_json, expectedSubstring) {
  const assistant = {
    key: assistant_key,
    requires_evidence_refs: requiresEvidence ? 1 : 0
  };
  const res = validateAssistantOutput(assistant, output_json);
  assert(!res.valid, `Expected invalid output for ${assistant_key}`);
  if (expectedSubstring) {
    assert(
      res.errors.some((e) => String(e).includes(expectedSubstring)),
      `Expected an error containing "${expectedSubstring}". Got: ${res.errors.join(' | ')}`
    );
  }
}

function run() {
  // A1 (Evidence Normalizer)
  const a1 = {
    company_profile: {
      name: 'Acme Plumbing',
      phones: ['(305) 555-1234'],
      emails: ['info@acmeplumbing.com'],
      address: { street: null, city: 'Miami', region: 'FL', postal: null, country: 'US' },
      hours: null,
      // Include URL-encoded values (e.g. "%20") to ensure compliance validator
      // does NOT misclassify percent-encoding as "growth percentages".
      social_links: [
        'https://facebook.com/acmeplumbing',
        'https://www.google.com/maps/search/?api=1&query=605%20Lincoln%20Rd%20Suite%20250%2C%20Miami%20Beach%2C%20FL'
      ]
    },
    services: {
      featured: [
        { title: 'Drain Cleaning', description: 'Clog removal', source_page: 'https://example.com/services' }
      ],
      other_keywords: ['drain cleaning']
    },
    cta_analysis: {
      primary: { text: 'Call Now', intent: 'call', location: 'above_fold' },
      all_ctas: [{ text: 'Call Now', intent: 'call', above_fold: true }]
    },
    trust_evidence: [{ type: 'years_in_business', value: '10+ years', snippet: 'Serving since 2014' }],
    contact_friction: { phone_in_header: true, phone_clickable: true, clicks_to_contact: 1, form_detected: false },
    quality_warnings: [{ code: 'WARN_NOTE', severity: 'low', message: 'Test warning' }]
  };
  validateOk('evidence_normalizer', false, a1);
  validateBad('evidence_normalizer', false, { company_profile: {} }, 'Missing required key');

  // A2 (UX Conversion Auditor) - evidence required
  const a2 = {
    top_issues: [
      {
        problem: 'Phone number not clickable',
        evidence_ref: ['llm_context.contact_friction.phone_clickable: false'],
        fix_steps: ['Add a tel: link to the header phone number'],
        why_it_matters: 'Make it easy for local customers to call',
        severity: 'high'
      }
    ],
    quick_wins: ['Make the phone clickable in the header'],
    mobile_issues: [
      {
        problem: 'CTA not visible on mobile above the fold',
        evidence_ref: ['screenshots.refs.mobile_above_fold'],
        fix: 'Make the primary CTA sticky on mobile'
      }
    ]
  };
  validateOk('ux_conversion_auditor', true, a2);
  validateBad('ux_conversion_auditor', true, { ...a2, top_issues: [{ ...a2.top_issues[0], evidence_ref: [] }] }, 'evidence_ref array is empty');
  validateBad('ux_conversion_auditor', true, { ...a2, top_issues: [{ ...a2.top_issues[0], evidence_ref: ['llm_context not searched'] }] }, 'Invalid prefix');

  // Compliance: percent sign should be blocked
  validateBad(
    'ux_conversion_auditor',
    true,
    {
      ...a2,
      top_issues: [
        {
          ...a2.top_issues[0],
          why_it_matters: 'This will increase leads by 30%'
        }
      ]
    },
    'Compliance violation'
  );

  // A3 (Local SEO & GEO Auditor) - evidence required
  const a3 = {
    nap_audit: {
      status: 'partial',
      issues: [
        {
          problem: 'Phone missing from NAP',
          evidence_ref: ['llm_context.company_profile.phones.length: 0'],
          fix: 'Add a visible phone number in header and footer',
          impact: 'Inconsistent NAP reduces local trust signals'
        }
      ]
    },
    local_signals: {
      city_mentions: {
        count: 0,
        evidence_ref: ['raw_dump.pages[0].title: (scan for job.city found 0 matches)'],
        recommendation: 'Add city name to H1, title, and first paragraph'
      },
      service_area: {
        detected: false,
        evidence_ref: ['llm_context.company_profile.address.city: null'],
        recommendation: 'Add a service area section listing cities you serve'
      }
    },
    schema_markup: {
      local_business: {
        present: false,
        evidence_ref: ['raw_dump.jsonld_raw.length: 0'],
        missing_fields: ['telephone']
      }
    },
    geo_ready_score: {
      score: 40,
      factors: [
        { factor: 'NAP complete', points: 25, earned: 0, evidence_ref: ['llm_context.company_profile.phones.length: 0'] }
      ]
    }
  };
  validateOk('local_seo_geo_auditor', true, a3);
  validateBad('local_seo_geo_auditor', true, { ...a3, nap_audit: { status: 'partial', issues: [{}] } }, 'Missing evidence_ref field');

  console.log('OK: assistant-validator.test.js');
}

run();

