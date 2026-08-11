import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApplicationStore,
  attachOAuthIdentity,
  createApplication,
  employerTransition,
  submitApplication,
  updateApplication
} from '../lib/application-engine.js';
import { createMemoryStorage } from '../lib/id-engine.js';

function fixedNow(value) {
  return () => new Date(value);
}

function completeCandidateApplication() {
  let application = createApplication({
    email: 'candidate@example.com',
    firstName: 'Candidate',
    lastName: 'Example',
    positionInterest: 'Program Manager',
    candidateId: 'GGH-CAN-2026-ABCDEFGHIJ-AA',
    now: fixedNow('2026-08-05T06:00:00Z')
  });
  application = attachOAuthIdentity(application, {
    authenticatedAt: '2026-08-05T06:05:00Z',
    claims: {
      subject: 'oauth-subject',
      objectId: 'entra-object',
      tenantId: 'tenant-id',
      email: 'candidate@example.com'
    }
  }, 'candidate.oauth', fixedNow('2026-08-05T06:05:00Z'));
  application = updateApplication(application, {
    profile: {
      phone: '555-555-0100',
      city: 'Lumberton',
      state: 'NJ',
      professionalSummary: 'Program leadership and service-delivery experience.'
    },
    eligibility: {
      authorizedToWork: true,
      requiresSponsorship: false,
      canPerformEssentialFunctions: true,
      understandsCredentialVerification: true
    },
    disclosures: {
      privacyNoticeAcknowledged: true,
      accuracyAttestation: true,
      electronicRecordsConsent: true
    },
    documents: {
      resume: 'READY_FOR_UPLOAD',
      professionalLicense: 'READY_FOR_UPLOAD',
      educationAuthorization: 'READY_FOR_UPLOAD',
      references: 'READY_FOR_UPLOAD'
    }
  }, 'candidate', fixedNow('2026-08-05T06:10:00Z'));
  return application;
}

test('registration creates candidate gates and initial tasks', () => {
  const application = createApplication({
    email: 'candidate@example.com',
    firstName: 'Candidate',
    lastName: 'Example',
    positionInterest: 'Program Manager',
    now: fixedNow('2026-08-05T06:00:00Z')
  });
  assert.match(application.applicationId, /^GGH-APP-2026-/);
  assert.equal(application.status, 'REGISTERED');
  assert.equal(application.gates.account.status, 'COMPLETE');
  assert.equal(application.gates.identity.status, 'PENDING');
  assert.deepEqual(application.tasks.map(task => task.key).sort(), ['COMPLETE_PROFILE', 'VERIFY_IDENTITY']);
});

test('candidate data and OAuth identity trigger submission readiness', () => {
  const application = completeCandidateApplication();
  assert.equal(application.status, 'READY_TO_SUBMIT');
  assert.equal(application.gates.identity.status, 'COMPLETE');
  assert.equal(application.gates.profile.status, 'COMPLETE');
  assert.equal(application.gates.eligibility.status, 'COMPLETE');
  assert.equal(application.gates.disclosures.status, 'COMPLETE');
  assert.equal(application.gates.documents.status, 'COMPLETE');
  assert.ok(application.tasks.some(task => task.key === 'SUBMIT_APPLICATION'));

  const submitted = submitApplication(application, 'candidate', fixedNow('2026-08-05T06:15:00Z'));
  assert.equal(submitted.status, 'SUBMITTED');
  assert.equal(submitted.gates.submission.status, 'COMPLETE');
  assert.ok(submitted.lockedAt);
  assert.throws(() => updateApplication(submitted, { profile: { city: 'Other' } }), /locked/);
});

test('employer workflow enforces review order before onboarding', () => {
  let application = submitApplication(completeCandidateApplication(), 'candidate', fixedNow('2026-08-05T06:15:00Z'));
  application = employerTransition(application, 'START_REVIEW', 'recruiter@example.com', '', fixedNow('2026-08-05T07:00:00Z'));
  application = employerTransition(application, 'COMPLETE_RECRUITER_REVIEW', 'recruiter@example.com', 'Complete', fixedNow('2026-08-05T07:10:00Z'));
  application = employerTransition(application, 'COMPLETE_COMPLIANCE_REVIEW', 'compliance@example.com', 'Verified', fixedNow('2026-08-05T07:20:00Z'));
  application = employerTransition(application, 'APPROVE', 'executive@example.com', 'Approved', fixedNow('2026-08-05T07:30:00Z'));
  assert.equal(application.status, 'APPROVED');
  application = employerTransition(application, 'RELEASE_ONBOARDING', 'hr@example.com', 'Offer accepted', fixedNow('2026-08-05T07:40:00Z'));
  assert.equal(application.status, 'ONBOARDING');
  assert.equal(application.gates.onboardingRelease.status, 'COMPLETE');
});

test('application store supports deterministic save and retrieval', () => {
  const storage = createMemoryStorage();
  const store = new ApplicationStore({ storage });
  const application = createApplication({
    email: 'candidate@example.com',
    firstName: 'Candidate',
    lastName: 'Example',
    positionInterest: 'Program Manager'
  });
  store.save(application);
  assert.equal(store.get(application.applicationId).identity.email, 'candidate@example.com');
  assert.equal(store.findByEmail('CANDIDATE@EXAMPLE.COM').length, 1);
});
