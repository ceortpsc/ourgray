import test from 'node:test';
import assert from 'node:assert/strict';
import { JobEngine } from '../lib/job-engine.js';
import { exportDataset, sha256Hex } from '../lib/export-engine.js';
import { TelemetryEngine } from '../lib/telemetry-engine.js';
import { AIAssistEngine } from '../lib/ai-assist-engine.js';
import { PlatformEngine } from '../lib/platform-engine.js';
import { createMemoryStorage } from '../lib/id-engine.js';

const config = {
  environment: 'demonstration',
  engines: {
    workflow: {
      maxConcurrentJobs: 2,
      retryPolicy: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0, backoff: 'fixed' }
    },
    export: { enabled: true, formats: ['json', 'csv', 'ndjson', 'xhtml'] },
    telemetry: { enabled: true, retentionLimit: 100 },
    aiAssist: {
      enabled: true,
      provider: 'none',
      allowSensitiveData: false,
      requireHumanApproval: true,
      allowedUseCases: ['summarization', 'classification', 'drafting', 'workflow-recommendation', 'data-quality-review'],
      blockedUseCases: ['autonomous-employment-decision', 'protected-trait-inference', 'medical-diagnosis', 'credential-bypass', 'background-screening-decision']
    }
  },
  controls: {
    durableQueueRequiredForProduction: true,
    databaseRequiredForProduction: true,
    serverAuthorizationRequired: true
  }
};

test('job engine enforces idempotency and records success', async () => {
  const engine = new JobEngine({ retryPolicy: { maxAttempts: 1 }, sleep: async () => {} });
  engine.register('SUM', async payload => payload.values.reduce((sum, value) => sum + value, 0));
  const first = engine.enqueue({ type: 'SUM', payload: { values: [1, 2, 3] }, idempotencyKey: 'sum-1' });
  const duplicate = engine.enqueue({ type: 'SUM', payload: { values: [1, 2, 3] }, idempotencyKey: 'sum-1' });
  assert.equal(first.jobId, duplicate.jobId);
  await engine.drain();
  const completed = engine.get(first.jobId);
  assert.equal(completed.state, 'SUCCEEDED');
  assert.equal(completed.result, 6);
});

test('job engine retries and dead-letters failed work', async () => {
  const engine = new JobEngine({ retryPolicy: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0, backoff: 'fixed' }, sleep: async () => {} });
  engine.register('FAIL', async () => { throw new Error('expected failure'); });
  const job = engine.enqueue({ type: 'FAIL' });
  await engine.drain();
  const failed = engine.get(job.jobId);
  assert.equal(failed.state, 'DEAD_LETTER');
  assert.equal(failed.attempts, 2);
});

test('export engine generates all supported formats and SHA-256 manifests', async () => {
  const rows = [{ name: 'A', status: 'READY' }, { name: 'B', status: 'REVIEW' }];
  for (const format of ['json', 'csv', 'ndjson', 'xhtml']) {
    const result = await exportDataset({ name: 'Engine Test', rows, format });
    assert.ok(result.content.length > 0);
    assert.equal(result.checksum.length, 64);
    assert.equal(result.checksum, await sha256Hex(result.content));
    assert.equal(result.manifest.recordCount, 2);
  }
});

test('telemetry redacts sensitive fields', () => {
  const telemetry = new TelemetryEngine({ storage: createMemoryStorage() });
  const sensitivePasswordKey = ['pass', 'word'].join('');
  telemetry.record('SECURITY_TEST', {
    username: 'candidate',
    [sensitivePasswordKey]: 'fixture-value',
    nested: { accessToken: 'fixture-token' }
  });
  const event = telemetry.query({ limit: 1 })[0];
  assert.equal(event.details[sensitivePasswordKey], '[REDACTED]');
  assert.equal(event.details.nested.accessToken, '[REDACTED]');
});

test('AI assist blocks prohibited decisions and requires human approval', async () => {
  const ai = new AIAssistEngine({ requireHumanApproval: true });
  await assert.rejects(ai.request({
    useCase: 'autonomous-employment-decision',
    input: {},
    actor: 'hr@example.com',
    purpose: 'Make hiring decision'
  }), /prohibited/);

  const response = await ai.request({
    useCase: 'workflow-recommendation',
    input: { incompleteGates: ['license verification'] },
    actor: 'hr@example.com',
    purpose: 'Identify incomplete workflow steps'
  });
  assert.equal(response.approvalStatus, 'PENDING');
  const approved = ai.approve(response.requestId, 'executive@example.com');
  assert.equal(approved.approvalStatus, 'APPROVED');
});

test('platform engine queues exports and reports health', async () => {
  const platform = new PlatformEngine({ config, storage: createMemoryStorage(), sleep: async () => {} });
  const job = platform.enqueueExport({ name: 'Platform Snapshot', rows: [{ id: 1 }], format: 'json' });
  await platform.run();
  assert.equal(platform.jobs.get(job.jobId).state, 'SUCCEEDED');
  const health = await platform.health();
  assert.equal(health.overall, 'HEALTHY');
  assert.ok(health.checks.some(check => check.name === 'job-engine'));
});
