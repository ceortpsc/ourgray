# ID Issuance and Central Registry

## Identifier families

| Type | Format | Purpose |
|---|---|---|
| Signature ID | `GGH-SIG-YYYY-RANDOM-CHECKSUM` | Associates an authenticated signature event with a document and signer |
| Candidate ID | `GGH-CAN-YYYY-RANDOM-CHECKSUM` | Stable candidate record identifier |
| Employee ID | `GGH-EMP-YYYY-RANDOM-CHECKSUM` | Issued only after approved conversion to employee status |
| Retention File ID | `GGH-RET-YYYY-RANDOM-CHECKSUM` | Groups records under a retention class and legal-hold policy |

The two-character checksum detects common transcription errors. It is not a cryptographic signature. Production issuance must be performed by an authenticated server and may add an HMAC or digital signature stored outside browser code.

## Lifecycle

`ACTIVE -> SUSPENDED | SUPERSEDED | REVOKED | ARCHIVED`

Identifiers are never silently deleted. Corrections issue a replacement and preserve predecessor/successor links. Status changes require an actor and reason and create an audit event.

## RBAC

The portal checks issuance, export, status-change, linking, and audit permissions by role. The browser implementation demonstrates the policy and user experience. Production APIs must enforce the same permissions server-side and must not trust browser-provided roles.

## Registry data model

Each record contains:

- ID and type
- subject reference
- status
- issuance timestamp and actor
- business purpose
- retention class
- optional expiration
- metadata
- predecessor/successor references
- related-ID links
- version number

## Storage and production adapter

The static portal uses namespaced `localStorage` for an executable demonstration. Replace it with an authenticated API backed by PostgreSQL or DynamoDB, encrypted object storage for documents, immutable audit storage, and a queue/outbox for workflow triggers.

Recommended server endpoints:

- `POST /api/v1/identifiers`
- `GET /api/v1/identifiers`
- `GET /api/v1/identifiers/{id}`
- `POST /api/v1/identifiers/{id}/status`
- `POST /api/v1/identifiers/{id}/links`
- `GET /api/v1/identifier-events`
- `POST /api/v1/exports`

## Controls

- MFA and strong identity provider authentication
- least-privilege RBAC
- server-side idempotency keys
- uniqueness constraint on `id`
- append-only event history
- legal-hold override
- encryption in transit and at rest
- retention policy enforcement
- signed document hash linked to Signature ID
- audit export with actor, timestamp, purpose, and status reason
