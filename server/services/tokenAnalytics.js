/**
 * Token Analytics Module - Non-invasive LLM Token Usage Tracking
 * 
 * Tracks:
 * - Payload sizes (bytes and estimated tokens)
 * - Token usage per assistant
 * - Duplicate data detection
 * - Cost estimation
 * 
 * Usage: Import and call trackPayload() before LLM calls
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const ANALYTICS_ENABLED = process.env.TOKEN_ANALYTICS_ENABLED !== 'false'; // Enabled by default
const LOG_DIR = path.join(__dirname, '../../logs/token-analytics');
const COST_PER_1M_INPUT_TOKENS = 3.0; // USD - adjust based on your OpenRouter model
const COST_PER_1M_OUTPUT_TOKENS = 15.0; // USD - adjust based on your OpenRouter model

// Rough token estimation: 1 token ≈ 4 characters (Claude/GPT average)
const CHARS_PER_TOKEN = 4;

// ============================================================================
// UTILS
// ============================================================================

/**
 * Estimate token count from text (rough approximation)
 */
function estimateTokens(text) {
  if (!text) return 0;
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.ceil(str.length / CHARS_PER_TOKEN);
}

/**
 * Get size in bytes
 */
function getByteSize(data) {
  if (!data) return 0;
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return Buffer.byteLength(str, 'utf8');
}

/**
 * Detect duplicate/overlapping data in payload
 */
function detectDuplicates(payload) {
  const duplicates = [];
  
  // Check if raw_dump appears multiple times
  if (payload.raw_dump_pages_json || payload.raw_dump) {
    duplicates.push({
      type: 'raw_dump',
      message: 'raw_dump data is being sent (check if needed)',
      size_bytes: getByteSize(payload.raw_dump_pages_json || payload.raw_dump)
    });
  }

  // Check if multiple audit outputs are being sent
  const auditFields = ['ux_audit_json', 'local_seo_audit_json', 'offer_copy_json'];
  const presentAudits = auditFields.filter(field => payload[field]);
  
  if (presentAudits.length > 2) {
    duplicates.push({
      type: 'multiple_audits',
      message: `Multiple audit outputs in payload: ${presentAudits.join(', ')}`,
      fields: presentAudits,
      total_size_bytes: presentAudits.reduce((sum, field) => sum + getByteSize(payload[field]), 0)
    });
  }

  // Check for large evidence_pack_v2
  if (payload.evidence_pack_v2_json) {
    const size = getByteSize(payload.evidence_pack_v2_json);
    if (size > 50000) { // > 50KB
      duplicates.push({
        type: 'large_evidence_pack',
        message: 'evidence_pack_v2_json is very large (consider trimming)',
        size_bytes: size
      });
    }
  }

  // Check for large llm_context
  if (payload.llm_context) {
    const size = getByteSize(payload.llm_context);
    if (size > 30000) { // > 30KB
      duplicates.push({
        type: 'large_llm_context',
        message: 'llm_context is large (this is output from A1, check if it can be trimmed)',
        size_bytes: size
      });
    }
  }

  return duplicates;
}

/**
 * Analyze payload structure
 */
function analyzePayload(payload) {
  const analysis = {
    total_size_bytes: getByteSize(payload),
    estimated_tokens: estimateTokens(payload),
    fields: {},
    duplicates: [],
    warnings: []
  };

  // Analyze each field
  for (const [key, value] of Object.entries(payload)) {
    const size = getByteSize(value);
    const tokens = estimateTokens(value);
    
    analysis.fields[key] = {
      size_bytes: size,
      estimated_tokens: tokens,
      percentage: 0 // Will calculate later
    };
  }

  // Calculate percentages
  const total = analysis.total_size_bytes;
  for (const key in analysis.fields) {
    analysis.fields[key].percentage = ((analysis.fields[key].size_bytes / total) * 100).toFixed(1);
  }

  // Detect duplicates
  analysis.duplicates = detectDuplicates(payload);

  // Generate warnings
  if (analysis.estimated_tokens > 50000) {
    analysis.warnings.push(`Large payload: ~${analysis.estimated_tokens.toLocaleString()} estimated input tokens`);
  }

  if (analysis.duplicates.length > 0) {
    analysis.warnings.push(`${analysis.duplicates.length} potential optimization(s) detected`);
  }

  return analysis;
}

// ============================================================================
// TRACKING
// ============================================================================

const jobAnalytics = new Map(); // jobId -> analytics data

/**
 * Track payload before sending to LLM
 */
function trackPayload(jobId, assistant_key, payload, metadata = {}) {
  if (!ANALYTICS_ENABLED) return null;

  const timestamp = new Date().toISOString();
  const analysis = analyzePayload(payload);

  // Initialize job analytics if not exists
  if (!jobAnalytics.has(jobId)) {
    jobAnalytics.set(jobId, {
      job_id: jobId,
      started_at: timestamp,
      assistants: {},
      total_estimated_input_tokens: 0,
      total_actual_tokens: 0,
      total_cost_usd: 0
    });
  }

  const jobData = jobAnalytics.get(jobId);

  // Track assistant
  jobData.assistants[assistant_key] = {
    payload_analysis: analysis,
    model: metadata.model || 'unknown',
    temperature: metadata.temperature || 0,
    tracked_at: timestamp,
    actual_token_usage: null // Will be filled by trackResponse()
  };

  jobData.total_estimated_input_tokens += analysis.estimated_tokens;

  // Log to console
  console.log(`[TokenAnalytics] ${assistant_key} - Payload: ${formatBytes(analysis.total_size_bytes)}, Est. ~${analysis.estimated_tokens.toLocaleString()} tokens`);
  
  if (analysis.warnings.length > 0) {
    analysis.warnings.forEach(w => console.log(`[TokenAnalytics] ⚠️  ${w}`));
  }

  if (analysis.duplicates.length > 0) {
    console.log(`[TokenAnalytics] 🔍 Potential optimizations:`);
    analysis.duplicates.forEach(d => {
      console.log(`   - ${d.message} (${formatBytes(d.size_bytes || 0)})`);
    });
  }

  return analysis;
}

/**
 * Track actual token usage from LLM response
 */
function trackResponse(jobId, assistant_key, token_usage) {
  if (!ANALYTICS_ENABLED || !token_usage) return;

  const jobData = jobAnalytics.get(jobId);
  if (!jobData) {
    console.warn(`[TokenAnalytics] No job data found for job ${jobId}`);
    return;
  }

  const assistant = jobData.assistants[assistant_key];
  if (!assistant) {
    console.warn(`[TokenAnalytics] No assistant data found for ${assistant_key} in job ${jobId}`);
    return;
  }

  // Store actual token usage
  assistant.actual_token_usage = token_usage;

  // Update totals
  jobData.total_actual_tokens += token_usage.total_tokens || 0;

  // Calculate cost
  const inputCost = ((token_usage.prompt_tokens || 0) / 1000000) * COST_PER_1M_INPUT_TOKENS;
  const outputCost = ((token_usage.completion_tokens || 0) / 1000000) * COST_PER_1M_OUTPUT_TOKENS;
  const totalCost = inputCost + outputCost;

  assistant.cost_usd = {
    input: inputCost,
    output: outputCost,
    total: totalCost
  };

  jobData.total_cost_usd += totalCost;

  // Log to console
  console.log(`[TokenAnalytics] ${assistant_key} - Actual tokens: ${token_usage.total_tokens.toLocaleString()} (input: ${token_usage.prompt_tokens.toLocaleString()}, output: ${token_usage.completion_tokens.toLocaleString()}), Cost: $${totalCost.toFixed(4)}`);
  
  // Compare estimate vs actual
  const estimated = assistant.payload_analysis.estimated_tokens;
  const actual = token_usage.prompt_tokens || 0;
  const accuracy = estimated > 0 ? ((actual / estimated) * 100).toFixed(1) : 'N/A';
  
  console.log(`[TokenAnalytics] ${assistant_key} - Estimate accuracy: ${accuracy}% (estimated ${estimated.toLocaleString()} vs actual ${actual.toLocaleString()})`);
}

/**
 * Generate final report for a job
 */
function generateJobReport(jobId) {
  if (!ANALYTICS_ENABLED) return null;

  const jobData = jobAnalytics.get(jobId);
  if (!jobData) {
    console.warn(`[TokenAnalytics] No analytics data for job ${jobId}`);
    return null;
  }

  jobData.finished_at = new Date().toISOString();

  // Calculate summary
  const assistantKeys = Object.keys(jobData.assistants);
  const summary = {
    total_assistants: assistantKeys.length,
    total_estimated_input_tokens: jobData.total_estimated_input_tokens,
    total_actual_tokens: jobData.total_actual_tokens,
    total_cost_usd: jobData.total_cost_usd,
    largest_payload: null,
    most_expensive_assistant: null,
    all_duplicates: [],
    all_warnings: []
  };

  // Find largest payload
  let maxSize = 0;
  for (const [key, data] of Object.entries(jobData.assistants)) {
    const size = data.payload_analysis.total_size_bytes;
    if (size > maxSize) {
      maxSize = size;
      summary.largest_payload = {
        assistant: key,
        size_bytes: size,
        estimated_tokens: data.payload_analysis.estimated_tokens
      };
    }
  }

  // Find most expensive assistant
  let maxCost = 0;
  for (const [key, data] of Object.entries(jobData.assistants)) {
    const cost = data.cost_usd?.total || 0;
    if (cost > maxCost) {
      maxCost = cost;
      summary.most_expensive_assistant = {
        assistant: key,
        cost_usd: cost,
        tokens: data.actual_token_usage?.total_tokens || 0
      };
    }
  }

  // Collect all duplicates and warnings
  for (const [key, data] of Object.entries(jobData.assistants)) {
    if (data.payload_analysis.duplicates.length > 0) {
      summary.all_duplicates.push(...data.payload_analysis.duplicates.map(d => ({
        ...d,
        assistant: key
      })));
    }
    if (data.payload_analysis.warnings.length > 0) {
      summary.all_warnings.push(...data.payload_analysis.warnings.map(w => ({
        message: w,
        assistant: key
      })));
    }
  }

  const report = {
    job_id: jobId,
    started_at: jobData.started_at,
    finished_at: jobData.finished_at,
    summary,
    assistants: jobData.assistants
  };

  // Print summary to console
  console.log('\n' + '='.repeat(80));
  console.log(`[TokenAnalytics] JOB REPORT - Job ID: ${jobId}`);
  console.log('='.repeat(80));
  console.log(`Total Assistants: ${summary.total_assistants}`);
  console.log(`Total Estimated Input Tokens: ${summary.total_estimated_input_tokens.toLocaleString()}`);
  console.log(`Total Actual Tokens: ${summary.total_actual_tokens.toLocaleString()}`);
  console.log(`Total Cost: $${summary.total_cost_usd.toFixed(4)}`);
  
  if (summary.largest_payload) {
    console.log(`\nLargest Payload: ${summary.largest_payload.assistant}`);
    console.log(`  Size: ${formatBytes(summary.largest_payload.size_bytes)}`);
    console.log(`  Est. Tokens: ${summary.largest_payload.estimated_tokens.toLocaleString()}`);
  }

  if (summary.most_expensive_assistant) {
    console.log(`\nMost Expensive Assistant: ${summary.most_expensive_assistant.assistant}`);
    console.log(`  Cost: $${summary.most_expensive_assistant.cost_usd.toFixed(4)}`);
    console.log(`  Tokens: ${summary.most_expensive_assistant.tokens.toLocaleString()}`);
  }

  if (summary.all_duplicates.length > 0) {
    console.log(`\n⚠️  OPTIMIZATION OPPORTUNITIES (${summary.all_duplicates.length}):`);
    summary.all_duplicates.forEach((d, i) => {
      console.log(`  ${i + 1}. [${d.assistant}] ${d.message}`);
      if (d.size_bytes) {
        console.log(`     Size: ${formatBytes(d.size_bytes)}`);
      }
    });
  }

  if (summary.all_warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${summary.all_warnings.length}):`);
    summary.all_warnings.forEach((w, i) => {
      console.log(`  ${i + 1}. [${w.assistant}] ${w.message}`);
    });
  }

  console.log('='.repeat(80) + '\n');

  // Save to file
  saveReportToFile(report);

  // Cleanup memory
  jobAnalytics.delete(jobId);

  return report;
}

/**
 * Save report to file
 */
function saveReportToFile(report) {
  try {
    // Ensure log directory exists
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    const filename = `job-${report.job_id}-${Date.now()}.json`;
    const filepath = path.join(LOG_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[TokenAnalytics] Report saved to: ${filepath}`);
  } catch (error) {
    console.error(`[TokenAnalytics] Failed to save report:`, error.message);
  }
}

/**
 * Format bytes to human-readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================================
// AGGREGATE REPORTS (across multiple jobs)
// ============================================================================

/**
 * Generate aggregate report from all saved job reports
 */
function generateAggregateReport(options = {}) {
  const { limit = 100, sortBy = 'timestamp' } = options;

  try {
    if (!fs.existsSync(LOG_DIR)) {
      console.log('[TokenAnalytics] No analytics logs found');
      return null;
    }

    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith('job-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    if (files.length === 0) {
      console.log('[TokenAnalytics] No job reports found');
      return null;
    }

    const reports = files.map(f => {
      const filepath = path.join(LOG_DIR, f);
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    });

    // Aggregate statistics
    const aggregate = {
      total_jobs: reports.length,
      total_tokens: 0,
      total_cost_usd: 0,
      avg_tokens_per_job: 0,
      avg_cost_per_job: 0,
      assistant_stats: {},
      common_duplicates: {},
      date_range: {
        from: reports[reports.length - 1].started_at,
        to: reports[0].started_at
      }
    };

    reports.forEach(report => {
      aggregate.total_tokens += report.summary.total_actual_tokens || 0;
      aggregate.total_cost_usd += report.summary.total_cost_usd || 0;

      // Per-assistant stats
      for (const [key, data] of Object.entries(report.assistants)) {
        if (!aggregate.assistant_stats[key]) {
          aggregate.assistant_stats[key] = {
            count: 0,
            total_tokens: 0,
            total_cost: 0,
            avg_tokens: 0,
            avg_cost: 0
          };
        }

        const stats = aggregate.assistant_stats[key];
        stats.count++;
        stats.total_tokens += data.actual_token_usage?.total_tokens || 0;
        stats.total_cost += data.cost_usd?.total || 0;
      }

      // Track common duplicates
      if (report.summary.all_duplicates) {
        report.summary.all_duplicates.forEach(d => {
          const key = `${d.type}_in_${d.assistant}`;
          aggregate.common_duplicates[key] = (aggregate.common_duplicates[key] || 0) + 1;
        });
      }
    });

    // Calculate averages
    aggregate.avg_tokens_per_job = Math.round(aggregate.total_tokens / aggregate.total_jobs);
    aggregate.avg_cost_per_job = aggregate.total_cost_usd / aggregate.total_jobs;

    for (const key in aggregate.assistant_stats) {
      const stats = aggregate.assistant_stats[key];
      stats.avg_tokens = Math.round(stats.total_tokens / stats.count);
      stats.avg_cost = stats.total_cost / stats.count;
    }

    // Print aggregate report
    console.log('\n' + '='.repeat(80));
    console.log('[TokenAnalytics] AGGREGATE REPORT');
    console.log('='.repeat(80));
    console.log(`Total Jobs Analyzed: ${aggregate.total_jobs}`);
    console.log(`Date Range: ${aggregate.date_range.from} to ${aggregate.date_range.to}`);
    console.log(`\nTotal Tokens Consumed: ${aggregate.total_tokens.toLocaleString()}`);
    console.log(`Total Cost: $${aggregate.total_cost_usd.toFixed(2)}`);
    console.log(`Average per Job: ${aggregate.avg_tokens_per_job.toLocaleString()} tokens, $${aggregate.avg_cost_per_job.toFixed(4)}`);

    console.log(`\nPer-Assistant Statistics:`);
    const sortedAssistants = Object.entries(aggregate.assistant_stats)
      .sort((a, b) => b[1].total_tokens - a[1].total_tokens);

    sortedAssistants.forEach(([key, stats]) => {
      console.log(`  ${key}:`);
      console.log(`    Runs: ${stats.count}`);
      console.log(`    Total: ${stats.total_tokens.toLocaleString()} tokens, $${stats.total_cost.toFixed(4)}`);
      console.log(`    Avg: ${stats.avg_tokens.toLocaleString()} tokens, $${stats.avg_cost.toFixed(4)}`);
    });

    if (Object.keys(aggregate.common_duplicates).length > 0) {
      console.log(`\nCommon Duplicate Patterns:`);
      const sortedDuplicates = Object.entries(aggregate.common_duplicates)
        .sort((a, b) => b[1] - a[1]);
      
      sortedDuplicates.forEach(([key, count]) => {
        console.log(`  ${key}: ${count} occurrences`);
      });
    }

    console.log('='.repeat(80) + '\n');

    return aggregate;

  } catch (error) {
    console.error('[TokenAnalytics] Error generating aggregate report:', error.message);
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  trackPayload,
  trackResponse,
  generateJobReport,
  generateAggregateReport,
  estimateTokens,
  getByteSize,
  analyzePayload,
  detectDuplicates
};
