/**
 * Audit Job Queue - Simple in-memory queue for production stability
 * 
 * Limits concurrent audit jobs to prevent resource exhaustion.
 * For 20 audits/day with 1 server instance, concurrency=1 is safe.
 */

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

    console.log(`[AUDIT QUEUE] Starting job ${job.jobId} (${this.running}/${this.concurrency} running, ${this.queue.length} queued)`);

    try {
      const result = await job.jobFn();
      job.resolve(result);
    } catch (error) {
      console.error(`[AUDIT QUEUE] Job ${job.jobId} failed:`, error.message);
      job.reject(error);
    } finally {
      this.running--;
      console.log(`[AUDIT QUEUE] Finished job ${job.jobId} (${this.running}/${this.concurrency} running, ${this.queue.length} queued)`);
      
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
