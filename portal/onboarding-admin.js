import { RegistryStore } from './lib/id-engine.js';
import { PERMISSIONS, ROLES, can } from './lib/rbac.js';

const STORAGE_KEY = 'ggh.onboarding-admin.v1';
const registry = new RegistryStore({ organization: 'GGH' });
const form = document.querySelector('#provisioning-form');
const roleSelect = document.querySelector('#onboarding-role');
const actorLabel = document.querySelector('#onboarding-actor');
const rolePill = document.querySelector('#role-pill');
const gateGrid = document.querySelector('#gate-grid');
const gateStatus = document.querySelector('#gate-status');
const metrics = document.querySelector('#onboarding-metrics');
const alertRegion = document.querySelector('#onboarding-alert');
const commandElement = document.querySelector('#powershell-command code');
const packageStatus = document.querySelector('#package-status');
const workflowSteps = document.querySelector('#workflow-steps');
const logElement = document.querySelector('#onboarding-log');

const gateDefinitions = [
  ['signedOffer', 'Signed offer', 'Candidate and corporate signatures completed'],
  ['credentialVerification', 'Credential verification', 'Required professional credentials verified'],
  ['ethicsClearance', 'Ethics clearance', 'Ethics committee review completed'],
  ['conflictDisclosure', 'Conflict disclosure', 'Outside interests and conflicts disclosed'],
  ['taxFormRelease', 'Tax-form release', 'I-9/W-4 workflow authorized for collection'],
  ['benefitsElection', 'Benefits election', 'Benefits package completed or formally waived'],
  ['securityAcknowledgment', 'Security acknowledgment', 'Acceptable use, MFA and device policies accepted']
];

const initialState = {
  role: localStorage.getItem('ggh.demo-role') || 'HR',
  gates: Object.fromEntries(gateDefinitions.map(([key]) => [key, false])),
  activePackage: null,
  logs: []
};

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && parsed.gates && Array.isArray(parsed.logs) ? { ...initialState, ...parsed } : structuredClone(initialState);
  } catch {
    return structuredClone(initialState);
  }
}

let state = loadState();
let currentRole = state.role;
let currentActor = `${currentRole.toLowerCase()}@ross-tax-pro.example`;

function saveState() {
  state.role = currentRole;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem('ggh.demo-role', currentRole);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function alert(message, tone = 'warn') {
  alertRegion.innerHTML = `<div class="alert-${tone}">${escapeHtml(message)}</div>`;
  window.setTimeout(() => { alertRegion.innerHTML = ''; }, 5000);
}

function audit(action, details = {}) {
  const event = {
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actor: currentActor,
    role: currentRole,
    action,
    details
  };
  state.logs.unshift(event);
  state.logs = state.logs.slice(0, 250);
  saveState();
  renderLog();
  return event;
}

function allGatesComplete() {
  return gateDefinitions.every(([key]) => state.gates[key] === true);
}

function slug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'employee';
}

function splitLines(value) {
  return String(value ?? '').split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
}

function download(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function serializeForm() {
  const data = new FormData(form);
  const tenantDomain = String(data.get('tenantDomain') || '').trim().toLowerCase();
  const alias = String(data.get('alias') || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const corporateEmail = alias && tenantDomain ? `${alias}@${tenantDomain}` : '';
  return {
    schemaVersion: 1,
    packageId: state.activePackage?.packageId || `ONB-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
    status: state.activePackage?.status || 'DRAFT',
    generatedAt: new Date().toISOString(),
    generatedBy: currentActor,
    candidate: {
      subjectRef: String(data.get('subjectRef') || '').trim(),
      personalEmail: String(data.get('personalEmail') || '').trim(),
      employeeId: String(data.get('employeeId') || '').trim()
    },
    identity: {
      displayName: String(data.get('displayName') || '').trim(),
      givenName: String(data.get('givenName') || '').trim(),
      surname: String(data.get('surname') || '').trim(),
      alias,
      tenantId: String(data.get('tenantId') || '').trim(),
      tenantDomain,
      userPrincipalName: corporateEmail,
      usageLocation: String(data.get('usageLocation') || '').trim().toUpperCase(),
      stagedAccount: data.get('stagedAccount') === 'on'
    },
    employment: {
      jobTitle: String(data.get('jobTitle') || '').trim(),
      department: String(data.get('department') || '').trim(),
      managerUpn: String(data.get('managerUpn') || '').trim(),
      startDate: String(data.get('startDate') || '').trim()
    },
    microsoft365: {
      skuPartNumber: String(data.get('skuPartNumber') || '').trim(),
      groupIds: splitLines(data.get('groupIds')),
      mailAliases: splitLines(data.get('mailAliases')),
      configureExchange: data.get('configureExchange') === 'on'
    },
    platformAccess: {
      portalRole: String(data.get('portalRole') || '').trim(),
      accessTier: String(data.get('accessTier') || '').trim(),
      entitlements: splitLines(data.get('entitlements')),
      mfaRequired: data.get('mfaRequired') === 'on',
      managedDeviceRequired: data.get('managedDeviceRequired') === 'on'
    },
    gates: { ...state.gates },
    allGatesComplete: allGatesComplete(),
    approvals: state.activePackage?.approvals || [],
    controls: {
      noSecretsEmbedded: true,
      executeWithAuthorizedMicrosoft365Admin: true,
      browserPackageIsNotProductionAuthorization: true
    }
  };
}

function validatePackage(pkg) {
  const errors = [];
  if (!pkg.identity.displayName) errors.push('Display name is required.');
  if (!pkg.identity.givenName || !pkg.identity.surname) errors.push('Given name and surname are required.');
  if (!pkg.candidate.personalEmail.includes('@')) errors.push('A valid contact email is required.');
  if (!pkg.candidate.employeeId) errors.push('Issue or select an Employee ID.');
  if (!pkg.identity.tenantDomain.includes('.')) errors.push('Enter a verified Microsoft 365 tenant domain.');
  if (!pkg.identity.alias) errors.push('A mail alias is required.');
  if (!/^[A-Z]{2}$/.test(pkg.identity.usageLocation)) errors.push('Usage location must be a two-letter code.');
  if (!pkg.employment.startDate) errors.push('A start date is required.');
  return errors;
}

function packageFilename(pkg = serializeForm()) {
  return `ggh-onboarding-${slug(pkg.identity.displayName)}-${pkg.packageId.toLowerCase()}.json`;
}

function buildPowerShellCommands(pkg = serializeForm()) {
  const file = packageFilename(pkg);
  const tenant = pkg.identity.tenantId || '<TENANT-GUID>';
  const provision = `pwsh ./scripts/m365/Provision-GGHEmployee.ps1 -InputFile "./${file}" -TenantId "${tenant}" -Confirm:$false`;
  const enable = `pwsh ./scripts/m365/Enable-GGHEmployeeAccess.ps1 -InputFile "./${file}" -TenantId "${tenant}" -Confirm:$false`;
  return `# 1. Review and export the onboarding package from this interface.\n# 2. Run from an authorized PowerShell 7 administrative session.\n${provision}\n\n# Day-1 activation after every required gate is complete:\n${enable}`;
}

async function bootstrapIdentifiers() {
  let candidate = registry.list({ type: 'CANDIDATE', subjectRef: 'candidate:jmartin' })[0];
  if (!candidate) {
    candidate = await registry.issue({
      type: 'CANDIDATE',
      subjectRef: 'candidate:jmartin',
      issuedBy: 'system.onboarding.bootstrap',
      purpose: 'Candidate master record'
    });
  }
  let retention = registry.list({ type: 'RETENTION', subjectRef: 'candidate:jmartin' })[0];
  if (!retention) {
    retention = await registry.issue({
      type: 'RETENTION',
      subjectRef: 'candidate:jmartin',
      issuedBy: 'system.onboarding.bootstrap',
      purpose: 'Candidate and onboarding retention file',
      retentionClass: 'CANDIDATE_FILE_7Y'
    });
  }
  registry.link({ id: candidate.id, relatedId: retention.id, actor: 'system.onboarding.bootstrap', relationship: 'RETAINED_IN' });
}

async function issueEmployeeId() {
  if (!can(currentRole, PERMISSIONS.ISSUE_EMPLOYEE)) {
    alert(`Role ${currentRole} cannot issue Employee IDs.`, 'danger');
    return;
  }
  const subjectRef = String(form.elements.subjectRef.value).trim();
  const existing = registry.list({ type: 'EMPLOYEE', subjectRef }).find(record => record.status === 'ACTIVE');
  if (existing) {
    form.elements.employeeId.value = existing.id;
    alert(`Existing active Employee ID loaded: ${existing.id}`, 'ok');
    refresh();
    return;
  }
  const employee = await registry.issue({
    type: 'EMPLOYEE',
    subjectRef,
    issuedBy: currentActor,
    purpose: 'Employment identity and Microsoft 365 onboarding',
    retentionClass: 'EMPLOYEE_FILE_7Y',
    metadata: { source: 'EMPLOYER_ONBOARDING_ADMIN' }
  });
  for (const record of registry.list({ subjectRef })) {
    if (record.id !== employee.id && ['CANDIDATE', 'RETENTION'].includes(record.type)) {
      registry.link({ id: employee.id, relatedId: record.id, actor: currentActor, relationship: record.type === 'CANDIDATE' ? 'CONVERTED_FROM' : 'RETAINED_IN' });
    }
  }
  form.elements.employeeId.value = employee.id;
  audit('EMPLOYEE_ID_ISSUED', { employeeId: employee.id, subjectRef });
  alert(`Employee ID issued and registered: ${employee.id}`, 'ok');
  refresh();
}

function stagePackage(event) {
  event.preventDefault();
  if (!can(currentRole, PERMISSIONS.ONBOARDING_STAGE)) {
    alert(`Role ${currentRole} cannot stage onboarding packages.`, 'danger');
    return;
  }
  const pkg = serializeForm();
  const errors = validatePackage(pkg);
  if (errors.length) {
    alert(errors.join(' '), 'danger');
    return;
  }
  pkg.status = 'STAGED';
  pkg.stagedAt = new Date().toISOString();
  state.activePackage = pkg;
  audit('ONBOARDING_PACKAGE_STAGED', { packageId: pkg.packageId, employeeId: pkg.candidate.employeeId, upn: pkg.identity.userPrincipalName });
  alert('Provisioning package staged. Approval gates and IT authorization still apply.', 'ok');
  refresh();
}

function approvePackage() {
  if (!can(currentRole, PERMISSIONS.ONBOARDING_APPROVE)) {
    alert(`Role ${currentRole} cannot approve onboarding packages.`, 'danger');
    return;
  }
  const pkg = state.activePackage ? { ...state.activePackage, gates: { ...state.gates }, allGatesComplete: allGatesComplete() } : serializeForm();
  const errors = validatePackage(pkg);
  if (errors.length) {
    alert(errors.join(' '), 'danger');
    return;
  }
  if (!allGatesComplete()) {
    alert('Every required approval and compliance gate must be complete before IT execution approval.', 'danger');
    return;
  }
  pkg.status = 'APPROVED_FOR_IT_EXECUTION';
  pkg.approvedAt = new Date().toISOString();
  pkg.approvals = [...(pkg.approvals || []), { actor: currentActor, role: currentRole, approvedAt: pkg.approvedAt, action: 'APPROVED_FOR_IT_EXECUTION' }];
  state.activePackage = pkg;
  audit('ONBOARDING_PACKAGE_APPROVED', { packageId: pkg.packageId, employeeId: pkg.candidate.employeeId });
  alert('Package approved for authorized Microsoft 365 administrator execution.', 'ok');
  refresh();
}

function markDisabled() {
  if (!can(currentRole, PERMISSIONS.DISABLE_ACCOUNT)) {
    alert(`Role ${currentRole} cannot disable access.`, 'danger');
    return;
  }
  if (!state.activePackage) {
    alert('Stage a package before changing its access state.', 'danger');
    return;
  }
  state.activePackage.status = 'ACCESS_DISABLED';
  state.activePackage.disabledAt = new Date().toISOString();
  state.activePackage.disabledBy = currentActor;
  audit('ACCESS_DISABLED_RECORDED', { packageId: state.activePackage.packageId, upn: state.activePackage.identity.userPrincipalName });
  alert('The package has been marked access-disabled in the workflow record.', 'ok');
  refresh();
}

function exportPackage() {
  if (!can(currentRole, PERMISSIONS.ONBOARDING_EXPORT)) {
    alert(`Role ${currentRole} cannot export onboarding packages.`, 'danger');
    return;
  }
  const pkg = state.activePackage ? { ...state.activePackage, gates: { ...state.gates }, allGatesComplete: allGatesComplete() } : serializeForm();
  const errors = validatePackage(pkg);
  if (errors.length) {
    alert(errors.join(' '), 'danger');
    return;
  }
  download(packageFilename(pkg), JSON.stringify(pkg, null, 2));
  audit('ONBOARDING_PACKAGE_EXPORTED', { packageId: pkg.packageId, format: 'JSON' });
  alert('Provisioning package JSON exported.', 'ok');
}

async function copyCommand() {
  const pkg = state.activePackage || serializeForm();
  const command = buildPowerShellCommands(pkg);
  await navigator.clipboard.writeText(command);
  audit('POWERSHELL_COMMAND_COPIED', { packageId: pkg.packageId });
  alert('PowerShell command copied. Export the matching JSON package before execution.', 'ok');
}

function renderGates() {
  const mayApprove = can(currentRole, PERMISSIONS.ONBOARDING_APPROVE);
  gateGrid.innerHTML = gateDefinitions.map(([key, label, description]) => `<label class="gate-item">
    <input type="checkbox" data-gate="${key}" ${state.gates[key] ? 'checked' : ''} ${mayApprove ? '' : 'disabled'} />
    <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></span>
  </label>`).join('');
  gateStatus.innerHTML = allGatesComplete() ? '<span class="badge ok">ALL GATES COMPLETE</span>' : `<span class="badge warn">${Object.values(state.gates).filter(Boolean).length}/${gateDefinitions.length} COMPLETE</span>`;
}

function renderMetrics() {
  const pkg = state.activePackage || serializeForm();
  metrics.innerHTML = `
    <div class="card metric"><strong>${Object.values(state.gates).filter(Boolean).length}/${gateDefinitions.length}</strong><span>Approval gates</span></div>
    <div class="card metric"><strong>${escapeHtml(pkg.status)}</strong><span>Package status</span></div>
    <div class="card metric"><strong class="mono">${escapeHtml(pkg.candidate.employeeId || 'Not issued')}</strong><span>Employee ID</span></div>
    <div class="card metric"><strong>${escapeHtml(pkg.identity.userPrincipalName || 'Pending')}</strong><span>Corporate email</span></div>`;
  packageStatus.innerHTML = `<span class="badge ${pkg.status.includes('APPROVED') ? 'ok' : pkg.status.includes('DISABLED') ? 'danger' : 'warn'}">${escapeHtml(pkg.status)}</span>`;
}

function renderWorkflow() {
  const pkg = state.activePackage || serializeForm();
  const steps = [
    ['Employee ID issued', Boolean(pkg.candidate.employeeId)],
    ['Offer and compliance gates complete', allGatesComplete()],
    ['Onboarding package staged', ['STAGED', 'APPROVED_FOR_IT_EXECUTION', 'ACCESS_DISABLED'].includes(pkg.status)],
    ['Executive/HR approval for IT execution', pkg.status === 'APPROVED_FOR_IT_EXECUTION'],
    ['Entra ID account created disabled', false],
    ['Microsoft 365 license and Outlook mailbox provisioned', false],
    ['Platform groups and application entitlements assigned', false],
    ['Day-1 account enabled after MFA/device controls', false]
  ];
  workflowSteps.innerHTML = steps.map(([label, complete], index) => `<li><b>${index + 1}. ${escapeHtml(label)}</b><br />${complete ? '<span class="badge ok">COMPLETE</span>' : '<span class="badge warn">PENDING EXTERNAL EXECUTION</span>'}</li>`).join('');
}

function renderLog() {
  logElement.innerHTML = state.logs.length ? state.logs.map(event => `<div class="log-entry"><b>${escapeHtml(event.action)}</b><small>${escapeHtml(event.occurredAt)} · ${escapeHtml(event.actor)} · ${escapeHtml(event.role)}</small></div>`).join('') : '<p>No onboarding events recorded.</p>';
}

function setField(name, value) {
  if (form.elements[name]) form.elements[name].value = value ?? '';
}

function seedForm() {
  const pkg = state.activePackage;
  setField('displayName', pkg?.identity.displayName || 'Jennifer Martin');
  setField('givenName', pkg?.identity.givenName || 'Jennifer');
  setField('surname', pkg?.identity.surname || 'Martin');
  setField('personalEmail', pkg?.candidate.personalEmail || 'Jmartin@thesolastagroup.org');
  setField('subjectRef', pkg?.candidate.subjectRef || 'candidate:jmartin');
  const employee = registry.list({ type: 'EMPLOYEE', subjectRef: 'candidate:jmartin' }).find(record => record.status === 'ACTIVE');
  setField('employeeId', pkg?.candidate.employeeId || employee?.id || '');
  setField('jobTitle', pkg?.employment.jobTitle || 'Chief Clinical & Program Development Officer');
  setField('department', pkg?.employment.department || 'Clinical Programs');
  setField('managerUpn', pkg?.employment.managerUpn || '');
  setField('startDate', pkg?.employment.startDate || '2026-09-01');
  setField('tenantId', pkg?.identity.tenantId || '');
  setField('tenantDomain', pkg?.identity.tenantDomain || 'rosstaxsoftware.com');
  setField('alias', pkg?.identity.alias || 'jennifer.martin');
  setField('usageLocation', pkg?.identity.usageLocation || 'US');
  setField('skuPartNumber', pkg?.microsoft365.skuPartNumber || 'SPE_E3');
  setField('groupIds', (pkg?.microsoft365.groupIds || []).join('\n'));
  setField('mailAliases', (pkg?.microsoft365.mailAliases || []).join('\n'));
  setField('portalRole', pkg?.platformAccess.portalRole || 'CLINICAL_PROGRAM_EXECUTIVE');
  setField('accessTier', pkg?.platformAccess.accessTier || 'STAGED');
  setField('entitlements', (pkg?.platformAccess.entitlements || ['Candidate Portal', 'Document Signer', 'Policy Library', 'Training Academy']).join('\n'));
  form.elements.stagedAccount.checked = pkg?.identity.stagedAccount ?? true;
  form.elements.configureExchange.checked = pkg?.microsoft365.configureExchange ?? true;
  form.elements.mfaRequired.checked = pkg?.platformAccess.mfaRequired ?? true;
  form.elements.managedDeviceRequired.checked = pkg?.platformAccess.managedDeviceRequired ?? true;
}

function syncCorporateEmail() {
  const alias = String(form.elements.alias.value).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const domain = String(form.elements.tenantDomain.value).trim().toLowerCase();
  form.elements.corporateEmail.value = alias && domain ? `${alias}@${domain}` : '';
  commandElement.textContent = buildPowerShellCommands(state.activePackage || serializeForm());
  renderMetrics();
}

function applyPermissions() {
  const mayStage = can(currentRole, PERMISSIONS.ONBOARDING_STAGE);
  const mayIssue = can(currentRole, PERMISSIONS.ISSUE_EMPLOYEE);
  const mayApprove = can(currentRole, PERMISSIONS.ONBOARDING_APPROVE);
  const mayExport = can(currentRole, PERMISSIONS.ONBOARDING_EXPORT);
  const mayDisable = can(currentRole, PERMISSIONS.DISABLE_ACCOUNT);
  document.querySelector('#stage-package').disabled = !mayStage;
  document.querySelector('#issue-employee-id').disabled = !mayIssue;
  document.querySelector('#approve-package').disabled = !mayApprove;
  document.querySelector('#export-package').disabled = !mayExport;
  document.querySelector('#copy-command').disabled = !mayExport;
  document.querySelector('#mark-disabled').disabled = !mayDisable;
  rolePill.textContent = currentRole.replaceAll('_', ' ');
  actorLabel.textContent = `Actor: ${currentActor}`;
}

function refresh() {
  saveState();
  renderGates();
  renderMetrics();
  renderWorkflow();
  renderLog();
  applyPermissions();
  syncCorporateEmail();
}

roleSelect.innerHTML = Object.keys(ROLES).map(role => `<option value="${role}">${role.replaceAll('_', ' ')}</option>`).join('');
roleSelect.value = currentRole;
roleSelect.addEventListener('change', () => {
  currentRole = roleSelect.value;
  currentActor = `${currentRole.toLowerCase()}@ross-tax-pro.example`;
  refresh();
  audit('RBAC_ROLE_CHANGED', { selectedRole: currentRole });
});

gateGrid.addEventListener('change', event => {
  const key = event.target.dataset.gate;
  if (!key || !can(currentRole, PERMISSIONS.ONBOARDING_APPROVE)) return;
  state.gates[key] = event.target.checked;
  audit('ONBOARDING_GATE_CHANGED', { gate: key, completed: event.target.checked });
  refresh();
});

form.addEventListener('submit', stagePackage);
form.addEventListener('input', event => {
  if (['tenantDomain', 'alias'].includes(event.target.name)) syncCorporateEmail();
  commandElement.textContent = buildPowerShellCommands(state.activePackage || serializeForm());
});
document.querySelector('#issue-employee-id').addEventListener('click', issueEmployeeId);
document.querySelector('#approve-package').addEventListener('click', approvePackage);
document.querySelector('#mark-disabled').addEventListener('click', markDisabled);
document.querySelector('#export-package').addEventListener('click', exportPackage);
document.querySelector('#copy-command').addEventListener('click', copyCommand);

await bootstrapIdentifiers();
seedForm();
refresh();
