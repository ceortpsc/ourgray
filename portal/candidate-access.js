import { RegistryStore } from './lib/id-engine.js';
import {
  ApplicationStore,
  GATE_DEFINITIONS,
  attachOAuthIdentity,
  completionPercent,
  createApplication,
  recalculate,
  submitApplication,
  updateApplication
} from './lib/application-engine.js';
import {
  beginOAuth,
  completeOAuth,
  getOAuthSession,
  oauthConfigured,
  signOutOAuth
} from './lib/oauth-pkce.js';

const ACTIVE_APPLICATION_KEY = 'ggh.active-application-id.v1';
const applicationStore = new ApplicationStore();
const registry = new RegistryStore({ organization: 'GGH' });
const registrationForm = document.querySelector('#registration-form');
const continueForm = document.querySelector('#continue-form');
const applicationForm = document.querySelector('#application-form');
const alertRegion = document.querySelector('#candidate-alert');
const positionOptions = document.querySelector('#position-options');
const oauthStatus = document.querySelector('#oauth-status');
const applicationEmpty = document.querySelector('#application-empty');
const applicationWorkspace = document.querySelector('#application-workspace');
const supportEmail = document.querySelector('#support-email');

let config;
let activeApplication = null;
let oauthSession = getOAuthSession();

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showAlert(message, tone = 'warn') {
  alertRegion.innerHTML = `<div class="candidate-alert ${tone}">${escapeHtml(message)}</div>`;
  window.setTimeout(() => { alertRegion.innerHTML = ''; }, 6000);
}

function badge(value) {
  const text = String(value || '').toUpperCase();
  const tone = /COMPLETE|APPROVED|VERIFIED|SUBMITTED|ONBOARDING/.test(text)
    ? 'ok'
    : /DECLINED|BLOCKED|FAILED|ACTION_REQUIRED/.test(text)
      ? 'danger'
      : 'warn';
  return `<span class="badge ${tone}">${escapeHtml(value)}</span>`;
}

function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadConfig() {
  const response = await fetch('./data/candidate-access-config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load candidate access configuration: ${response.status}`);
  return response.json();
}

function activeApplicationId() {
  return sessionStorage.getItem(ACTIVE_APPLICATION_KEY);
}

function setActiveApplication(application) {
  activeApplication = application;
  if (application?.applicationId) sessionStorage.setItem(ACTIVE_APPLICATION_KEY, application.applicationId);
  else sessionStorage.removeItem(ACTIVE_APPLICATION_KEY);
  render();
}

function saveActiveApplication(application, message = '') {
  activeApplication = applicationStore.save(application);
  sessionStorage.setItem(ACTIVE_APPLICATION_KEY, activeApplication.applicationId);
  if (message) showAlert(message, 'ok');
  render();
  return activeApplication;
}

function switchView(view) {
  document.querySelectorAll('.candidate-tabs button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('.candidate-view').forEach(section => section.classList.toggle('active', section.id === `${view}-view`));
  if (view !== 'access' && !activeApplication) showAlert('Register or continue an application first.');
}

function parseBoolean(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function setFormValue(name, value) {
  const field = applicationForm.elements[name];
  if (!field) return;
  if (field.type === 'checkbox') field.checked = Boolean(value);
  else if (typeof value === 'boolean') field.value = String(value);
  else field.value = value ?? '';
}

function populateApplicationForm(application) {
  const values = {
    ...application.profile,
    ...application.eligibility,
    ...application.disclosures,
    ...application.documents
  };
  for (const [name, value] of Object.entries(values)) setFormValue(name, value);
  const locked = Boolean(application.lockedAt);
  for (const field of applicationForm.elements) {
    if (field.id === 'export-application') continue;
    field.disabled = locked;
  }
  document.querySelector('#export-application').disabled = false;
}

function renderOAuth() {
  const configured = oauthConfigured(config);
  const signIn = document.querySelector('#oauth-sign-in');
  const signOut = document.querySelector('#oauth-sign-out');
  signIn.disabled = !configured || !activeApplication;
  signOut.disabled = !oauthSession;

  if (!configured) {
    oauthStatus.innerHTML = `${badge('CONFIGURATION REQUIRED')}<p>The Entra application client ID has not been written to the public configuration file.</p>`;
    return;
  }
  if (!activeApplication) {
    oauthStatus.innerHTML = `${badge('APPLICATION REQUIRED')}<p>Create or continue an application before identity verification.</p>`;
    return;
  }
  if (activeApplication.identity.oauthVerifiedAt) {
    oauthStatus.innerHTML = `${badge('IDENTITY GATE COMPLETE')}<p>${escapeHtml(activeApplication.identity.email)}<br /><small>Verified ${escapeHtml(new Date(activeApplication.identity.oauthVerifiedAt).toLocaleString())}</small></p>`;
    return;
  }
  if (oauthSession) {
    oauthStatus.innerHTML = `${badge('SIGNED IN')}<p>${escapeHtml(oauthSession.claims.email || oauthSession.claims.username || oauthSession.claims.name || 'Microsoft account')}</p>`;
    return;
  }
  oauthStatus.innerHTML = `${badge('PENDING')}<p>Microsoft OAuth 2.0 authorization code flow with PKCE is available.</p>`;
}

function renderApplication() {
  if (!activeApplication) {
    applicationEmpty.hidden = false;
    applicationWorkspace.hidden = true;
    return;
  }
  applicationEmpty.hidden = true;
  applicationWorkspace.hidden = false;
  document.querySelector('#active-candidate-name').textContent = `${activeApplication.identity.firstName} ${activeApplication.identity.lastName}`;
  document.querySelector('#active-application-id').textContent = activeApplication.applicationId;
  document.querySelector('#active-candidate-id').textContent = activeApplication.candidateId || 'Pending issuance';
  const completion = completionPercent(activeApplication);
  document.querySelector('#completion-value').textContent = `${completion}%`;
  document.querySelector('#completion-bar').style.width = `${completion}%`;
  populateApplicationForm(activeApplication);
  const submitButton = document.querySelector('#submit-application');
  submitButton.disabled = activeApplication.status !== 'READY_TO_SUBMIT';
  submitButton.textContent = activeApplication.submittedAt ? 'Application submitted' : 'Submit application';
}

function renderGates() {
  const target = document.querySelector('#candidate-gates');
  if (!activeApplication) {
    target.innerHTML = '<div class="empty-state">No active application.</div>';
    return;
  }
  target.innerHTML = `<div class="gate-list">${Object.entries(GATE_DEFINITIONS).map(([key, definition]) => {
    const gate = activeApplication.gates[key];
    return `<div class="gate-row"><div><strong>${escapeHtml(definition.label)}</strong><small>Owner: ${escapeHtml(definition.owner)}${gate.evidence ? ` · ${escapeHtml(gate.evidence)}` : ''}</small></div>${badge(gate.status)}</div>`;
  }).join('')}</div>`;
}

function renderTasks() {
  const target = document.querySelector('#candidate-tasks');
  if (!activeApplication) {
    target.innerHTML = '<div class="empty-state">No active application.</div>';
    return;
  }
  const visibleTasks = activeApplication.tasks.filter(task => task.owner === 'Candidate' || task.status === 'COMPLETE');
  target.innerHTML = `<div class="task-list">${visibleTasks.map(task => `<div class="task-row ${task.status.toLowerCase()}"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.owner)} · ${escapeHtml(task.status)}${task.completedAt ? ` · ${escapeHtml(new Date(task.completedAt).toLocaleString())}` : ''}</small></div>`).join('')}</div>`;
}

function renderEvents() {
  const target = document.querySelector('#candidate-events');
  if (!activeApplication) {
    target.innerHTML = '<div class="empty-state">No active application.</div>';
    return;
  }
  target.innerHTML = `<div class="event-list">${activeApplication.events.slice(0, 25).map(event => `<div class="event-row"><strong>${escapeHtml(event.action.replaceAll('_', ' '))}</strong><small>${escapeHtml(new Date(event.occurredAt).toLocaleString())} · ${escapeHtml(event.actor)}</small></div>`).join('')}</div>`;
}

function render() {
  renderOAuth();
  renderApplication();
  renderGates();
  renderTasks();
  renderEvents();
}

async function registerCandidate(event) {
  event.preventDefault();
  const data = new FormData(registrationForm);
  if (data.get('privacyAcknowledged') !== 'on') {
    showAlert('The candidate privacy notice must be acknowledged.', 'danger');
    return;
  }
  const email = String(data.get('email')).trim();
  const subjectRef = `candidate:${email.toLowerCase()}`;
  const existingApplications = applicationStore.findByEmail(email).filter(application => !['DECLINED', 'WITHDRAWN'].includes(application.status));
  if (existingApplications.length) {
    showAlert(`An application already exists for this email. Use Continue Application with ${existingApplications[0].applicationId}.`, 'danger');
    return;
  }

  let candidateRecord = registry.list({ type: 'CANDIDATE', subjectRef }).find(record => record.status === 'ACTIVE');
  if (!candidateRecord) {
    candidateRecord = await registry.issue({
      type: 'CANDIDATE',
      subjectRef,
      issuedBy: 'candidate.access.registration',
      purpose: 'Candidate application registration',
      retentionClass: 'CANDIDATE_FILE_7Y',
      metadata: { source: 'CANDIDATE_ACCESS_GATE' }
    });
  }
  let retentionRecord = registry.list({ type: 'RETENTION', subjectRef }).find(record => record.status === 'ACTIVE');
  if (!retentionRecord) {
    retentionRecord = await registry.issue({
      type: 'RETENTION',
      subjectRef,
      issuedBy: 'candidate.access.registration',
      purpose: 'Candidate application retention file',
      retentionClass: 'CANDIDATE_FILE_7Y'
    });
  }
  registry.link({ id: candidateRecord.id, relatedId: retentionRecord.id, actor: 'candidate.access.registration', relationship: 'RETAINED_IN' });

  const application = createApplication({
    email,
    firstName: data.get('firstName'),
    lastName: data.get('lastName'),
    positionInterest: data.get('positionInterest'),
    candidateId: candidateRecord.id
  });
  saveActiveApplication(application, `Application created. Save this Application ID: ${application.applicationId}`);
  continueForm.elements.applicationId.value = application.applicationId;
  continueForm.elements.email.value = email;
  registrationForm.reset();
  switchView('application');
}

function continueCandidate(event) {
  event.preventDefault();
  const data = new FormData(continueForm);
  const application = applicationStore.get(String(data.get('applicationId')).trim().toUpperCase());
  if (!application || application.identity.email.toLowerCase() !== String(data.get('email')).trim().toLowerCase()) {
    showAlert('No locally stored application matched that Application ID and email address.', 'danger');
    return;
  }
  setActiveApplication(application);
  showAlert(`Application ${application.applicationId} opened.`, 'ok');
  switchView('application');
}

function saveApplication(event) {
  event.preventDefault();
  if (!activeApplication) return;
  const data = new FormData(applicationForm);
  try {
    const updated = updateApplication(activeApplication, {
      profile: {
        preferredName: data.get('preferredName'),
        phone: data.get('phone'),
        city: data.get('city'),
        state: String(data.get('state') || '').toUpperCase(),
        currentEmployer: data.get('currentEmployer'),
        currentTitle: data.get('currentTitle'),
        yearsRelevantExperience: data.get('yearsRelevantExperience'),
        professionalSummary: data.get('professionalSummary'),
        referralSource: data.get('referralSource')
      },
      eligibility: {
        authorizedToWork: parseBoolean(data.get('authorizedToWork')),
        requiresSponsorship: parseBoolean(data.get('requiresSponsorship')),
        canPerformEssentialFunctions: parseBoolean(data.get('canPerformEssentialFunctions')),
        understandsCredentialVerification: parseBoolean(data.get('understandsCredentialVerification'))
      },
      disclosures: {
        privacyNoticeAcknowledged: data.get('privacyNoticeAcknowledged') === 'on',
        accuracyAttestation: data.get('accuracyAttestation') === 'on',
        electronicRecordsConsent: data.get('electronicRecordsConsent') === 'on'
      },
      documents: {
        resume: data.get('resume'),
        professionalLicense: data.get('professionalLicense'),
        educationAuthorization: data.get('educationAuthorization'),
        references: data.get('references')
      }
    });
    saveActiveApplication(updated, `Application saved. Current status: ${updated.status}.`);
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

function submitCandidateApplication() {
  if (!activeApplication) return;
  try {
    const submitted = submitApplication(activeApplication);
    saveActiveApplication(submitted, 'Application submitted and locked for employer review.');
    switchView('tasks');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

function exportCandidateCopy() {
  if (!activeApplication) return;
  const candidateCopy = structuredClone(activeApplication);
  candidateCopy.exportedAt = new Date().toISOString();
  candidateCopy.exportPurpose = 'Candidate personal copy';
  download(`${activeApplication.applicationId.toLowerCase()}-candidate-copy.json`, JSON.stringify(candidateCopy, null, 2));
  showAlert('Candidate copy exported.', 'ok');
}

async function signIn() {
  if (!activeApplication) {
    showAlert('Create or continue an application before signing in.', 'danger');
    return;
  }
  sessionStorage.setItem(ACTIVE_APPLICATION_KEY, activeApplication.applicationId);
  try {
    await beginOAuth(config, { loginHint: activeApplication.identity.email });
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

function signOut() {
  signOutOAuth();
  oauthSession = null;
  showAlert('Microsoft sign-in session ended. The saved application remains available on this browser.', 'ok');
  render();
}

async function processOAuthCallback() {
  try {
    const completed = await completeOAuth(config);
    if (completed) oauthSession = completed;
    if (!oauthSession) return;
    const id = activeApplicationId();
    const application = id ? applicationStore.get(id) : null;
    if (!application || application.identity.oauthVerifiedAt) return;
    const updated = attachOAuthIdentity(application, oauthSession);
    saveActiveApplication(updated, 'Microsoft identity verification gate completed.');
  } catch (error) {
    showAlert(`Microsoft sign-in could not be completed: ${error.message}`, 'danger');
  }
}

function bindEvents() {
  document.querySelector('.candidate-tabs').addEventListener('click', event => {
    if (event.target.dataset.view) switchView(event.target.dataset.view);
  });
  registrationForm.addEventListener('submit', registerCandidate);
  continueForm.addEventListener('submit', continueCandidate);
  applicationForm.addEventListener('submit', saveApplication);
  document.querySelector('#submit-application').addEventListener('click', submitCandidateApplication);
  document.querySelector('#export-application').addEventListener('click', exportCandidateCopy);
  document.querySelector('#oauth-sign-in').addEventListener('click', signIn);
  document.querySelector('#oauth-sign-out').addEventListener('click', signOut);
}

async function initialize() {
  config = await loadConfig();
  positionOptions.innerHTML = '<option value="">Select a role</option>' + config.positionOptions.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('');
  supportEmail.textContent = config.supportEmail;
  supportEmail.href = `mailto:${config.supportEmail}`;
  const savedId = activeApplicationId();
  if (savedId) activeApplication = applicationStore.get(savedId);
  bindEvents();
  await processOAuthCallback();
  if (activeApplication) {
    activeApplication = recalculate(activeApplication);
    applicationStore.save(activeApplication);
  }
  render();
}

initialize().catch(error => showAlert(error.message, 'danger'));
