const STORAGE_VERSION = 1;
const DEFAULT_STORAGE_KEY = 'ggh.candidate-applications.v1';

export const APPLICATION_STATUSES = Object.freeze([
  'REGISTERED',
  'APPLICATION_IN_PROGRESS',
  'READY_TO_SUBMIT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ACTION_REQUIRED',
  'APPROVED',
  'DECLINED',
  'WITHDRAWN',
  'ONBOARDING'
]);

export const GATE_DEFINITIONS = Object.freeze({
  account: Object.freeze({ label: 'Application registration', owner: 'Candidate', requiredForSubmission: true }),
  identity: Object.freeze({ label: 'OAuth identity verification', owner: 'Candidate / Identity', requiredForSubmission: true }),
  profile: Object.freeze({ label: 'Candidate profile', owner: 'Candidate', requiredForSubmission: true }),
  eligibility: Object.freeze({ label: 'Eligibility declarations', owner: 'Candidate', requiredForSubmission: true }),
  disclosures: Object.freeze({ label: 'Disclosures and attestations', owner: 'Candidate', requiredForSubmission: true }),
  documents: Object.freeze({ label: 'Document checklist', owner: 'Candidate / Recruiting', requiredForSubmission: false }),
  submission: Object.freeze({ label: 'Application submission', owner: 'Candidate', requiredForSubmission: false }),
  recruiterReview: Object.freeze({ label: 'Recruiter review', owner: 'Recruiting', requiredForSubmission: false }),
  complianceReview: Object.freeze({ label: 'Compliance review', owner: 'Compliance', requiredForSubmission: false }),
  executiveApproval: Object.freeze({ label: 'Executive approval', owner: 'Executive', requiredForSubmission: false }),
  onboardingRelease: Object.freeze({ label: 'Onboarding release', owner: 'HR / IT', requiredForSubmission: false })
});

export const WORKFLOW_TASKS = Object.freeze([
  Object.freeze({ key: 'COMPLETE_PROFILE', title: 'Complete candidate profile', owner: 'Candidate', trigger: 'REGISTERED' }),
  Object.freeze({ key: 'VERIFY_IDENTITY', title: 'Verify sign-in identity', owner: 'Candidate', trigger: 'REGISTERED' }),
  Object.freeze({ key: 'COMPLETE_ELIGIBILITY', title: 'Complete eligibility declarations', owner: 'Candidate', trigger: 'PROFILE_COMPLETE' }),
  Object.freeze({ key: 'ACKNOWLEDGE_DISCLOSURES', title: 'Acknowledge disclosures and attest accuracy', owner: 'Candidate', trigger: 'PROFILE_COMPLETE' }),
  Object.freeze({ key: 'PREPARE_DOCUMENTS', title: 'Prepare required supporting documents', owner: 'Candidate', trigger: 'PROFILE_COMPLETE' }),
  Object.freeze({ key: 'SUBMIT_APPLICATION', title: 'Review and submit application', owner: 'Candidate', trigger: 'SUBMISSION_READY' }),
  Object.freeze({ key: 'RECRUITER_REVIEW', title: 'Conduct recruiter completeness review', owner: 'Recruiting', trigger: 'SUBMITTED' }),
  Object.freeze({ key: 'COMPLIANCE_REVIEW', title: 'Conduct credential and compliance review', owner: 'Compliance', trigger: 'RECRUITER_REVIEW_COMPLETE' }),
  Object.freeze({ key: 'EXECUTIVE_DECISION', title: 'Record executive application decision', owner: 'Executive', trigger: 'COMPLIANCE_REVIEW_COMPLETE' }),
  Object.freeze({ key: 'RELEASE_ONBOARDING', title: 'Release approved applicant to onboarding', owner: 'HR', trigger: 'APPROVED' })
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nowIso(now = () => new Date()) {
  return now().toISOString();
}

function makeApplicationId(now = () => new Date()) {
  const date = now();
  const token = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  return `GGH-APP-${date.getUTCFullYear()}-${token}`;
}

function taskFromDefinition(definition, createdAt) {
  return {
    taskId: crypto.randomUUID(),
    key: definition.key,
    title: definition.title,
    owner: definition.owner,
    status: 'PENDING',
    createdAt,
    completedAt: null,
    completedBy: null,
    notes: ''
  };
}

function createEvent(action, actor, details, occurredAt) {
  return {
    eventId: crypto.randomUUID(),
    occurredAt,
    action,
    actor,
    details: details || {}
  };
}

export function createApplication({ email, firstName, lastName, positionInterest, candidateId = null, actor = 'candidate.registration', now = () => new Date() } = {}) {
  assert(email && String(email).includes('@'), 'A valid email address is required.');
  assert(firstName, 'First name is required.');
  assert(lastName, 'Last name is required.');
  assert(positionInterest, 'Position interest is required.');

  const createdAt = nowIso(now);
  const application = {
    schemaVersion: STORAGE_VERSION,
    applicationId: makeApplicationId(now),
    candidateId,
    status: 'REGISTERED',
    createdAt,
    updatedAt: createdAt,
    submittedAt: null,
    lockedAt: null,
    identity: {
      subjectRef: `candidate:${String(email).trim().toLowerCase()}`,
      oauthSubject: null,
      oauthObjectId: null,
      oauthTenantId: null,
      oauthVerifiedAt: null,
      email: String(email).trim(),
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim()
    },
    profile: {
      preferredName: '',
      phone: '',
      city: '',
      state: '',
      positionInterest: String(positionInterest).trim(),
      currentEmployer: '',
      currentTitle: '',
      yearsRelevantExperience: '',
      professionalSummary: '',
      referralSource: ''
    },
    eligibility: {
      authorizedToWork: null,
      requiresSponsorship: null,
      canPerformEssentialFunctions: null,
      understandsCredentialVerification: null
    },
    disclosures: {
      privacyNoticeAcknowledged: false,
      accuracyAttestation: false,
      electronicRecordsConsent: false,
      separateScreeningDisclosureRequired: true,
      screeningAuthorizationCollectedHere: false
    },
    documents: {
      resume: 'NOT_PROVIDED',
      professionalLicense: 'NOT_PROVIDED',
      educationAuthorization: 'NOT_PROVIDED',
      references: 'NOT_PROVIDED'
    },
    gates: Object.fromEntries(Object.keys(GATE_DEFINITIONS).map(key => [key, {
      status: key === 'account' ? 'COMPLETE' : 'PENDING',
      completedAt: key === 'account' ? createdAt : null,
      completedBy: key === 'account' ? actor : null,
      evidence: key === 'account' ? 'Application record created' : null
    }])),
    tasks: WORKFLOW_TASKS.filter(task => task.trigger === 'REGISTERED').map(task => taskFromDefinition(task, createdAt)),
    events: [createEvent('APPLICATION_REGISTERED', actor, { email, positionInterest, candidateId }, createdAt)]
  };
  return recalculate(application, actor, now);
}

function isProfileComplete(application) {
  const required = [
    application.identity.firstName,
    application.identity.lastName,
    application.identity.email,
    application.profile.phone,
    application.profile.city,
    application.profile.state,
    application.profile.positionInterest,
    application.profile.professionalSummary
  ];
  return required.every(value => String(value ?? '').trim().length > 0);
}

function isEligibilityComplete(application) {
  return [
    application.eligibility.authorizedToWork,
    application.eligibility.requiresSponsorship,
    application.eligibility.canPerformEssentialFunctions,
    application.eligibility.understandsCredentialVerification
  ].every(value => typeof value === 'boolean');
}

function areDisclosuresComplete(application) {
  return application.disclosures.privacyNoticeAcknowledged
    && application.disclosures.accuracyAttestation
    && application.disclosures.electronicRecordsConsent;
}

function requiredSubmissionGatesComplete(application) {
  return Object.entries(GATE_DEFINITIONS)
    .filter(([, definition]) => definition.requiredForSubmission)
    .every(([key]) => application.gates[key].status === 'COMPLETE');
}

function ensureTask(application, key, createdAt) {
  if (application.tasks.some(task => task.key === key)) return;
  const definition = WORKFLOW_TASKS.find(task => task.key === key);
  if (definition) application.tasks.push(taskFromDefinition(definition, createdAt));
}

function completeTask(application, key, actor, completedAt) {
  const task = application.tasks.find(item => item.key === key);
  if (!task || task.status === 'COMPLETE') return;
  task.status = 'COMPLETE';
  task.completedAt = completedAt;
  task.completedBy = actor;
}

function setGateInternal(application, key, status, actor, evidence, completedAt) {
  assert(application.gates[key], `Unknown gate: ${key}`);
  application.gates[key] = {
    status,
    completedAt: status === 'COMPLETE' ? completedAt : null,
    completedBy: status === 'COMPLETE' ? actor : null,
    evidence: evidence || null
  };
}

export function recalculate(application, actor = 'system.workflow', now = () => new Date()) {
  const updatedAt = nowIso(now);
  application.updatedAt = updatedAt;

  if (application.identity.oauthVerifiedAt) {
    setGateInternal(application, 'identity', 'COMPLETE', actor, 'OAuth2 PKCE identity session recorded', application.identity.oauthVerifiedAt);
    completeTask(application, 'VERIFY_IDENTITY', actor, application.identity.oauthVerifiedAt);
  }

  if (isProfileComplete(application)) {
    if (application.gates.profile.status !== 'COMPLETE') setGateInternal(application, 'profile', 'COMPLETE', actor, 'Required profile fields complete', updatedAt);
    completeTask(application, 'COMPLETE_PROFILE', actor, updatedAt);
    ensureTask(application, 'COMPLETE_ELIGIBILITY', updatedAt);
    ensureTask(application, 'ACKNOWLEDGE_DISCLOSURES', updatedAt);
    ensureTask(application, 'PREPARE_DOCUMENTS', updatedAt);
  } else if (application.gates.profile.status === 'COMPLETE') {
    setGateInternal(application, 'profile', 'PENDING', actor, 'Required profile fields incomplete', updatedAt);
  }

  if (isEligibilityComplete(application)) {
    if (application.gates.eligibility.status !== 'COMPLETE') setGateInternal(application, 'eligibility', 'COMPLETE', actor, 'Eligibility declarations complete', updatedAt);
    completeTask(application, 'COMPLETE_ELIGIBILITY', actor, updatedAt);
  } else if (application.gates.eligibility.status === 'COMPLETE') {
    setGateInternal(application, 'eligibility', 'PENDING', actor, 'Eligibility declarations incomplete', updatedAt);
  }

  if (areDisclosuresComplete(application)) {
    if (application.gates.disclosures.status !== 'COMPLETE') setGateInternal(application, 'disclosures', 'COMPLETE', actor, 'Privacy, accuracy, and electronic-record acknowledgments complete', updatedAt);
    completeTask(application, 'ACKNOWLEDGE_DISCLOSURES', actor, updatedAt);
  } else if (application.gates.disclosures.status === 'COMPLETE') {
    setGateInternal(application, 'disclosures', 'PENDING', actor, 'Required disclosures incomplete', updatedAt);
  }

  const documentValues = Object.values(application.documents);
  if (documentValues.every(value => ['READY_FOR_UPLOAD', 'UPLOADED', 'VERIFIED', 'NOT_APPLICABLE'].includes(value))) {
    if (application.gates.documents.status !== 'COMPLETE') setGateInternal(application, 'documents', 'COMPLETE', actor, 'Document checklist prepared', updatedAt);
    completeTask(application, 'PREPARE_DOCUMENTS', actor, updatedAt);
  }

  if (requiredSubmissionGatesComplete(application) && !['SUBMITTED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'ONBOARDING'].includes(application.status)) {
    application.status = 'READY_TO_SUBMIT';
    ensureTask(application, 'SUBMIT_APPLICATION', updatedAt);
  } else if (application.status === 'REGISTERED' && application.gates.profile.status === 'COMPLETE') {
    application.status = 'APPLICATION_IN_PROGRESS';
  }

  return application;
}

export function updateApplication(application, patch, actor = 'candidate', now = () => new Date()) {
  assert(!application.lockedAt, 'The submitted application is locked.');
  const allowedTopLevel = ['profile', 'eligibility', 'disclosures', 'documents'];
  for (const key of allowedTopLevel) {
    if (patch[key]) application[key] = { ...application[key], ...patch[key] };
  }
  const occurredAt = nowIso(now);
  application.events.unshift(createEvent('APPLICATION_UPDATED', actor, { sections: Object.keys(patch).filter(key => allowedTopLevel.includes(key)) }, occurredAt));
  return recalculate(application, actor, now);
}

export function attachOAuthIdentity(application, session, actor = 'candidate.oauth', now = () => new Date()) {
  assert(session?.claims?.subject || session?.claims?.objectId, 'OAuth identity claims are required.');
  const email = String(session.claims.email || session.claims.username || '').trim().toLowerCase();
  const applicationEmail = String(application.identity.email || '').trim().toLowerCase();
  if (email && applicationEmail && email !== applicationEmail) {
    throw new Error('Authenticated account email does not match the application email. Contact support to resolve the identity mismatch.');
  }
  const verifiedAt = session.authenticatedAt || nowIso(now);
  application.identity.oauthSubject = session.claims.subject || null;
  application.identity.oauthObjectId = session.claims.objectId || null;
  application.identity.oauthTenantId = session.claims.tenantId || null;
  application.identity.oauthVerifiedAt = verifiedAt;
  application.events.unshift(createEvent('OAUTH_IDENTITY_ATTACHED', actor, {
    oauthTenantId: application.identity.oauthTenantId,
    email: session.claims.email || session.claims.username || null
  }, verifiedAt));
  return recalculate(application, actor, now);
}

export function submitApplication(application, actor = 'candidate', now = () => new Date()) {
  recalculate(application, actor, now);
  assert(application.status === 'READY_TO_SUBMIT', 'Required submission gates are incomplete.');
  const submittedAt = nowIso(now);
  application.status = 'SUBMITTED';
  application.submittedAt = submittedAt;
  application.lockedAt = submittedAt;
  setGateInternal(application, 'submission', 'COMPLETE', actor, 'Candidate submitted application', submittedAt);
  completeTask(application, 'SUBMIT_APPLICATION', actor, submittedAt);
  ensureTask(application, 'RECRUITER_REVIEW', submittedAt);
  application.events.unshift(createEvent('APPLICATION_SUBMITTED', actor, { applicationId: application.applicationId }, submittedAt));
  return application;
}

export function employerTransition(application, action, actor, evidence = '', now = () => new Date()) {
  assert(actor, 'Employer actor is required.');
  const occurredAt = nowIso(now);
  switch (action) {
    case 'START_REVIEW':
      assert(application.status === 'SUBMITTED' || application.status === 'ACTION_REQUIRED', 'Application is not ready for employer review.');
      application.status = 'UNDER_REVIEW';
      application.events.unshift(createEvent('EMPLOYER_REVIEW_STARTED', actor, { evidence }, occurredAt));
      break;
    case 'REQUEST_ACTION':
      assert(['SUBMITTED', 'UNDER_REVIEW'].includes(application.status), 'Action cannot be requested from the current status.');
      application.status = 'ACTION_REQUIRED';
      application.lockedAt = null;
      application.events.unshift(createEvent('CANDIDATE_ACTION_REQUESTED', actor, { evidence }, occurredAt));
      break;
    case 'COMPLETE_RECRUITER_REVIEW':
      setGateInternal(application, 'recruiterReview', 'COMPLETE', actor, evidence || 'Recruiter review completed', occurredAt);
      completeTask(application, 'RECRUITER_REVIEW', actor, occurredAt);
      ensureTask(application, 'COMPLIANCE_REVIEW', occurredAt);
      application.events.unshift(createEvent('RECRUITER_REVIEW_COMPLETED', actor, { evidence }, occurredAt));
      break;
    case 'COMPLETE_COMPLIANCE_REVIEW':
      assert(application.gates.recruiterReview.status === 'COMPLETE', 'Recruiter review must be complete first.');
      setGateInternal(application, 'complianceReview', 'COMPLETE', actor, evidence || 'Compliance review completed', occurredAt);
      completeTask(application, 'COMPLIANCE_REVIEW', actor, occurredAt);
      ensureTask(application, 'EXECUTIVE_DECISION', occurredAt);
      application.events.unshift(createEvent('COMPLIANCE_REVIEW_COMPLETED', actor, { evidence }, occurredAt));
      break;
    case 'APPROVE':
      assert(application.gates.complianceReview.status === 'COMPLETE', 'Compliance review must be complete first.');
      application.status = 'APPROVED';
      setGateInternal(application, 'executiveApproval', 'COMPLETE', actor, evidence || 'Executive approval recorded', occurredAt);
      completeTask(application, 'EXECUTIVE_DECISION', actor, occurredAt);
      ensureTask(application, 'RELEASE_ONBOARDING', occurredAt);
      application.events.unshift(createEvent('APPLICATION_APPROVED', actor, { evidence }, occurredAt));
      break;
    case 'DECLINE':
      application.status = 'DECLINED';
      completeTask(application, 'EXECUTIVE_DECISION', actor, occurredAt);
      application.events.unshift(createEvent('APPLICATION_DECLINED', actor, { evidence }, occurredAt));
      break;
    case 'RELEASE_ONBOARDING':
      assert(application.status === 'APPROVED', 'Only approved applications may enter onboarding.');
      application.status = 'ONBOARDING';
      setGateInternal(application, 'onboardingRelease', 'COMPLETE', actor, evidence || 'Released to employer onboarding', occurredAt);
      completeTask(application, 'RELEASE_ONBOARDING', actor, occurredAt);
      application.events.unshift(createEvent('ONBOARDING_RELEASED', actor, { evidence }, occurredAt));
      break;
    default:
      throw new Error(`Unsupported employer transition: ${action}`);
  }
  application.updatedAt = occurredAt;
  return application;
}

export function completionPercent(application) {
  const candidateGateKeys = ['account', 'identity', 'profile', 'eligibility', 'disclosures', 'documents', 'submission'];
  const completed = candidateGateKeys.filter(key => application.gates[key].status === 'COMPLETE').length;
  return Math.round((completed / candidateGateKeys.length) * 100);
}

export class ApplicationStore {
  constructor({ storage = globalThis.localStorage, storageKey = DEFAULT_STORAGE_KEY } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.state = this.#load();
  }

  #load() {
    try {
      const parsed = JSON.parse(this.storage.getItem(this.storageKey) || 'null');
      if (parsed?.schemaVersion === STORAGE_VERSION && Array.isArray(parsed.applications)) return parsed;
    } catch {
      // Ignore invalid local demonstration data.
    }
    return { schemaVersion: STORAGE_VERSION, applications: [] };
  }

  #save() {
    this.storage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  list() {
    return this.state.applications.map(application => structuredClone(application));
  }

  get(applicationId) {
    const application = this.state.applications.find(item => item.applicationId === applicationId);
    return application ? structuredClone(application) : null;
  }

  findByEmail(email) {
    const normalized = String(email ?? '').trim().toLowerCase();
    return this.state.applications
      .filter(item => String(item.identity.email).trim().toLowerCase() === normalized)
      .map(item => structuredClone(item));
  }

  save(application) {
    assert(application?.applicationId, 'applicationId is required.');
    const index = this.state.applications.findIndex(item => item.applicationId === application.applicationId);
    if (index >= 0) this.state.applications[index] = structuredClone(application);
    else this.state.applications.unshift(structuredClone(application));
    this.#save();
    return structuredClone(application);
  }

  remove(applicationId) {
    this.state.applications = this.state.applications.filter(item => item.applicationId !== applicationId);
    this.#save();
  }
}
