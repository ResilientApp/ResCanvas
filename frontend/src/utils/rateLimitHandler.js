// frontend/src/utils/rateLimitHandler.js
/**
 * Rate Limit Handler for ResCanvas Frontend
 * 
 * Provides utilities for:
 * - Detecting rate limit errors (429)
 * - Parsing rate limit headers
 * - Auto-retry with exponential backoff
 * - User notifications
 * - Request queueing during rate limits
 */

/**
 * Parse rate limit information from response headers
 */
export function parseRateLimitInfo(response) {
  if (!response || !response.headers) {
    return null;
  }

  return {
    limit: parseInt(response.headers.get('X-RateLimit-Limit')) || null,
    remaining: parseInt(response.headers.get('X-RateLimit-Remaining')) || null,
    reset: parseInt(response.headers.get('X-RateLimit-Reset')) || null,
    retryAfter: parseInt(response.headers.get('Retry-After')) || null,
  };
}

/**
 * Check if a response is a rate limit error
 */
export function isRateLimitError(error) {
  return (
    error &&
    error.response &&
    error.response.status === 429
  );
}

/**
 * Calculate delay for exponential backoff
 */
export function calculateBackoffDelay(attempt, baseDelay = 1000, maxDelay = 60000) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * delay * 0.1;
  return delay + jitter;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * 
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} - Result of successful function call
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 60000,
    onRetry = null,
  } = options;

  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's not a rate limit error
      if (!isRateLimitError(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts - 1) {
        break;
      }

      // Calculate delay
      const rateLimitInfo = parseRateLimitInfo(error.response);
      let delay;

      if (rateLimitInfo && rateLimitInfo.retryAfter) {
        // Use server-provided Retry-After header (in seconds)
        delay = rateLimitInfo.retryAfter * 1000;
      } else {
        // Use exponential backoff
        delay = calculateBackoffDelay(attempt, baseDelay, maxDelay);
      }

      // Notify about retry
      if (onRetry) {
        onRetry(attempt + 1, delay, rateLimitInfo);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Format user-friendly rate limit message
 */
export function formatRateLimitMessage(error) {
  const rateLimitInfo = parseRateLimitInfo(error.response);
  
  if (rateLimitInfo && rateLimitInfo.retryAfter) {
    const seconds = rateLimitInfo.retryAfter;
    if (seconds < 60) {
      return `Rate limit exceeded. Please wait ${seconds} seconds.`;
    } else {
      const minutes = Math.ceil(seconds / 60);
      return `Rate limit exceeded. Please wait ${minutes} minute(s).`;
    }
  }

  return 'Rate limit exceeded. Please try again in a moment.';
}

/**
 * Request Queue for handling rate limits
 * Queues requests when rate limited and executes them after limit resets
 */
export class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.rateLimitInfo = null;
  }

  /**
   * Add request to queue
   */
  enqueue(requestFn, resolve, reject) {
    this.queue.push({ requestFn, resolve, reject });
    
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process queued requests
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const { requestFn, resolve, reject } = this.queue[0];

      try {
        // If we have rate limit info, wait before executing
        if (this.rateLimitInfo && this.rateLimitInfo.retryAfter) {
          await sleep(this.rateLimitInfo.retryAfter * 1000);
          this.rateLimitInfo = null;
        }

        const result = await requestFn();
        resolve(result);
        this.queue.shift();
      } catch (error) {
        if (isRateLimitError(error)) {
          // Update rate limit info and wait
          this.rateLimitInfo = parseRateLimitInfo(error.response);
          
          // Wait before processing next request
          if (this.rateLimitInfo && this.rateLimitInfo.retryAfter) {
            await sleep(this.rateLimitInfo.retryAfter * 1000);
            this.rateLimitInfo = null;
          } else {
            // Fallback delay
            await sleep(60000); // 1 minute
          }
        } else {
          // Not a rate limit error, reject and remove from queue
          reject(error);
          this.queue.shift();
        }
      }
    }

    this.processing = false;
  }

  /**
   * Wrap a request function with queueing
   */
  wrap(requestFn) {
    return () => {
      return new Promise((resolve, reject) => {
        this.enqueue(requestFn, resolve, reject);
      });
    };
  }
}

/**
 * Global request queue instance
 */
export const globalRequestQueue = new RequestQueue();

/**
 * Rate limit aware fetch wrapper
 */
export async function rateLimitAwareFetch(url, options = {}, retryOptions = {}) {
  const fetchFn = async () => {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const error = new Error('Rate limit exceeded');
      error.response = response;
      error.rateLimitInfo = parseRateLimitInfo(response);
      throw error;
    }
    
    return response;
  };

  return await retryWithBackoff(fetchFn, {
    maxAttempts: retryOptions.maxAttempts || 3,
    baseDelay: retryOptions.baseDelay || 1000,
    onRetry: retryOptions.onRetry,
  });
}

/**
 * Show rate limit notification to user
 */
export function showRateLimitNotification(error, notificationFn) {
  const message = formatRateLimitMessage(error);
  const rateLimitInfo = parseRateLimitInfo(error.response);

  if (notificationFn) {
    notificationFn({
      type: 'warning',
      message: message,
      duration: rateLimitInfo?.retryAfter ? rateLimitInfo.retryAfter * 1000 : 5000,
    });
  } else {
    // Fallback to console
    console.warn('Rate limit exceeded:', message);
  }
}

/**
 * Monitor rate limit headers and warn user when approaching limit
 */
export class RateLimitMonitor {
  constructor(warningThreshold = 0.2) {
    this.warningThreshold = warningThreshold; // Warn when 20% remaining
    this.lastWarningTime = {};
  }

  /**
   * Check response headers and warn if approaching limit
   */
  checkResponse(response, endpoint, warningCallback) {
    const rateLimitInfo = parseRateLimitInfo(response);
    
    if (!rateLimitInfo || rateLimitInfo.limit === null || rateLimitInfo.remaining === null) {
      return;
    }

    const percentRemaining = rateLimitInfo.remaining / rateLimitInfo.limit;
    
    if (percentRemaining <= this.warningThreshold) {
      // Only warn once per minute per endpoint
      const now = Date.now();
      const lastWarning = this.lastWarningTime[endpoint] || 0;
      
      if (now - lastWarning > 60000) {
        this.lastWarningTime[endpoint] = now;
        
        if (warningCallback) {
          warningCallback({
            endpoint,
            limit: rateLimitInfo.limit,
            remaining: rateLimitInfo.remaining,
            reset: rateLimitInfo.reset,
          });
        }
      }
    }
  }
}

export const globalRateLimitMonitor = new RateLimitMonitor();
