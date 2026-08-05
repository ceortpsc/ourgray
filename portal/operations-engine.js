import { PlatformEngine } from './lib/platform-engine.js';
import { exportDataset, triggerBrowserDownload } from './lib/export-engine.js';

const alertRegion = document.querySelector('#operations-alert');
const metricsRegion = document.querySelector('#operations-metrics');
const healthGrid = document.querySelector('#health-grid');
const jobsTable = document.querySelector('#jobs-table');
const aiReviewList = document.querySelector('#ai-review-list');
const exportList = document.querySelector('#export-list');
const telemetryList = document.querySelector('#telemetry-list');
let platform;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function badge(value) {
  const text = String(value || '').toUpperCase();
  const tone = /HEALTHY|SUCCEEDED|APPROVED|COMPLETE/.test(text)
    ? 'ok'
    : /FAILED|DEAD|UNHEALTHY|REJECTED|CANCELLED/.test(text)
      ? 'danger'
      : 'warn';
  return `<span class="badge ${tone}">${escapeHtml(value)}</span>`;
}

function alert(message, tone = '') {
  alertRegion.innerHTML = `<div class="operations-alert ${tone}">${escapeHtml(message)}</div>`;
  window.setTimeout(() => { alertRegion.innerHTML = ''; }, 6000);
}

async function loadConfig() {
  const response = await fetch('./data/engine-config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load engine configuration: ${response.status}`);
  return response.json();
}

function sampleRows(count) {
  const limit = Math.max(1, Math.min(100, Number(count || 5)));
  return Array.from({ length: limit }, (_, index) => ({
    recordNumber: index + 1,
    recordType: 'CANDIDATE_OPERATION',
    status: index % 3 === 0 ? 'ACTION_REQUIRED' : index % 2 === 0 ? 'READY' : 'REVIEW',
    generatedFor: 'The Great Gray Horizon Counseling Center',
    exportedAt: new Date().toISOString()
  }));
}

function aiInput(value) {
  const lines = String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const object = {};
  for (const line of lines) {
    const index = line.indexOf(':');
    if (index > 0) object[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    else object[`line${Object.keys(object).length + 1}`] = line;
  }
  return object;
}

function renderMetrics() {
  const dashboard = platform.dashboard();
  const counts = dashboard.jobSnapshot.counts;
  metricsRegion.innerHTML = `
    <div class="card metric"><strong>${dashboard.jobSnapshot.queueDepth}</strong><span>Queued jobs</span></div>
    <div class="card metric"><strong>${counts.SUCCEEDED || 0}</strong><span>Succeeded jobs</span></div>
    <div class="card metric"><strong>${counts.DEAD_LETTER || 0}</strong><span>Dead-letter jobs</span></div>
    <div class="card metric"><strong>${dashboard.telemetry.totalEvents}</strong><span>Telemetry events</span></div>`;
}

async function renderHealth() {
  const health = await platform.health();
  healthGrid.innerHTML = health.checks.map(check => `<article class="card health-card ${check.status.toLowerCase()}">
    <strong>${escapeHtml(check.name)}</strong>
    ${badge(check.status)}
    <span>${escapeHtml(check.latencyMs)} ms · ${escapeHtml(JSON.stringify(check.details))}</span>
  </article>`).join('');
}

function renderJobs() {
  const jobs = platform.jobs.list();
  jobsTable.innerHTML = jobs.length ? jobs.map(job => `<tr>
    <td class="mono">${escapeHtml(job.jobId)}</td>
    <td>${escapeHtml(job.type)}</td>
    <td>${badge(job.state)}</td>
    <td>${escapeHtml(job.priority)}</td>
    <td>${escapeHtml(job.attempts)}</td>
    <td>${escapeHtml(new Date(job.updatedAt).toLocaleString())}</td>
  </tr>`).join('') : '<tr><td colspan="6">No jobs have been queued.</td></tr>';
}

function renderAIReviews() {
  const requests = platform.ai.list();
  aiReviewList.innerHTML = requests.length ? requests.map(request => `<article class="card ai-review-card">
    <div><h3>${escapeHtml(request.useCase)}</h3>${badge(request.approvalStatus)}</div>
    <div class="ai-output">${escapeHtml(typeof request.output === 'object' ? JSON.stringify(request.output, null, 2) : request.output)}</div>
    <div class="export-meta">Provider: ${escapeHtml(request.provider)} · Confidence: ${escapeHtml(request.confidence)}<br />${escapeHtml(request.explanation || '')}</div>
    ${request.approvalStatus === 'PENDING' ? `<div class="review-actions"><button class="button compact" data-ai-approve="${request.requestId}">Approve</button><button class="button compact danger-button" data-ai-reject="${request.requestId}">Reject</button></div>` : ''}
  </article>`).join('') : '<div class="empty-state">No AI-assist requests have completed.</div>';
}

function renderExports() {
  const jobs = platform.jobs.list({ type: 'EXPORT_DATASET' }).filter(job => job.state === 'SUCCEEDED' && job.result);
  exportList.innerHTML = jobs.length ? jobs.map(job => `<article class="card export-card">
    <h3>${escapeHtml(job.result.filename)}</h3>
    <div>${badge('READY')}</div>
    <div class="export-meta">${escapeHtml(job.result.mimeType)}<br /><span class="mono-wrap">SHA-256 ${escapeHtml(job.result.checksum)}</span></div>
    <div class="review-actions">
      <button class="button compact" data-export-content="${job.jobId}">Download file</button>
      ${job.result.manifest ? `<button class="button compact secondary" data-export-manifest="${job.jobId}">Download manifest</button>` : ''}
    </div>
  </article>`).join('') : '<div class="empty-state">No completed exports.</div>';
}

function renderTelemetry() {
  const events = platform.telemetry.query({ limit: 100 });
  telemetryList.innerHTML = events.length ? events.map(event => `<div class="event-item"><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(new Date(event.occurredAt).toLocaleString())} · ${escapeHtml(event.source)} · ${escapeHtml(event.level)}</small></div>`).join('') : '<div class="empty-state">No telemetry events.</div>';
}

async function render() {
  renderMetrics();
  await renderHealth();
  renderJobs();
  renderAIReviews();
  renderExports();
  renderTelemetry();
}

function queueExport(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = String(data.get('name')).trim();
  const format = String(data.get('format'));
  const count = Number(data.get('count'));
  const job = platform.enqueueExport({
    name,
    format,
    rows: sampleRows(count),
    metadata: {
      corporation: 'Ross Tax Pro Software Co.',
      program: 'The Great Gray Horizon Counseling Center',
      exportScope: 'Operations-center sample records'
    }
  }, { priority: 60, idempotencyKey: `export:${name}:${format}:${count}` });
  alert(`Export job queued: ${job.jobId}`, 'ok');
  render();
}

function queueAI(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    const job = platform.enqueueAIAssist({
      useCase: String(data.get('useCase')),
      input: aiInput(data.get('input')),
      actor: 'operations.admin@ross-tax-pro.example',
      purpose: String(data.get('purpose'))
    }, { priority: 50 });
    alert(`AI-assist job queued: ${job.jobId}`, 'ok');
    render();
  } catch (error) {
    alert(error.message, 'danger');
  }
}

function queueNotification(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const job = platform.enqueueNotification({
    recipient: String(data.get('recipient')),
    subject: String(data.get('subject')),
    channel: String(data.get('channel'))
  }, { priority: 40 });
  alert(`Notification job staged: ${job.jobId}`, 'ok');
  render();
}

async function runQueue() {
  const queued = platform.jobs.snapshot().queueDepth;
  if (!queued) {
    alert('No queued jobs are available.');
    return;
  }
  await platform.run();
  alert(`${queued} queued job(s) processed.`, 'ok');
  await render();
}

async function exportDashboard() {
  const result = await exportDataset({
    name: 'Great Gray Horizon Platform Engine Dashboard',
    format: 'json',
    rows: [platform.dashboard()],
    metadata: { exportPurpose: 'Administrative engine-state snapshot' }
  });
  triggerBrowserDownload(result);
  if (result.manifest) triggerBrowserDownload({ filename: result.manifestFilename, content: result.manifestContent, mimeType: 'application/json' });
  alert('Engine dashboard and manifest exported.', 'ok');
}

function handleReviewAction(event) {
  const approveId = event.target.dataset.aiApprove;
  const rejectId = event.target.dataset.aiReject;
  try {
    if (approveId) platform.ai.approve(approveId, 'operations.admin@ross-tax-pro.example');
    if (rejectId) platform.ai.reject(rejectId, 'operations.admin@ross-tax-pro.example', 'Rejected during operations review.');
    render();
  } catch (error) {
    alert(error.message, 'danger');
  }
}

function handleExportDownload(event) {
  const contentJobId = event.target.dataset.exportContent;
  const manifestJobId = event.target.dataset.exportManifest;
  const jobId = contentJobId || manifestJobId;
  if (!jobId) return;
  const job = platform.jobs.get(jobId);
  if (!job?.result) return;
  if (contentJobId) triggerBrowserDownload(job.result);
  if (manifestJobId) triggerBrowserDownload({ filename: job.result.manifestFilename, content: job.result.manifestContent, mimeType: 'application/json' });
}

async function initialize() {
  const config = await loadConfig();
  platform = new PlatformEngine({ config });
  platform.telemetry.record('OPERATIONS_CENTER_INITIALIZED', { environment: config.environment }, { source: 'operations-ui' });
  document.querySelector('#export-job-form').addEventListener('submit', queueExport);
  document.querySelector('#ai-job-form').addEventListener('submit', queueAI);
  document.querySelector('#notification-job-form').addEventListener('submit', queueNotification);
  document.querySelector('#run-queue').addEventListener('click', runQueue);
  document.querySelector('#refresh-health').addEventListener('click', renderHealth);
  document.querySelector('#export-dashboard').addEventListener('click', exportDashboard);
  document.querySelector('#clear-telemetry').addEventListener('click', () => { platform.telemetry.clear(); render(); });
  aiReviewList.addEventListener('click', handleReviewAction);
  exportList.addEventListener('click', handleExportDownload);
  await render();
}

initialize().catch(error => alert(error.message, 'danger'));
