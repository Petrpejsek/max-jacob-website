/**
 * Payload Builders for LLM Assistants v1
 * 
 * Each assistant has a specific payload structure based on:
 * - Required input data
 * - Dependencies on previous assistant outputs
 * - Evidence Pack v2 format
 */

function normalizeScreenshotsForAssistants(screenshots = {}) {
  const s = (screenshots && typeof screenshots === 'object') ? screenshots : {};

  // Scraper v2 keys: above_fold, fullpage, mobile
  // Scraper v3 keys: desktop_above_fold, desktop_full, mobile_above_fold
  const above_fold = s.above_fold || s.desktop_above_fold || null;
  const fullpage = s.fullpage || s.desktop_full || null;
  const mobile_above_fold = s.mobile_above_fold || s.mobile || null;

  return {
    refs: {
      above_fold,
      fullpage,
      mobile_above_fold,
      contact_page: s.contact_page || null,
      services_page: s.services_page || null,
      reviews_page: s.reviews_page || null
    },
    available: {
      above_fold: !!above_fold,
      fullpage: !!fullpage,
      mobile: !!mobile_above_fold,
      contact_page: !!s.contact_page,
      services_page: !!s.services_page,
      reviews_page: !!s.reviews_page
    }
  };
}

function trimRawDumpForAssistants(raw_dump) {
  if (!raw_dump || typeof raw_dump !== 'object') return null;

  const pages = Array.isArray(raw_dump.pages) ? raw_dump.pages : [];
  const trimmedPages = pages.slice(0, 8).map((p) => {
    const headings = (p && p.headings && typeof p.headings === 'object') ? p.headings : {};
    const links_summary = (p && p.links_summary && typeof p.links_summary === 'object') ? p.links_summary : {};

    return {
      page_url: p.page_url || null,
      page_type: p.page_type || null,
      title: p.title || null,
      meta_description: p.meta_description || null,
      canonical: p.canonical || null,
      headings: {
        h1: headings.h1 || null,
        h2: Array.isArray(headings.h2) ? headings.h2.slice(0, 10) : [],
        h3: Array.isArray(headings.h3) ? headings.h3.slice(0, 15) : [],
        h6: Array.isArray(headings.h6) ? headings.h6.slice(0, 15) : []
      },
      word_count: Number.isFinite(p.word_count) ? p.word_count : 0,
      text_snippet: p.text_snippet ? String(p.text_snippet).slice(0, 1200) : null,
      links_summary: {
        tel_links: Array.isArray(links_summary.tel_links) ? links_summary.tel_links.slice(0, 8) : [],
        internal_important_links: Array.isArray(links_summary.internal_important_links)
          ? links_summary.internal_important_links.slice(0, 12)
          : []
      }
    };
  });

  return {
    version: raw_dump.version || null,
    pages: trimmedPages,
    jsonld_raw: Array.isArray(raw_dump.jsonld_raw) ? raw_dump.jsonld_raw.slice(0, 20) : [],
    jsonld_extracted: raw_dump.jsonld_extracted || null
  };
}

/**
 * A1: Evidence Normalizer
 * 
 * Input: Raw scrape data (evidence_pack_v2, raw_dump, screenshots)
 * Output: llm_context_json + quality_warnings
 * 
 * @param {Object} job - Audit job record
 * @param {Object} evidence_pack_v2 - Evidence Pack v2 from scraper
 * @param {Object} raw_dump - Raw dump with pages array
 * @param {Object} screenshots - Screenshots refs and availability
 * @returns {Object} - Payload for A1
 */
function buildA1Payload(job, evidence_pack_v2, raw_dump, screenshots) {
  const ss = normalizeScreenshotsForAssistants(screenshots);
  const rd = trimRawDumpForAssistants(raw_dump);
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    evidence_pack_v2_json: evidence_pack_v2,
    raw_dump_pages_json: (rd && Array.isArray(rd.pages)) ? rd.pages : [],
    screenshots: ss
  };
}

/**
 * A2: UX Conversion Auditor
 * 
 * Input: llm_context from A1, screenshots
 * Output: ux_audit_json
 * 
 * @param {Object} job
 * @param {Object} llm_context - Output from A1
 * @param {Object} raw_dump
 * @param {Object} screenshots
 * @returns {Object} - Payload for A2
 */
function buildA2Payload(job, llm_context, raw_dump, screenshots) {
  const ss = normalizeScreenshotsForAssistants(screenshots);
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    llm_context: llm_context,
    raw_dump: trimRawDumpForAssistants(raw_dump),
    screenshots: ss
  };
}

/**
 * A3: Local SEO & GEO Auditor
 * 
 * Input: llm_context from A1
 * Output: local_seo_audit_json
 * 
 * @param {Object} job
 * @param {Object} llm_context - Output from A1
 * @param {Object} raw_dump
 * @returns {Object} - Payload for A3
 */
function buildA3Payload(job, llm_context, raw_dump) {
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    llm_context: llm_context,
    raw_dump: trimRawDumpForAssistants(raw_dump)
  };
}

/**
 * A4: Offer Strategist
 * 
 * Input: llm_context, ux_audit (A2), local_seo_audit (A3)
 * Output: offer_copy_json
 * 
 * @param {Object} job
 * @param {Object} llm_context - Output from A1
 * @param {Object} ux_audit_json - Output from A2
 * @param {Object} local_seo_audit_json - Output from A3
 * @returns {Object} - Payload for A4
 */
function buildA4Payload(job, llm_context, ux_audit_json, local_seo_audit_json) {
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    llm_context: llm_context,
    ux_audit_json: ux_audit_json,
    local_seo_audit_json: local_seo_audit_json
  };
}

/**
 * A5: Outreach Email Writer
 * 
 * Input: llm_context, offer_copy (A4), links (audit landing, questionnaire)
 * Output: email_pack_json
 * 
 * @param {Object} job
 * @param {Object} llm_context - Output from A1
 * @param {Object} offer_copy_json - Output from A4
 * @param {Object} links - {audit_landing_url, questionnaire_url}
 * @returns {Object} - Payload for A5
 */
function buildA5Payload(job, llm_context, offer_copy_json, links = {}) {
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    llm_context: llm_context,
    offer_copy_json: offer_copy_json,
    links: {
      audit_landing_url: links.audit_landing_url || '{{audit_landing_url}}',
      questionnaire_url: links.questionnaire_url || '{{questionnaire_url}}'
    }
  };
}

/**
 * A6: Public Audit Page Composer
 * 
 * Input: llm_context, ux_audit (A2), local_seo_audit (A3), offer_copy (A4), screenshots, compliance, links
 * Output: public_page_json
 * 
 * @param {Object} job
 * @param {Object} llm_context - Output from A1
 * @param {Object} ux_audit_json - Output from A2
 * @param {Object} local_seo_audit_json - Output from A3
 * @param {Object} offer_copy_json - Output from A4
 * @param {Object} screenshots
 * @param {Object} links - {questionnaire_url}
 * @returns {Object} - Payload for A6
 */
function buildA6Payload(job, llm_context, ux_audit_json, local_seo_audit_json, offer_copy_json, screenshots, links = {}) {
  const ss = normalizeScreenshotsForAssistants(screenshots);
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    llm_context: llm_context,
    ux_audit_json: ux_audit_json,
    local_seo_audit_json: local_seo_audit_json,
    offer_copy_json: offer_copy_json,
    screenshots: ss,
    compliance: {
      concept_preview_required: true,
      no_growth_guarantees: true,
      no_shaming_language: true
    },
    links: {
      questionnaire_url: links.questionnaire_url || '{{questionnaire_url}}'
    }
  };
}

/**
 * Build payload for any assistant (dispatcher)
 * 
 * @param {string} assistant_key
 * @param {Object} data - Contains all possible dependencies
 * @returns {Object} - Payload for the assistant
 */
function buildPayload(assistant_key, data) {
  const {
    job,
    evidence_pack_v2,
    raw_dump,
    screenshots,
    llm_context,
    ux_audit_json,
    local_seo_audit_json,
    offer_copy_json,
    links
  } = data;

  switch (assistant_key) {
    case 'evidence_normalizer':
      return buildA1Payload(job, evidence_pack_v2, raw_dump, screenshots);
    
    case 'ux_conversion_auditor':
      return buildA2Payload(job, llm_context, raw_dump, screenshots);
    
    case 'local_seo_geo_auditor':
      return buildA3Payload(job, llm_context, raw_dump);
    
    case 'offer_strategist':
      return buildA4Payload(job, llm_context, ux_audit_json, local_seo_audit_json);
    
    case 'outreach_email_writer':
      return buildA5Payload(job, llm_context, offer_copy_json, links);
    
    case 'public_audit_page_composer':
      return buildA6Payload(job, llm_context, ux_audit_json, local_seo_audit_json, offer_copy_json, screenshots, links);
    
    default:
      throw new Error(`Unknown assistant_key: ${assistant_key}`);
  }
}

/**
 * Check if assistant can run (all dependencies available)
 * 
 * @param {string} assistant_key
 * @param {Object} data - Available data
 * @returns {Object} - {can_run: boolean, missing: string[]}
 */
function checkAssistantDependencies(assistant_key, data) {
  const missing = [];

  switch (assistant_key) {
    case 'evidence_normalizer':
      // A1 needs: evidence_pack_v2, raw_dump, screenshots from scraper
      if (!data.evidence_pack_v2) missing.push('evidence_pack_v2 (from scraper)');
      if (!data.raw_dump) missing.push('raw_dump (from scraper)');
      if (!data.screenshots) missing.push('screenshots (from scraper)');
      break;
    
    case 'ux_conversion_auditor':
      // A2 needs: llm_context from A1
      if (!data.llm_context) missing.push('llm_context (from A1: Evidence Normalizer)');
      break;
    
    case 'local_seo_geo_auditor':
      // A3 needs: llm_context from A1
      if (!data.llm_context) missing.push('llm_context (from A1: Evidence Normalizer)');
      break;
    
    case 'offer_strategist':
      // A4 needs: llm_context (A1), ux_audit_json (A2), local_seo_audit_json (A3)
      if (!data.llm_context) missing.push('llm_context (from A1)');
      if (!data.ux_audit_json) missing.push('ux_audit_json (from A2: UX Auditor)');
      if (!data.local_seo_audit_json) missing.push('local_seo_audit_json (from A3: SEO Auditor)');
      break;
    
    case 'outreach_email_writer':
      // A5 needs: llm_context (A1), offer_copy_json (A4)
      if (!data.llm_context) missing.push('llm_context (from A1)');
      if (!data.offer_copy_json) missing.push('offer_copy_json (from A4: Offer Strategist)');
      break;
    
    case 'public_audit_page_composer':
      // A6 needs: llm_context (A1), ux_audit_json (A2), local_seo_audit_json (A3), offer_copy_json (A4)
      if (!data.llm_context) missing.push('llm_context (from A1)');
      if (!data.ux_audit_json) missing.push('ux_audit_json (from A2)');
      if (!data.local_seo_audit_json) missing.push('local_seo_audit_json (from A3)');
      if (!data.offer_copy_json) missing.push('offer_copy_json (from A4)');
      break;
    
    default:
      missing.push(`Unknown assistant: ${assistant_key}`);
  }

  return {
    can_run: missing.length === 0,
    missing
  };
}

module.exports = {
  buildPayload,
  checkAssistantDependencies,
  buildA1Payload,
  buildA2Payload,
  buildA3Payload,
  buildA4Payload,
  buildA5Payload,
  buildA6Payload
};

