# The Great Gray Horizon Counseling Center
## System Architecture and Program Specification

**Parent corporation:** Ross Tax Pro Software Co.  
**Program slogan:** *Illuminating Pathways Beyond the Gray Horizon.*  
**Architecture status:** Executable browser demonstration plus production contracts, controls and deployment scaffolding.

## 1. Leadership and authority model

| Role | Administrator-provided designation | System authority |
|---|---|---|
| Condre Ross | Chief Executive Officer, Chief Financial Officer and Program Director | Corporate governance, finance, enrollment approval and platform administration |
| Dr. Jenifer Martin | Chief Clinical Officer and Clinical Persona Steward | Clinical curriculum stewardship, simulation review and ethics oversight |

Names, degrees, licenses and professional designations are administrator-provided. Public display and assignment of regulated duties require independent credential and license verification.

## 2. Program purpose

The platform provides distance-learning, workflow automation and supervised AI-assisted educational simulations for learners, instructors, administrators, auditors, engineers and quality-assurance personnel. It is not a substitute for direct professional care and does not permit AI systems to make autonomous clinical, employment, admission, financial or disciplinary decisions.

### Primary user actions

- **Enroll Now** — opens the candidate and enrollment workflow.
- **Launch Realtime AI Sandbox** — starts an educational simulation only after RBAC and safety-policy evaluation.

## 3. Bounded-context architecture

```text
Public Web and Candidate Access
        |
        v
Enrollment API ---- Payment Provider
        |                 |
        |                 v
        |          Signed Webhook Event
        v
Workflow Orchestrator ---- Immutable Audit Sink
        |
        +---- Approval Gate
        |
        +---- Microsoft Entra Provisioning Adapter
        |
        +---- Notification Adapter
        |
        +---- Learning Workspace Service
        |
        +---- AI Persona Session Broker
```

### Services

1. **Candidate and Enrollment Service**
   - application and enrollment IDs;
   - candidate-owned data entry;
   - payment-session reference;
   - enrollment-state machine;
   - idempotent task triggers.

2. **Payment Verification Adapter**
   - accepts provider event IDs and verified webhook events;
   - never stores raw payment credentials in the browser;
   - records amount, currency, event type and provider reference;
   - rejects duplicate event IDs.

3. **Approval Service**
   - verifies payment and eligibility gates;
   - requires an authorized human actor;
   - records approval evidence and reason;
   - creates the identity-provisioning task.

4. **Identity Provisioning Adapter**
   - calls Microsoft Graph through a server-side workload identity;
   - creates a staged user only after approval;
   - records directory object ID and user principal name;
   - assigns approved static security groups;
   - does not expose Graph credentials to the browser.

5. **Learning Workspace Service**
   - creates course workspace and enrollment records;
   - assigns learner, instructor and persona roles;
   - initializes task, module and grade ledgers;
   - produces certificate evidence after completion gates.

6. **AI Persona Session Broker**
   - stores no provider API key in client code;
   - creates server-authorized Realtime sessions;
   - attaches approved prompt versions and persona policies;
   - logs model, prompt version, tools, safety outcome and reviewer state;
   - requires human review for consequential output.

7. **Audit and Evidence Service**
   - append-only event records;
   - correlation and causation IDs;
   - actor, role, action, object, result and timestamp;
   - export manifest and checksum;
   - retention class and legal-hold status.

## 4. Learning personas

### Clinical Education Facilitator

The Dr. Martin persona supports case-based learning, reasoning rubrics, ethics scenarios and reviewed literature summaries. It may provide formative educational feedback. It may not independently determine a learner's final competency, deliver direct professional care or initiate adverse academic action.

### Program Governance and Operations Assistant

The Condre Ross module supports enrollment summaries, capacity analysis, compliance checklists, financial scenario modeling and task orchestration. It may not execute payments, create privileged accounts, modify audit evidence or approve its own recommendations.

### Teaching and Administrative Assistant

This persona supports reminders, navigation, assignment organization and initial formative feedback. It is restricted to assigned learner and course scopes.

## 5. RBAC model

| Role | Identity | Curriculum and AI | Finance | Evidence | Engineering |
|---|---|---|---|---|---|
| Executive Admin | Full approved administration | Governance and configuration | Analytics and approval | Full review and export | Operational oversight |
| Clinical Officer | Read assigned identities | Clinical curriculum and human review | No payment execution | Clinical evidence review | Approved persona configuration |
| Student | Own identity only | Assigned coursework and simulations | Own payment status | Own certificates and grades | None |
| Auditor | Read-only audit identity | Evaluation artifacts | Transaction evidence | Read and export | None |
| Developer | Service-principal scope | Prompt and route configuration | Integration logs only | Technical audit events | Infrastructure and API routes |
| Tester | Test identities only | Sandbox and automated tests | Mock gateway only | Test evidence | Non-production environments |

Production authorization is enforced by server-side access-token validation. Browser role selectors are demonstration controls only.

## 6. Enrollment state machine

```text
APPLICATION_SUBMITTED
  -> PAYMENT_PENDING
  -> PAYMENT_VERIFIED
  -> APPROVAL_PENDING
  -> APPROVED
  -> IDENTITY_PROVISIONING
  -> IDENTITY_READY
  -> LMS_PROVISIONING
  -> ACTIVE
  -> COMPLETED
```

Exception states:

```text
SUSPENDED
DECLINED
CANCELLED
ACTION_REQUIRED
```

Every transition requires:

- current-state validation;
- actor and RBAC permission;
- idempotency key;
- correlation ID;
- timestamp;
- result and reason;
- append-only audit event.

## 7. Workflow triggers

| Trigger | Preconditions | Created task | Completion evidence |
|---|---|---|---|
| Application submitted | Required profile fields | Verify payment | Enrollment and candidate IDs |
| Payment verified | Valid signature and unique provider event | Approve enrollment | Provider reference and event ID |
| Enrollment approved | Payment and eligibility complete | Provision identity | Approver, timestamp and decision |
| Identity ready | Directory object created | Provision LMS and send welcome | Object ID and UPN |
| Workspace active | RBAC groups and workspace created | Complete orientation | Workspace ID and assignments |
| Module complete | Active learner and assigned module | Update grade ledger | Module evidence and reviewer |
| Program complete | All academic gates complete | Issue certificate | Certificate ID and evidence manifest |

## 8. Payment controls

- Use provider-hosted payment collection.
- Retain only provider references and business records required by policy.
- Verify webhook signatures using the provider's official library and the unmodified request body.
- Process events idempotently by provider event ID.
- Separate test and production credentials.
- Never place payment secrets in Terraform source, browser JavaScript, GitHub or exported audit packages.

## 9. Microsoft identity controls

- Use an application registration or managed workload identity with least privilege.
- Require administrator consent for directory-wide permissions.
- Create staged identities only after human approval.
- Keep accounts disabled until the approved effective date when appropriate.
- Record Employee or Student ID in the directory profile.
- Assign static groups that map to application roles.
- Require MFA and device controls when licensing supports them.
- Outlook mailbox creation remains dependent on an Exchange-capable license.

## 10. Realtime AI controls

- Current production integration should use the OpenAI Realtime API through a backend session broker.
- Use a current supported Realtime model rather than hard-coding a retired preview model.
- API keys remain server-side or in an approved secret manager.
- Prompt versions are immutable and reviewable.
- Literature ingestion is staged, scanned, cited and approved before inclusion.
- Simulation transcripts receive retention and access classifications.
- No autonomous adverse action.
- Consequential scoring requires a named human reviewer.

## 11. Data classification and retention

| Class | Examples | Default handling |
|---|---|---|
| Public | Program pages and approved policies | Public CDN and version control |
| Internal | Course design and operational procedures | Authenticated staff access |
| Confidential | Candidate and learner records | Encryption, RBAC and audit logging |
| Restricted | Identity secrets, payment secrets and sensitive evidence | Secret manager, least privilege and no browser storage |

Retention periods must be approved by counsel and records management. Deletion requires identity verification, legal-hold checks, dependency analysis, two-person approval for bulk actions and an audit record of the result.

## 12. Environment strategy

```text
local -> development -> test -> staging -> production
```

Each environment receives separate:

- identity applications and redirect URIs;
- payment keys and webhook secrets;
- databases and object storage;
- queues and audit streams;
- AI provider projects and quotas;
- DNS names and certificates;
- deployment approvals.

Production promotion requires successful tests, security review, accessibility checks, migration approval and rollback readiness.

## 13. Repository implementation map

```text
portal/learning-portal.html
portal/learning-portal.css
portal/learning-portal.js
portal/data/program-spec.json
portal/lib/learning-engine.js
portal/tests/learning-engine.test.mjs
openapi/ggh-onboarding.yaml
infra/terraform/ggh-platform/
docs/GGH_SYSTEM_ARCHITECTURE.md
```

## 14. External references

- OpenAI Realtime API: https://platform.openai.com/docs/api-reference/realtime
- OpenAI API authentication and server-side key handling: https://platform.openai.com/docs/api-reference
- Microsoft Graph create user: https://learn.microsoft.com/graph/api/user-post-users
- Microsoft Graph user resource: https://learn.microsoft.com/graph/api/resources/user
- Microsoft Graph send mail: https://learn.microsoft.com/graph/api/user-sendmail
- Stripe webhook signature verification: https://docs.stripe.com/webhooks
