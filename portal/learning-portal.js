import {
  LearningPlatformEngine,
  LEARNING_ROLES,
  ENROLLMENT_STATES,
  canLearning,
  LEARNING_PERMISSIONS
} from './lib/learning-engine.js';

const engine = new LearningPlatformEngine();
let spec;
let role = 'EXECUTIVE_ADMIN';
let activeTab = 'Streams';
let enrollment;

const roleSelect = document.querySelector('#learning-role');
const tabContainer = document.querySelector('#learning-tabs');
const metrics = document.querySelector('#learning-metrics');
const activeModule = document.querySelector('#active-module');
const moduleStatus = document.querySelector('#module-status');
const facilitatorPanel = document.querySelector('#facilitator-panel');
const workflowTrack = document.querySelector('#workflow-track');
const workflowState = document.querySelector('#workflow-state');
const taskList = document.querySelector('#task-list');
const taskCount = document.querySelector('#task-count');
const auditList = document.querySelector('#audit-list');
const roleMatrix = document.querySelector('#role-matrix');
const alertRegion = document.querySelector('#learning-alert');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showAlert(message, tone = 'warn') {
  alertRegion.className = `learning-alert ${tone}`;
  alertRegion.textContent = message;
  window.setTimeout(() => {
    alertRegion.className = '';
    alertRegion.textContent = '';
  }, 5500);
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function actor() {
  return `${role.toLowerCase()}@ggh.demo`;
}

function registerDemoApplication() {
  enrollment = engine.registerApplication({
    applicantName: 'Demo Learner',
    email: 'learner@example.invalid',
    programId: 'GGH-DISTANCE-LEARNING',
    actor: 'candidate-demo'
  });
}

function refreshEnrollment() {
  if (!enrollment) return;
  enrollment = structuredClone(engine.getEnrollment(enrollment.enrollmentId));
}

function renderTabs() {
  tabContainer.innerHTML = spec.learningNavigation.map(tab => `
    <button type="button" class="${tab === activeTab ? 'active' : ''}" data-tab="${escapeHtml(tab)}">${escapeHtml(tab)}</button>
  `).join('');
}

function renderMetrics() {
  const currentIndex = Math.max(0, ENROLLMENT_STATES.indexOf(enrollment.status));
  const completion = Math.round(((currentIndex + 1) / ENROLLMENT_STATES.length) * 100);
  metrics.innerHTML = `
    <div class="card metric"><strong>${escapeHtml(enrollment.status)}</strong><span>Enrollment status</span></div>
    <div class="card metric"><strong>${completion}%</strong><span>Provisioning progress</span></div>
    <div class="card metric"><strong>${enrollment.tasks.filter(task => task.status === 'OPEN').length}</strong><span>Open workflow tasks</span></div>
    <div class="card metric"><strong>${enrollment.progress.percentage}%</strong><span>Learning completion</span></div>`;
}

function renderModule() {
  const module = spec.modules[0];
  moduleStatus.innerHTML = `<span class="badge warn">${escapeHtml(module.status)}</span>`;
  activeModule.innerHTML = `
    <div class="module-list">
      <div class="module-item">
        <h3>${escapeHtml(module.title)}</h3>
        <p>${escapeHtml(module.assignment)}</p>
        <p class="callout">${escapeHtml(module.disclaimer)}</p>
        <div class="module-meta">
          <span class="role-pill">${escapeHtml(module.id)}</span>
          <button class="button compact" id="complete-module" ${enrollment.status !== 'ACTIVE' ? 'disabled' : ''}>Record completion</button>
        </div>
      </div>
    </div>`;
  document.querySelector('#complete-module')?.addEventListener('click', () => {
    try {
      enrollment = engine.completeModule(enrollment.enrollmentId, {
        moduleId: module.id,
        totalModules: spec.modules.length,
        actor: actor(),
        role
      });
      showAlert('Module completion recorded in the audit trail.', 'ok');
      renderAll();
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  });
}

function renderFacilitator() {
  const persona = spec.personas[0];
  facilitatorPanel.innerHTML = `
    <div class="facilitator-avatar">
      <div class="avatar">AI</div>
      <div><strong>${escapeHtml(persona.displayName)}</strong><br /><small>Persona steward: ${escapeHtml(persona.stewardRole)}</small></div>
    </div>
    <p>Provides supervised case-based learning, rubric feedback and ethics scenarios. Every consequential output remains subject to human review.</p>
    <div class="module-meta">
      ${persona.functions.map(item => `<span class="role-pill">${escapeHtml(item)}</span>`).join('')}
    </div>`;
}

function renderWorkflow() {
  const currentIndex = ENROLLMENT_STATES.indexOf(enrollment.status);
  workflowState.innerHTML = `<span class="badge ${enrollment.status === 'ACTIVE' ? 'ok' : 'warn'}">${escapeHtml(enrollment.status)}</span>`;
  workflowTrack.innerHTML = spec.workflow.map((state, index) => {
    const className = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : '';
    return `<div class="workflow-node ${className}">${index + 1}. ${escapeHtml(state.replaceAll('_', ' '))}</div>`;
  }).join('');
}

function renderTasks() {
  const openTasks = enrollment.tasks.filter(task => task.status === 'OPEN');
  taskCount.innerHTML = `<span class="badge ${openTasks.length ? 'warn' : 'ok'}">${openTasks.length} OPEN</span>`;
  taskList.innerHTML = openTasks.length ? openTasks.map(task => `
    <div class="task-row">
      <div><strong>${escapeHtml(task.label)}</strong><small>${escapeHtml(task.type)} · Owner: ${escapeHtml(task.ownerRole)}</small></div>
      <span class="role-pill">${escapeHtml(task.status)}</span>
    </div>`).join('') : '<p>No open workflow tasks.</p>';
}

function renderAudit() {
  auditList.innerHTML = engine.auditEvents.slice().reverse().slice(0, 12).map(event => `
    <div class="audit-row">
      <div><strong>${escapeHtml(event.action)}</strong><small>${escapeHtml(event.occurredAt)} · ${escapeHtml(event.actor)}</small></div>
      <span class="role-pill">${escapeHtml(event.eventId)}</span>
    </div>`).join('') || '<p>No audit events.</p>';
}

function renderRoleMatrix() {
  roleMatrix.innerHTML = `
    <table>
      <thead><tr><th>Portal role</th><th>Primary scope</th><th>Current access</th></tr></thead>
      <tbody>
        ${Object.entries(spec.roles).map(([key, value]) => `
          <tr>
            <td><strong>${escapeHtml(value.label)}</strong><br /><small>${escapeHtml(key)}</small></td>
            <td class="matrix-scope">${value.scope.map(item => escapeHtml(item)).join(' · ')}</td>
            <td>${key === role ? '<span class="badge ok">ACTIVE</span>' : '<span class="badge warn">NOT SELECTED</span>'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function applyAction(action) {
  try {
    if (action === 'payment') {
      enrollment = engine.recordPayment(enrollment.enrollmentId, {
        providerReference: `demo_payment_${Date.now()}`,
        amount: 0,
        currency: 'USD',
        actor: actor(),
        role
      });
    } else if (action === 'approve') {
      enrollment = engine.approveEnrollment(enrollment.enrollmentId, { actor: actor(), role });
    } else if (action === 'identity') {
      enrollment = engine.recordIdentityProvisioned(enrollment.enrollmentId, {
        userPrincipalName: 'demo.learner@condreroutlook626.onmicrosoft.com',
        objectId: `demo-object-${Date.now()}`,
        actor: actor(),
        role
      });
    } else if (action === 'workspace') {
      enrollment = engine.activateWorkspace(enrollment.enrollmentId, {
        workspaceId: `LMS-${Date.now()}`,
        personas: ['TEACHING_ASSISTANT', 'DR_JENIFER_MARTIN_PHD'],
        actor: actor(),
        role
      });
    }
    showAlert(`${action} action completed under ${role}.`, 'ok');
    renderAll();
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

function renderAll() {
  refreshEnrollment();
  renderTabs();
  renderMetrics();
  renderModule();
  renderFacilitator();
  renderWorkflow();
  renderTasks();
  renderAudit();
  renderRoleMatrix();
}

async function initialize() {
  const response = await fetch('./data/program-spec.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load program specification: ${response.status}`);
  spec = await response.json();

  roleSelect.innerHTML = Object.keys(LEARNING_ROLES).map(value => `<option value="${value}">${value.replaceAll('_', ' ')}</option>`).join('');
  roleSelect.value = role;
  registerDemoApplication();
  renderAll();

  roleSelect.addEventListener('change', () => {
    role = roleSelect.value;
    renderAll();
    showAlert(`Active demonstration role changed to ${role}.`, 'warn');
  });

  tabContainer.addEventListener('click', event => {
    const tab = event.target.dataset.tab;
    if (!tab) return;
    activeTab = tab;
    renderTabs();
    showAlert(`${tab} selected. The demonstration keeps all modules on one page.`, 'warn');
  });

  document.querySelector('#enroll-now').addEventListener('click', () => {
    registerDemoApplication();
    showAlert('A new demonstration enrollment and workflow record were created.', 'ok');
    renderAll();
  });

  document.querySelector('#launch-sandbox').addEventListener('click', () => {
    const decision = engine.reviewPersonaRequest({
      role,
      category: 'EDUCATIONAL_SIMULATION'
    });
    if (!decision.allowed) {
      showAlert(`Sandbox blocked: ${decision.code}`, 'danger');
      return;
    }
    showAlert('Educational sandbox authorized with disclosure and human-review requirements. No live AI provider call was made.', 'ok');
  });

  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', () => applyAction(button.dataset.action));
  });

  document.querySelector('#export-evidence').addEventListener('click', () => {
    if (!canLearning(role, LEARNING_PERMISSIONS.EXPORT_EVIDENCE)) {
      showAlert(`Role ${role} cannot export evidence.`, 'danger');
      return;
    }
    downloadJson(`ggh-learning-evidence-${Date.now()}.json`, engine.exportEvidence());
    showAlert('Evidence package exported.', 'ok');
  });
}

initialize().catch(error => showAlert(error.message, 'danger'));
