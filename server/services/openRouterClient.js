/**
 * OpenRouter Client - Unified LLM Request Handler
 * 
 * Single source of truth for all LLM API calls with:
 * - Consistent error handling
 * - Request/response logging
 * - Token usage tracking
 * - JSON parsing with fallback
 */

/**
 * Send a request to OpenRouter API
 * 
 * @param {Object} options
 * @param {string} options.model - OpenRouter model identifier (e.g., 'openai/gpt-4.1', 'anthropic/claude-3.7-sonnet')
 * @param {number} options.temperature - Temperature (0.0 - 1.0)
 * @param {string} options.system_prompt - System prompt
 * @param {Object} options.user_content - User content (will be JSON.stringified)
 * @param {Object} options.metadata - Metadata for tracking (job_id, assistant_key, template_version, etc.)
 * @returns {Promise<Object>} - {raw_text, parsed_json, token_usage, request_payload}
 */
async function sendOpenRouterRequest({ 
  model, 
  temperature, 
  system_prompt, 
  user_content,
  metadata = {}
}) {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '')
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/^'(.*)'$/, '$1');
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }

  // Build request payload
  const request_payload = {
    model,
    temperature,
    messages: [
      { role: 'system', content: system_prompt },
      { role: 'user', content: typeof user_content === 'string' ? user_content : JSON.stringify(user_content, null, 2) }
    ]
  };

  // Log request (for debugging)
  console.log(`[OpenRouter] Sending request to model: ${model} (temp: ${temperature})`);
  console.log(`[OpenRouter] Metadata:`, metadata);

  try {
    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'Max&Jacob Audit Pipeline'
      },
      body: JSON.stringify(request_payload)
    });

    // Check for HTTP errors
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `OpenRouter API error: ${response.status} ${response.statusText}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch (e) {
        // Error text is not JSON, use as-is
        errorMessage += ` - ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    // Parse response
    const responseData = await response.json();
    
    // Extract message content
    const raw_text = responseData.choices?.[0]?.message?.content || '';
    
    if (!raw_text) {
      throw new Error('OpenRouter returned empty response');
    }

    // Parse JSON from response
    const parsed_json = parseJsonFromLLMResponse(raw_text);

    // Extract token usage (if available)
    const token_usage = responseData.usage ? {
      prompt_tokens: responseData.usage.prompt_tokens || 0,
      completion_tokens: responseData.usage.completion_tokens || 0,
      total_tokens: responseData.usage.total_tokens || 0
    } : null;

    console.log(`[OpenRouter] Response received: ${raw_text.length} chars, ${token_usage?.total_tokens || 'unknown'} tokens`);

    return {
      raw_text,
      parsed_json,
      token_usage,
      request_payload: {
        model,
        temperature,
        messages: request_payload.messages,
        metadata
      }
    };

  } catch (error) {
    console.error(`[OpenRouter] Request failed:`, error.message);
    throw error;
  }
}

/**
 * Parse JSON from LLM response with fallback strategies
 * 
 * Strategy:
 * 1. Try direct JSON.parse
 * 2. Try finding JSON block in markdown (```json ... ```)
 * 3. Try finding first { ... } block
 * 4. Fail with descriptive error
 * 
 * @param {string} text - Raw LLM response text
 * @returns {Object} - Parsed JSON object
 * @throws {Error} - If JSON cannot be parsed
 */
function parseJsonFromLLMResponse(text) {
  const trimmed = text.trim();
  
  if (!trimmed) {
    throw new Error('LLM returned empty response');
  }

  // Strategy 1: Direct parse
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    // Continue to fallback strategies
  }

  // Strategy 2: Extract from markdown code block
  const markdownMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (markdownMatch) {
    try {
      return JSON.parse(markdownMatch[1]);
    } catch (e) {
      // Continue to next strategy
    }
  }

  // Strategy 3: Find first {...} block
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const jsonCandidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonCandidate);
    } catch (e) {
      throw new Error(`Failed to parse JSON from LLM response. Found JSON-like block but parse failed: ${e.message}`);
    }
  }

  // All strategies failed
  throw new Error(`Failed to parse JSON from LLM response. Response does not contain valid JSON. First 200 chars: ${trimmed.slice(0, 200)}`);
}

/**
 * Retry wrapper for transient errors
 * 
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts (default: 1)
 * @param {number} delayMs - Delay between retries in milliseconds (default: 2000)
 * @returns {Promise} - Result of fn
 */
async function retryOnTransientError(fn, maxRetries = 1, delayMs = 2000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if error is transient (rate limit, timeout, network)
      const isTransient = 
        error.message.includes('rate limit') ||
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('429') ||
        error.message.includes('503') ||
        error.message.includes('504');
      
      // Don't retry on non-transient errors
      if (!isTransient) {
        throw error;
      }
      
      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) {
        console.error(`[OpenRouter] Max retries (${maxRetries}) exhausted for transient error`);
        throw error;
      }
      
      // Wait before retry
      console.log(`[OpenRouter] Transient error, retrying in ${delayMs}ms... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

module.exports = {
  sendOpenRouterRequest,
  parseJsonFromLLMResponse,
  retryOnTransientError
};

