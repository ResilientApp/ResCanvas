/**
 * ResilientDB Health Monitor
 * 
 * Periodically checks if ResilientDB GraphQL endpoint is operational.
 * Shows a persistent warning banner when the service is down.
 * 
 * This ensures users are aware when blockchain persistence is unavailable,
 * even though their canvas operations continue to work (saved to MongoDB).
 */

import { API_BASE } from '../config/apiConfig';

let healthCheckInterval = null;
let isHealthy = true;
let lastCheckTime = null;
let queueSize = 0;
let listeners = [];

const CHECK_INTERVAL = 60000; // Check every 60 seconds
const INITIAL_DELAY = 5000;   // Wait 5 seconds after mount before first check

/**
 * Subscribe to health status changes
 * @param {Function} callback - Called with {isHealthy: boolean, queueSize: number, timestamp: number}
 * @returns {Function} Unsubscribe function
 */
export function onHealthChange(callback) {
  listeners.push(callback);
  
  // Immediately notify of current status if available
  if (lastCheckTime) {
    callback({ isHealthy, queueSize, timestamp: lastCheckTime });
  }
  
  return () => {
    listeners = listeners.filter(cb => cb !== callback);
  };
}

/**
 * Perform a single health check
 */
async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/health/resilientdb`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    const wasHealthy = isHealthy;
    const oldQueueSize = queueSize;
    
    isHealthy = response.ok;
    queueSize = data.retry_queue_size || 0;
    lastCheckTime = Date.now();
    
    // Notify listeners if status changed or queue size changed significantly
    if (wasHealthy !== isHealthy || Math.abs(oldQueueSize - queueSize) > 5) {
      console.log(`[ResilientDB Monitor] Status: ${isHealthy ? 'healthy' : 'unhealthy'}, Queue: ${queueSize}`);
      listeners.forEach(cb => cb({ isHealthy, queueSize, timestamp: lastCheckTime }));
    }
    
    return isHealthy;
  } catch (error) {
    const wasHealthy = isHealthy;
    isHealthy = false;
    lastCheckTime = Date.now();
    
    if (wasHealthy !== isHealthy) {
      console.error('[ResilientDB Monitor] Health check failed:', error);
      listeners.forEach(cb => cb({ isHealthy, queueSize, timestamp: lastCheckTime }));
    }
    
    return false;
  }
}

/**
 * Start periodic health monitoring
 */
export function startMonitoring() {
  if (healthCheckInterval) {
    console.warn('[ResilientDB Monitor] Already monitoring');
    return;
  }
  
  console.log('[ResilientDB Monitor] Starting health checks');
  
  // Initial check after delay
  setTimeout(() => {
    checkHealth();
  }, INITIAL_DELAY);
  
  // Periodic checks
  healthCheckInterval = setInterval(() => {
    checkHealth();
  }, CHECK_INTERVAL);
}

/**
 * Stop periodic health monitoring
 */
export function stopMonitoring() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log('[ResilientDB Monitor] Stopped health checks');
  }
}

/**
 * Get current health status
 */
export function getHealthStatus() {
  return {
    isHealthy,
    queueSize,
    lastCheckTime
  };
}

/**
 * Force an immediate health check
 */
export async function forceHealthCheck() {
  return await checkHealth();
}
