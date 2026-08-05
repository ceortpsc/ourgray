const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const DEFAULT_ORG = 'GGH';
const STORAGE_VERSION = 1;

export const ID_TYPES = Object.freeze({
  SIGNATURE: Object.freeze({ code: 'SIG', label: 'Signature ID', permission: 'id.issue.signature', retentionClass: 'SIGNED_RECORD' }),
  CANDIDATE: Object.freeze({ code: 'CAN', label: 'Candidate ID', permission: 'id.issue.candidate', retentionClass: 'CANDIDATE_FILE' }),
  EMPLOYEE: Object.freeze({ code: 'EMP', label: 'Employee ID', permission: 'id.issue.employee', retentionClass: 'EMPLOYEE_FILE' }),
  RETENTION: Object.freeze({ code: 'RET', label: 'Retention File ID', permission: 'id.issue.retention', retentionClass: 'RECORDS_MANAGEMENT' })
});

export const ID_STATUSES = Object.freeze(['ACTIVE', 'SUSPENDED', 'REVOKED', 'SUPERSEDED', 'ARCHIVED']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function normalizeToken(value, fallback = 'NA') {
  const token = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 12);
  return token || fallback;
}

function randomToken(length = 10) {
  const values = new Uint8Array(length);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, value => ALPHABET[value % ALPHABET.length]).join('');
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

function digestToToken(bytes, length = 2) {
  let output = '';
  for (let index = 0; index < length; index += 1) {
    output += ALPHABET[bytes[index] % ALPHABET.length];
  }
  return output;
}

async function checksumFor(body) {
  return digestToToken(await sha256(body), 2);
}

function resolveType(type) {
  const key = String(type ?? '').toUpperCase();
  const definition = ID_TYPES[key] || Object.values(ID_TYPES).find(item => item.code === key);
  assert(definition, `Unsupported ID type: ${type}`);
  return { key: Object.keys(ID_TYPES).find(name => ID_TYPES[name] === definition), ...definition };
}

export async function generateId({ type, organization = DEFAULT_ORG, issuedAt = new Date(), entropy } = {}) {
  const definition = resolveType(type);
  const date = issuedAt instanceof Date ? issuedAt : new Date(issuedAt);
  assert(!Number.isNaN(date.getTime()), 'issuedAt must be a valid date');
  const year = String(date.getUTCFullYear());
  const org = normalizeToken(organization, DEFAULT_ORG).slice(0, 6);
  const random = normalizeToken(entropy || randomToken(10)).slice(0, 10).padEnd(10, '2');
  const body = `${org}-${definition.code}-${year}-${random}`;
  const checksum = await checksumFor(body);
  return `${body}-${checksum}`;
}

export async function validateId(id) {
  const value = String(id ?? '').trim().toUpperCase();
  const match = /^([A-Z0-9]{1,6})-(SIG|CAN|EMP|RET)-(\d{4})-([23456789A-HJ-NP-Z]{10})-([23456789A-HJ-NP-Z]{2})$/.exec(value);
  if (!match) return { valid: false, reason: 'FORMAT_INVALID' };
  const [, organization, typeCode, year, entropy, suppliedChecksum] = match;
  const body = `${organization}-${typeCode}-${year}-${entropy}`;
  const expectedChecksum = await checksumFor(body);
  return {
    valid: suppliedChecksum === expectedChecksum,
    reason: suppliedChecksum === expectedChecksum ? null : 'CHECKSUM_INVALID',
    organization,
    type: resolveType(typeCode).key,
    typeCode,
    year: Number(year),
    entropy,
    checksum: suppliedChecksum,
    expectedChecksum
  };
}

export function createMemoryStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem: () => value,
    setItem: (_key, nextValue) => { value = String(nextValue); },
    removeItem: () => { value = null; }
  };
}

export class RegistryStore {
  constructor({ storage = globalThis.localStorage, storageKey = 'ggh.id-registry.v1', organization = DEFAULT_ORG, now = () => new Date() } = {}) {
    assert(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function', 'A storage adapter is required');
    this.storage = storage;
    this.storageKey = storageKey;
    this.organization = organization;
    this.now = now;
    this.state = this.#load();
  }

  #emptyState() {
    return { schemaVersion: STORAGE_VERSION, organization: this.organization, records: [], events: [] };
  }

  #load() {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) return this.#emptyState();
    try {
      const parsed = JSON.parse(raw);
      if (parsed.schemaVersion !== STORAGE_VERSION || !Array.isArray(parsed.records) || !Array.isArray(parsed.events)) {
        return this.#emptyState();
      }
      return parsed;
    } catch {
      return this.#emptyState();
    }
  }

  #save() {
    this.storage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  #event({ action, actor, recordId = null, details = {} }) {
    const event = {
      eventId: globalThis.crypto.randomUUID(),
      occurredAt: this.now().toISOString(),
      action,
      actor,
      recordId,
      details
    };
    this.state.events.unshift(event);
    return event;
  }

  list({ type, status, query, subjectRef } = {}) {
    const search = String(query ?? '').trim().toLowerCase();
    return this.state.records.filter(record => {
      if (type && record.type !== type) return false;
      if (status && record.status !== status) return false;
      if (subjectRef && record.subjectRef !== subjectRef) return false;
      if (search) {
        const haystack = [record.id, record.type, record.subjectRef, record.purpose, record.issuedBy, record.status, record.retentionClass]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  get(id) {
    return this.state.records.find(record => record.id === id) || null;
  }

  events(limit = 100) {
    return this.state.events.slice(0, limit);
  }

  async issue({ type, subjectRef, issuedBy, purpose, retentionClass, expiresAt = null, metadata = {}, predecessorId = null } = {}) {
    const definition = resolveType(type);
    assert(subjectRef, 'subjectRef is required');
    assert(issuedBy, 'issuedBy is required');
    assert(purpose, 'purpose is required');

    let id;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      id = await generateId({ type: definition.key, organization: this.organization, issuedAt: this.now() });
      if (!this.get(id)) break;
    }
    assert(id && !this.get(id), 'Unable to issue a unique identifier');

    const issuedAt = this.now().toISOString();
    const record = {
      id,
      type: definition.key,
      typeCode: definition.code,
      subjectRef: String(subjectRef),
      status: 'ACTIVE',
      issuedAt,
      issuedBy: String(issuedBy),
      purpose: String(purpose),
      retentionClass: retentionClass || definition.retentionClass,
      expiresAt: expiresAt || null,
      metadata: { ...metadata },
      predecessorId,
      supersededBy: null,
      version: 1
    };
    this.state.records.unshift(record);

    if (predecessorId) {
      const predecessor = this.get(predecessorId);
      if (predecessor) {
        predecessor.status = 'SUPERSEDED';
        predecessor.supersededBy = id;
        predecessor.version += 1;
      }
    }

    this.#event({ action: 'ID_ISSUED', actor: issuedBy, recordId: id, details: { type: definition.key, subjectRef, purpose } });
    this.#save();
    return structuredClone(record);
  }

  changeStatus({ id, status, actor, reason } = {}) {
    assert(ID_STATUSES.includes(status), `Unsupported status: ${status}`);
    assert(actor, 'actor is required');
    assert(reason, 'reason is required');
    const record = this.get(id);
    assert(record, 'Identifier not found');
    const previousStatus = record.status;
    record.status = status;
    record.version += 1;
    record.lastChangedAt = this.now().toISOString();
    record.lastChangedBy = actor;
    record.statusReason = reason;
    this.#event({ action: 'ID_STATUS_CHANGED', actor, recordId: id, details: { previousStatus, status, reason } });
    this.#save();
    return structuredClone(record);
  }

  link({ id, relatedId, actor, relationship = 'RELATED' } = {}) {
    assert(actor, 'actor is required');
    const record = this.get(id);
    const related = this.get(relatedId);
    assert(record && related, 'Both identifiers must exist');
    record.links = record.links || [];
    if (!record.links.some(link => link.id === relatedId && link.relationship === relationship)) {
      record.links.push({ id: relatedId, relationship });
      record.version += 1;
      this.#event({ action: 'ID_LINKED', actor, recordId: id, details: { relatedId, relationship } });
      this.#save();
    }
    return structuredClone(record);
  }

  exportJson() {
    return JSON.stringify({ exportedAt: this.now().toISOString(), ...this.state }, null, 2);
  }

  exportCsv(records = this.state.records) {
    const columns = ['id', 'type', 'subjectRef', 'status', 'issuedAt', 'issuedBy', 'purpose', 'retentionClass', 'expiresAt', 'version'];
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    return [columns.join(','), ...records.map(record => columns.map(column => escape(record[column])).join(','))].join('\n');
  }

  reset(actor = 'SYSTEM_ADMIN') {
    this.state = this.#emptyState();
    this.#event({ action: 'REGISTRY_RESET', actor, details: { reason: 'Administrative reset' } });
    this.#save();
  }
}
