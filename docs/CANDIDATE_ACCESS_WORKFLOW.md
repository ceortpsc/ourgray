# Candidate Access, Registration and Application Workflow

**Program:** The Great Gray Horizon Counseling Center  
**Parent corporation:** Ross Tax Pro Software Co.  
**Tenant:** `eb6c9e4e-0943-4ada-b473-fbafda77eb27`

## Purpose

This module provides a candidate-facing landing page for registration, OAuth 2.0 identity verification, data entry, continuation of a saved application, task management, status tracking, employer review, and controlled release into onboarding.

## Routes

- `/candidate-access.html` — registration, Microsoft sign-in, application data entry, tasks and status
- `/index.html` — corporate candidate-operations portal
- `/onboarding-admin.html` — employer onboarding administration
- `/operations-engine.html` — platform workflow, export, telemetry and AI-assist operations

## Access states

1. **Anonymous visitor:** may read instructions and create an application record.
2. **Registered applicant:** receives an Application ID, Candidate ID and Retention File ID.
3. **OAuth-authenticated applicant:** Microsoft OAuth 2.0 authorization code flow with PKCE links the signed-in identity to the application.
4. **Submitted applicant:** the candidate file is locked for employer review.
5. **Approved applicant:** HR may release the file to onboarding.
6. **Employee onboarding:** Employee ID, Entra identity, platform roles and corporate email remain subject to the employer onboarding gates.

A browser session, visible button, or OAuth ID token is not sufficient authorization for protected employer actions. Production APIs must validate the access token, tenant, application ownership, role, workflow state and requested operation.

## Candidate data-entry gates

| Gate | Completion rule | Triggered tasks |
|---|---|---|
| Registration | Application record and Candidate ID issued | Complete profile; verify identity |
| OAuth identity | OAuth subject or object identifier attached | Identity task completes |
| Profile | Required contact and professional-summary fields complete | Eligibility, disclosure and document tasks |
| Eligibility | Work and credential declarations answered | Eligibility task completes |
| Disclosures | Privacy, accuracy and electronic-record acknowledgments accepted | Disclosure task completes |
| Documents | Each checklist item ready, uploaded, verified or not applicable | Document-preparation task completes |
| Submission | Required gates complete and candidate submits | Recruiter-review task |
| Recruiter review | Employer completeness review complete | Compliance-review task |
| Compliance review | Credential and compliance review complete | Executive-decision task |
| Executive approval | Authorized decision recorded | Onboarding-release task |
| Onboarding release | Offer and employer onboarding requirements satisfied | Employee onboarding workflow |

## Status model

```text
REGISTERED
APPLICATION_IN_PROGRESS
READY_TO_SUBMIT
SUBMITTED
UNDER_REVIEW
ACTION_REQUIRED
APPROVED
DECLINED
WITHDRAWN
ONBOARDING
```

## Deterministic task triggers

```text
REGISTERED
  -> COMPLETE_PROFILE
  -> VERIFY_IDENTITY

PROFILE_COMPLETE
  -> COMPLETE_ELIGIBILITY
  -> ACKNOWLEDGE_DISCLOSURES
  -> PREPARE_DOCUMENTS

SUBMISSION_READY
  -> SUBMIT_APPLICATION

SUBMITTED
  -> RECRUITER_REVIEW

RECRUITER_REVIEW_COMPLETE
  -> COMPLIANCE_REVIEW

COMPLIANCE_REVIEW_COMPLETE
  -> EXECUTIVE_DECISION

APPROVED
  -> RELEASE_ONBOARDING
```

Tasks are idempotent: recalculating the application does not create duplicate tasks.

## OAuth 2.0 and PKCE

The candidate portal is designed as a public SPA and does not require a client secret. The flow includes:

- authorization-code response;
- PKCE `S256` challenge;
- state validation;
- nonce validation when present;
- exact redirect-URI matching;
- session-scoped sign-in state;
- email consistency check between the application and authenticated identity.

Use `scripts/m365/Initialize-GGHCandidatePortalApp.ps1` to create or update:

- the Microsoft Entra application registration;
- the enterprise application/service-principal instance;
- candidate and operations-admin app roles;
- approved SPA redirect URIs;
- the public client ID in `portal/data/candidate-access-config.json`.

No client secret is generated. Protected backend APIs must still validate Microsoft-issued access tokens and enforce RBAC independently.

## Privacy and data-minimization controls

The public browser interface intentionally excludes:

- Social Security numbers;
- banking and payroll account details;
- government-ID images;
- medical or disability descriptions;
- passwords or Microsoft credentials;
- criminal-history details;
- background-screening authorization.

Background-screening disclosure and authorization, when required, must remain a separate compliant workflow. Secure file bytes belong in an approved encrypted upload provider, not browser local storage or GitHub Pages.

## Production requirements

The current interface uses browser storage as an executable demonstration. Production requires:

- authenticated application API;
- server-side Candidate ID and Application ID issuance;
- database uniqueness and optimistic concurrency;
- encrypted document storage and malware scanning;
- server-side OAuth token validation;
- candidate ownership checks;
- durable task queue;
- immutable audit storage;
- notification providers;
- retention and legal-hold enforcement;
- accessibility and security testing;
- rate limiting and abuse controls.
