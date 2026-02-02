/**
 * Mail-Tester.com Integration Service
 * 
 * Provides automated email deliverability testing by:
 * 1. Scraping temporary email from mail-tester.com
 * 2. Sending test emails
 * 3. Scraping and parsing test results
 */

const { chromium } = require('playwright');

/**
 * Get a temporary test email address from mail-tester.com
 * @returns {Promise<{email: string, testId: string}>}
 */
async function getTestEmail() {
  let browser;
  
  try {
    console.log('[MAIL-TESTER] Launching browser to get test email...');
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    // Navigate to mail-tester.com
    await page.goto('https://www.mail-tester.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Wait a bit for JavaScript to render
    await page.waitForTimeout(3000);
    
    // Get page content
    const pageContent = await page.content();
    
    // Try multiple methods to extract email
    let email = null;
    
    // Method 1: Look for input field
    try {
      const inputElement = await page.$('input[type="text"], input[readonly], input[value*="@mail-tester.com"]');
      if (inputElement) {
        email = await inputElement.inputValue();
      }
    } catch (e) {
      console.log('[MAIL-TESTER] Method 1 failed:', e.message);
    }
    
    // Method 2: Look for email pattern in page content
    if (!email) {
      const emailMatch = pageContent.match(/test-[a-z0-9]+@mail-tester\.com/i);
      if (emailMatch) {
        email = emailMatch[0];
      }
    }
    
    // Method 3: Look for specific elements that might contain email
    if (!email) {
      const possibleSelectors = [
        'code', 'pre', 'strong', 'b', 
        '[class*="email"]', '[id*="email"]',
        '.test-email', '#test-email'
      ];
      
      for (const selector of possibleSelectors) {
        try {
          const elements = await page.$$(selector);
          for (const el of elements) {
            const text = await el.textContent();
            if (text && text.includes('@mail-tester.com')) {
              email = text.trim();
              break;
            }
          }
          if (email) break;
        } catch (e) {
          // Continue to next selector
        }
      }
    }
    
    if (!email || !email.includes('@mail-tester.com')) {
      // Log page content for debugging
      console.error('[MAIL-TESTER] Page content sample:', pageContent.substring(0, 500));
      throw new Error('Failed to extract valid test email from page');
    }
    
    // Extract test ID from email (e.g., test-abc123@mail-tester.com -> abc123)
    const testId = email.split('@')[0].replace('test-', '');
    
    console.log(`[MAIL-TESTER] Got test email: ${email}, testId: ${testId}`);
    
    await browser.close();
    
    return { email, testId };
    
  } catch (error) {
    console.error('[MAIL-TESTER] Error getting test email:', error);
    
    if (browser) {
      await browser.close().catch(() => {});
    }
    
    throw new Error(`Failed to get mail-tester email: ${error.message}`);
  }
}

/**
 * Get test results from mail-tester.com
 * @param {string} testId - The test ID (e.g., "abc123")
 * @returns {Promise<{score: number, details: object, ready: boolean}>}
 */
async function getTestResults(testId) {
  let browser;
  
  try {
    console.log(`[MAIL-TESTER] Fetching results for test: ${testId}`);
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    // Navigate to results page
    const resultsUrl = `https://www.mail-tester.com/${testId}`;
    await page.goto(resultsUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Check if email has been received
    const pageContent = await page.content();
    
    // Check for "no email received yet" message
    if (pageContent.includes('waiting') || pageContent.includes('not received')) {
      console.log(`[MAIL-TESTER] Test ${testId} not ready yet`);
      await browser.close();
      return { ready: false, score: null, details: null };
    }
    
    // Try to find the score
    let score = null;
    
    // Method 1: Look for score in text (e.g., "You have 9/10")
    const scoreMatch = pageContent.match(/You have (\d+(?:\.\d+)?)\s*\/\s*10/i);
    if (scoreMatch) {
      score = parseFloat(scoreMatch[1]);
    }
    
    // Method 2: Look for score in specific element
    if (!score) {
      const scoreElement = await page.$('.score, .result-score, [class*="score"]');
      if (scoreElement) {
        const scoreText = await scoreElement.textContent();
        const match = scoreText.match(/(\d+(?:\.\d+)?)/);
        if (match) {
          score = parseFloat(match[1]);
        }
      }
    }
    
    if (score === null) {
      console.log(`[MAIL-TESTER] Could not extract score from page`);
    }
    
    // Extract details (SPF, DKIM, DMARC status, etc.)
    const details = {
      url: resultsUrl,
      timestamp: new Date().toISOString()
    };
    
    // Look for SPF/DKIM/DMARC status
    if (pageContent.includes('SPF')) {
      details.spf = pageContent.includes('SPF') && pageContent.includes('pass') ? 'PASS' : 'FAIL';
    }
    
    if (pageContent.includes('DKIM')) {
      details.dkim = pageContent.includes('DKIM') && pageContent.includes('pass') ? 'PASS' : 'FAIL';
    }
    
    if (pageContent.includes('DMARC')) {
      details.dmarc = pageContent.includes('DMARC') && pageContent.includes('pass') ? 'PASS' : 'FAIL';
    }
    
    console.log(`[MAIL-TESTER] Results for ${testId}: Score ${score}/10`);
    
    await browser.close();
    
    return {
      ready: true,
      score,
      details,
      resultsUrl
    };
    
  } catch (error) {
    console.error('[MAIL-TESTER] Error getting test results:', error);
    
    if (browser) {
      await browser.close().catch(() => {});
    }
    
    throw new Error(`Failed to get mail-tester results: ${error.message}`);
  }
}

module.exports = {
  getTestEmail,
  getTestResults
};
