const assert = require('assert');

const {
  generateEvidencePackV2,
  generateEvidencePack
} = require('../server/services/auditPipeline');

function build247Spec() {
  const days = [
    'https://schema.org/Monday',
    'https://schema.org/Tuesday',
    'https://schema.org/Wednesday',
    'https://schema.org/Thursday',
    'https://schema.org/Friday',
    'https://schema.org/Saturday',
    'https://schema.org/Sunday'
  ];
  return days.map(d => ({ dayOfWeek: d, opens: '00:00:00', closes: '23:59:00' }));
}

function run() {
  // Evidence Pack v2 fixture (Scraper v3-style pages)
  const job = { niche: 'plumbing', city: 'Miami', input_url: 'https://empireplumbing.com/' };
  const crawledPages = [
    {
      url: 'https://empireplumbing.com/',
      page_type: 'home',
      title: 'Empire Plumbing | Home',
      og_site_name: 'Empire Plumbing',
      jsonld_extracted_json: {
        organization: {
          name: 'Empire Plumbing',
          logo: 'https://empireplumbing.com/logo.png',
          sameAs: [],
          contactPoint: {}
        },
        website: { name: 'Empire Plumbing' },
        localbusiness: {
          name: 'Empire Plumbing',
          image: 'https://empireplumbing.com/logo.png',
          address: {
            streetAddress: '123 Main St',
            addressLocality: 'Miami',
            addressRegion: 'FL',
            postalCode: '33101',
            addressCountry: 'US'
          },
          geo: { latitude: 25.7617, longitude: -80.1918 },
          openingHoursSpecification: build247Spec()
        },
        offer_catalog_services: []
      },
      cta_candidates_json: [
        // Nav item (should never become primary)
        { text: 'Home', href: '/', cta_intent: 'other', target_type: 'internal', is_in_nav: true, is_above_fold_desktop: true, is_above_fold_mobile: true, page_url: 'https://empireplumbing.com/', dom_debug_selector: 'a.nav' },
        // Real CTA
        { text: 'Call Now', href: 'tel:+13055551234', cta_intent: 'call', target_type: 'tel', is_in_nav: false, is_above_fold_desktop: true, is_above_fold_mobile: true, page_url: 'https://empireplumbing.com/', dom_debug_selector: 'a.btn' }
      ],
      forms_detailed_json: [],
      has_form: false,
      text_snippet: 'Welcome to Empire Plumbing',
      brand_assets_json: {
        logo_candidates: [
          { url: 'https://empireplumbing.com/logo.png', source: 'jsonld_org_logo', priority_score: 120, width: 200, height: 60 }
        ]
      }
    },
    {
      url: 'https://empireplumbing.com/contact',
      page_type: 'contact',
      title: 'Contact | Empire Plumbing',
      og_site_name: 'Empire Plumbing',
      text_snippet: 'Name Email Phone Message Send Leave this field blank',
      has_form: true,
      forms_detailed_json: [],
      cta_candidates_json: [],
      jsonld_extracted_json: {
        organization: { name: 'Empire Plumbing', logo: 'https://empireplumbing.com/logo.png', sameAs: [], contactPoint: {} },
        website: { name: 'Empire Plumbing' },
        localbusiness: { name: 'Empire Plumbing', openingHoursSpecification: build247Spec() },
        offer_catalog_services: []
      },
      brand_assets_json: { logo_candidates: [] }
    }
  ];

  const ep2 = generateEvidencePackV2(job, crawledPages, {});
  assert(ep2, 'Evidence Pack v2 should be generated');
  assert(ep2.company_name, 'company_name should not be null');
  assert.strictEqual(ep2.company_name_source, 'jsonld_organization', 'company_name_source should prefer JSON-LD Organization.name');
  assert(ep2.contact_form && ep2.contact_form.contact_form_detected === true, 'contact_form_detected should be true');
  assert(ep2.cta_map && ep2.cta_map.primary && ep2.cta_map.primary.text !== 'Home', 'primary CTA must not be a nav item (Home)');
  assert(ep2.company_profile && ep2.company_profile.hours && ep2.company_profile.hours.value === '24/7', 'hours should be 24/7');
  assert(ep2.company_profile && ep2.company_profile.social_links && Array.isArray(ep2.company_profile.social_links.google_maps) && ep2.company_profile.social_links.google_maps.length > 0, 'google_maps should be generated');
  assert.strictEqual(ep2.logo_source, 'jsonld_organization', 'logo_source should be jsonld_organization for Empire');

  // Evidence Pack v1 fixture (legacy pack)
  const v1Scrape = {
    title: 'Empire Plumbing | Home',
    og_site_name: 'Empire Plumbing',
    layout_summary: { has_primary_cta_above_fold: true, primary_cta_text: 'Call Now', primary_cta_source: 'tel', contact_form_detected: false, contact_page_detected: true },
    ctas: ['Call Now', 'Contact'],
    contacts: {
      phones: [],
      emails: [],
      address: { value: '123 Main St, Miami, FL 33101', source: 'jsonld' },
      hours: { value: '24/7', source: 'jsonld_openingHoursSpecification' },
      social_links: { google_maps: [] }
    },
    contacts_debug: {}
  };
  const v1RawDump = {
    structured_data_jsonld: [
      { '@type': 'Organization', name: 'Empire Plumbing', logo: 'https://empireplumbing.com/logo.png' },
      { '@type': 'WebSite', name: 'Empire Plumbing' }
    ],
    contact_text_snippet: 'Name Email Phone Message Send Leave this field blank'
  };
  const ep1 = generateEvidencePack(job, v1Scrape, v1RawDump, {});
  assert(ep1, 'Evidence Pack v1 should be generated');
  assert(ep1.company_name, 'v1 company_name should not be null');
  assert.strictEqual(ep1.company_name_source, 'jsonld_organization', 'v1 company_name_source should prefer JSON-LD Organization.name');
  assert(ep1.contact_friction && ep1.contact_friction.contact_form_detected === true, 'v1 contact_form_detected should be true from contact text');
  assert(ep1.cta_map && ep1.cta_map.primary && ep1.cta_map.primary.text !== 'Home', 'v1 primary CTA must not be Home');
  assert(ep1.logo_source, 'v1 logo_source should be set');

  console.log('OK: evidence-pack-empire.test.js');
}

run();


