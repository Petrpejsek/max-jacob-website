/**
 * Output Validator - Evidence-First Validation for LLM Outputs
 * 
 * Validates assistant outputs to prevent hallucinations by:
 * 1. Checking JSON structure and required keys
 * 2. Validating evidence_ref arrays (if required by assistant)
 * 3. Ensuring evidence_ref paths have valid prefixes
 * 4. Checking for compliance violations (growth %, guarantees, etc.)
 */

/**
 * Assistant output schemas - defines required keys and structures
 */
const ASSISTANT_SCHEMAS = {
  evidence_normalizer: {
    // Matches the OUTPUT JSON SCHEMA stored in DB prompts (llm_context + quality_warnings)
    required_keys: ['llm_context', 'quality_warnings'],
    nested_required: {
      llm_context: ['business_identity', 'contacts', 'services', 'ctas', 'trust', 'screenshots']
    }
  },
  ux_conversion_auditor: {
    // Matches the OUTPUT SCHEMA stored in DB prompts (ux_score, top_issues, quick_wins_48h, notes_unknowns)
    required_keys: ['ux_score', 'top_issues', 'quick_wins_48h', 'notes_unknowns'],
    array_keys: ['top_issues', 'quick_wins_48h', 'notes_unknowns']
  },
  local_seo_geo_auditor: {
    // Matches the OUTPUT SCHEMA stored in DB prompts (seo_score, issues, content_modules_to_add, nap_snapshot)
    required_keys: ['seo_score', 'issues', 'content_modules_to_add', 'nap_snapshot'],
    array_keys: ['issues', 'content_modules_to_add'],
    nested_required: {
      nap_snapshot: ['name', 'address', 'phones', 'hours']
    }
  },
  offer_strategist: {
    // Matches the OUTPUT SCHEMA stored in DB prompts
    required_keys: ['offer_name', 'positioning', '7_day_plan', 'deliverables_list', 'risk_reversal', 'upsell_paths_later'],
    array_keys: ['7_day_plan', 'deliverables_list', 'upsell_paths_later'],
    nested_required: {
      positioning: ['one_liner', 'who_its_for', 'why_now']
    }
  },
  outreach_email_writer: {
    // Matches the OUTPUT SCHEMA stored in DB prompts
    required_keys: ['subjects', 'plain_text', 'html', 'personalization_points', 'compliance_note'],
    array_keys: ['subjects', 'personalization_points']
  },
  public_audit_page_composer: {
    // Matches the OUTPUT SCHEMA stored in DB prompts
    required_keys: ['hero', 'mini_audit', 'top_3_fixes', 'trust_disclaimer', 'cta_block'],
    array_keys: ['mini_audit', 'top_3_fixes'],
    nested_required: {
      hero: ['headline', 'subheadline', 'primary_cta_text', 'secondary_cta_text'],
      cta_block: ['text', 'button_text', 'link_placeholder']
    }
  }
};

/**
 * Valid evidence_ref prefixes
 */
const VALID_EVIDENCE_PREFIXES = [
  'evidence_pack_v2.',
  'llm_context.',
  'raw_dump.',
  'screenshots.refs.',
  'ux_audit_json.',
  'local_seo_audit_json.',
  'offer_copy_json.'
];

/**
 * Validate assistant output
 * 
 * @param {Object} assistant - Assistant record from DB (with requires_evidence_refs field)
 * @param {Object} output_json - Parsed JSON output from LLM
 * @returns {Object} - {valid: boolean, errors: string[]}
 */
function validateAssistantOutput(assistant, output_json) {
  const errors = [];
  const assistant_key = assistant.key;

  // 1. Check if output is valid object
  if (!output_json || typeof output_json !== 'object' || Array.isArray(output_json)) {
    errors.push('Output is not a valid JSON object');
    return { valid: false, errors };
  }

  // 2. Check required keys for this assistant
  const schema = ASSISTANT_SCHEMAS[assistant_key];
  if (schema) {
    // Check top-level required keys
    if (schema.required_keys) {
      schema.required_keys.forEach(key => {
        if (!(key in output_json)) {
          errors.push(`Missing required key: "${key}"`);
        }
      });
    }

    // Check array keys (should be arrays)
    if (schema.array_keys) {
      schema.array_keys.forEach(key => {
        if (key in output_json && !Array.isArray(output_json[key])) {
          errors.push(`Key "${key}" should be an array`);
        }
      });
    }

    // Check nested required keys
    if (schema.nested_required) {
      Object.keys(schema.nested_required).forEach(parentKey => {
        if (output_json[parentKey]) {
          const nestedKeys = schema.nested_required[parentKey];
          nestedKeys.forEach(nestedKey => {
            if (!(nestedKey in output_json[parentKey])) {
              errors.push(`Missing required nested key: "${parentKey}.${nestedKey}"`);
            }
          });
        }
      });
    }
  }

  // 3. Validate evidence_ref if required by assistant
  if (assistant.requires_evidence_refs) {
    const evidenceErrors = validateEvidenceRefs(assistant_key, output_json);
    errors.push(...evidenceErrors);
  }

  // 4. Check for compliance violations
  const complianceErrors = checkComplianceViolations(output_json);
  errors.push(...complianceErrors);

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate evidence_ref arrays in issues
 * 
 * @param {string} assistant_key
 * @param {Object} output_json
 * @returns {string[]} - Array of error messages
 */
function validateEvidenceRefs(assistant_key, output_json) {
  const errors = [];
  const issues = extractIssuesFromOutput(assistant_key, output_json);

  issues.forEach((issue, idx) => {
    // Check if evidence_ref exists
    if (!issue.evidence_ref) {
      errors.push(`Issue ${idx + 1} ("${issue.problem?.slice(0, 50) || 'Unknown'}"): Missing evidence_ref field`);
      return;
    }

    // Check if evidence_ref is array
    if (!Array.isArray(issue.evidence_ref)) {
      errors.push(`Issue ${idx + 1}: evidence_ref must be an array`);
      return;
    }

    // Check if evidence_ref is not empty
    if (issue.evidence_ref.length === 0) {
      errors.push(`Issue ${idx + 1} ("${issue.problem?.slice(0, 50) || 'Unknown'}"): evidence_ref array is empty`);
      return;
    }

    // Validate each evidence_ref path
    issue.evidence_ref.forEach((ref, refIdx) => {
      if (typeof ref !== 'string') {
        errors.push(`Issue ${idx + 1}, evidence_ref[${refIdx}]: Must be a string`);
        return;
      }

      // Check if ref has valid prefix
      const hasValidPrefix = VALID_EVIDENCE_PREFIXES.some(prefix => ref.startsWith(prefix));
      if (!hasValidPrefix) {
        errors.push(
          `Issue ${idx + 1}, evidence_ref[${refIdx}]: Invalid prefix. ` +
          `Must start with one of: ${VALID_EVIDENCE_PREFIXES.join(', ')}. ` +
          `Got: "${ref}"`
        );
      }
    });
  });

  return errors;
}

/**
 * Extract issues array from output based on assistant type
 * 
 * @param {string} assistant_key
 * @param {Object} output_json
 * @returns {Array} - Array of issue objects
 */
function extractIssuesFromOutput(assistant_key, output_json) {
  switch (assistant_key) {
    case 'ux_conversion_auditor':
      return output_json.top_issues || [];
    
    case 'local_seo_geo_auditor':
      // Extract issues from nap_audit.issues
      return (output_json.nap_audit?.issues || []);
    
    default:
      return [];
  }
}

/**
 * Check for compliance violations (banned phrases, growth %, etc.)
 * 
 * @param {Object} output_json
 * @returns {string[]} - Array of violation messages
 */
function checkComplianceViolations(output_json) {
  const violations = [];
  const jsonString = JSON.stringify(output_json).toLowerCase();

  // Banned patterns
  const bannedPatterns = [
    { pattern: /\d+\s*%/, message: 'Growth percentages or numeric projections are prohibited' },
    { pattern: /guarantee(d|s)?\s+(results|ranking|growth|traffic|leads)/i, message: 'Guarantees are prohibited (guaranteed results/ranking/growth)' },
    { pattern: /will\s+increase\s+(conversions|traffic|leads|sales)/i, message: 'Guarantees about results are prohibited ("will increase...")' },
    { pattern: /your\s+website\s+is\s+(bad|terrible|poor)/i, message: 'Negative framing about client website is prohibited' }
  ];

  bannedPatterns.forEach(({ pattern, message }) => {
    if (pattern.test(jsonString)) {
      violations.push(`Compliance violation: ${message}`);
    }
  });

  return violations;
}

/**
 * Get required keys for an assistant (for documentation/validation)
 * 
 * @param {string} assistant_key
 * @returns {Object} - Schema definition
 */
function getRequiredKeys(assistant_key) {
  return ASSISTANT_SCHEMAS[assistant_key] || null;
}

module.exports = {
  validateAssistantOutput,
  validateEvidenceRefs,
  extractIssuesFromOutput,
  checkComplianceViolations,
  getRequiredKeys,
  VALID_EVIDENCE_PREFIXES
};

