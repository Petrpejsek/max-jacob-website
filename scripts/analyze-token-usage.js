#!/usr/bin/env node
/**
 * CLI Tool: Token Usage Analyzer
 * 
 * Generates aggregate reports from token analytics logs
 * 
 * Usage:
 *   node scripts/analyze-token-usage.js [options]
 * 
 * Options:
 *   --limit <n>    Number of jobs to analyze (default: 100)
 *   --recent       Analyze only recent jobs (last 24 hours)
 *   --assistant <name>  Show detailed stats for specific assistant
 */

const { generateAggregateReport } = require('../server/services/tokenAnalytics');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  limit: 100,
  recent: false,
  assistant: null
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === '--recent') {
    options.recent = true;
  } else if (arg === '--assistant' && args[i + 1]) {
    options.assistant = args[i + 1];
    i++;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Token Usage Analyzer
====================

Generates aggregate reports from token analytics logs.

Usage:
  node scripts/analyze-token-usage.js [options]

Options:
  --limit <n>           Number of jobs to analyze (default: 100)
  --recent              Analyze only recent jobs (last 24 hours)
  --assistant <name>    Show detailed stats for specific assistant
  --help, -h            Show this help message

Examples:
  node scripts/analyze-token-usage.js
  node scripts/analyze-token-usage.js --limit 50
  node scripts/analyze-token-usage.js --recent
  node scripts/analyze-token-usage.js --assistant evidence_normalizer
    `);
    process.exit(0);
  }
}

// Filter by recent if requested
if (options.recent) {
  const LOG_DIR = path.join(__dirname, '../logs/token-analytics');
  
  if (fs.existsSync(LOG_DIR)) {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const files = fs.readdirSync(LOG_DIR);
    
    // Filter files by modification time
    const recentFiles = files.filter(f => {
      const filepath = path.join(LOG_DIR, f);
      const stats = fs.statSync(filepath);
      return stats.mtimeMs >= oneDayAgo;
    });
    
    options.limit = Math.min(recentFiles.length, options.limit);
    console.log(`Analyzing ${options.limit} jobs from last 24 hours\n`);
  }
}

// Generate report
const report = generateAggregateReport(options);

if (!report) {
  console.log('No analytics data available. Run some audits first!');
  process.exit(0);
}

// Show assistant-specific details if requested
if (options.assistant && report.assistant_stats[options.assistant]) {
  const stats = report.assistant_stats[options.assistant];
  
  console.log('\n' + '='.repeat(80));
  console.log(`Detailed Stats for Assistant: ${options.assistant}`);
  console.log('='.repeat(80));
  console.log(`Total Runs: ${stats.count}`);
  console.log(`Total Tokens: ${stats.total_tokens.toLocaleString()}`);
  console.log(`Total Cost: $${stats.total_cost.toFixed(2)}`);
  console.log(`Average per Run: ${stats.avg_tokens.toLocaleString()} tokens, $${stats.avg_cost.toFixed(4)}`);
  console.log(`Percentage of Total: ${((stats.total_tokens / report.total_tokens) * 100).toFixed(1)}%`);
  console.log('='.repeat(80) + '\n');
} else if (options.assistant) {
  console.log(`\nAssistant '${options.assistant}' not found in analytics data.`);
  console.log(`Available assistants: ${Object.keys(report.assistant_stats).join(', ')}\n`);
}
