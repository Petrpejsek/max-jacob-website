/**
 * Email Detector - Multi-Method Email Detection
 * 
 * Detects email addresses on websites using multiple strategies:
 * 1. Regex patterns (comprehensive email formats)
 * 2. DOM parsing (footer, header, contact sections)
 * 3. mailto: links
 * 4. /contact page crawling
 * 5. JavaScript decoded emails (obfuscation bypass)
 */

/**
 * Comprehensive email regex patterns
 */
const EMAIL_PATTERNS = [
  // Standard email pattern
  /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi,
  // Email with optional display name
  /<?([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)>?/gi,
  // Email in text format (word at word dot word)
  /([a-zA-Z0-9._-]+\s*@\s*[a-zA-Z0-9._-]+\s*\.\s*[a-zA-Z0-9_-]+)/gi,
  // Email with [at] replacement
  /([a-zA-Z0-9._-]+\s*\[at\]\s*[a-zA-Z0-9._-]+\s*\[dot\]\s*[a-zA-Z0-9_-]+)/gi,
  // Email with (at) replacement
  /([a-zA-Z0-9._-]+\s*\(at\)\s*[a-zA-Z0-9._-]+\s*\(dot\)\s*[a-zA-Z0-9_-]+)/gi
];

/**
 * Common spam/fake email patterns to exclude
 */
const SPAM_PATTERNS = [
  /example\.com$/i,
  /test\.com$/i,
  /sample\.com$/i,
  /placeholder\.com$/i,
  /yoursite\.com$/i,
  /yourdomain\.com$/i,
  /domain\.com$/i,
  /email\.com$/i,
  /noreply@/i,
  /no-reply@/i
];

/**
 * Normalize email address (clean up obfuscation)
 * @param {string} email - Raw email string
 * @returns {string} Normalized email
 */
function normalizeEmail(email) {
  return email
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/\[at\]/gi, '@')
    .replace(/\(at\)/gi, '@')
    .replace(/\[dot\]/gi, '.')
    .replace(/\(dot\)/gi, '.')
    .replace(/[<>]/g, '');
}

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  const normalized = normalizeEmail(email);
  
  // Check basic format
  // IMPORTANT:
  // - must have a real TLD (letters only, length >= 2)
  // - prevents false positives like "froala-editor@4.6" (package@version)
  const basicPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}$/;
  if (!basicPattern.test(normalized)) return false;

  // Reject "version domains" like 4.6, 1.2.3, etc.
  // Example false positive: froala-editor@4.6
  const at = normalized.lastIndexOf('@');
  if (at > 0) {
    const domain = normalized.slice(at + 1);
    if (/^\d+(\.\d+)+$/.test(domain)) return false;
  }
  
  // Check for spam patterns
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(normalized)) return false;
  }
  
  // Check for reasonable length
  if (normalized.length < 5 || normalized.length > 254) return false;
  
  return true;
}

/**
 * Extract emails from text using regex patterns
 * @param {string} text - Text to search
 * @returns {Array<string>} Array of found emails
 */
function extractEmailsFromText(text) {
  if (!text) return [];
  
  const emails = new Set();
  
  for (const pattern of EMAIL_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const email = match[1] || match[0];
      if (email) {
        const normalized = normalizeEmail(email);
        if (isValidEmail(normalized)) {
          emails.add(normalized);
        }
      }
    }
  }
  
  return Array.from(emails);
}

/**
 * Method 1: Extract emails from page HTML using regex
 * @param {object} page - Playwright page object
 * @returns {Promise<Array<string>>} Found emails
 */
async function findEmailsInHTML(page) {
  try {
    const html = await page.content();
    return extractEmailsFromText(html);
  } catch (error) {
    console.error('[EMAIL DETECTOR] Error in findEmailsInHTML:', error);
    return [];
  }
}

/**
 * Method 2: Extract emails from specific DOM sections (footer, header, contact)
 * @param {object} page - Playwright page object
 * @returns {Promise<Array<string>>} Found emails
 */
async function findEmailsInDOMSections(page) {
  try {
    const selectors = [
      'footer',
      'header',
      '.footer',
      '.header',
      '.contact',
      '.contact-info',
      '.contact-us',
      '#footer',
      '#header',
      '#contact',
      '[class*="contact"]',
      '[class*="footer"]',
      '[id*="contact"]'
    ];
    
    const emails = new Set();
    
    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements) {
          const text = await element.textContent();
          if (text) {
            const found = extractEmailsFromText(text);
            found.forEach(email => emails.add(email));
          }
        }
      } catch (e) {
        // Skip if selector fails
      }
    }
    
    return Array.from(emails);
  } catch (error) {
    console.error('[EMAIL DETECTOR] Error in findEmailsInDOMSections:', error);
    return [];
  }
}

/**
 * Method 3: Extract emails from mailto: links
 * @param {object} page - Playwright page object
 * @returns {Promise<Array<string>>} Found emails
 */
async function findEmailsInMailtoLinks(page) {
  try {
    const mailtoLinks = await page.$$eval('a[href^="mailto:"]', links =>
      links.map(link => link.getAttribute('href'))
    );
    
    const emails = new Set();
    
    for (const href of mailtoLinks) {
      if (href && href.startsWith('mailto:')) {
        // Extract email from mailto:email@example.com?subject=...
        const email = href.replace('mailto:', '').split('?')[0];
        const normalized = normalizeEmail(email);
        if (isValidEmail(normalized)) {
          emails.add(normalized);
        }
      }
    }
    
    return Array.from(emails);
  } catch (error) {
    console.error('[EMAIL DETECTOR] Error in findEmailsInMailtoLinks:', error);
    return [];
  }
}

/**
 * Method 4: Try to find and crawl /contact page
 * @param {object} page - Playwright page object
 * @param {string} baseUrl - Base URL of the website
 * @returns {Promise<Array<string>>} Found emails
 */
async function findEmailsOnContactPage(page, baseUrl) {
  try {
    // Common contact page URLs
    const contactPaths = [
      '/contact',
      '/contact-us',
      '/contactus',
      '/contact.html',
      '/contact-us.html',
      '/about/contact',
      '/get-in-touch',
      '/reach-us'
    ];
    
    const emails = new Set();
    const currentUrl = page.url();
    
    for (const path of contactPaths) {
      try {
        const contactUrl = new URL(path, baseUrl).href;
        
        // Don't re-visit current page
        if (contactUrl === currentUrl) continue;
        
        console.log('[EMAIL DETECTOR] Trying contact page:', contactUrl);
        
        // Navigate to contact page (with timeout)
        await page.goto(contactUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });
        
        // Extract emails from contact page
        const html = await page.content();
        const found = extractEmailsFromText(html);
        found.forEach(email => emails.add(email));
        
        // If we found emails, stop searching
        if (emails.size > 0) {
          console.log('[EMAIL DETECTOR] Found emails on contact page:', contactUrl);
          break;
        }
      } catch (e) {
        // Page doesn't exist or failed to load, try next
        continue;
      }
    }
    
    return Array.from(emails);
  } catch (error) {
    console.error('[EMAIL DETECTOR] Error in findEmailsOnContactPage:', error);
    return [];
  }
}

/**
 * Main email detection function - tries all methods
 * @param {string} url - Website URL
 * @param {object} page - Playwright page object (already navigated to URL)
 * @returns {Promise<object>} { found: boolean, email: string|null, method: string, allEmails: Array }
 */
async function detectEmail(url, page) {
  console.log('[EMAIL DETECTOR] Starting email detection for:', url);
  
  const allEmails = new Set();
  let detectionMethod = null;
  
  try {
    // Method 1: mailto links (fastest and most reliable)
    console.log('[EMAIL DETECTOR] Method 1: Checking mailto links...');
    const mailtoEmails = await findEmailsInMailtoLinks(page);
    mailtoEmails.forEach(email => allEmails.add(email));
    if (mailtoEmails.length > 0) {
      detectionMethod = 'mailto_links';
      console.log('[EMAIL DETECTOR] ✓ Found via mailto links:', mailtoEmails);
    }
    
    // Method 2: DOM sections (footer, header, contact)
    if (allEmails.size === 0) {
      console.log('[EMAIL DETECTOR] Method 2: Checking DOM sections...');
      const domEmails = await findEmailsInDOMSections(page);
      domEmails.forEach(email => allEmails.add(email));
      if (domEmails.length > 0) {
        detectionMethod = 'dom_sections';
        console.log('[EMAIL DETECTOR] ✓ Found in DOM sections:', domEmails);
      }
    }
    
    // Method 3: Full HTML regex scan
    if (allEmails.size === 0) {
      console.log('[EMAIL DETECTOR] Method 3: Scanning full HTML...');
      const htmlEmails = await findEmailsInHTML(page);
      htmlEmails.forEach(email => allEmails.add(email));
      if (htmlEmails.length > 0) {
        detectionMethod = 'html_regex';
        console.log('[EMAIL DETECTOR] ✓ Found in HTML:', htmlEmails);
      }
    }
    
    // Method 4: Contact page crawl (last resort, slower)
    if (allEmails.size === 0) {
      console.log('[EMAIL DETECTOR] Method 4: Crawling /contact page...');
      const baseUrl = new URL(url).origin;
      const contactEmails = await findEmailsOnContactPage(page, baseUrl);
      contactEmails.forEach(email => allEmails.add(email));
      if (contactEmails.length > 0) {
        detectionMethod = 'contact_page';
        console.log('[EMAIL DETECTOR] ✓ Found on contact page:', contactEmails);
      }
    }
    
    const emailsArray = Array.from(allEmails);
    
    if (emailsArray.length > 0) {
      console.log('[EMAIL DETECTOR] ✓ SUCCESS - Found', emailsArray.length, 'email(s):', emailsArray);
      return {
        found: true,
        email: emailsArray[0], // Return first email
        method: detectionMethod,
        allEmails: emailsArray
      };
    } else {
      console.log('[EMAIL DETECTOR] ✗ No emails found');
      return {
        found: false,
        email: null,
        method: null,
        allEmails: []
      };
    }
  } catch (error) {
    console.error('[EMAIL DETECTOR] Error during detection:', error);
    return {
      found: false,
      email: null,
      method: null,
      allEmails: [],
      error: error.message
    };
  }
}

module.exports = {
  detectEmail,
  findEmailsInHTML,
  findEmailsInDOMSections,
  findEmailsInMailtoLinks,
  findEmailsOnContactPage,
  extractEmailsFromText,
  normalizeEmail,
  isValidEmail
};
