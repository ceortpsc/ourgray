export const LEARNING_PERMISSIONS = Object.freeze({
  VIEW_OWN: 'learning.view.own',
  VIEW_ALL: 'learning.view.all',
  MANAGE_CURRICULUM: 'learning.curriculum.manage',
  RUN_SIMULATION: 'learning.simulation.run',
  CONFIGURE_PERSONA: 'learning.persona.configure',
  REVIEW_CLINICAL_OUTPUT: 'learning.clinical.review',
  REVIEW_FINANCE: 'learning.finance.review',
  APPROVE_ENROLLMENT: 'learning.enrollment.approve',
  PROVISION_IDENTITY: 'learning.identity.provision',
  MANAGE_PLATFORM: 'learning.platform.manage',
  VIEW_AUDIT: 'learning.audit.view',
  EXPORT_EVIDENCE: 'learning.evidence.export',
  RUN_TESTS: 'learning.tests.run'
});

export const LEARNING_ROLES = Object.freeze({
  EXECUTIVE_ADMIN: Object.freeze(Object.values(LEARNING_PERMISSIONS)),
  CLINICAL_OFFICER: Object.freeze([
    LEARNING_PERMISSIONS.VIEW_ALL,
    LEARNING_PERMISSIONS.MANAGE_CURRICULUM,
    LEARNING_PERMISSIONS.RUN_SIMULATION,
    LEARNING_PERMISSIONS.CONFIGURE_PERSONA,
    LEARNING_PERMISSIONS.REVIEW_CLINICAL_OUTPUT,
    LEARNING_PERMISSIONS.VIEW_AUDIT,
    LEARNING_PERMISSIONS.EXPORT_EVIDENCE
  ]),
  STUDENT: Object.freeze([
    LEARNING_PERMISSIONS.VIEW_OWN,
    LEARNING_PERMISSIONS.RUN_SIMULATION
  ]),
  AUDITOR: Object.freeze([
    LEARNING_PERMISSIONS.VIEW_ALL,
    LEARNING_PERMISSIONS.VIEW_AUDIT,
    LEARNING_PERMISSIONS.EXPORT_EVIDENCE
  ]),
  DEVELOPER: Object.freeze([
    LEARNING_PERMISSIONS.VIEW_ALL,
    LEARNING_PERMISSIONS.CONFIGURE_PERSONA,
    LEARNING_PERMISSIONS.MANAGE_PLATFORM,
    LEARNING_PERMISSIONS.VIEW_AUDIT,
    LEARNING_PERMISSIONS.RUN_TESTS
  ]),
  TESTER: Object.freeze([
    LEARNING_PERMISSIONS.VIEW_ALL,
    LEARNING_PERMISSIONS.RUN_SIMULATION,
    LEARNING_PERMISSIONS.VIEW_AUDIT,
    LEARNING_PERMISSIONS.RUN_TESTS
  ]),
  FINANCE: Object.freeze([
    LEARNING_PERMISSIONS.VIEW_ALL,
    LEARNING_PERMISSIONS.REVIEW_FINANCE,
    LEARNING_PERMISSIONS.VIEW_AUDIT
  ]),
  IDENTITY_ADMIN: Object.freeze([
    LEARNING_PERMISSIONS.VIEW_ALL,
    LEARNING_PERMISSIONS.PROVISION_IDENTITY,
    LEARNING_PERMISSIONS.VIEW_AUDIT
  ])
});

export const ENROLLMENT_STATES = Object.freeze([
  'APPLICATION_SUBMITTED',
  'PAYMENT_PENDING',
  'PAYMENT_VERIFIED',
  'APPROVAL_PENDING',
  'APPROVED',
  'IDENTITY_PROVISIONING',
  'IDENTITY_READY',
  'LMS_PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'COMPLETED',
  'DECLINED'
]);

export const PERSONA_POLICIES = Object.freeze({
  educationalOnly: true,
  noAutonomousDiagnosis: true,
  noAutonomousTreatment: true,
  noAutonomousEmploymentDecision: true,
  humanReviewRequiredForClinicalScoring: true,
  humanReviewRequiredForAdverseAction: true,
  crisisContentRequiresHumanEscalation: true,
  sourceUpdatesRequireApproval: true
});

const ROLE_ALIASES = Object.freeze({
  ADMIN: 'EXECUTIVE_ADMIN',
  EXECUTIVE: 'EXECUTIVE_ADMIN',
  STUDENT_TRAINEE: 'STUDENT',
  ACCREDITOR: 'AUDITOR',
  ENGINEER: 'DEVELOPER',
  QA: 'TESTER'
});

function normalizeRole(role) {
  const value = String(role ?? '').trim().toUpperCase();
  return ROLE_ALIASES[value] || value;
}

export function learningPermissionsFor(role) {
  return LEARNING_ROLES[normalizeRole(role)] || [];
}

export function canLearning(role, permission) {
  return learningPermissionsFor(role).includes(permission);
}

export function requireLearningPermission(role, permission) {
  if (!canLearning(role, permission)) {
    throw new Error(`Role ${role} is not authorized for ${permission}`);
  }
  return true;
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function required(value, label) {
  if (!String(value ?? '').trim()) throw new Error(`${label} is required`);
  return String(value).trim();
}

function clone(value) {
  return structuredClone(value);
}

function defaultId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${prefix}-${String(random).replaceAll('-', '').slice(0, 16).toUpperCase()}`;
}

function freezeEvent(event) {
  return Object.freeze({ ...event, details: Object.freeze({ ...(event.details || {}) }) });
}

const TASK_DEFINITIONS = Object.freeze({
  VERIFY_PAYMENT: { ownerRole: 'FINANCE', label: 'Verify payment event and provider reference' },
  APPROVE_ENROLLMENT: { ownerRole: 'EXECUTIVE_ADMIN', label: 'Approve enrollment after eligibility review' },
  PROVISION_ENTRA: { ownerRole: 'IDENTITY_ADMIN', label: 'Create staged Microsoft Entra identity' },
  SEND_WELCOME: { ownerRole: 'EXECUTIVE_ADMIN', label: 'Send approved onboarding communication' },
  PROVISION_LMS: { ownerRole: 'DEVELOPER', label: 'Initialize learner workspace and RBAC groups' },
  COMPLETE_ORIENTATION: { ownerRole: 'STUDENT', label: 'Complete privacy, safety and platform orientation' }
});

export class LearningPlatformEngine {
  constructor({ clock = () => new Date(), idFactory = defaultId } = {}) {
    this.clock = clock;
    this.idFactory = idFactory;
    this.enrollments = new Map();
    this.auditEvents = [];
  }

  now() {
    return this.clock().toISOString();
  }

  audit(action, actor, details = {}) {
    const event = freezeEvent({
      eventId: this.idFactory('AUD'),
      occurredAt: this.now(),
      action,
      actor: String(actor || 'system'),
      details
    });
    this.auditEvents.push(event);
    return event;
  }

  registerApplication({ applicantName, email, programId, actor = 'candidate' }) {
    const enrollmentId = this.idFactory('ENR');
    const candidateId = this.idFactory('CAN');
    const record = {
      enrollmentId,
      candidateId,
      applicantName: required(applicantName, 'Applicant name'),
      email: normalizeEmail(required(email, 'Email')),
      programId: required(programId, 'Program ID'),
      status: 'PAYMENT_PENDING',
      payment: { status: 'PENDING', providerReference: null, amount: null, currency: null },
      approval: { status: 'PENDING', approvedBy: null, approvedAt: null },
      identity: { status: 'NOT_STARTED', userPrincipalName: null, objectId: null },
      workspace: { status: 'NOT_STARTED', workspaceId: null, personaAssignments: [] },
      progress: { completedModules: [], percentage: 0 },
      tasks: [],
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.enrollments.set(enrollmentId, record);
    this.ensureTask(record, 'VERIFY_PAYMENT');
    this.audit('APPLICATION_REGISTERED', actor, { enrollmentId, candidateId, programId: record.programId });
    return clone(record);
  }

  getEnrollment(enrollmentId) {
    const record = this.enrollments.get(enrollmentId);
    if (!record) throw new Error(`Enrollment ${enrollmentId} was not found`);
    return record;
  }

  ensureTask(record, taskType) {
    if (record.tasks.some(task => task.type === taskType && task.status !== 'CANCELLED')) return;
    const definition = TASK_DEFINITIONS[taskType];
    if (!definition) throw new Error(`Unknown task type ${taskType}`);
    record.tasks.push({
      taskId: this.idFactory('TSK'),
      type: taskType,
      label: definition.label,
      ownerRole: definition.ownerRole,
      status: 'OPEN',
      createdAt: this.now(),
      completedAt: null
    });
  }

  completeTask(record, taskType) {
    const task = record.tasks.find(item => item.type === taskType && item.status === 'OPEN');
    if (task) {
      task.status = 'COMPLETED';
      task.completedAt = this.now();
    }
  }

  recordPayment(enrollmentId, { providerReference, amount, currency = 'USD', actor, role = 'FINANCE' }) {
    requireLearningPermission(role, LEARNING_PERMISSIONS.REVIEW_FINANCE);
    const record = this.getEnrollment(enrollmentId);
    record.payment = {
      status: 'VERIFIED',
      providerReference: required(providerReference, 'Payment provider reference'),
      amount: Number(amount),
      currency: String(currency).toUpperCase()
    };
    if (!Number.isFinite(record.payment.amount) || record.payment.amount < 0) {
      throw new Error('Payment amount must be a non-negative number');
    }
    record.status = 'APPROVAL_PENDING';
    record.updatedAt = this.now();
    this.completeTask(record, 'VERIFY_PAYMENT');
    this.ensureTask(record, 'APPROVE_ENROLLMENT');
    this.audit('PAYMENT_VERIFIED', actor, {
      enrollmentId,
      providerReference: record.payment.providerReference,
      amount: record.payment.amount,
      currency: record.payment.currency
    });
    return clone(record);
  }

  approveEnrollment(enrollmentId, { actor, role = 'EXECUTIVE_ADMIN' }) {
    requireLearningPermission(role, LEARNING_PERMISSIONS.APPROVE_ENROLLMENT);
    const record = this.getEnrollment(enrollmentId);
    if (record.payment.status !== 'VERIFIED') throw new Error('Payment must be verified before approval');
    record.approval = { status: 'APPROVED', approvedBy: actor, approvedAt: this.now() };
    record.status = 'IDENTITY_PROVISIONING';
    record.updatedAt = this.now();
    this.completeTask(record, 'APPROVE_ENROLLMENT');
    this.ensureTask(record, 'PROVISION_ENTRA');
    this.audit('ENROLLMENT_APPROVED', actor, { enrollmentId, candidateId: record.candidateId });
    return clone(record);
  }

  recordIdentityProvisioned(enrollmentId, { userPrincipalName, objectId, actor, role = 'IDENTITY_ADMIN' }) {
    requireLearningPermission(role, LEARNING_PERMISSIONS.PROVISION_IDENTITY);
    const record = this.getEnrollment(enrollmentId);
    if (record.approval.status !== 'APPROVED') throw new Error('Enrollment must be approved before identity provisioning');
    record.identity = {
      status: 'READY',
      userPrincipalName: normalizeEmail(required(userPrincipalName, 'User principal name')),
      objectId: required(objectId, 'Entra object ID')
    };
    record.status = 'LMS_PROVISIONING';
    record.updatedAt = this.now();
    this.completeTask(record, 'PROVISION_ENTRA');
    this.ensureTask(record, 'SEND_WELCOME');
    this.ensureTask(record, 'PROVISION_LMS');
    this.audit('IDENTITY_PROVISIONED', actor, {
      enrollmentId,
      objectId: record.identity.objectId,
      userPrincipalName: record.identity.userPrincipalName
    });
    return clone(record);
  }

  activateWorkspace(enrollmentId, { workspaceId, personas = ['TEACHING_ASSISTANT'], actor, role = 'DEVELOPER' }) {
    requireLearningPermission(role, LEARNING_PERMISSIONS.MANAGE_PLATFORM);
    const record = this.getEnrollment(enrollmentId);
    if (record.identity.status !== 'READY') throw new Error('Identity must be ready before workspace activation');
    record.workspace = {
      status: 'ACTIVE',
      workspaceId: required(workspaceId, 'Workspace ID'),
      personaAssignments: [...new Set(personas.map(value => String(value).toUpperCase()))]
    };
    record.status = 'ACTIVE';
    record.updatedAt = this.now();
    this.completeTask(record, 'PROVISION_LMS');
    this.completeTask(record, 'SEND_WELCOME');
    this.ensureTask(record, 'COMPLETE_ORIENTATION');
    this.audit('WORKSPACE_ACTIVATED', actor, {
      enrollmentId,
      workspaceId: record.workspace.workspaceId,
      personas: record.workspace.personaAssignments
    });
    return clone(record);
  }

  completeModule(enrollmentId, { moduleId, totalModules, actor, role = 'STUDENT' }) {
    if (!canLearning(role, LEARNING_PERMISSIONS.VIEW_OWN) && !canLearning(role, LEARNING_PERMISSIONS.MANAGE_CURRICULUM)) {
      throw new Error(`Role ${role} cannot record module progress`);
    }
    const record = this.getEnrollment(enrollmentId);
    if (record.status !== 'ACTIVE') throw new Error('Workspace must be active before recording progress');
    const id = required(moduleId, 'Module ID');
    if (!record.progress.completedModules.includes(id)) record.progress.completedModules.push(id);
    const denominator = Math.max(1, Number(totalModules) || 1);
    record.progress.percentage = Math.min(100, Math.round((record.progress.completedModules.length / denominator) * 100));
    record.updatedAt = this.now();
    this.audit('MODULE_COMPLETED', actor, { enrollmentId, moduleId: id, percentage: record.progress.percentage });
    return clone(record);
  }

  reviewPersonaRequest({ role, category, containsCrisisContent = false, requestsDiagnosis = false, requestsTreatment = false, requestsAdverseAction = false }) {
    const normalizedCategory = String(category || 'EDUCATIONAL_SIMULATION').toUpperCase();
    if (!canLearning(role, LEARNING_PERMISSIONS.RUN_SIMULATION)) {
      return { allowed: false, code: 'RBAC_DENIED', humanReviewRequired: true };
    }
    if (requestsDiagnosis || requestsTreatment) {
      return { allowed: false, code: 'CLINICAL_DECISION_PROHIBITED', humanReviewRequired: true };
    }
    if (requestsAdverseAction) {
      return { allowed: false, code: 'AUTONOMOUS_ADVERSE_ACTION_PROHIBITED', humanReviewRequired: true };
    }
    if (containsCrisisContent) {
      return { allowed: false, code: 'HUMAN_ESCALATION_REQUIRED', humanReviewRequired: true };
    }
    return {
      allowed: normalizedCategory === 'EDUCATIONAL_SIMULATION',
      code: normalizedCategory === 'EDUCATIONAL_SIMULATION' ? 'ALLOWED_WITH_DISCLOSURE' : 'UNSUPPORTED_CATEGORY',
      humanReviewRequired: true
    };
  }

  exportEvidence() {
    return clone({
      schemaVersion: 1,
      generatedAt: this.now(),
      enrollments: [...this.enrollments.values()],
      auditEvents: this.auditEvents,
      personaPolicies: PERSONA_POLICIES
    });
  }
}
