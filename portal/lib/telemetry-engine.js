const DEFAULT_SENSITIVE_KEYS = Object.freeze([
  'password',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'ssn',
  'socialSecurityNumber',
  'bankAccount',
  'routingNumber',
  'dateOfBirth'
]);

function clone(value) {
  return structuredClone(value);
}

function redact(value, sensitiveKeys) {
  if (Array.isArray(value)) return value.map(item => redact(item, sensitiveKeys));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = sensitiveKeys.has(key) ? '[REDACTED]' : redact(item, sensitiveKeys);
  }
  return result;
}

export class TelemetryEngine {
  constructor({
    now = () => new Date(),
    retentionLimit = 500,
    sensitiveKeys = DEFAULT_SENSITIVE_KEYS,
    storage = null,
    storageKey = 'ggh.telemetry.v1'
  } = {}) {
    this.now = now;
    this.retentionLimit = Math.max(50, Number(retentionLimit || 500));
    this.sensitiveKeys = new Set(sensitiveKeys);
    this.storage = storage;
    this.storageKey = storageKey;
    this.events = this.#load();
    this.healthChecks = new Map();
  }

  record(name, details = {}, { level = 'INFO', source = 'platform', correlationId = null } = {}) {
    const event = {
      eventId: crypto.randomUUID(),
      occurredAt: this.now().toISOString(),
      name,
      level,
      source,
      correlationId,
      details: redact(clone(details), this.sensitiveKeys)
    };
    this.events.unshift(event);
    this.events = this.events.slice(0, this.retentionLimit);
    this.#save();
    return clone(event);
  }

  registerHealthCheck(name, check) {
    if (!name || typeof check !== 'function') throw new Error('Health-check name and function are required.');
    this.healthChecks.set(name, check);
    return this;
  }

  async health() {
    const generatedAt = this.now().toISOString();
    const checks = [];
    for (const [name, check] of this.healthChecks.entries()) {
      const started = performance.now();
      try {
        const result = await check();
        checks.push({
          name,
          status: result?.status || 'HEALTHY',
          latencyMs: Math.round((performance.now() - started) * 100) / 100,
          details: redact(result?.details || {}, this.sensitiveKeys)
        });
      } catch (error) {
        checks.push({
          name,
          status: 'UNHEALTHY',
          latencyMs: Math.round((performance.now() - started) * 100) / 100,
          details: { error: error?.message || String(error) }
        });
      }
    }
    const overall = checks.some(check => check.status === 'UNHEALTHY')
      ? 'UNHEALTHY'
      : checks.some(check => check.status === 'DEGRADED')
        ? 'DEGRADED'
        : 'HEALTHY';
    return { generatedAt, overall, checks };
  }

  metrics() {
    const byLevel = {};
    const bySource = {};
    const byName = {};
    for (const event of this.events) {
      byLevel[event.level] = (byLevel[event.level] || 0) + 1;
      bySource[event.source] = (bySource[event.source] || 0) + 1;
      byName[event.name] = (byName[event.name] || 0) + 1;
    }
    return {
      generatedAt: this.now().toISOString(),
      totalEvents: this.events.length,
      byLevel,
      bySource,
      byName,
      latestEventAt: this.events[0]?.occurredAt || null
    };
  }

  query({ name = null, level = null, source = null, correlationId = null, limit = 100 } = {}) {
    return this.events
      .filter(event => !name || event.name === name)
      .filter(event => !level || event.level === level)
      .filter(event => !source || event.source === source)
      .filter(event => !correlationId || event.correlationId === correlationId)
      .slice(0, Math.max(1, Number(limit || 100)))
      .map(clone);
  }

  clear() {
    this.events = [];
    this.#save();
  }

  #load() {
    if (!this.storage) return [];
    try {
      const parsed = JSON.parse(this.storage.getItem(this.storageKey) || '[]');
      return Array.isArray(parsed) ? parsed.slice(0, this.retentionLimit) : [];
    } catch {
      return [];
    }
  }

  #save() {
    if (this.storage) this.storage.setItem(this.storageKey, JSON.stringify(this.events));
  }
}
