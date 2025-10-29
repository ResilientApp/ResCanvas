// frontend/src/components/RateLimitWarning.js
/**
 * Rate Limit Warning Component
 * 
 * Displays user-friendly warnings when rate limits are approached or exceeded
 */

import React, { useState, useEffect } from 'react';
import './RateLimitWarning.css';

const RateLimitWarning = ({ rateLimitInfo, onDismiss }) => {
  const [timeRemaining, setTimeRemaining] = useState(null);

  useEffect(() => {
    if (!rateLimitInfo || !rateLimitInfo.reset) {
      return;
    }

    // Calculate initial time remaining
    const calculateTimeRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = rateLimitInfo.reset - now;
      return Math.max(0, remaining);
    };

    setTimeRemaining(calculateTimeRemaining());

    // Update every second
    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining();
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        if (onDismiss) {
          onDismiss();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [rateLimitInfo, onDismiss]);

  if (!rateLimitInfo) {
    return null;
  }

  const formatTime = (seconds) => {
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };

  const isExceeded = rateLimitInfo.remaining === 0 || rateLimitInfo.exceeded;
  const isWarning = !isExceeded && rateLimitInfo.remaining <= rateLimitInfo.limit * 0.2;

  return (
    <div className={`rate-limit-warning ${isExceeded ? 'exceeded' : 'warning'}`}>
      <div className="rate-limit-icon">
        {isExceeded ? '🚫' : '⚠️'}
      </div>
      <div className="rate-limit-content">
        <div className="rate-limit-title">
          {isExceeded ? 'Rate Limit Exceeded' : 'Approaching Rate Limit'}
        </div>
        <div className="rate-limit-message">
          {isExceeded ? (
            <p>
              You've reached the maximum number of requests allowed. 
              {timeRemaining !== null && timeRemaining > 0 && (
                <> Please wait {formatTime(timeRemaining)} before trying again.</>
              )}
            </p>
          ) : (
            <p>
              You have {rateLimitInfo.remaining} of {rateLimitInfo.limit} requests remaining.
              Please slow down to avoid being temporarily blocked.
            </p>
          )}
        </div>
        {rateLimitInfo.endpoint && (
          <div className="rate-limit-details">
            Endpoint: {rateLimitInfo.endpoint}
          </div>
        )}
      </div>
      {onDismiss && !isExceeded && (
        <button className="rate-limit-dismiss" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
};

export default RateLimitWarning;

/**
 * Example Usage:
 * 
 * import RateLimitWarning from './components/RateLimitWarning';
 * 
 * function MyComponent() {
 *   const [rateLimitInfo, setRateLimitInfo] = useState(null);
 * 
 *   // When you catch a rate limit error:
 *   catch (error) {
 *     if (error.status === 429) {
 *       setRateLimitInfo({
 *         exceeded: true,
 *         limit: error.rateLimitInfo?.limit,
 *         remaining: 0,
 *         reset: error.rateLimitInfo?.reset,
 *       });
 *     }
 *   }
 * 
 *   return (
 *     <div>
 *       {rateLimitInfo && (
 *         <RateLimitWarning 
 *           rateLimitInfo={rateLimitInfo}
 *           onDismiss={() => setRateLimitInfo(null)}
 *         />
 *       )}
 *     </div>
 *   );
 * }
 */
