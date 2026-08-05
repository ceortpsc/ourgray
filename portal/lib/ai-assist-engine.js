const DEFAULT_ALLOWED = Object.freeze([
  'summarization',
  'classification',
  'drafting',
  'workflow-recommendation',
  'data-quality-review'
]);

const DEFAULT_BLOCKED = Object.freeze([
  'autonomous-employment-decision',
  'protected-trait-inference',
  'medical-diagnosis',
  'credential-bypass',
  'background-screening-decision'
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function containsSensitiveData(input) {
  const text = JSON.stringify(input || {}).toLowerCase();
  return [
    'social security',
    'ssn',
    'routing number',
    'bank account',
    'medical record',
    'diagnosis',
    'password',
    'access token',
    'refresh token'
  ].some(term => text.includes(term));
}

function deterministicAssist(request) {
  const input = request.input || {};
  switch (request.useCase) {
    case 'summarization': {
      const values = Object.entries(input)
        .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
        .slice(0, 8)
        .map(([key, value]) => `${key.replaceAll(/([A-Z])/g, ' $1')}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
      return {
        output: values.length ? values.join('\n') : 'No substantive information was supplied for summarization.',
        confidence: 'LOW',
        explanation: 'Deterministic local summarization; no external AI provider was called.'
      };
    }
    case 'classification': {
      const status = String(input.status || '').toUpperCase();
      const category = /BLOCK|FAIL|DECLIN/.test(status)
        ? 'ACTION_REQUIRED'
        : /APPROV|COMPLETE|READY/.test(status)
          ? 'READY'
          : 'REVIEW';
      return {
        output: { category },
        confidence: 'LOW',
        explanation: 'Rules-based demonstration classification; human review is required.'
      };
    }
    case 'workflow-recommendation': {
      const incomplete = Array.isArray(input.incompleteGates) ? input.incompleteGates : [];
      return {
        output: incomplete.length
          ? incomplete.map(gate => `Complete or resolve gate: ${gate}`).join('\n')
          : 'No incomplete workflow gates were supplied.',
        confidence: 'MEDIUM',
        explanation: 'Recommendation derived from explicit workflow state.'
      };
    }
    case 'data-quality-review': {
      const issues = [];
      for (const [key, value] of Object.entries(input)) {
        if (value === null || value === undefined || String(value).trim() === '') issues.push(`${key} is blank`);
      }
      return {
        output: issues.length ? issues : ['No blank top-level fields detected.'],
        confidence: 'MEDIUM',
        explanation: 'Local structural data-quality check.'
      };
    }
    case 'drafting':
      return {
        output: `Draft prepared from the supplied business facts. Review every statement before use.\n\n${Object.entries(input).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join('\n')}`,
        confidence: 'LOW',
        explanation: 'Template-based local draft; no external AI provider was called.'
      };
    default:
      throw new Error(`No deterministic assistant exists for ${request.useCase}.`);
  }
}

export class AIAssistEngine {
  constructor({
    provider = null,
    allowedUseCases = DEFAULT_ALLOWED,
    blockedUseCases = DEFAULT_BLOCKED,
    allowSensitiveData = false,
    requireHumanApproval = true,
    eventSink = null,
    now = () => new Date()
  } = {}) {
    this.provider = provider;
    this.allowedUseCases = new Set(allowedUseCases);
    this.blockedUseCases = new Set(blockedUseCases);
    this.allowSensitiveData = Boolean(allowSensitiveData);
    this.requireHumanApproval = Boolean(requireHumanApproval);
    this.eventSink = eventSink;
    this.now = now;
    this.requests = [];
  }

  policyDecision({ useCase, input, actor, purpose }) {
    if (!useCase) return { allowed: false, reason: 'Use case is required.' };
    if (this.blockedUseCases.has(useCase)) return { allowed: false, reason: `Use case ${useCase} is prohibited.` };
    if (!this.allowedUseCases.has(useCase)) return { allowed: false, reason: `Use case ${useCase} is not approved.` };
    if (!actor) return { allowed: false, reason: 'Authenticated actor context is required.' };
    if (!purpose) return { allowed: false, reason: 'Business purpose is required.' };
    if (!this.allowSensitiveData && containsSensitiveData(input)) return { allowed: false, reason: 'Sensitive data is not permitted in AI-assist requests.' };
    return { allowed: true, reason: 'Approved policy-gated use case.' };
  }

  async request({ useCase, input = {}, actor, purpose, providerOptions = {} } = {}) {
    const policy = this.policyDecision({ useCase, input, actor, purpose });
    assert(policy.allowed, policy.reason);
    const requestId = crypto.randomUUID();
    const requestedAt = this.now().toISOString();
    this.#emit('AI_ASSIST_REQUESTED', { requestId, useCase, actor, purpose });

    let result;
    let providerName = 'deterministic-local';
    if (this.provider) {
      assert(typeof this.provider.generate === 'function', 'Configured AI provider must expose generate().');
      result = await this.provider.generate({ requestId, useCase, input, purpose, options: providerOptions });
      providerName = this.provider.name || 'external-provider';
    } else {
      result = deterministicAssist({ useCase, input });
    }

    const response = {
      requestId,
      requestedAt,
      completedAt: this.now().toISOString(),
      actor,
      purpose,
      useCase,
      provider: providerName,
      output: result.output,
      confidence: result.confidence || 'UNSPECIFIED',
      explanation: result.explanation || null,
      humanApprovalRequired: this.requireHumanApproval,
      approvalStatus: this.requireHumanApproval ? 'PENDING' : 'NOT_REQUIRED',
      approvedAt: null,
      approvedBy: null,
      policy
    };
    this.requests.unshift(response);
    this.#emit('AI_ASSIST_COMPLETED', { requestId, useCase, provider: providerName, humanApprovalRequired: this.requireHumanApproval });
    return structuredClone(response);
  }

  approve(requestId, actor) {
    assert(actor, 'Approving actor is required.');
    const request = this.requests.find(item => item.requestId === requestId);
    assert(request, 'AI-assist request not found.');
    assert(request.humanApprovalRequired, 'This request does not require approval.');
    request.approvalStatus = 'APPROVED';
    request.approvedAt = this.now().toISOString();
    request.approvedBy = actor;
    this.#emit('AI_ASSIST_APPROVED', { requestId, actor });
    return structuredClone(request);
  }

  reject(requestId, actor, reason) {
    assert(actor, 'Rejecting actor is required.');
    const request = this.requests.find(item => item.requestId === requestId);
    assert(request, 'AI-assist request not found.');
    request.approvalStatus = 'REJECTED';
    request.approvedAt = this.now().toISOString();
    request.approvedBy = actor;
    request.rejectionReason = reason || 'Rejected during human review.';
    this.#emit('AI_ASSIST_REJECTED', { requestId, actor, reason: request.rejectionReason });
    return structuredClone(request);
  }

  list() {
    return this.requests.map(structuredClone);
  }

  #emit(event, details) {
    if (typeof this.eventSink === 'function') this.eventSink({ event, occurredAt: this.now().toISOString(), details: structuredClone(details) });
  }
}
