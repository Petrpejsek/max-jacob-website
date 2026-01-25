/**
 * Audit Job Queue - Simple in-memory queue for production stability
 * 
 * Limits concurrent audit jobs to prevent resource exhaustion.
 * For 20 audits/day with 1 server instance, concurrency=1 is safe.
 */

const { getMemorySnapshot, logMemoryDelta } = require('./memoryMonitor');

class AuditQueue {
  constructor(concurrency = 1) {
    this.concurrency = concurrency;
    this.queue = [];
    this.running = 0;
  }

  /**
   * Add job to queue
   * @param {Function} jobFn - Async function that runs the audit
   * @param {number} jobId - Job ID for logging
   * @returns {Promise} - Resolves when job completes
   */
  async enqueue(jobFn, jobId) {
    return new Promise((resolve, reject) => {
      this.queue.push({ jobFn, jobId, resolve, reject });
      this.processNext();
    });
  }

  async processNext() {
    if (this.running >= this.concurrency) {
      return; // Already at max concurrency
    }

    if (this.queue.length === 0) {
      return; // Nothing to process
    }

    const job = this.queue.shift();
    this.running++;

    // Memory logging: before job starts
    const memBefore = getMemorySnapshot();
    console.log(`[AUDIT QUEUE] Starting job ${job.jobId} (${this.running}/${this.concurrency} running, ${this.queue.length} queued) - Memory: ${memBefore.rss}MB RSS, ${memBefore.heapUsed}MB heap`);

    try {
      const result = await job.jobFn();
      job.resolve(result);
    } catch (error) {
      console.error(`[AUDIT QUEUE] Job ${job.jobId} failed:`, error.message);
      job.reject(error);
    } finally {
      this.running--;
      
      // Memory logging: after job completes
      const memAfter = getMemorySnapshot();
      console.log(`[AUDIT QUEUE] Finished job ${job.jobId} (${this.running}/${this.concurrency} running, ${this.queue.length} queued) - Memory: ${memAfter.rss}MB RSS, ${memAfter.heapUsed}MB heap`);
      logMemoryDelta(`Job ${job.jobId} delta`, memBefore, memAfter);
      
      // OOM Fix: Force garbage collection after heavy audit job (if --expose-gc flag is set)
      // This immediately frees memory instead of waiting for automatic GC.
      if (global.gc) {
        try {
          global.gc();
          const memAfterGC = getMemorySnapshot();
          console.log(`[AUDIT QUEUE] After GC - Memory: ${memAfterGC.rss}MB RSS, ${memAfterGC.heapUsed}MB heap`);
        } catch (e) {
          // GC failed, ignore
        }
      }
      
      // Process next job in queue
      setImmediate(() => this.processNext());
    }
  }

  getStatus() {
    return {
      running: this.running,
      queued: this.queue.length,
      concurrency: this.concurrency
    };
  }
}

// Singleton instance - concurrency=1 for single-server production
const auditQueue = new AuditQueue(1);

module.exports = {
  auditQueue,
  AuditQueue
};
