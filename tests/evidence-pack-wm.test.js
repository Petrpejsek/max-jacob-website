const assert = require('assert');

const {
  generateEvidencePackV2
} = require('../server/services/auditPipeline');

function run() {
  // WM Plumbing fixture (JSON-LD with @graph, ImageObject logo, openingHours string, telePhone typo)
  const job = { niche: 'plumbing', city: 'Miami', input_url: 'https://wmplumbinginc.com/' };
  const crawledPages = [
    {
      url: 'https://wmplumbinginc.com/',
      page_type: 'home',
      title: 'WM Plumbing, Inc. - Miami Plumbing Services',
      og_site_name: null,
      h3_json: [
        'Septic Tank Maintenance',
        'Grease Traps Service',
        'Sewer Lines Repair',
        'Drain Cleaning',
        'Water Heaters Installation',
        'Emergency Repairs'
      ],
      h6_json: [
        'Professional septic tank services for residential and commercial properties',
        'Expert grease trap cleaning and maintenance',
        'Complete sewer line inspection and repair',
        'Fast and reliable drain cleaning services',
        'New water heater installation and replacement',
        '24/7 emergency plumbing repairs'
      ],
      text_snippet: 'WM Plumbing, Inc. Call us at (305) 555-1234 or (954) 555-6789. Email: info@wmplumbinginc.com. Get Started with a Free Estimate.',
      jsonld_extracted_json: {
        organization: {
          name: 'WM Plumbing, Inc.',
          logo: {
            '@type': 'ImageObject',
            url: 'https://wmplumbinginc.com/assets/logo.png',
            contentUrl: 'https://wmplumbinginc.com/assets/logo.png',
            width: 250,
            height: 80
          },
          sameAs: [],
          contactPoint: {}
        },
        website: { name: null },
        localbusiness: {
          name: 'WM Plumbing, Inc.',
          telePhone: '(305) 555-1234',
          address: {
            streetAddress: '456 Oak Avenue',
            addressLocality: 'Miami',
            addressRegion: 'FL',
            postalCode: '33125',
            addressCountry: 'US'
          },
          geo: { latitude: 25.7889, longitude: -80.2264 },
          openingHoursSpecification: 'Mo,Tu,We,Th,Fr,Sa,Su 07:00-19:00',
          aggregateRating: null,
          areaServed: []
        },
        offer_catalog_services: []
      },
      cta_candidates_json: [],
      forms_detailed_json: [],
      has_form: false,
      brand_assets_json: {
        logo_candidates: [
          { 
            url: 'https://wmplumbinginc.com/assets/logo.png', 
            source: 'jsonld_org_logo', 
            priority_score: 120, 
            width: 250, 
            height: 80 
          }
        ]
      },
      services_extracted_json: {}
    },
    {
      url: 'https://wmplumbinginc.com/contact',
      page_type: 'contact',
      title: 'Contact Us - WM Plumbing',
      og_site_name: null,
      text_snippet: 'Contact WM Plumbing, Inc. Call (305) 555-1234 or email info@wmplumbinginc.com',
      h3_json: [],
      h6_json: [],
      has_form: false,
      forms_detailed_json: [],
      cta_candidates_json: [],
      jsonld_extracted_json: {
        organization: { name: 'WM Plumbing, Inc.', logo: null, sameAs: [], contactPoint: {} },
        website: { name: null },
        localbusiness: { 
          name: 'WM Plumbing, Inc.', 
          telePhone: '(305) 555-1234',
          openingHoursSpecification: 'Mo,Tu,We,Th,Fr,Sa,Su 07:00-19:00' 
        },
        offer_catalog_services: []
      },
      brand_assets_json: { logo_candidates: [] },
      services_extracted_json: {}
    }
  ];

  const ep2 = generateEvidencePackV2(job, crawledPages, {});
  
  // Assertions
  assert(ep2, 'Evidence Pack v2 should be generated');
  assert.strictEqual(ep2.company_name, 'WM Plumbing, Inc.', 'company_name should be "WM Plumbing, Inc." from JSON-LD');
  assert.strictEqual(ep2.company_name_source, 'jsonld_organization', 'company_name_source should be jsonld_organization');
  
  assert(ep2.logo_url, 'logo_url should not be null');
  assert(ep2.logo_url.includes('logo.png'), 'logo_url should contain logo.png');
  assert.strictEqual(ep2.logo_source, 'jsonld_organization', 'logo_source should be jsonld_organization');
  
  assert(ep2.company_profile, 'company_profile should exist');
  assert(Array.isArray(ep2.company_profile.phones), 'phones should be array');
  assert(ep2.company_profile.phones.length >= 2, `phones should have at least 2 entries (got ${ep2.company_profile.phones.length})`);
  
  assert(Array.isArray(ep2.company_profile.emails), 'emails should be array');
  assert(ep2.company_profile.emails.length >= 1, `emails should have at least 1 entry (got ${ep2.company_profile.emails.length})`);
  const email = ep2.company_profile.emails[0];
  assert(email.address === 'info@wmplumbinginc.com', `email should be info@wmplumbinginc.com (got ${email.address})`);
  
  assert(ep2.company_profile.hours, 'hours should not be null');
  assert(ep2.company_profile.hours.value, 'hours.value should exist');
  // Hours are normalized to "7–19" format (short format without leading zeros)
  assert(ep2.company_profile.hours.value.includes('7') && ep2.company_profile.hours.value.includes('19'), 'hours should contain opening and closing times');
  assert(ep2.company_profile.hours.source === 'jsonld_openingHours', 'hours source should be jsonld_openingHours');
  
  assert(ep2.cta_map, 'cta_map should exist');
  assert(ep2.cta_map.primary_cta_text, 'primary_cta_text should not be null');
  assert(ep2.cta_map.primary_cta_text !== 'Home', 'primary_cta_text should not be "Home"');
  
  assert(ep2.services, 'services should exist');
  assert(Array.isArray(ep2.services.featured), 'services.featured should be array');
  assert(ep2.services.featured.length >= 5, `services.featured should have at least 5 entries (got ${ep2.services.featured.length})`);
  
  // Check some specific service titles
  const titles = ep2.services.featured.map(s => s.title.toLowerCase());
  assert(titles.some(t => t.includes('septic')), 'services should include Septic');
  assert(titles.some(t => t.includes('grease')), 'services should include Grease Traps');
  
  console.log('OK: evidence-pack-wm.test.js');
}

run();

