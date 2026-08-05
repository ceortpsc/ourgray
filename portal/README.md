# The Great Gray Horizon Candidate Operations Portal

Powered by Ross Tax Pro Software Co. | Innovator of All Things Software and Development

## Architecture

This package is a no-build, multi-page-style web application implemented as a single client-side application layer. Every interface is routed through the shared application shell, design system, seeded data model, identifier engine, registry store and RBAC controller.

## Interfaces

- Executive overview
- Candidate file
- Signature, Candidate, Employee and Retention File ID issuance
- Centralized identifier registry
- Checksum validation, lifecycle status, linking and exports
- Workflow orchestration
- Documents and electronic signatures
- Governance and compliance
- RBAC matrix
- Support-agent center
- Append-only audit trail

## Identifier system

The executable browser demonstration issues IDs in this format:

```text
GGH-CAN-2026-XXXXXXXXXX-CC
GGH-EMP-2026-XXXXXXXXXX-CC
GGH-SIG-2026-XXXXXXXXXX-CC
GGH-RET-2026-XXXXXXXXXX-CC
```

`CC` is a typo-detection checksum. It is not a cryptographic signature. Production issuance belongs behind an authenticated API with server-side RBAC, idempotency, uniqueness enforcement and immutable audit storage.

See [`docs/ID_ISSUANCE_AND_REGISTRY.md`](./docs/ID_ISSUANCE_AND_REGISTRY.md) for the data model, lifecycle, controls and recommended API contract.

## Run

```bash
python -m http.server 8080
```

Open `http://localhost:8080/portal/`.

## Test

```bash
npm run test:portal
```

The test suite verifies all four ID families, checksum rejection, registry lifecycle operations, linking, export and RBAC policy.

## Embed on any existing page

```html
<script type="module" src="/portal/embed/ggh-candidate-portal.js"></script>
<ggh-candidate-portal src="/portal/index.html" height="960px"></ggh-candidate-portal>
```

The web component isolates the portal inside an accessible iframe so it can be added to an existing HTML, XHTML, CMS, tax platform, academy site or internal dashboard without changing that site's framework.

## Production adapters still required

The repository implements an executable UI, deterministic ID rules, centralized browser registry, role policies, workflow triggers and audit events. Production operations require secure backend adapters for:

- PostgreSQL or DynamoDB identifier registry
- enterprise identity, MFA and server-side RBAC
- Microsoft 365 or Google Workspace account provisioning
- e-signature provider and document hashing
- encrypted document storage and malware scanning
- HRIS, payroll and benefits
- FCRA-compliant screening provider
- primary-source professional license verification
- immutable audit storage, retention and legal hold

Do not place secrets, production credentials, sensitive documents or real employee data in browser code or GitHub Pages.
