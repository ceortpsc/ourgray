import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LearningPlatformEngine,
  canLearning,
  LEARNING_PERMISSIONS
} from '../lib/learning-engine.js';

function createEngine() {
  let counter = 0;
  return new LearningPlatformEngine({
    clock: () => new Date('2026-08-05T10:00:00.000Z'),
    idFactory: prefix => `${prefix}-${String(++counter).padStart(4, '0')}`
  });
}

test('registers an application and creates the payment task', () => {
  const engine = createEngine();
  const record = engine.registerApplication({
    applicantName: 'Demo Learner',
    email: 'learner@example.invalid',
    programId: 'GGH-101'
  });

  assert.equal(record.status, 'PAYMENT_PENDING');
  assert.equal(record.tasks.length, 1);
  assert.equal(record.tasks[0].type, 'VERIFY_PAYMENT');
  assert.equal(engine.auditEvents[0].action, 'APPLICATION_REGISTERED');
});

test('enforces role boundaries across payment, approval, identity and workspace activation', () => {
  const engine = createEngine();
  let record = engine.registerApplication({
    applicantName: 'Demo Learner',
    email: 'learner@example.invalid',
    programId: 'GGH-101'
  });

  assert.throws(() => engine.recordPayment(record.enrollmentId, {
    providerReference: 'payment-1', amount: 100, actor: 'student', role: 'STUDENT'
  }), /not authorized/);

  record = engine.recordPayment(record.enrollmentId, {
    providerReference: 'payment-1', amount: 100, actor: 'finance', role: 'FINANCE'
  });
  assert.equal(record.status, 'APPROVAL_PENDING');

  record = engine.approveEnrollment(record.enrollmentId, {
    actor: 'executive', role: 'EXECUTIVE_ADMIN'
  });
  assert.equal(record.status, 'IDENTITY_PROVISIONING');

  record = engine.recordIdentityProvisioned(record.enrollmentId, {
    userPrincipalName: 'learner@example.invalid',
    objectId: 'object-1',
    actor: 'identity-admin',
    role: 'IDENTITY_ADMIN'
  });
  assert.equal(record.status, 'LMS_PROVISIONING');

  record = engine.activateWorkspace(record.enrollmentId, {
    workspaceId: 'workspace-1',
    personas: ['TEACHING_ASSISTANT'],
    actor: 'developer',
    role: 'DEVELOPER'
  });
  assert.equal(record.status, 'ACTIVE');
});

test('creates workflow tasks idempotently', () => {
  const engine = createEngine();
  let record = engine.registerApplication({
    applicantName: 'Demo Learner',
    email: 'learner@example.invalid',
    programId: 'GGH-101'
  });

  const internal = engine.getEnrollment(record.enrollmentId);
  engine.ensureTask(internal, 'VERIFY_PAYMENT');
  engine.ensureTask(internal, 'VERIFY_PAYMENT');

  assert.equal(internal.tasks.filter(task => task.type === 'VERIFY_PAYMENT').length, 1);
});

test('blocks consequential persona requests and permits supervised educational simulations', () => {
  const engine = createEngine();

  const allowed = engine.reviewPersonaRequest({
    role: 'STUDENT',
    category: 'EDUCATIONAL_SIMULATION'
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.humanReviewRequired, true);

  const clinicalDecision = engine.reviewPersonaRequest({
    role: 'STUDENT',
    category: 'EDUCATIONAL_SIMULATION',
    requestsDiagnosis: true
  });
  assert.equal(clinicalDecision.allowed, false);
  assert.equal(clinicalDecision.code, 'CLINICAL_DECISION_PROHIBITED');

  const adverseAction = engine.reviewPersonaRequest({
    role: 'EXECUTIVE_ADMIN',
    category: 'EDUCATIONAL_SIMULATION',
    requestsAdverseAction: true
  });
  assert.equal(adverseAction.allowed, false);
  assert.equal(adverseAction.code, 'AUTONOMOUS_ADVERSE_ACTION_PROHIBITED');
});

test('exposes expected learning permissions', () => {
  assert.equal(canLearning('AUDITOR', LEARNING_PERMISSIONS.VIEW_AUDIT), true);
  assert.equal(canLearning('STUDENT', LEARNING_PERMISSIONS.VIEW_AUDIT), false);
  assert.equal(canLearning('CLINICAL_OFFICER', LEARNING_PERMISSIONS.REVIEW_CLINICAL_OUTPUT), true);
});
