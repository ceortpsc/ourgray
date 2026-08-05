export const JOB_STATES = Object.freeze([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'RETRY_WAIT',
  'CANCELLED',
  'DEAD_LETTER'
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return structuredClone(value);
}

function nowIso(now) {
  return now().toISOString();
}

function normalizePriority(value) {
  const number = Number(value ?? 50);
  if (!Number.isFinite(number)) return 50;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function calculateDelay(policy, attempt) {
  const base = Number(policy.baseDelayMs ?? 1000);
  const max = Number(policy.maxDelayMs ?? 30000);
  if (policy.backoff === 'fixed') return Math.min(max, base);
  const delay = base * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(max, delay);
}

export class JobEngine {
  constructor({
    now = () => new Date(),
    sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    retryPolicy = {},
    maxConcurrentJobs = 1,
    eventSink = null
  } = {}) {
    this.now = now;
    this.sleep = sleep;
    this.retryPolicy = {
      maxAttempts: Number(retryPolicy.maxAttempts ?? 3),
      baseDelayMs: Number(retryPolicy.baseDelayMs ?? 1000),
      maxDelayMs: Number(retryPolicy.maxDelayMs ?? 30000),
      backoff: retryPolicy.backoff || 'exponential'
    };
    this.maxConcurrentJobs = Math.max(1, Number(maxConcurrentJobs || 1));
    this.eventSink = eventSink;
    this.handlers = new Map();
    this.jobs = new Map();
    this.queue = [];
    this.deadLetters = [];
    this.running = 0;
  }

  register(type, handler, { validate = null } = {}) {
    assert(type && typeof type === 'string', 'Job type is required.');
    assert(typeof handler === 'function', 'Job handler must be a function.');
    this.handlers.set(type, { handler, validate });
    return this;
  }

  enqueue({ type, payload = {}, priority = 50, idempotencyKey = null, metadata = {} } = {}) {
    assert(this.handlers.has(type), `No handler registered for job type ${type}.`);
    if (idempotencyKey) {
      const existing = [...this.jobs.values()].find(job => job.idempotencyKey === idempotencyKey && !['FAILED', 'CANCELLED', 'DEAD_LETTER'].includes(job.state));
      if (existing) return clone(existing);
    }

    const definition = this.handlers.get(type);
    if (definition.validate) definition.validate(payload);
    const createdAt = nowIso(this.now);
    const job = {
      jobId: crypto.randomUUID(),
      type,
      state: 'QUEUED',
      priority: normalizePriority(priority),
      payload: clone(payload),
      metadata: clone(metadata),
      idempotencyKey,
      attempts: 0,
      createdAt,
      updatedAt: createdAt,
      startedAt: null,
      completedAt: null,
      nextAttemptAt: null,
      result: null,
      error: null,
      history: [{ state: 'QUEUED', occurredAt: createdAt, actor: 'job-engine' }]
    };
    this.jobs.set(job.jobId, job);
    this.queue.push(job.jobId);
    this.#sortQueue();
    this.#emit('JOB_QUEUED', { jobId: job.jobId, type, priority: job.priority, idempotencyKey });
    return clone(job);
  }

  get(jobId) {
    const job = this.jobs.get(jobId);
    return job ? clone(job) : null;
  }

  list({ state = null, type = null } = {}) {
    return [...this.jobs.values()]
      .filter(job => !state || job.state === state)
      .filter(job => !type || job.type === type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  cancel(jobId, actor = 'system') {
    const job = this.jobs.get(jobId);
    assert(job, 'Job not found.');
    assert(['QUEUED', 'RETRY_WAIT'].includes(job.state), 'Only queued or retry-wait jobs may be cancelled.');
    this.queue = this.queue.filter(id => id !== jobId);
    this.#transition(job, 'CANCELLED', actor);
    job.completedAt = nowIso(this.now);
    this.#emit('JOB_CANCELLED', { jobId, actor });
    return clone(job);
  }

  retryDeadLetter(jobId, actor = 'system') {
    const job = this.jobs.get(jobId);
    assert(job?.state === 'DEAD_LETTER', 'Job is not in the dead-letter queue.');
    job.error = null;
    job.result = null;
    job.nextAttemptAt = null;
    this.#transition(job, 'QUEUED', actor);
    this.deadLetters = this.deadLetters.filter(id => id !== jobId);
    this.queue.push(jobId);
    this.#sortQueue();
    this.#emit('DEAD_LETTER_REQUEUED', { jobId, actor });
    return clone(job);
  }

  async runNext() {
    if (this.running >= this.maxConcurrentJobs) return null;
    const jobId = this.queue.shift();
    if (!jobId) return null;
    const job = this.jobs.get(jobId);
    if (!job || !['QUEUED', 'RETRY_WAIT'].includes(job.state)) return null;
    this.running += 1;
    try {
      return await this.#execute(job);
    } finally {
      this.running -= 1;
    }
  }

  async drain({ maxJobs = 1000 } = {}) {
    const completed = [];
    let processed = 0;
    while (this.queue.length && processed < maxJobs) {
      const batch = [];
      while (this.queue.length && batch.length < this.maxConcurrentJobs && processed + batch.length < maxJobs) {
        batch.push(this.runNext());
      }
      const results = await Promise.all(batch);
      completed.push(...results.filter(Boolean));
      processed += batch.length;
    }
    return completed;
  }

  snapshot() {
    return {
      generatedAt: nowIso(this.now),
      counts: Object.fromEntries(JOB_STATES.map(state => [state, this.list({ state }).length])),
      queueDepth: this.queue.length,
      running: this.running,
      deadLetterCount: this.deadLetters.length,
      jobs: this.list()
    };
  }

  async #execute(job) {
    const definition = this.handlers.get(job.type);
    job.attempts += 1;
    job.startedAt ||= nowIso(this.now);
    this.#transition(job, 'RUNNING', 'job-engine');
    this.#emit('JOB_STARTED', { jobId: job.jobId, type: job.type, attempt: job.attempts });

    try {
      const result = await definition.handler(clone(job.payload), {
        job: clone(job),
        attempt: job.attempts,
        metadata: clone(job.metadata),
        emit: (event, details = {}) => this.#emit(event, { jobId: job.jobId, ...details })
      });
      job.result = clone(result ?? null);
      job.error = null;
      job.completedAt = nowIso(this.now);
      this.#transition(job, 'SUCCEEDED', 'job-engine');
      this.#emit('JOB_SUCCEEDED', { jobId: job.jobId, type: job.type, attempt: job.attempts });
      return clone(job);
    } catch (error) {
      job.error = {
        name: error?.name || 'Error',
        message: error?.message || String(error),
        occurredAt: nowIso(this.now)
      };
      if (job.attempts < this.retryPolicy.maxAttempts) {
        const delayMs = calculateDelay(this.retryPolicy, job.attempts);
        job.nextAttemptAt = new Date(this.now().getTime() + delayMs).toISOString();
        this.#transition(job, 'RETRY_WAIT', 'job-engine');
        this.#emit('JOB_RETRY_SCHEDULED', { jobId: job.jobId, type: job.type, attempt: job.attempts, delayMs });
        await this.sleep(delayMs);
        if (job.state === 'RETRY_WAIT') {
          this.queue.push(job.jobId);
          this.#sortQueue();
        }
      } else {
        job.completedAt = nowIso(this.now);
        this.#transition(job, 'DEAD_LETTER', 'job-engine');
        if (!this.deadLetters.includes(job.jobId)) this.deadLetters.push(job.jobId);
        this.#emit('JOB_DEAD_LETTERED', { jobId: job.jobId, type: job.type, attempts: job.attempts, error: job.error.message });
      }
      return clone(job);
    }
  }

  #transition(job, state, actor) {
    assert(JOB_STATES.includes(state), `Unsupported job state: ${state}`);
    job.state = state;
    job.updatedAt = nowIso(this.now);
    job.history.unshift({ state, occurredAt: job.updatedAt, actor });
  }

  #sortQueue() {
    this.queue.sort((leftId, rightId) => {
      const left = this.jobs.get(leftId);
      const right = this.jobs.get(rightId);
      return right.priority - left.priority || left.createdAt.localeCompare(right.createdAt);
    });
  }

  #emit(event, details) {
    if (typeof this.eventSink === 'function') this.eventSink({ event, occurredAt: nowIso(this.now), details: clone(details) });
  }
}
