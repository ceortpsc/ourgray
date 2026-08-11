import test from 'node:test';
import assert from 'node:assert/strict';
import { generateId, validateId, RegistryStore, createMemoryStorage } from '../lib/id-engine.js';
import { can, PERMISSIONS } from '../lib/rbac.js';

test('issues and validates all supported ID types', async () => {
  for (const type of ['SIGNATURE', 'CANDIDATE', 'EMPLOYEE', 'RETENTION']) {
    const id = await generateId({ type, organization: 'GGH', issuedAt: new Date('2026-08-05T00:00:00Z'), entropy: 'ABCDEFGHJK' });
    const result = await validateId(id);
    assert.equal(result.valid, true);
    assert.equal(result.type, type);
    assert.match(id, /^GGH-(SIG|CAN|EMP|RET)-2026-/);
  }
});

test('rejects a modified checksum', async () => {
  const id = await generateId({ type: 'CANDIDATE', organization: 'GGH', entropy: 'ABCDEFGHJK' });
  const invalid = `${id.slice(0, -1)}${id.endsWith('2') ? '3' : '2'}`;
  const result = await validateId(invalid);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'CHECKSUM_INVALID');
});

test('registry issues, links, exports, and revokes records', async () => {
  const storage = createMemoryStorage();
  const fixedTimes = [
    new Date('2026-08-05T00:00:00Z'),
    new Date('2026-08-05T00:00:01Z'),
    new Date('2026-08-05T00:00:02Z'),
    new Date('2026-08-05T00:00:03Z'),
    new Date('2026-08-05T00:00:04Z')
  ];
  const registry = new RegistryStore({ storage, organization: 'GGH', now: () => fixedTimes.shift() || new Date('2026-08-05T00:00:05Z') });
  const candidate = await registry.issue({ type: 'CANDIDATE', subjectRef: 'candidate:jmartin', issuedBy: 'hr@example.test', purpose: 'Candidate onboarding' });
  const retention = await registry.issue({ type: 'RETENTION', subjectRef: 'candidate:jmartin', issuedBy: 'records@example.test', purpose: 'Master retention file' });
  registry.link({ id: candidate.id, relatedId: retention.id, actor: 'records@example.test', relationship: 'RETAINED_IN' });
  registry.changeStatus({ id: candidate.id, status: 'REVOKED', actor: 'hr@example.test', reason: 'Test lifecycle transition' });
  assert.equal(registry.get(candidate.id).status, 'REVOKED');
  assert.equal(registry.list({ subjectRef: 'candidate:jmartin' }).length, 2);
  assert.match(registry.exportCsv(), /candidate:jmartin/);
  assert.match(registry.exportJson(), /ID_STATUS_CHANGED/);
});

test('RBAC enforces issuance permissions', () => {
  assert.equal(can('HR', PERMISSIONS.ISSUE_EMPLOYEE), true);
  assert.equal(can('CANDIDATE', PERMISSIONS.ISSUE_EMPLOYEE), false);
  assert.equal(can('AUDITOR', PERMISSIONS.EXPORT), true);
});
