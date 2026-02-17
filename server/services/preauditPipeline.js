/**
 * Preaudit Pipeline - Main Orchestrator
 * 
 * Orchestrates the complete preaudit flow:
 * 1. Search for businesses via Serper API
 * 2. For each result:
 *    - Check blacklist
 *    - Visit website with Playwright
 *    - Detect email using multi-method detection
 *    - If email found: take screenshots (hero + fullpage)
 *    - If no email: add to blacklist
 * 3. Update search status and counts
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { searchBusinesses } = require('./searchService');
const { detectEmail } = require('./emailDetector');
const {
  getPreauditSearchById,
  updatePreauditSearch,
  createPreauditResult,
  isUrlBlacklisted,
  isUrlAlreadyProcessed,
  addToBlacklist
} = require('../db');
const { getPersistentPublicDir } = require('../runtimePaths');

// Configuration
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const VIEWPORT_DESKTOP = { width: 1280, height: 720 };
const PAGE_TIMEOUT = 30000; // 30 seconds
const DELAY_BETWEEN_PAGES = 3000; // 3 seconds (ban prevention)
const ENABLE_PREAUDIT_FULLPAGE_SCREENSHOTS =
  (process.env.ENABLE_PREAUDIT_FULLPAGE_SCREENSHOTS ?? 'true').toString().toLowerCase() === 'true';

/**
 * Normalize URL (remove trailing slashes, www variants, etc.)
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    // Remove www., trailing slash, and force https
    let normalized = urlObj.href.toLowerCase();
    normalized = normalized.replace(/^https?:\/\/(www\.)?/, 'https://');
    normalized = normalized.replace(/\/$/, '');
    return normalized;
  } catch (e) {
    return url;
  }
}

/**
 * Take screenshot of a page
 * @param {object} page - Playwright page
 * @param {string} filepath - Path to save screenshot
 * @param {object} options - Screenshot options
 * @returns {Promise<boolean>} Success status
 */
async function takeScreenshot(page, filepath, options = {}) {
  try {
    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    await page.screenshot({
      path: filepath,
      fullPage: options.fullPage || false,
      type: 'jpeg',
      quality: 80
    });
    
    console.log('[PREAUDIT PIPELINE] Screenshot saved:', filepath);
    return true;
  } catch (error) {
    console.error('[PREAUDIT PIPELINE] Screenshot failed:', error);
    return false;
  }
}

/**
 * Process a single website (visit, detect email, screenshot)
 * @param {object} browser - Playwright browser instance
 * @param {object} result - Search result { url, title, description, position }
 * @param {object} searchData - Search data { id, niche, city }
 * @returns {Promise<object>} Processing result
 */
async function processWebsite(browser, result, searchData) {
  const { url, title, description, position } = result;
  const { id: searchId, niche, city } = searchData;
  
  console.log(`\n[PREAUDIT PIPELINE] Processing [${position}]: ${url}`);
  
  let page;
  
  try {
    // Check blacklist first
    const normalizedUrl = normalizeUrl(url);
    const blacklisted = await new Promise((resolve, reject) => {
      isUrlBlacklisted(normalizedUrl, (err, isBlacklisted) => {
        if (err) reject(err);
        else resolve(isBlacklisted);
      });
    });
    
    if (blacklisted) {
      console.log('[PREAUDIT PIPELINE] ✗ URL is blacklisted, skipping:', url);
      // Store skip for diagnostics (won't show in red list)
      await new Promise((resolve) => {
        createPreauditResult({
          search_id: searchId,
          url: normalizedUrl,
          title,
          description,
          email: null,
          has_email: false,
          screenshot_hero_path: null,
          screenshot_full_path: null,
          status: 'skipped_blacklisted',
          search_position: position
        }, () => resolve());
      });
      return {
        url,
        skipped: true,
        reason: 'blacklisted'
      };
    }
    
    // Check if already processed (green result from previous search)
    const alreadyProcessed = await new Promise((resolve, reject) => {
      isUrlAlreadyProcessed(normalizedUrl, (err, isProcessed) => {
        if (err) reject(err);
        else resolve(isProcessed);
      });
    });
    
    if (alreadyProcessed) {
      console.log('[PREAUDIT PIPELINE] ✓ URL already processed (has email), skipping:', url);
      // Store skip for diagnostics (won't show in green list)
      await new Promise((resolve) => {
        createPreauditResult({
          search_id: searchId,
          url: normalizedUrl,
          title,
          description,
          email: null,
          has_email: true,
          screenshot_hero_path: null,
          screenshot_full_path: null,
          status: 'skipped_already_processed',
          search_position: position
        }, () => resolve());
      });
      return {
        url,
        skipped: true,
        reason: 'already_processed'
      };
    }
    
    // Create browser context with anti-detection
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: VIEWPORT_DESKTOP,
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });
    
    page = await context.newPage();
    
    // Set reasonable timeout
    page.setDefaultTimeout(PAGE_TIMEOUT);
    
    console.log('[PREAUDIT PIPELINE] Visiting:', url);
    
    // Navigate to page
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT
    });
    
    // Wait a bit for dynamic content
    await page.waitForTimeout(2000);
    
    console.log('[PREAUDIT PIPELINE] Page loaded, detecting email...');
    
    // Detect email using multi-method approach
    const emailResult = await detectEmail(url, page);
    
    if (emailResult.found) {
      console.log('[PREAUDIT PIPELINE] ✓ Email found:', emailResult.email);
      
      // Navigate back to original URL if we crawled contact page
      if (page.url() !== url) {
        console.log('[PREAUDIT PIPELINE] Navigating back to homepage for screenshots...');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
        await page.waitForTimeout(1000);
      }
      
      // Create screenshot directory
      const screenshotDir = path.join(
        getPersistentPublicDir(),
        'preaudit_screenshots',
        searchId.toString()
      );
      
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      
      // Take screenshots
      console.log('[PREAUDIT PIPELINE] Taking screenshots...');
      
      const timestamp = Date.now();
      const heroPath = path.join(screenshotDir, `${timestamp}_hero.jpg`);
      const fullPath = path.join(screenshotDir, `${timestamp}_full.jpg`);
      
      // Hero screenshot (above the fold) — JPEG quality 80 (~5x smaller than PNG)
      await takeScreenshot(page, heroPath, { fullPage: false });
      
      // Full page screenshot (optional; can be disabled in production if memory is tight)
      if (ENABLE_PREAUDIT_FULLPAGE_SCREENSHOTS) {
        await takeScreenshot(page, fullPath, { fullPage: true });
      }
      
      // Save to database (GREEN result)
      // NOTE: Express serves from /public URL prefix, so paths must include 'public/'
      await new Promise((resolve, reject) => {
        createPreauditResult({
          search_id: searchId,
          url: normalizedUrl,
          title,
          description,
          email: emailResult.email,
          has_email: true,
          screenshot_hero_path: `public/preaudit_screenshots/${searchId}/${timestamp}_hero.jpg`,
          screenshot_full_path: ENABLE_PREAUDIT_FULLPAGE_SCREENSHOTS
            ? `public/preaudit_screenshots/${searchId}/${timestamp}_full.jpg`
            : null,
          status: 'valid',
          search_position: position
        }, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      console.log('[PREAUDIT PIPELINE] ✓ GREEN result saved');
      
      await context.close();
      
      return {
        url,
        success: true,
        hasEmail: true,
        email: emailResult.email,
        status: 'green'
      };
      
    } else {
      console.log('[PREAUDIT PIPELINE] ✗ No email found');
      
      // Add to blacklist (RED result)
      await new Promise((resolve, reject) => {
        addToBlacklist(normalizedUrl, {
          niche,
          city,
          reason: 'no_email'
        }, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      // Save to database (RED result)
      await new Promise((resolve, reject) => {
        createPreauditResult({
          search_id: searchId,
          url: normalizedUrl,
          title,
          description,
          email: null,
          has_email: false,
          screenshot_hero_path: null,
          screenshot_full_path: null,
          status: 'no_email',
          search_position: position
        }, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      console.log('[PREAUDIT PIPELINE] ✗ RED result saved (blacklisted)');
      
      await context.close();
      
      return {
        url,
        success: true,
        hasEmail: false,
        email: null,
        status: 'red'
      };
    }
    
  } catch (error) {
    console.error('[PREAUDIT PIPELINE] Error processing website:', error);
    
    if (page) {
      try {
        await page.context().close();
      } catch (e) {
        // Ignore
      }
    }

    // Store error for diagnostics (won't show in red list)
    try {
      const normalizedUrl = normalizeUrl(url);
      await new Promise((resolve) => {
        createPreauditResult({
          search_id: searchData.id,
          url: normalizedUrl,
          title: result.title,
          description: result.description,
          email: null,
          has_email: false,
          screenshot_hero_path: null,
          screenshot_full_path: null,
          status: 'error',
          search_position: result.position
        }, () => resolve());
      });
    } catch (e) {
      // ignore
    }
    
    return {
      url,
      success: false,
      error: error.message,
      status: 'error'
    };
  }
}

/**
 * Main pipeline function - orchestrates full preaudit search
 * @param {number} searchId - Preaudit search ID
 * @returns {Promise<object>} Results summary
 */
async function runPreauditSearch(searchId) {
  console.log('\n=== PREAUDIT PIPELINE STARTING ===');
  console.log('Search ID:', searchId);
  
  let browser;
  
  try {
    // Get search data
    const searchData = await new Promise((resolve, reject) => {
      getPreauditSearchById(searchId, (err, data) => {
        if (err) reject(err);
        else if (!data) reject(new Error('Search not found'));
        else resolve(data);
      });
    });
    
    console.log('Search params:', {
      niche: searchData.niche,
      city: searchData.city,
      count: searchData.requested_count
    });
    
    // Update status to processing
    await new Promise((resolve, reject) => {
      updatePreauditSearch(searchId, {
        status: 'processing'
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Search for businesses
    console.log('\n[PREAUDIT PIPELINE] Searching via Serper API...');
    // Pull a larger candidate pool to compensate for skips/filters
    const targetCount = searchData.requested_count;
    const candidateCount = Math.min(100, Math.max(20, targetCount * 10));
    const searchResults = await searchBusinesses(searchData.niche, searchData.city, candidateCount);
    
    console.log(`[PREAUDIT PIPELINE] Found ${searchResults.length} results`);
    
    if (searchResults.length === 0) {
      await new Promise((resolve, reject) => {
        updatePreauditSearch(searchId, {
          status: 'completed',
          found_count: 0,
          green_count: 0,
          red_count: 0
        }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      return {
        success: true,
        found: 0,
        green: 0,
        red: 0,
        errors: 0
      };
    }
    
    // Launch browser
    console.log('\n[PREAUDIT PIPELINE] Launching browser...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    // Process each website
    const results = [];
    let greenCount = 0;
    let redCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let processedCount = 0;

    // Set target for UI progress
    await new Promise((resolve, reject) => {
      updatePreauditSearch(searchId, {
        found_count: targetCount
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    for (let i = 0; i < searchResults.length; i++) {
      if (greenCount + redCount >= targetCount) break;
      const result = searchResults[i];
      
      console.log(`\n[PREAUDIT PIPELINE] Progress: ${i + 1}/${searchResults.length}`);
      
      const processResult = await processWebsite(browser, result, searchData);
      results.push(processResult);
      
      if (processResult.skipped) {
        skippedCount++;
      } else if (processResult.success) {
        if (processResult.hasEmail) {
          greenCount++;
        } else {
          redCount++;
        }
      } else {
        errorCount++;
      }
      processedCount++;
      
      // Update progress in database
      await new Promise((resolve, reject) => {
        updatePreauditSearch(searchId, {
          found_count: targetCount,
          green_count: greenCount,
          red_count: redCount
        }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Delay between pages (ban prevention)
      if (i < searchResults.length - 1) {
        console.log(`[PREAUDIT PIPELINE] Waiting ${DELAY_BETWEEN_PAGES}ms before next page...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_PAGES));
      }
    }
    
    // Close browser
    await browser.close();
    
    // Update final status
    await new Promise((resolve, reject) => {
      updatePreauditSearch(searchId, {
        status: 'completed',
        found_count: targetCount,
        green_count: greenCount,
        red_count: redCount
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log('\n=== PREAUDIT PIPELINE COMPLETED ===');
    console.log('Results:', {
      target: targetCount,
      candidates: searchResults.length,
      processed: processedCount,
      green: greenCount,
      red: redCount,
      errors: errorCount,
      skipped: skippedCount
    });
    
    return {
      success: true,
      target: targetCount,
      candidates: searchResults.length,
      processed: processedCount,
      green: greenCount,
      red: redCount,
      errors: errorCount,
      skipped: skippedCount
    };
    
  } catch (error) {
    console.error('\n=== PREAUDIT PIPELINE FAILED ===');
    console.error('Error:', error);
    
    // Close browser if open
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore
      }
    }
    
    // Update status to failed
    try {
      await new Promise((resolve, reject) => {
        updatePreauditSearch(searchId, {
          status: 'failed',
          error_message: error.message
        }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (updateErr) {
      console.error('[PREAUDIT PIPELINE] Failed to update error status:', updateErr);
    }
    
    throw error;
  }
}

module.exports = {
  runPreauditSearch,
  processWebsite,
  normalizeUrl
};
