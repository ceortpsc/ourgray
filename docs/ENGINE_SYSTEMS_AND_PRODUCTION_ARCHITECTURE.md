# Engine Systems and Production Architecture

**Platform:** The Great Gray Horizon Counseling Center  
**Parent corporation:** Ross Tax Pro Software Co.  
**Architecture status:** Executable browser demonstration with production contracts and controls

## 1. Executive architecture

The platform engine layer separates operational responsibilities into independently testable services:

1. **Job engine** — queues, prioritizes, retries, cancels and dead-letters deterministic work.
2. **Application engine** — evaluates candidate gates and creates idempotent workflow tasks.
3. **Identifier engine** — issues Candidate, Employee, Signature and Retention File IDs.
4. **Export engine** — creates JSON, CSV, NDJSON and XHTML packages with SHA-256 manifests.
5. **Telemetry engine** — records redacted events, operational metrics and health checks.
6. **AI-assist engine** — permits approved assistance while blocking autonomous employment decisions and sensitive-data processing.
7. **Platform engine** — composes the engines and exposes a unified operational interface.

The browser layer demonstrates these contracts. Production execution must move state-changing operations behind authenticated server APIs and durable infrastructure.

## 2. Job orchestration

### Job lifecycle

```text
QUEUED
  -> RUNNING
      -> SUCCEEDED
      -> RETRY_WAIT -> QUEUED
      -> DEAD_LETTER

QUEUED / RETRY_WAIT
  -> CANCELLED

DEAD_LETTER
  -> QUEUED through authorized requeue
```

### Reliability controls

- unique Job ID;
- optional idempotency key;
- priority ordering;
- handler-specific payload validation;
- bounded concurrency;
- retry limit;
- fixed or exponential backoff;
- maximum retry delay;
- attempt count;
- state-transition history;
- structured result or error;
- dead-letter registry;
- event sink for telemetry and audit integration.

### Production substitutions

The browser queue is in-memory. Production should use a durable service such as Azure Service Bus, AWS SQS, PostgreSQL job tables or another approved queue. Queue consumers should run with managed identity, restricted network access and least-privilege database and storage permissions.

## 3. Production-process improvements

The engine architecture improves throughput through:

- asynchronous work separation;
- deduplication by idempotency key;
- concurrent non-conflicting job execution;
- bounded retries instead of uncontrolled loops;
- dead-letter isolation;
- explicit dependency gates;
- export jobs separated from interactive requests;
- provider adapters separated from core workflows;
- health and telemetry visibility;
- human approval queues for AI-assisted output.

Recommended production service lanes:

| Lane | Representative work | Scaling rule |
|---|---|---|
| Interactive API | profile saves, status reads, task completion | horizontal web scaling |
| Workflow queue | triggers, reminders, review tasks | queue depth and processing latency |
| Document queue | hashing, malware scan, rendering, signatures | file volume and scan duration |
| Export queue | reports, archives, XHTML/CSV packages | record volume and export duration |
| Notification queue | email, SMS, in-app notifications | provider rate and retry policy |
| AI-assist queue | approved summaries and quality reviews | token budget, provider quotas and human-review capacity |

## 4. Export architecture

### Formats

- **JSON:** complete structured export with metadata and records.
- **CSV:** globally portable tabular output with RFC-style quoting.
- **NDJSON:** streaming-friendly record-per-line output.
- **XHTML:** styled, standards-oriented presentation suitable for browser viewing and downstream print conversion.

### Export package

Every export can include:

- file name;
- MIME type;
- generation timestamp;
- locale and timezone;
- record count;
- byte length;
- SHA-256 checksum;
- export-purpose metadata;
- separate JSON manifest.

The checksum proves content consistency, not signer identity. Signed reports should additionally use the Signature ID engine, e-signature provider evidence and document-hash linkage.

### Globalization strategy

Production export requests should carry:

- locale;
- timezone;
- requested language;
- date and number formatting policy;
- character encoding;
- jurisdictional privacy restrictions;
- export-purpose classification;
- recipient and delivery channel;
- retention class.

UTF-8 is the default encoding. Personally identifiable information should be minimized, redacted or excluded based on export purpose and recipient authorization.

## 5. Telemetry, health and observability

### Telemetry event model

```json
{
  "eventId": "uuid",
  "occurredAt": "ISO-8601 UTC",
  "name": "JOB_SUCCEEDED",
  "level": "INFO",
  "source": "engine",
  "correlationId": "job-or-request-id",
  "details": {}
}
```

### Built-in redaction

The demonstration engine redacts known secret and sensitive keys, including passwords, tokens, Social Security numbers, banking identifiers and date-of-birth fields. Production must also implement:

- schema-level allowlists;
- structured logging libraries;
- centralized redaction policy;
- log-access RBAC;
- encryption in transit and at rest;
- retention limits;
- legal-hold separation;
- alerting for suspected secret leakage.

### Health model

Each engine exposes a named health check with status:

- `HEALTHY`;
- `DEGRADED`;
- `UNHEALTHY`.

Health results include latency and non-sensitive details. Production readiness should also measure queue age, database connectivity, storage access, identity-provider status, provider quotas, certificate expiration and error-rate thresholds.

## 6. AI-assist governance

### Approved uses

- summarization;
- classification for workflow organization;
- drafting;
- workflow recommendation;
- structural data-quality review.

### Prohibited uses

- autonomous hiring or rejection decisions;
- protected-characteristic inference;
- medical diagnosis;
- credential-verification bypass;
- autonomous background-screening decisions;
- use of passwords, tokens, Social Security numbers, bank information or medical records.

### Required controls

Every request contains:

- request ID;
- authenticated actor;
- documented business purpose;
- approved use case;
- provider identity;
- confidence label;
- explanation;
- human-approval requirement;
- approval or rejection record.

The local deterministic assistant demonstrates policy enforcement without calling an external AI provider. Live AI requires an approved provider adapter, contractual data protections, server-side credentials, data-loss-prevention controls, human review and documented model-risk governance.

## 7. Interfaces

### Candidate access

`portal/candidate-access.html`

- registration;
- continue application;
- OAuth 2.0/PKCE sign-in;
- profile and eligibility data entry;
- disclosures;
- document-readiness checklist;
- gates, tasks and event history;
- candidate copy export.

### Employer onboarding

`portal/onboarding-admin.html`

- Employee ID issuance;
- approval gates;
- Entra and Microsoft 365 package generation;
- platform-role staging;
- audit-log export;
- day-one activation controls.

### Engine operations

`portal/operations-engine.html`

- health dashboard;
- job queue;
- export jobs;
- AI-assist review queue;
- notification staging;
- telemetry stream;
- administrative dashboard export.

## 8. Production deployment map

```text
Cloudflare Pages / CDN
  -> public static UI
  -> security headers and cache rules

Microsoft Entra ID
  -> OAuth 2.0 / OIDC
  -> workforce and candidate identity
  -> app roles and Conditional Access where licensed

Authenticated API
  -> server-side RBAC
  -> application ownership validation
  -> rate limits and abuse protection

PostgreSQL / durable database
  -> candidates, applications, tasks, IDs, approvals and audit references

Durable queue
  -> workflows, exports, notifications, document processing and AI assistance

Encrypted object storage
  -> uploaded documents, reports and signature evidence
  -> malware scanning and retention controls

Immutable audit store
  -> security, workflow, signature and administrative events
```

## 9. Environment promotion

Recommended environments:

```text
local
  -> development
  -> integration
  -> staging
  -> production
  -> disaster-recovery validation
```

Promotion gates:

- automated unit tests;
- static syntax validation;
- secret scan;
- dependency and vulnerability scan;
- infrastructure plan review;
- accessibility test;
- privacy and retention review;
- security review;
- data-migration validation;
- rollback plan;
- executive production approval.

## 10. Current execution boundary

Implemented now:

- executable client-side job engine;
- deterministic candidate workflow engine;
- registry and ID issuance;
- multi-format exports with manifests;
- telemetry and health checks;
- AI policy gates and human review;
- candidate, employer and operations interfaces;
- Microsoft Entra application-registration script;
- Cloudflare Pages deployment controller;
- automated tests and CI validation.

Still requiring external infrastructure and credentials:

- production API;
- durable database and queue;
- encrypted upload and malware-scanning provider;
- immutable audit storage;
- email/SMS provider;
- live AI provider;
- Microsoft tenant administrator execution;
- Cloudflare account authorization;
- final production domain and DNS ownership.
