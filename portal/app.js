import { ID_TYPES, RegistryStore, validateId } from './lib/id-engine.js';
import { PERMISSIONS, ROLES, can, permissionsFor } from './lib/rbac.js';

const navItems = [
  ['overview', 'Executive Overview'],
  ['candidate', 'Candidate File'],
  ['registry', 'ID Issuance & Registry'],
  ['workflows', 'Workflow Orchestration'],
  ['documents', 'Documents & Signatures'],
  ['governance', 'Governance & Compliance'],
  ['rbac', 'RBAC Matrix'],
  ['support', 'Support Center'],
  ['audit', 'Audit Trail']
];

const seed = {
  candidate: {
    subjectRef: 'candidate:jmartin',
    name: 'Jennifer Martin',
    email: 'Jmartin@thesolastagroup.org',
    status: 'Conditional Review',
    proposedTitle: 'Chief Clinical & Program Development Officer',
    compensation: '$95,000–$125,000',
    readiness: 42,
    identity: 70,
    credential: 25,
    ethics: 39
  },
  tasks: [
    ['Identity and résumé verification', 'Recruiting', 'IN PROGRESS'],
    ['NJ license category and number', 'Compliance', 'BLOCKED'],
    ['Conflict-of-interest disclosure', 'Ethics', 'PENDING'],
    ['Offer and compensation approval', 'Executive', 'PENDING'],
    ['I-9 and W-4 collection', 'HR', 'NOT STARTED'],
    ['Corporate email provisioning', 'IT', 'GATED']
  ],
  documents: [
    ['Conditional Offer Letter', 'Offer', 'DRAFT'],
    ['Executive Employment Agreement', 'Agreement', 'DRAFT'],
    ['Partnership and Equity Term Sheet', 'Agreement', 'DRAFT'],
    ['Confidentiality and IP Assignment', 'Compliance', 'READY'],
    ['Background-Screening Disclosure', 'Disclosure', 'READY'],
    ['Benefits Enrollment Packet', 'Benefits', 'GATED'],
    ['Form I-9', 'Federal Form', 'GATED'],
    ['Form W-4', 'Federal Form', 'GATED']
  ],
  events: [
    ['2026-08-04 23:11', 'Candidate identifier updated', 'Jmartin@thesolastagroup.org'],
    ['2026-08-04 22:38', 'Ethics review initialized', 'Conditional review'],
    ['2026-08-04 21:52', 'Branded document system created', 'Navy · Gold · Silver'],
    ['2026-08-04 20:40', 'Due-diligence report generated', 'Evidence limitations recorded']
  ]
};

const legacyPermissions = {
  CANDIDATE: ['View own file', 'Upload documents', 'Sign assigned documents', 'Complete tasks', 'Use support'],
  RECRUITER: ['View/edit candidate', 'Create tasks', 'Issue Candidate ID', 'Manage interviews'],
  COMPLIANCE: ['Verify credentials', 'Issue Signature and Retention IDs', 'Review disclosures', 'View audit'],
  ETHICS: ['Score ethics review', 'Review conflicts', 'Read approved registry records'],
  HR: ['Issue offer', 'Issue Candidate/Employee/Signature/Retention IDs', 'Collect tax and benefit forms'],
  EXECUTIVE: ['Approve title/pay/equity', 'Administer all identifier operations', 'View all'],
  IT_ADMIN: ['Provision access', 'Issue Employee and Retention IDs', 'Revoke access'],
  RECORDS_MANAGER: ['Manage Retention File IDs', 'Archive and export records', 'Apply legal hold'],
  AUDITOR: ['Read-only evidence, registry, workflow and audit access']
};

const app = document.querySelector('#app');
const title = document.querySelector('#page-title');
const nav = document.querySelector('#nav');
const roleSelect = document.querySelector('#role-select');
const actorLabel = document.querySelector('#actor-label');

const registry = new RegistryStore({ organization: 'GGH' });
let currentRole = localStorage.getItem('ggh.demo-role') || 'HR';
let currentActor = `${currentRole.toLowerCase()}@ross-tax-pro.example`;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function badge(value) {
  const text = String(value).toUpperCase();
  const css = /SIGNED|READY|COMPLETED|APPROVED|ACTIVE/.test(text)
    ? 'ok'
    : /BLOCKED|HIGH|GATED|REVOKED|SUSPENDED/.test(text)
      ? 'danger'
      : 'warn';
  return `<span class="badge ${css}">${escapeHtml(value)}</span>`;
}

function showToast(message, tone = 'ok') {
  const toast = document.createElement('div');
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3200);
}

function route(page) {
  location.hash = page;
  render(page);
}

function setActive(page) {
  document.querySelectorAll('nav button').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  title.textContent = navItems.find(item => item[0] === page)?.[1] || 'Candidate Operations';
}

function syncRoleUi() {
  roleSelect.value = currentRole;
  actorLabel.textContent = `Acting role: ${currentRole}`;
}

nav.innerHTML = navItems.map(([key, label]) => `<button data-page="${key}">${label}</button>`).join('');
nav.addEventListener('click', event => {
  if (event.target.dataset.page) route(event.target.dataset.page);
});

roleSelect.innerHTML = Object.keys(ROLES).map(role => `<option value="${role}">${role.replaceAll('_', ' ')}</option>`).join('');
roleSelect.addEventListener('change', () => {
  currentRole = roleSelect.value;
  currentActor = `${currentRole.toLowerCase()}@ross-tax-pro.example`;
  localStorage.setItem('ggh.demo-role', currentRole);
  syncRoleUi();
  render(location.hash.slice(1) || 'overview');
});
syncRoleUi();

async function bootstrapRegistry() {
  if (registry.list().length) return;
  const candidate = await registry.issue({
    type: 'CANDIDATE',
    subjectRef: seed.candidate.subjectRef,
    issuedBy: 'system.bootstrap',
    purpose: 'Candidate master record'
  });
  const retention = await registry.issue({
    type: 'RETENTION',
    subjectRef: seed.candidate.subjectRef,
    issuedBy: 'system.bootstrap',
    purpose: 'Candidate retention file',
    retentionClass: 'CANDIDATE_FILE_7Y'
  });
  registry.link({ id: candidate.id, relatedId: retention.id, actor: 'system.bootstrap', relationship: 'RETAINED_IN' });
}

function visibleRegistryRecords(filters = {}) {
  if (currentRole === 'CANDIDATE') return registry.list({ ...filters, subjectRef: seed.candidate.subjectRef });
  if (!can(currentRole, PERMISSIONS.READ)) return [];
  return registry.list(filters);
}

function metrics() {
  const records = visibleRegistryRecords();
  return `<div class="grid grid-4">
    <div class="card metric"><strong>${seed.candidate.readiness}%</strong><span>Decision readiness</span></div>
    <div class="card metric"><strong>${records.length}</strong><span>Registered identifiers</span></div>
    <div class="card metric"><strong>${records.filter(record => record.status === 'ACTIVE').length}</strong><span>Active identifiers</span></div>
    <div class="card metric"><strong>${seed.candidate.ethics}/100</strong><span>Ethics file completeness</span></div>
  </div>`;
}

function taskTable() {
  return `<div class="table-wrap"><table><thead><tr><th>Task</th><th>Owner</th><th>Status</th></tr></thead><tbody>${seed.tasks.map(task => `<tr><td>${escapeHtml(task[0])}</td><td>${escapeHtml(task[1])}</td><td>${badge(task[2])}</td></tr>`).join('')}</tbody></table></div>`;
}

function timeline() {
  return `<div class="timeline">${seed.events.map(event => `<div class="timeline-item"><b>${escapeHtml(event[1])}</b><br><small>${escapeHtml(event[0])} · ${escapeHtml(event[2])}</small></div>`).join('')}</div>`;
}

function overview() {
  const ids = visibleRegistryRecords({ subjectRef: seed.candidate.subjectRef });
  const candidateId = ids.find(record => record.type === 'CANDIDATE');
  return `${metrics()}
    <div class="section-title"><h2>Candidate snapshot</h2>${badge(seed.candidate.status.toUpperCase())}</div>
    <div class="grid grid-2">
      <div class="card"><h3>${escapeHtml(seed.candidate.name)}</h3>
        <p><b>Email:</b> ${escapeHtml(seed.candidate.email)}</p>
        <p><b>Candidate ID:</b> <span class="mono">${escapeHtml(candidateId?.id || 'Access restricted')}</span></p>
        <p><b>Proposed role:</b> ${escapeHtml(seed.candidate.proposedTitle)}</p>
        <p><b>Pay band:</b> ${escapeHtml(seed.candidate.compensation)}</p>
        <div class="callout">No clinical authority, equity, banking access or protected-data access activates until credential, ethics, executive and security gates are complete.</div>
      </div>
      <div class="card"><h3>Onboarding completion</h3>
        <div class="progress"><span style="width:${seed.candidate.readiness}%"></span></div>
        <p>${seed.candidate.readiness}% of required verification and approval controls completed.</p>
        <button class="button" data-route="registry">Open ID registry</button>
      </div>
    </div>
    <div class="section-title"><h2>Current tasks</h2></div>${taskTable()}
    <div class="section-title"><h2>Latest audit events</h2></div>${timeline()}`;
}

function candidate() {
  const records = visibleRegistryRecords({ subjectRef: seed.candidate.subjectRef });
  return `<div class="grid grid-2">
      <div class="card"><h2>Identity profile</h2>
        <p><b>Legal/professional name:</b> ${escapeHtml(seed.candidate.name)}</p>
        <p><b>Primary email:</b> ${escapeHtml(seed.candidate.email)}</p>
        <p><b>Reported associations:</b> Lumberton, New Jersey; Crowley, Louisiana; Rider University</p>
        <p><b>Evidence state:</b> Candidate-provided and partially corroborated; authoritative license identity pending.</p>
      </div>
      <div class="card"><h2>Identifier portfolio</h2>
        ${records.length ? records.map(record => `<p><b>${escapeHtml(ID_TYPES[record.type].label)}:</b><br><span class="mono">${escapeHtml(record.id)}</span> ${badge(record.status)}</p>`).join('') : '<p>No identifier records visible for the current role.</p>'}
      </div>
    </div>
    <div class="section-title"><h2>Assessment domains</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Domain</th><th>Score</th><th>Interpretation</th></tr></thead><tbody>
      <tr><td>Identity resolution</td><td>70</td><td>Moderate confidence; official identifiers required</td></tr>
      <tr><td>Credential verification</td><td>25</td><td>License number and category unresolved</td></tr>
      <tr><td>Professional alignment</td><td>55</td><td>Potentially aligned; résumé and references needed</td></tr>
      <tr><td>Ethics review</td><td>39</td><td>File incomplete; not a character score</td></tr>
      <tr><td>Cybersecurity readiness</td><td>30</td><td>Training, managed device and MFA not completed</td></tr>
    </tbody></table></div>`;
}

function idTypeOptions() {
  return Object.entries(ID_TYPES).map(([key, definition]) => {
    const disabled = can(currentRole, definition.permission) ? '' : 'disabled';
    return `<option value="${key}" ${disabled}>${escapeHtml(definition.label)}${disabled ? ' — restricted' : ''}</option>`;
  }).join('');
}

function registryTable(records) {
  if (!records.length) return '<div class="empty-state">No identifiers match the selected filters.</div>';
  return `<div class="table-wrap"><table><thead><tr>
    <th>ID</th><th>Type</th><th>Subject</th><th>Status</th><th>Issued</th><th>Purpose</th><th>Actions</th>
  </tr></thead><tbody>${records.map(record => `<tr>
    <td><span class="mono">${escapeHtml(record.id)}</span></td>
    <td>${escapeHtml(ID_TYPES[record.type].label)}</td>
    <td>${escapeHtml(record.subjectRef)}</td>
    <td>${badge(record.status)}</td>
    <td>${escapeHtml(new Date(record.issuedAt).toLocaleString())}<br><small>${escapeHtml(record.issuedBy)}</small></td>
    <td>${escapeHtml(record.purpose)}<br><small>${escapeHtml(record.retentionClass)}</small></td>
    <td class="actions">
      <button class="button compact secondary" data-copy-id="${escapeHtml(record.id)}">Copy</button>
      ${can(currentRole, PERMISSIONS.CHANGE_STATUS) && record.status === 'ACTIVE' ? `<button class="button compact danger-button" data-revoke-id="${escapeHtml(record.id)}">Revoke</button>` : ''}
    </td>
  </tr>`).join('')}</tbody></table></div>`;
}

function registryPage() {
  const canRead = can(currentRole, PERMISSIONS.READ) || can(currentRole, PERMISSIONS.READ_OWN);
  if (!canRead) return '<div class="callout danger-callout">Your role is not authorized to access the identifier registry.</div>';
  const records = visibleRegistryRecords();
  const mayIssue = Object.values(ID_TYPES).some(type => can(currentRole, type.permission));
  return `<div class="callout"><b>Issuance control:</b> IDs are non-secret references. The checksum catches transcription errors; production authenticity must be enforced by authenticated server APIs and immutable audit storage.</div>
    <div class="grid grid-4 compact-grid" style="margin-top:18px">
      ${Object.entries(ID_TYPES).map(([key, definition]) => `<div class="card metric"><strong>${records.filter(record => record.type === key).length}</strong><span>${escapeHtml(definition.label)}s</span></div>`).join('')}
    </div>
    ${mayIssue ? `<div class="section-title"><h2>Issue an identifier</h2><span class="role-pill">${escapeHtml(currentRole)}</span></div>
    <form id="issue-id-form" class="card form-grid">
      <label>Identifier type<select name="type" required>${idTypeOptions()}</select></label>
      <label>Subject reference<input name="subjectRef" value="${escapeHtml(seed.candidate.subjectRef)}" required /></label>
      <label>Purpose<input name="purpose" placeholder="Business purpose" required /></label>
      <label>Retention class<input name="retentionClass" placeholder="Use type default" /></label>
      <label class="span-2">Metadata note<input name="metadataNote" placeholder="Optional non-sensitive operational note" /></label>
      <div class="span-2"><button class="button" type="submit">Issue and register ID</button></div>
    </form>` : '<div class="callout" style="margin-top:18px">The selected role has read-only access.</div>'}
    <div class="section-title"><h2>Central registry</h2><div class="toolbar">
      <input id="registry-search" type="search" placeholder="Search ID, subject, purpose or status" />
      ${can(currentRole, PERMISSIONS.EXPORT) ? '<button class="button secondary" data-export="json">Export JSON</button><button class="button secondary" data-export="csv">Export CSV</button>' : ''}
    </div></div>
    <div id="registry-results">${registryTable(records)}</div>
    <div class="section-title"><h2>Validate an identifier</h2></div>
    <form id="validate-id-form" class="card inline-form"><input name="id" placeholder="GGH-CAN-2026-..." required /><button class="button secondary" type="submit">Validate format and checksum</button></form>
    <div id="validation-result"></div>`;
}

function workflows() {
  return `<div class="callout"><b>Trigger rule:</b> Corporate email issuance begins only after signed offer, required disclosures, verification approvals, tax/benefits intake and security acknowledgment.</div>
    <div class="section-title"><h2>Workflow pipeline</h2></div>${taskTable()}
    <div class="grid grid-2" style="margin-top:18px">
      <div class="card"><h3>Identifier trigger sequence</h3><ol>
        <li>Candidate ID is issued at verified intake.</li>
        <li>Signature ID is issued for each authenticated executed document.</li>
        <li>Retention File ID groups the master candidate file.</li>
        <li>Employee ID is issued only after the approved conversion gate.</li>
        <li>Predecessor and related identifiers remain linked in the registry.</li>
      </ol></div>
      <div class="card"><h3>Retention controls</h3><p>Each registry operation records actor, UTC timestamp, object identifier, purpose, lifecycle status and reason. Legal hold overrides routine deletion.</p></div>
    </div>`;
}

function documents() {
  return `<div class="section-title"><h2>Document registry</h2><button class="button">Upload document</button></div>
    <div class="table-wrap"><table><thead><tr><th>Document</th><th>Category</th><th>Status</th><th>Action</th></tr></thead><tbody>${seed.documents.map(document => `<tr><td>${escapeHtml(document[0])}</td><td>${escapeHtml(document[1])}</td><td>${badge(document[2])}</td><td><button class="button secondary">Open</button></td></tr>`).join('')}</tbody></table></div>
    <div class="section-title"><h2>Signature ID control</h2></div>
    <div class="card"><p>An authenticated signature event receives a Signature ID linked to the Candidate or Employee ID, document hash, signer intent, legal name, session, UTC timestamp and retention file. Decorative signature images are never the controlling evidence.</p><button class="button" data-route="registry">Open issuance engine</button></div>`;
}

function governance() {
  return `<div class="grid grid-2">
      <div class="card"><h2>Mission</h2><p>Deliver dignified, accountable, inclusive and technology-enabled counseling-program administration, education and community support while preserving professional scope, privacy and due process.</p></div>
      <div class="card"><h2>Corporate paradigm</h2><p>Ross Tax Pro Software Co. supplies technology, governance, auditability and operational support. Clinical authority remains with properly credentialed professionals acting within jurisdiction and scope.</p></div>
    </div>
    <div class="section-title"><h2>Identifier governance</h2></div>
    <div class="grid grid-2"><div class="card"><h3>Control objectives</h3><ul><li>Unique issuance</li><li>Purpose limitation</li><li>Least privilege</li><li>Lifecycle traceability</li><li>Correction without silent deletion</li><li>Retention and legal hold</li></ul></div><div class="card"><h3>Production controls</h3><ul><li>Server-side authorization</li><li>Database uniqueness constraint</li><li>Idempotency keys</li><li>Append-only audit ledger</li><li>Encryption and backups</li><li>Document-hash linkage</li></ul></div></div>`;
}

function rbac() {
  return `<div class="section-title"><h2>Roles and permissions</h2><span class="role-pill">Current: ${escapeHtml(currentRole)}</span></div>
    <div class="grid grid-2">${Object.keys(ROLES).map(role => `<div class="card ${role === currentRole ? 'selected-card' : ''}"><h3>${escapeHtml(role.replaceAll('_', ' '))}</h3><p>${escapeHtml(legacyPermissions[role]?.join(' · ') || permissionsFor(role).join(' · '))}</p><details><summary>Machine permissions</summary><p class="mono permission-list">${escapeHtml(permissionsFor(role).join('\n'))}</p></details></div>`).join('')}</div>
    <p class="footer-note">The interface applies RBAC for demonstration. Production APIs must independently verify identity, tenant, role, subject scope and permission for every operation.</p>`;
}

function support() {
  const personas = [
    ['Candidate Concierge', 'Portal navigation, forms, deadlines and accessibility routing'],
    ['HR Onboarding Agent', 'Offer, tax-form, employee-ID and benefits workflow support'],
    ['Compliance Desk', 'Credential, signature-ID, disclosure and policy guidance'],
    ['Records Agent', 'Retention File IDs, legal hold, archive and export support'],
    ['Security Help Agent', 'MFA, device, account and incident support'],
    ['Executive Operations Agent', 'Approval queues, compensation and governance routing']
  ];
  return `<div class="grid grid-2">${personas.map(persona => `<div class="card"><h3>${escapeHtml(persona[0])}</h3><p>${escapeHtml(persona[1])}</p><button class="button">Start assisted session</button></div>`).join('')}</div><p class="footer-note">Agents provide policy-grounded administrative support and route legal, clinical, payroll, benefits and security decisions to authorized humans.</p>`;
}

function audit() {
  const events = registry.events(200);
  const legacy = seed.events.map(event => ({ occurredAt: event[0], action: event[1], actor: 'legacy.portal', details: { detail: event[2] }, recordId: '' }));
  const all = [...events, ...legacy];
  return `<div class="section-title"><h2>Append-only event stream</h2>${can(currentRole, PERMISSIONS.EXPORT) ? '<button class="button secondary" data-export="json">Export registry JSON</button>' : ''}</div>
    <div class="table-wrap"><table><thead><tr><th>UTC time</th><th>Action</th><th>Actor</th><th>Record</th><th>Detail</th></tr></thead><tbody>${all.map(event => `<tr><td>${escapeHtml(event.occurredAt)}</td><td>${escapeHtml(event.action)}</td><td>${escapeHtml(event.actor)}</td><td class="mono">${escapeHtml(event.recordId || '')}</td><td>${escapeHtml(JSON.stringify(event.details || {}))}</td></tr>`).join('')}</tbody></table></div>
    <div class="callout" style="margin-top:18px">Production mode extends each event with authenticated user ID, tenant, request ID, source IP where lawful, device/session ID, prior hash, event hash, retention class and legal-hold state.</div>`;
}

const pages = { overview, candidate, registry: registryPage, workflows, documents, governance, rbac, support, audit };

function render(page = 'overview') {
  const resolved = pages[page] ? page : 'overview';
  setActive(resolved);
  app.innerHTML = pages[resolved]();
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

app.addEventListener('click', event => {
  const routeButton = event.target.closest('[data-route]');
  if (routeButton) return route(routeButton.dataset.route);

  const copyButton = event.target.closest('[data-copy-id]');
  if (copyButton) {
    navigator.clipboard.writeText(copyButton.dataset.copyId);
    showToast('Identifier copied.');
    return;
  }

  const revokeButton = event.target.closest('[data-revoke-id]');
  if (revokeButton) {
    if (!can(currentRole, PERMISSIONS.CHANGE_STATUS)) return showToast('Permission denied.', 'danger');
    const reason = window.prompt('Enter the documented reason for revocation:');
    if (!reason) return;
    try {
      registry.changeStatus({ id: revokeButton.dataset.revokeId, status: 'REVOKED', actor: currentActor, reason });
      showToast('Identifier revoked and audit event recorded.');
      render('registry');
    } catch (error) {
      showToast(error.message, 'danger');
    }
    return;
  }

  const exportButton = event.target.closest('[data-export]');
  if (exportButton) {
    if (!can(currentRole, PERMISSIONS.EXPORT)) return showToast('Export permission denied.', 'danger');
    if (exportButton.dataset.export === 'csv') download('ggh-id-registry.csv', registry.exportCsv(visibleRegistryRecords()), 'text/csv');
    else download('ggh-id-registry.json', registry.exportJson(), 'application/json');
  }
});

app.addEventListener('input', event => {
  if (event.target.id !== 'registry-search') return;
  const results = document.querySelector('#registry-results');
  results.innerHTML = registryTable(visibleRegistryRecords({ query: event.target.value }));
});

app.addEventListener('submit', async event => {
  if (event.target.id === 'issue-id-form') {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const definition = ID_TYPES[data.type];
    if (!definition || !can(currentRole, definition.permission)) return showToast('Your role is not authorized to issue this ID type.', 'danger');
    try {
      const record = await registry.issue({
        type: data.type,
        subjectRef: data.subjectRef,
        issuedBy: currentActor,
        purpose: data.purpose,
        retentionClass: data.retentionClass || undefined,
        metadata: data.metadataNote ? { note: data.metadataNote } : {}
      });
      showToast(`${definition.label} issued: ${record.id}`);
      render('registry');
    } catch (error) {
      showToast(error.message, 'danger');
    }
    return;
  }

  if (event.target.id === 'validate-id-form') {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const result = await validateId(data.id);
    const target = document.querySelector('#validation-result');
    target.innerHTML = result.valid
      ? `<div class="callout success-callout"><b>Valid identifier.</b> Type: ${escapeHtml(result.type)} · Organization: ${escapeHtml(result.organization)} · Year: ${escapeHtml(result.year)}</div>`
      : `<div class="callout danger-callout"><b>Invalid identifier.</b> Reason: ${escapeHtml(result.reason)}</div>`;
  }
});

window.addEventListener('hashchange', () => render(location.hash.slice(1)));
await bootstrapRegistry();
render(location.hash.slice(1) || 'overview');
