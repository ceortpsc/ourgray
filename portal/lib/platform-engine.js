import { JobEngine } from './job-engine.js';
import { exportDataset } from './export-engine.js';
import { TelemetryEngine } from './telemetry-engine.js';
import { AIAssistEngine } from './ai-assist-engine.js';

export class PlatformEngine {
  constructor({ config, storage = globalThis.localStorage, now = () => new Date(), sleep } = {}) {
    if (!config) throw new Error('Engine configuration is required.');
    this.config = structuredClone(config);
    this.now = now;
    this.telemetry = new TelemetryEngine({
      now,
      retentionLimit: config.engines?.telemetry?.retentionLimit || 500,
      storage,
      storageKey: 'ggh.platform.telemetry.v1'
    });
    const eventSink = ({ event, occurredAt, details }) => this.telemetry.record(event, details, { source: 'engine', correlationId: details?.jobId || details?.requestId || null });
    this.jobs = new JobEngine({
      now,
      sleep,
      maxConcurrentJobs: config.engines?.workflow?.maxConcurrentJobs || 1,
      retryPolicy: config.engines?.workflow?.retryPolicy || {},
      eventSink
    });
    this.ai = new AIAssistEngine({
      provider: null,
      allowedUseCases: config.engines?.aiAssist?.allowedUseCases,
      blockedUseCases: config.engines?.aiAssist?.blockedUseCases,
      allowSensitiveData: config.engines?.aiAssist?.allowSensitiveData,
      requireHumanApproval: config.engines?.aiAssist?.requireHumanApproval,
      eventSink,
      now
    });
    this.exports = [];
    this.#registerDefaultHandlers();
    this.#registerHealthChecks();
  }

  #registerDefaultHandlers() {
    this.jobs.register('EXPORT_DATASET', async payload => {
      const result = await exportDataset(payload);
      this.exports.unshift({
        exportId: crypto.randomUUID(),
        generatedAt: this.now().toISOString(),
        ...result,
        content: undefined,
        manifestContent: undefined
      });
      this.exports = this.exports.slice(0, 100);
      return result;
    }, {
      validate: payload => {
        if (!payload?.name) throw new Error('Export job requires a name.');
        if (!payload?.format) throw new Error('Export job requires a format.');
      }
    });

    this.jobs.register('AI_ASSIST', async payload => this.ai.request(payload), {
      validate: payload => {
        if (!payload?.useCase) throw new Error('AI-assist job requires a use case.');
        if (!payload?.actor) throw new Error('AI-assist job requires an actor.');
      }
    });

    this.jobs.register('WORKFLOW_NOTIFICATION', async payload => ({
      notificationId: crypto.randomUUID(),
      channel: payload.channel || 'IN_APP',
      recipient: payload.recipient,
      subject: payload.subject,
      status: 'STAGED',
      providerExecutionRequired: true
    }), {
      validate: payload => {
        if (!payload?.recipient) throw new Error('Notification recipient is required.');
        if (!payload?.subject) throw new Error('Notification subject is required.');
      }
    });

    this.jobs.register('DATA_QUALITY_REVIEW', async payload => this.ai.request({
      useCase: 'data-quality-review',
      input: payload.input || {},
      actor: payload.actor,
      purpose: payload.purpose || 'Operational data-quality review'
    }));
  }

  #registerHealthChecks() {
    this.telemetry.registerHealthCheck('job-engine', async () => ({
      status: 'HEALTHY',
      details: this.jobs.snapshot().counts
    }));
    this.telemetry.registerHealthCheck('export-engine', async () => ({
      status: this.config.engines?.export?.enabled ? 'HEALTHY' : 'DEGRADED',
      details: { formats: this.config.engines?.export?.formats || [] }
    }));
    this.telemetry.registerHealthCheck('ai-assist', async () => ({
      status: this.config.engines?.aiAssist?.enabled ? 'HEALTHY' : 'DEGRADED',
      details: {
        provider: this.config.engines?.aiAssist?.provider || 'none',
        humanApprovalRequired: this.config.engines?.aiAssist?.requireHumanApproval !== false,
        liveProviderConnected: Boolean(this.ai.provider)
      }
    }));
    this.telemetry.registerHealthCheck('production-boundary', async () => ({
      status: this.config.environment === 'production' ? 'DEGRADED' : 'HEALTHY',
      details: {
        environment: this.config.environment,
        durableQueueRequired: this.config.controls?.durableQueueRequiredForProduction,
        databaseRequired: this.config.controls?.databaseRequiredForProduction,
        serverAuthorizationRequired: this.config.controls?.serverAuthorizationRequired
      }
    }));
  }

  enqueueExport(payload, options = {}) {
    return this.jobs.enqueue({ type: 'EXPORT_DATASET', payload, ...options });
  }

  enqueueAIAssist(payload, options = {}) {
    return this.jobs.enqueue({ type: 'AI_ASSIST', payload, ...options });
  }

  enqueueNotification(payload, options = {}) {
    return this.jobs.enqueue({ type: 'WORKFLOW_NOTIFICATION', payload, ...options });
  }

  async run() {
    return this.jobs.drain();
  }

  async health() {
    return this.telemetry.health();
  }

  dashboard() {
    return {
      generatedAt: this.now().toISOString(),
      environment: this.config.environment,
      jobSnapshot: this.jobs.snapshot(),
      telemetry: this.telemetry.metrics(),
      aiRequests: this.ai.list(),
      exports: structuredClone(this.exports)
    };
  }
}
