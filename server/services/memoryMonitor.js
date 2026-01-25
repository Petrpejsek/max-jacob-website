/**
 * Memory Monitor Service
 * 
 * Lightweight periodic memory logging for production diagnostics.
 * Helps identify memory leaks and OOM issues on Render.
 * 
 * Can be disabled via DISABLE_MEMORY_LOGGING=true env var.
 */

const MONITORING_INTERVAL = 60000; // 60 seconds
const DISABLE_LOGGING = process.env.DISABLE_MEMORY_LOGGING === 'true';

let monitorInterval = null;

/**
 * Format bytes to human-readable MB
 */
function formatMB(bytes) {
  return Math.round(bytes / 1024 / 1024);
}

/**
 * Get current memory usage snapshot
 */
function getMemorySnapshot() {
  const mem = process.memoryUsage();
  return {
    rss: formatMB(mem.rss),
    heapUsed: formatMB(mem.heapUsed),
    heapTotal: formatMB(mem.heapTotal),
    external: formatMB(mem.external),
    timestamp: new Date().toISOString()
  };
}

/**
 * Log memory usage (safe format)
 */
function logMemory() {
  if (DISABLE_LOGGING) return;
  
  const snap = getMemorySnapshot();
  console.log(`[MEMORY MONITOR] RSS: ${snap.rss}MB, Heap Used: ${snap.heapUsed}MB, Heap Total: ${snap.heapTotal}MB, External: ${snap.external}MB`);
}

/**
 * Start periodic memory monitoring
 */
function startMonitoring() {
  if (DISABLE_LOGGING) {
    console.log('[MEMORY MONITOR] Disabled via DISABLE_MEMORY_LOGGING env var');
    return;
  }
  
  if (monitorInterval) {
    console.warn('[MEMORY MONITOR] Already running, skipping duplicate start');
    return;
  }
  
  console.log(`[MEMORY MONITOR] Starting periodic logging (every ${MONITORING_INTERVAL / 1000}s)`);
  
  // Log immediately on start
  logMemory();
  
  // Set up periodic logging
  monitorInterval = setInterval(() => {
    logMemory();
  }, MONITORING_INTERVAL);
  
  // Prevent interval from keeping process alive
  if (monitorInterval.unref) {
    monitorInterval.unref();
  }
}

/**
 * Stop monitoring (for testing)
 */
function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('[MEMORY MONITOR] Stopped');
  }
}

/**
 * Log memory usage at a specific point (for request-level logging)
 * Returns snapshot for before/after comparison
 */
function logMemoryPoint(label) {
  if (DISABLE_LOGGING) return null;
  
  const snap = getMemorySnapshot();
  console.log(`[MEMORY] ${label}: RSS=${snap.rss}MB, Heap=${snap.heapUsed}MB`);
  return snap;
}

/**
 * Log memory delta between two snapshots
 */
function logMemoryDelta(label, before, after) {
  if (DISABLE_LOGGING || !before || !after) return;
  
  const rssDelta = after.rss - before.rss;
  const heapDelta = after.heapUsed - before.heapUsed;
  
  const sign = (val) => val >= 0 ? '+' : '';
  console.log(`[MEMORY] ${label}: RSS ${sign(rssDelta)}${rssDelta}MB, Heap ${sign(heapDelta)}${heapDelta}MB`);
}

module.exports = {
  startMonitoring,
  stopMonitoring,
  getMemorySnapshot,
  logMemory,
  logMemoryPoint,
  logMemoryDelta
};
