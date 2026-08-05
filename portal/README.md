# The Great Gray Horizon Candidate Operations Portal

Powered by Ross Tax Pro Software Co. | Innovator of All Things Software and Development

## Architecture

This package is a no-build, multi-page-style web application implemented as a single client-side application layer. Every interface is routed through the shared application shell, design system, seeded data model and navigation controller.

## Interfaces

- Executive overview
- Candidate file
- Workflow orchestration
- Documents and electronic signatures
- Governance and compliance
- RBAC matrix
- Support-agent center
- Append-only audit trail

## Run

Serve the repository root with any static web server and open `portal/index.html`.

```bash
python -m http.server 8080
```

Then browse to `http://localhost:8080/portal/`.

## Embed on any existing page

```html
<script type="module" src="/portal/embed/ggh-candidate-portal.js"></script>
<ggh-candidate-portal src="/portal/index.html" height="960px"></ggh-candidate-portal>
```

The web component isolates the portal inside an accessible iframe so it can be added to an existing HTML, XHTML, CMS, tax platform, academy site or internal dashboard without changing that site's framework.

## Production adapters still required

The current repository implements the complete UI, route model, seeded workflows and client-side trigger specification. Real production operations require secure backend adapters for:

- Microsoft 365 or Google Workspace account provisioning
- Enterprise identity and MFA
- E-signature provider
- Secure document storage and malware scanning
- HRIS/payroll/benefits
- FCRA-compliant screening vendor
- Primary-source professional license verification
- Audit storage and legal hold

Do not place secrets in browser code or GitHub Pages.
