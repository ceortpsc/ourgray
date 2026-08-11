import {
  LearningPlatformEngine,
  LEARNING_ROLES,
  ENROLLMENT_STATES,
  canLearning,
  LEARNING_PERMISSIONS
} from './lib/learning-engine.js';

const engine = new LearningPlatformEngine();
const stateKey = 'ggh.lms.full-simulation.v1';
let spec;
let sim;
let enrollment;
let role = 'EXECUTIVE_ADMIN';
let view = 'Dashboard';
let searchIndex = [];

const $ = selector => document.querySelector(selector);
const workspace = $('#workspace');
const roleSelect = $('#learning-role');
const nav = $('#primary-navigation');
const alertRegion = $('#learning-alert');
const modal = $('#modal');
const modalTitle = $('#modal-title');
const modalBody = $('#modal-body');
const assistModal = $('#assist-modal');
const chatWindow = $('#chat-window');
const chatInput = $('#chat-input');
const toastRegion = $('#toast-region');

const NAV = Object.freeze({
  EXECUTIVE_ADMIN: [
    ['Dashboard','⌂'],['Enrollment','◎'],['Academics','▤'],['People','♙'],['Finance','¤'],['Identity & Access','⚿'],['Compliance','✓'],['Evidence Center','▣'],['Messages','✉'],['Calendar','□'],['Documents','▧'],['System','⚙'],['Support','?']
  ],
  CLINICAL_OFFICER: [
    ['Dashboard','⌂'],['Courses','▤'],['Simulations','◈'],['Classwork','✎'],['Gradebook','★'],['People','♙'],['Clinical Review Queue','✓'],['Evidence Center','▣'],['Messages','✉'],['Calendar','□'],['Documents','▧'],['Support','?']
  ],
  STUDENT: [
    ['Dashboard','⌂'],['Stream','☷'],['Courses','▤'],['Classwork','✎'],['Simulations','◈'],['Grades','★'],['People','♙'],['Messages','✉'],['Calendar','□'],['Documents','▧'],['Billing','¤'],['Certificates','◇'],['Support','?']
  ],
  AUDITOR: [
    ['Dashboard','⌂'],['Evidence Center','▣'],['Compliance','✓'],['Academic Records','▤'],['Transactions','¤'],['Identity & Access','⚿'],['Documents','▧'],['System','⚙']
  ],
  DEVELOPER: [
    ['Dashboard','⌂'],['System','⚙'],['API Explorer','<>'],['Persona Configuration','◈'],['Identity & Access','⚿'],['Audit Logs','▣'],['Exports','⇩'],['Tests','✓'],['Support','?']
  ],
  TESTER: [
    ['Dashboard','⌂'],['Test Center','✓'],['Simulations','◈'],['Mock Payments','¤'],['Identity & Access','⚿'],['Audit Logs','▣'],['System','⚙'],['Support','?']
  ],
  FINANCE: [
    ['Dashboard','⌂'],['Finance','¤'],['Transactions','▤'],['Enrollment','◎'],['Audit Logs','▣'],['Documents','▧'],['Support','?']
  ],
  IDENTITY_ADMIN: [
    ['Dashboard','⌂'],['Identity & Access','⚿'],['Enrollment','◎'],['Audit Logs','▣'],['System','⚙'],['Support','?']
  ]
});

const PAGE_COPY = Object.freeze({
  Dashboard:['Dashboard','Role-aware operational overview and current priorities.'],
  Stream:['Stream','Announcements, course activity, reminders and program updates.'],
  Courses:['Courses','Course workspaces, modules, progress, faculty and materials.'],
  Academics:['Academic Operations','Program delivery, courses, assignments and learner progress.'],
  Classwork:['Classwork','Assignments, deadlines, submissions, rubrics and review status.'],
  Simulations:['AI Clinical Simulations','Human-reviewed educational scenarios and controlled AI-assist activities.'],
  Grades:['Grades','Student-facing academic results and reviewed feedback.'],
  Gradebook:['Gradebook','Faculty-facing grading, review queues and learner performance.'],
  People:['People','Students, faculty, administrative roles and simulation personas.'],
  Enrollment:['Enrollment Operations','Application, payment, approval, identity and LMS provisioning workflow.'],
  Finance:['Finance Operations','Simulation billing, revenue, balances and financial review queues.'],
  Transactions:['Transaction Evidence','Read-only simulated payment and transaction records.'],
  'Identity & Access':['Identity & Access','Entra staging, RBAC groups, access lifecycle and provisioning status.'],
  Compliance:['Compliance Center','Policy controls, evidence readiness, findings and review schedules.'],
  'Evidence Center':['Evidence Center','Audit-ready exports, retention classes and immutable-event previews.'],
  Messages:['Messages','Role-aware inbox, notices, faculty communication and administrative messaging.'],
  Calendar:['Calendar','Deadlines, office hours, reviews and administrative events.'],
  Documents:['Document Center','Policies, acknowledgments, reports and retention metadata.'],
  Billing:['Billing','Student-facing balance, payment-event status and account records.'],
  Certificates:['Certificates','Completed and in-progress educational credentials.'],
  System:['System Operations','Service health, runtime environment, release state and adapter readiness.'],
  Support:['Support Center','Knowledge resources, ticket simulation and escalation channels.'],
  'Clinical Review Queue':['Clinical Review Queue','Human-review queue for educational simulation artifacts and formative feedback.'],
  'Academic Records':['Academic Records','Auditor-facing read-only academic evidence and completion records.'],
  'API Explorer':['API Explorer','OpenAPI-aligned endpoint simulation and payload inspection.'],
  'Persona Configuration':['Persona Configuration','Governed AI persona definitions, stewardship and human-review requirements.'],
  'Audit Logs':['Audit Logs','Append-only simulation events with actor, timestamp and correlation data.'],
  Exports:['Exports','Evidence packages and machine-readable operational exports.'],
  Tests:['Automated Tests','Validation suites, release gates and simulated QA results.'],
  'Test Center':['QA Test Center','Test personas, scenario suites, accessibility checks and workflow validation.'],
  'Mock Payments':['Mock Payment Gateway','Non-financial payment event simulation for workflow testing.']
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

function money(value) {
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value || 0));
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(date);
}

function initials(name) {
  return String(name).split(/\s+/).filter(Boolean).slice(0,2).map(v => v[0]).join('').toUpperCase();
}

function showAlert(message,tone='warn') {
  alertRegion.className = `learning-alert ${tone}`;
  alertRegion.textContent = message;
  setTimeout(()=>{ alertRegion.className=''; alertRegion.textContent=''; },5000);
}

function toast(message,tone='ok') {
  const item = document.createElement('div');
  item.className = `toast-item ${tone}`;
  item.textContent = message;
  toastRegion.append(item);
  setTimeout(()=>item.remove(),3500);
}

function download(filename,content,type='application/json') {
  const blob = new Blob([content],{type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}

function actor() { return `${role.toLowerCase()}@ggh.simulation`; }

function loadLocalState() {
  try { return JSON.parse(localStorage.getItem(stateKey)) || {}; } catch { return {}; }
}

function saveLocalState(patch={}) {
  const current = loadLocalState();
  localStorage.setItem(stateKey,JSON.stringify({...current,...patch}));
}

function registerDemoEnrollment() {
  enrollment = engine.registerApplication({
    applicantName: sim.learner.name,
    email:'learner@example.invalid',
    programId:'GGH-DISTANCE-LEARNING',
    actor:'system.simulation'
  });
}

function refreshEnrollment() {
  if (enrollment) enrollment = structuredClone(engine.getEnrollment(enrollment.enrollmentId));
}

function setPageCopy() {
  const [title,sub] = PAGE_COPY[view] || [view,'Great Gray Horizon learning platform simulation.'];
  $('#page-heading').textContent = title;
  $('#page-subheading').textContent = sub;
  $('#profile-role-label').textContent = (spec.roles?.[role]?.label || role).replace('Students / Trainees','Student');
  $('#profile-environment').textContent = `${sim.system.environment} · ${sim.system.release}`;
}

function renderNav() {
  nav.innerHTML = (NAV[role] || NAV.STUDENT).map(([label,icon]) => `
    <button type="button" data-view="${escapeHtml(label)}" class="${label===view?'active':''}">
      <span class="nav-icon">${icon}</span><span>${escapeHtml(label)}</span>${label==='Messages'?'<span class="nav-badge">2</span>':''}
    </button>`).join('');
}

function stat(label,value,trend='Simulation data',tone='') {
  return `<article class="card metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span><small class="trend ${tone}">${escapeHtml(trend)}</small></article>`;
}

function progress(value) {
  const safe = Math.max(0,Math.min(100,Number(value)||0));
  return `<div class="progress" aria-label="${safe}% complete"><span style="width:${safe}%"></span></div>`;
}

function badge(status) {
  const value = String(status ?? '').toUpperCase();
  const tone = /(HEALTHY|ACTIVE|SIGNED|EARNED|AVAILABLE|REVIEWED|CURRENT|SUCCESS|ACKNOWLEDGED)/.test(value)?'ok':/(PENDING|IN_PROGRESS|OPEN|STAGED|SIMULATION|REVIEW)/.test(value)?'warn':/(SUSPENDED|FAILED|DECLINED|DISABLED)/.test(value)?'danger':'neutral';
  return `<span class="badge ${tone}">${escapeHtml(String(status).replaceAll('_',' '))}</span>`;
}

function heroForRole() {
  const roleLabel = spec.roles?.[role]?.label || role;
  if (role === 'STUDENT') {
    return `<section class="hero"><div><p class="eyebrow">${escapeHtml(sim.learner.term)}</p><h2>Welcome back, ${escapeHtml(sim.learner.name)}</h2><p>${escapeHtml(sim.learner.program)} · Continue your courses, review deadlines, and launch supervised educational simulations.</p><button class="button secondary" data-open-view="Courses">Continue learning</button></div><div class="hero-kpis"><div class="hero-kpi"><strong>${sim.learner.progress}%</strong><small>Program progress</small></div><div class="hero-kpi"><strong>${sim.learner.gpa.toFixed(2)}</strong><small>Current GPA</small></div><div class="hero-kpi"><strong>${sim.assignments.filter(x=>x.status==='IN_PROGRESS').length}</strong><small>Assignments in progress</small></div><div class="hero-kpi"><strong>${sim.messages.filter(x=>x.unread).length}</strong><small>Unread messages</small></div></div></section>`;
  }
  return `<section class="hero"><div><p class="eyebrow">${escapeHtml(roleLabel)}</p><h2>Great Gray Horizon command workspace</h2><p>Operate the complete LMS simulation from the ${escapeHtml(roleLabel)} facing. State-changing actions remain simulated and auditable.</p><button class="button secondary" data-open-view="${role==='DEVELOPER'?'System':'Enrollment'}">Open priority workspace</button></div><div class="hero-kpis"><div class="hero-kpi"><strong>${sim.admin.enrollmentCounts.active}</strong><small>Active learners</small></div><div class="hero-kpi"><strong>${sim.admin.facultyQueues.clinicalReviews}</strong><small>Clinical review queue</small></div><div class="hero-kpi"><strong>${sim.admin.compliance.openFindings}</strong><small>Open compliance findings</small></div><div class="hero-kpi"><strong>${sim.system.services.filter(x=>x.status==='HEALTHY').length}/${sim.system.services.length}</strong><small>Healthy adapters</small></div></div></section>`;
}

function renderDashboard() {
  const student = role === 'STUDENT';
  const cards = student
    ? stat('Program progress',`${sim.learner.progress}%`,'On track')+stat('Current GPA',sim.learner.gpa.toFixed(2),'Faculty-reviewed grades')+stat('Upcoming deadlines',sim.assignments.filter(x=>x.status!=='SUBMITTED').length,'Next 14 days')+stat('Certificates earned',sim.certificates.filter(x=>x.status==='EARNED').length,'Verified simulation record')
    : stat('Active enrollments',sim.admin.enrollmentCounts.active,'Simulation population')+stat('Pending enrollments',sim.admin.enrollmentCounts.pending,'Needs review')+stat('Evidence packages',sim.admin.compliance.evidencePackages,'Audit-ready simulations')+stat('Posted revenue',money(sim.admin.finance.postedRevenue),'Simulated financial ledger');
  workspace.innerHTML = `${heroForRole()}<section class="grid grid-4">${cards}</section><section class="grid grid-2"><article class="card"><div class="section-title"><h2>${student?'My courses':'Operational queues'}</h2>${badge('ACTIVE')}</div>${student?courseList(true):queueList()}</article><article class="card"><div class="section-title"><h2>Recent activity</h2><button class="button compact secondary" data-open-view="${student?'Stream':'Evidence Center'}">View all</button></div>${announcementList(3)}</article></section><section class="card"><div class="section-title"><h2>Enrollment & access workflow</h2>${badge(enrollment.status)}</div>${workflowHtml()}</section>`;
}

function courseList(compact=false) {
  return `<div class="${compact?'list':'grid grid-3'}">${sim.courses.map(course => compact?`<div class="list-row"><div><strong>${escapeHtml(course.title)}</strong><small>${escapeHtml(course.id)} · ${course.progress}% complete</small>${progress(course.progress)}</div>${badge(course.status)}</div>`:`<article class="card course-card"><div class="course-banner"></div><div class="course-meta"><span class="pill info">${escapeHtml(course.id)}</span>${badge(course.status)}</div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.instructor)}</p>${progress(course.progress)}<p><strong>Next:</strong> ${escapeHtml(course.next)}</p><button class="button compact" data-course="${course.id}">Open course</button></article>`).join('')}</div>`;
}

function queueList() {
  const queues = [
    ['Clinical reviews',sim.admin.facultyQueues.clinicalReviews,'CLINICAL_OFFICER'],
    ['Grade reviews',sim.admin.facultyQueues.gradeReviews,'CLINICAL_OFFICER'],
    ['Policy approvals',sim.admin.facultyQueues.policyApprovals,'EXECUTIVE_ADMIN'],
    ['Staged identities',sim.admin.identity.stagedAccounts,'IDENTITY_ADMIN'],
    ['Compliance findings',sim.admin.compliance.openFindings,'AUDITOR']
  ];
  return `<div class="list">${queues.map(([name,count,owner])=>`<div class="list-row"><div><strong>${name}</strong><small>Owner: ${owner.replaceAll('_',' ')}</small></div><span class="badge ${count?'warn':'ok'}">${count}</span></div>`).join('')}</div>`;
}

function announcementList(limit=99) {
  return sim.announcements.slice(0,limit).map(item=>`<article class="announcement"><header><div><h3>${escapeHtml(item.title)}</h3><small>${escapeHtml(item.audience)} · ${new Date(item.postedAt).toLocaleString()}</small></div>${badge(item.priority)}</header><p>${escapeHtml(item.body)}</p></article>`).join('');
}

function workflowHtml() {
  const idx = Math.max(0,ENROLLMENT_STATES.indexOf(enrollment.status));
  const steps = spec.workflow || ENROLLMENT_STATES.slice(0,9);
  return `<div class="workflow-track">${steps.map((s,i)=>`<div class="workflow-node ${i<idx?'complete':i===idx?'current':''}">${i+1}. ${escapeHtml(s.replaceAll('_',' '))}</div>`).join('')}</div>`;
}

function renderStream() {
  workspace.innerHTML = `<section class="card"><div class="stream-composer"><span class="composer-avatar">${role==='STUDENT'?'DL':'CR'}</span><button type="button" id="stream-compose">Share an announcement or course update...</button></div></section><section>${announcementList()}</section>`;
}

function renderCourses() {
  workspace.innerHTML = `<section class="grid grid-4">${stat('Courses',sim.courses.length,'Current term')}${stat('Average progress',`${Math.round(sim.courses.reduce((a,c)=>a+c.progress,0)/sim.courses.length)}%`,'Across active courses')}${stat('Assignments',sim.assignments.length,'Current term')}${stat('Faculty review queue',sim.admin.facultyQueues.gradeReviews,'Human review')}</section>${courseList(false)}`;
}

function assignmentRows(faculty=false) {
  return `<div class="assignment-board">${sim.assignments.map(a=>`<article class="assignment-card"><div class="assignment-icon">✎</div><div><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.course)} · Due ${dateLabel(a.due)} · ${a.points} points</p></div><div class="row-actions">${badge(a.status)}${a.grade!==null?`<span class="badge info">${a.grade}%</span>`:''}<button class="button compact secondary" data-assignment="${a.id}">${faculty?'Review':'Open'}</button></div></article>`).join('')}</div>`;
}

function renderClasswork() {
  workspace.innerHTML = `<section class="grid grid-4">${stat('Submitted',sim.assignments.filter(x=>x.status==='SUBMITTED').length,'Recorded')}${stat('In progress',sim.assignments.filter(x=>x.status==='IN_PROGRESS').length,'Continue work')}${stat('Not started',sim.assignments.filter(x=>x.status==='NOT_STARTED').length,'Plan ahead')}${stat('Faculty reviewed',sim.assignments.filter(x=>x.review==='FACULTY_REVIEWED').length,'Human-reviewed')}</section><section class="card"><div class="section-title"><h2>${role==='STUDENT'?'My assignments':'Assignment management'}</h2><span class="pill info">${sim.learner.term}</span></div>${assignmentRows(role!=='STUDENT')}</section>`;
}

function renderSimulations() {
  workspace.innerHTML = `<section class="callout info"><strong>Educational simulation environment.</strong><p>Scenarios are designed for learning and rubric-based reflection. They do not independently diagnose, treat, prescribe, or establish professional competency.</p></section><section class="simulation-grid">${sim.simulations.map(s=>`<article class="simulation-card"><div class="simulation-level"><span class="pill info">${escapeHtml(s.level)}</span>${badge(s.status)}</div><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.description)}</p><p><strong>Human review:</strong> ${s.requiresHumanReview?'Required':'Not required'}</p><button class="button compact" data-simulation="${s.id}">Launch simulation</button></article>`).join('')}</section>`;
}

function gradeTable() {
  return `<div class="table-wrap"><table><thead><tr><th>Course</th><th>Earned</th><th>Possible</th><th>Percent</th><th>Letter</th><th>Review</th></tr></thead><tbody>${sim.gradebook.map(g=>`<tr><td><strong>${escapeHtml(g.course)}</strong></td><td>${g.earned}</td><td>${g.possible}</td><td>${g.percent}%</td><td><strong>${g.letter}</strong></td><td>${badge('FACULTY_REVIEWED')}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderGrades() {
  workspace.innerHTML = `<section class="grid grid-3"><article class="card"><div class="section-title"><h2>Term GPA</h2>${badge('CURRENT')}</div><div class="grade-ring" style="--grade:${Math.round(sim.learner.gpa/4*100)}"><strong>${sim.learner.gpa.toFixed(2)}</strong></div></article>${stat('Credits attempted',sim.learner.creditsAttempted,'Current program')}${stat('Credits completed',sim.learner.creditsCompleted,'Recorded')}</section><section class="card"><div class="section-title"><h2>Course grades</h2><span class="pill info">Human reviewed</span></div>${gradeTable()}</section>`;
}

function renderGradebook() {
  workspace.innerHTML = `<section class="grid grid-4">${stat('Grade reviews',sim.admin.facultyQueues.gradeReviews,'Open queue')}${stat('Clinical reviews',sim.admin.facultyQueues.clinicalReviews,'Open queue')}${stat('Current GPA',sim.learner.gpa.toFixed(2),'Demo learner')}${stat('Assignments',sim.assignments.length,'Term total')}</section><section class="card"><div class="section-title"><h2>Faculty gradebook</h2><button class="button compact">Release reviewed grades</button></div>${gradeTable()}</section><section class="card"><div class="section-title"><h2>Assignment review queue</h2>${badge('HUMAN REVIEW')}</div>${assignmentRows(true)}</section>`;
}

function renderPeople() {
  workspace.innerHTML = `<section class="grid grid-3">${sim.people.map(p=>`<article class="card person-card"><div class="person-avatar">${initials(p.name)}</div><div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.role)}</small><p>${escapeHtml(p.credentialStatus)}</p>${badge(p.presence)}</div></article>`).join('')}</section><section class="callout"><strong>Credential representation policy</strong><p>Administrator-provided credentials and titles require independent verification before they are represented as verified professional credentials or used to assign regulated responsibilities.</p></section>`;
}

function renderEnrollment() {
  refreshEnrollment();
  const openTasks = enrollment.tasks.filter(x=>x.status==='OPEN');
  workspace.innerHTML = `<section class="grid grid-4">${stat('Active',sim.admin.enrollmentCounts.active,'Learners')}${stat('Pending',sim.admin.enrollmentCounts.pending,'Needs review')}${stat('Completed',sim.admin.enrollmentCounts.completed,'Program records')}${stat('Staged identities',sim.admin.identity.stagedAccounts,'Awaiting activation')}</section><section class="card"><div class="section-title"><h2>Demo enrollment workflow</h2>${badge(enrollment.status)}</div>${workflowHtml()}<div class="page-header-actions" style="margin-top:16px"><button class="button secondary" data-flow="payment">Verify demo payment</button><button class="button secondary" data-flow="approve">Approve enrollment</button><button class="button secondary" data-flow="identity">Record Entra identity</button><button class="button secondary" data-flow="workspace">Activate LMS workspace</button></div></section><section class="grid grid-2"><article class="card"><div class="section-title"><h2>Workflow tasks</h2><span class="badge warn">${openTasks.length} OPEN</span></div><div class="list">${openTasks.map(t=>`<div class="list-row"><div><strong>${escapeHtml(t.label)}</strong><small>${escapeHtml(t.ownerRole)}</small></div>${badge(t.status)}</div>`).join('')||'<p>No open tasks.</p>'}</div></article><article class="card"><div class="section-title"><h2>Provisioning controls</h2>${badge('SIMULATION')}</div><div class="key-value"><b>Identity creation</b><span>Server-side authorization required</span></div><div class="key-value"><b>Payment</b><span>Provider reference only; no card data stored</span></div><div class="key-value"><b>Welcome email</b><span>Triggered after identity and access gates</span></div><div class="key-value"><b>LMS activation</b><span>Role, course, and persona assignments logged</span></div></article></section>`;
}

function renderAcademics() {
  workspace.innerHTML = `<section class="grid grid-4">${stat('Courses',sim.courses.length,'Active term')}${stat('Assignments',sim.assignments.length,'Assigned')}${stat('Grade reviews',sim.admin.facultyQueues.gradeReviews,'Open')}${stat('Clinical reviews',sim.admin.facultyQueues.clinicalReviews,'Open')}</section>${courseList(false)}<section class="card"><div class="section-title"><h2>Academic performance snapshot</h2>${badge('FACULTY REVIEWED')}</div>${gradeTable()}</section>`;
}

function renderFinance(student=false) {
  if (student) {
    workspace.innerHTML = `<section class="grid grid-3">${stat('Account status',sim.billing.accountStatus,'Student ledger')}${stat('Current balance',money(sim.billing.currentBalance),'No amount due')}${stat('Transactions',sim.billing.transactions.length,'Simulation ledger')}</section><section class="card"><div class="section-title"><h2>Account transactions</h2>${badge('SIMULATION')}</div>${transactionTable(sim.billing.transactions)}</section><section class="callout info"><strong>Payment security.</strong><p>The simulation stores provider event references only. Production payment-card data belongs with the authorized payment processor and is never collected by this static portal.</p></section>`;
  } else {
    workspace.innerHTML = `<section class="grid grid-4">${stat('Posted revenue',money(sim.admin.finance.postedRevenue),'Simulation ledger')}${stat('Outstanding',money(sim.admin.finance.outstanding),'Open balances')}${stat('Refund reviews',sim.admin.finance.refundReview,'Pending review')}${stat('Current learner balance',money(sim.billing.currentBalance),'Demo account')}</section><section class="card"><div class="section-title"><h2>Transaction evidence</h2>${badge('READ ONLY')}</div>${transactionTable(sim.billing.transactions)}</section>`;
  }
}

function transactionTable(rows) {
  return `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Date</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead><tbody>${rows.map(t=>`<tr><td><code>${escapeHtml(t.id)}</code></td><td>${escapeHtml(t.date)}</td><td>${escapeHtml(t.description)}</td><td>${money(t.amount)}</td><td>${badge(t.status)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderIdentity() {
  const roleRows = Object.entries(LEARNING_ROLES).map(([r,perms])=>`<tr><td><strong>${r.replaceAll('_',' ')}</strong></td><td>${perms.length}</td><td>${r===role?badge('ACTIVE FACING'):badge('DEFINED')}</td></tr>`).join('');
  workspace.innerHTML = `<section class="grid grid-4">${stat('Active accounts',sim.admin.identity.activeAccounts,'Directory simulation')}${stat('Staged accounts',sim.admin.identity.stagedAccounts,'Awaiting activation')}${stat('Disabled accounts',sim.admin.identity.disabledAccounts,'Lifecycle controlled')}${stat('RBAC roles',Object.keys(LEARNING_ROLES).length,'Learning platform')}</section><section class="grid grid-2"><article class="card"><div class="section-title"><h2>Identity lifecycle</h2>${badge('CONTROLLED')}</div><div class="list"><div class="list-row"><div><strong>Candidate / student registration</strong><small>Creates application identity record</small></div>${badge('AVAILABLE')}</div><div class="list-row"><div><strong>Entra staging</strong><small>Disabled account until approvals complete</small></div>${badge('STAGED')}</div><div class="list-row"><div><strong>Group assignment</strong><small>Least-privilege learning entitlements</small></div>${badge('PENDING')}</div><div class="list-row"><div><strong>Day-one activation</strong><small>MFA and approved effective-date gate</small></div>${badge('PENDING')}</div></div></article><article class="card"><div class="section-title"><h2>RBAC definitions</h2>${badge('POLICY')}</div><div class="table-wrap"><table><thead><tr><th>Role</th><th>Permissions</th><th>Status</th></tr></thead><tbody>${roleRows}</tbody></table></div></article></section>`;
}

function renderCompliance() {
  const controls = [
    ['Privacy and data minimization','PASS','Public browser excludes high-risk identifiers'],
    ['AI human-review requirement','PASS','Consequential outputs remain review-gated'],
    ['Credential representation','REVIEW','Administrator-provided titles require verification'],
    ['Retention schedules','PASS','Document classes mapped to retention categories'],
    ['Accessibility review','OPEN','Manual WCAG review remains scheduled'],
    ['Incident response evidence','PASS','Operational event export available']
  ];
  workspace.innerHTML = `<section class="grid grid-4">${stat('Open findings',sim.admin.compliance.openFindings,'Review queue')}${stat('Evidence packages',sim.admin.compliance.evidencePackages,'Available')}${stat('Policies due',sim.admin.compliance.policiesDueForReview,'Scheduled review')}${stat('Audit events',engine.auditEvents.length,'Current session')}</section><section class="card"><div class="section-title"><h2>Control assessment</h2>${badge('SIMULATION')}</div><div class="table-wrap"><table><thead><tr><th>Control</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${controls.map(([c,s,e])=>`<tr><td><strong>${c}</strong></td><td>${badge(s)}</td><td>${e}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function renderEvidence() {
  const events = engine.auditEvents.slice().reverse();
  workspace.innerHTML = `<section class="grid grid-4">${stat('Audit events',events.length,'Session')}${stat('Evidence packages',sim.admin.compliance.evidencePackages,'Program')}${stat('Retention classes',new Set(sim.documents.map(x=>x.retention)).size,'Document registry')}${stat('Export formats','JSON / CSV / XHTML','Machine readable')}</section><section class="grid grid-2"><article class="card"><div class="section-title"><h2>Evidence registry</h2><button class="button compact" id="evidence-export">Export package</button></div><div class="list">${sim.documents.map(d=>`<div class="list-row"><div><strong>${escapeHtml(d.name)}</strong><small>${d.id} · ${d.retention}</small></div>${badge(d.status)}</div>`).join('')}</div></article><article class="card"><div class="section-title"><h2>Append-only event preview</h2>${badge('DEMO')}</div><div class="list">${events.slice(0,12).map(e=>`<div class="list-row"><div><strong>${escapeHtml(e.action)}</strong><small>${escapeHtml(e.occurredAt)} · ${escapeHtml(e.actor)}</small></div><code>${escapeHtml(e.eventId.slice(-8))}</code></div>`).join('')||'<p>No events yet.</p>'}</div></article></section>`;
}

function renderMessages() {
  workspace.innerHTML = `<section class="grid grid-3">${stat('Inbox',sim.messages.length,'Messages')}${stat('Unread',sim.messages.filter(x=>x.unread).length,'Needs attention')}${stat('Support tickets',sim.support.openTickets,'Open')}</section><section class="card"><div class="section-title"><h2>Inbox</h2><button class="button compact" id="compose-message">Compose</button></div><div class="list">${sim.messages.map(m=>`<div class="list-row"><div><strong>${m.unread?'● ':''}${escapeHtml(m.subject)}</strong><small>From ${escapeHtml(m.from)} · ${escapeHtml(m.preview)}</small></div><button class="button compact secondary" data-message="${m.id}">Open</button></div>`).join('')}</div></section>`;
}

function renderCalendar() {
  workspace.innerHTML = `<section class="card"><div class="section-title"><h2>Upcoming schedule</h2><button class="button compact">Add simulated event</button></div><div class="timeline">${sim.calendar.map(e=>`<div class="timeline-item"><time>${dateLabel(e.date)}<br>${escapeHtml(e.time)}</time><span class="timeline-dot"></span><div><strong>${escapeHtml(e.title)}</strong><br>${badge(e.type)}</div></div>`).join('')}</div></section>`;
}

function renderDocuments() {
  workspace.innerHTML = `<section class="grid grid-4">${stat('Documents',sim.documents.length,'Current file')}${stat('Signed',sim.documents.filter(x=>x.status==='SIGNED').length,'Electronic records')}${stat('Available',sim.documents.filter(x=>x.status==='AVAILABLE').length,'Ready to view')}${stat('Retention classes',new Set(sim.documents.map(x=>x.retention)).size,'Mapped')}</section><section class="card"><div class="section-title"><h2>Document registry</h2><button class="button compact">Upload simulation metadata</button></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Document</th><th>Category</th><th>Status</th><th>Retention</th><th>Action</th></tr></thead><tbody>${sim.documents.map(d=>`<tr><td><code>${d.id}</code></td><td><strong>${escapeHtml(d.name)}</strong></td><td>${d.category}</td><td>${badge(d.status)}</td><td>${d.retention}</td><td><button class="button compact secondary" data-document="${d.id}">View metadata</button></td></tr>`).join('')}</tbody></table></div></section>`;
}

function renderCertificates() {
  workspace.innerHTML = `<section class="grid grid-3">${sim.certificates.map(c=>`<article class="card"><div class="section-title"><h2>${escapeHtml(c.title)}</h2>${badge(c.status)}</div><p><strong>Certificate ID:</strong> ${c.id}</p><p><strong>Issued:</strong> ${c.issued?dateLabel(c.issued):'Pending completion'}</p><button class="button compact secondary" ${c.status!=='EARNED'?'disabled':''}>View certificate</button></article>`).join('')}</section>`;
}

function renderSystem() {
  workspace.innerHTML = `<section class="grid grid-4">${stat('Release',sim.system.release,'Current build')}${stat('Environment',sim.system.environment,'No live providers')}${stat('Healthy services',`${sim.system.services.filter(x=>x.status==='HEALTHY').length}/${sim.system.services.length}`,'Adapter health')}${stat('Audit mode',sim.system.auditMode,'Event model')}</section><section class="grid grid-2"><article class="card"><div class="section-title"><h2>Service health</h2>${badge('ONLINE')}</div>${systemList()}</article><article class="card"><div class="section-title"><h2>Architecture boundaries</h2>${badge('PRODUCTION CONTRACT')}</div><div class="key-value"><b>Browser</b><span>Interface and deterministic simulation only</span></div><div class="key-value"><b>Identity</b><span>Production requires Entra token validation and server authorization</span></div><div class="key-value"><b>Storage</b><span>Production requires encrypted durable data and document stores</span></div><div class="key-value"><b>AI</b><span>Production provider calls must use server-issued sessions and human review controls</span></div><div class="key-value"><b>Audit</b><span>Production events require immutable storage and retention enforcement</span></div></article></section>`;
}

function systemList() {
  return `<div class="list">${sim.system.services.map(s=>`<div class="system-service"><div><strong>${escapeHtml(s.name)}</strong><small>${s.latencyMs?`${s.latencyMs} ms`:'No live call'}</small></div>${badge(s.status)}</div>`).join('')}</div>`;
}

function renderSupport() {
  workspace.innerHTML = `<section class="grid grid-4">${stat('Open tickets',sim.support.openTickets,'Current profile')}${stat('Support channels',sim.support.channels.length,'Available')}${stat('Knowledge base','24/7','Simulation access')}${stat('Accessibility support','Available','Dedicated channel')}</section><section class="grid grid-2"><article class="card"><div class="section-title"><h2>Support tickets</h2><button class="button compact" id="new-ticket">New ticket</button></div><div class="list">${sim.support.tickets.map(t=>`<div class="list-row"><div><strong>${escapeHtml(t.subject)}</strong><small>${t.id} · Owner: ${t.owner}</small></div>${badge(t.status)}</div>`).join('')}</div></article><article class="card"><div class="section-title"><h2>Support channels</h2>${badge('AVAILABLE')}</div><div class="list">${sim.support.channels.map(c=>`<div class="list-row"><strong>${escapeHtml(c)}</strong><button class="button compact secondary">Open</button></div>`).join('')}</div></article></section>`;
}

function renderClinicalQueue() {
  const items = sim.assignments.filter(a=>a.review!=='FACULTY_REVIEWED');
  workspace.innerHTML = `<section class="grid grid-3">${stat('Clinical review queue',sim.admin.facultyQueues.clinicalReviews,'Human review')}${stat('Grade review queue',sim.admin.facultyQueues.gradeReviews,'Human review')}${stat('Persona steward','Assigned','Clinical Officer')}</section><section class="card"><div class="section-title"><h2>Educational artifact review</h2>${badge('HUMAN AUTHORITY')}</div><div class="list">${items.map(a=>`<div class="list-row"><div><strong>${escapeHtml(a.title)}</strong><small>${a.course} · ${a.id}</small></div><div class="row-actions">${badge(a.review)}<button class="button compact" data-review="${a.id}">Review</button></div></div>`).join('')}</div></section>`;
}

function renderAcademicRecords() {
  workspace.innerHTML = `<section class="callout info"><strong>Read-only auditor facing.</strong><p>Records shown here are simulated evidence and do not represent accredited transcripts or verified credentials.</p></section><section class="card"><div class="section-title"><h2>Academic record</h2>${badge('READ ONLY')}</div>${gradeTable()}</section><section class="card"><div class="section-title"><h2>Completion evidence</h2>${badge('SIMULATION')}</div><div class="key-value"><b>Student ID</b><span>${sim.learner.studentId}</span></div><div class="key-value"><b>Program</b><span>${sim.learner.program}</span></div><div class="key-value"><b>Term</b><span>${sim.learner.term}</span></div><div class="key-value"><b>Credits attempted</b><span>${sim.learner.creditsAttempted}</span></div><div class="key-value"><b>Credits completed</b><span>${sim.learner.creditsCompleted}</span></div></section>`;
}

function renderAPIExplorer() {
  const example = `POST /v1/enrollment/submit\n{\n  "applicant_name": "Demo Learner",\n  "email": "learner@example.invalid",\n  "program_id": "GGH-DISTANCE-LEARNING",\n  "payment_reference": "provider-ref-only"\n}`;
  workspace.innerHTML = `<section class="grid grid-4">${stat('API version','1.0.0','OpenAPI 3.0.3')}${stat('Auth','OAuth 2.0','Server validated')}${stat('Environment','Simulation','No live side effects')}${stat('Audit','Required','Correlation IDs')}</section><section class="grid grid-2"><article class="card"><div class="section-title"><h2>Enrollment endpoint</h2>${badge('CONTRACT')}</div><div class="code-panel">${escapeHtml(example)}</div></article><article class="card"><div class="section-title"><h2>Response simulation</h2>${badge('200')}</div><div class="code-panel">${escapeHtml(JSON.stringify({status:'SIMULATED_SUCCESS',enrollment_id:enrollment.enrollmentId,access_granted:false,next_gate:'ADMIN_APPROVAL'},null,2))}</div></article></section>`;
}

function renderPersonaConfig() {
  workspace.innerHTML = `<section class="callout"><strong>Governance rule.</strong><p>Persona configuration changes require an authorized steward and human review. Runtime personas cannot independently create clinical determinations, grades, credentials, or employment decisions.</p></section><section class="grid grid-3">${spec.personas.map(p=>`<article class="card"><div class="section-title"><h2>${escapeHtml(p.displayName)}</h2>${badge('REVIEWED CONFIG')}</div><p><strong>ID:</strong> <code>${p.id}</code></p><p><strong>Steward:</strong> ${p.stewardRole}</p><div class="list">${p.functions.map(f=>`<div class="list-row"><span>${escapeHtml(f)}</span>${badge('ENABLED')}</div>`).join('')}</div><button class="button compact secondary" data-persona="${p.id}">Inspect policy</button></article>`).join('')}</section>`;
}

function renderAuditLogs() {
  const events = engine.auditEvents.slice().reverse();
  workspace.innerHTML = `<section class="grid grid-4">${stat('Events',events.length,'Session')}${stat('Mode',sim.system.auditMode,'Simulation')}${stat('Actor',actor(),'Current role')}${stat('Retention','Configured','Production policy')}</section><section class="card"><div class="section-title"><h2>Event stream</h2><button class="button compact" id="audit-export">Export JSON</button></div><div class="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Event ID</th></tr></thead><tbody>${events.map(e=>`<tr><td>${escapeHtml(e.occurredAt)}</td><td><strong>${escapeHtml(e.action)}</strong></td><td>${escapeHtml(e.actor)}</td><td><code>${escapeHtml(e.eventId)}</code></td></tr>`).join('')||'<tr><td colspan="4">No events yet.</td></tr>'}</tbody></table></div></section>`;
}

function renderExports() {
  const options = [['Session evidence','JSON','Audit and workflow events'],['Learner record','JSON','Demo learner profile and academic summary'],['Course gradebook','CSV','Current course grades'],['System snapshot','XHTML','Service health and environment'],['Document registry','CSV','Document metadata and retention classes']];
  workspace.innerHTML = `<section class="grid grid-3">${options.map(([name,fmt,desc])=>`<article class="card"><div class="section-title"><h2>${name}</h2><span class="pill info">${fmt}</span></div><p>${desc}</p><button class="button compact" data-export="${name}">Generate export</button></article>`).join('')}</section>`;
}

function renderTests() {
  const tests = [['Identifier engine','PASS'],['Learning workflow transitions','PASS'],['RBAC permission gates','PASS'],['OAuth PKCE syntax','PASS'],['Export manifest generation','PASS'],['PowerShell parser validation','PASS'],['Secret scanner','PASS'],['Accessibility manual review','SCHEDULED']];
  workspace.innerHTML = `<section class="grid grid-4">${stat('Automated suites',7,'Passing')}${stat('Manual reviews',1,'Scheduled')}${stat('Release',sim.system.release,'Candidate')}${stat('Environment',sim.system.environment,'Static simulation')}</section><section class="card"><div class="section-title"><h2>Release validation</h2><button class="button compact" id="rerun-tests">Run simulation</button></div><div class="table-wrap"><table><thead><tr><th>Suite</th><th>Status</th></tr></thead><tbody>${tests.map(([t,s])=>`<tr><td>${t}</td><td>${badge(s)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function renderMockPayments() {
  workspace.innerHTML = `<section class="callout info"><strong>Mock gateway only.</strong><p>No real payment method, card number, bank credential, or charge is collected or processed.</p></section><section class="grid grid-3">${stat('Gateway mode','MOCK','No external processor')}${stat('Last amount',money(0),'Simulation')}${stat('Workflow trigger','READY','Provider reference only')}</section><section class="card"><div class="section-title"><h2>Generate test event</h2>${badge('SAFE TEST')}</div><button class="button" id="mock-payment-event">Generate successful payment reference</button></section>`;
}

function renderTestCenter() {
  workspace.innerHTML = `<section class="grid grid-4">${stat('UI routes',NAV[role].length,'Role facing')}${stat('Simulation scenarios',sim.simulations.length,'Available')}${stat('Service adapters',sim.system.services.length,'Tracked')}${stat('Open defects',0,'Demo')}</section><section class="grid grid-2"><article class="card"><div class="section-title"><h2>QA suites</h2>${badge('READY')}</div><div class="list"><div class="list-row"><strong>Responsive navigation</strong>${badge('PASS')}</div><div class="list-row"><strong>Role-facing navigation</strong>${badge('PASS')}</div><div class="list-row"><strong>Workflow permissions</strong>${badge('PASS')}</div><div class="list-row"><strong>Export generation</strong>${badge('PASS')}</div><div class="list-row"><strong>AI safety disclosure</strong>${badge('PASS')}</div></div></article><article class="card"><div class="section-title"><h2>Test actions</h2>${badge('SIMULATION')}</div><button class="button" id="test-routes">Exercise routes</button><button class="button secondary" id="test-workflow" style="margin-left:8px">Exercise workflow</button></article></section>`;
}

function renderView() {
  setPageCopy();
  renderNav();
  const renderers = {
    Dashboard:renderDashboard,Stream:renderStream,Courses:renderCourses,Academics:renderAcademics,Classwork:renderClasswork,Simulations:renderSimulations,Grades:renderGrades,Gradebook:renderGradebook,People:renderPeople,Enrollment:renderEnrollment,Finance:()=>renderFinance(false),Transactions:()=>renderFinance(false),'Identity & Access':renderIdentity,Compliance:renderCompliance,'Evidence Center':renderEvidence,Messages:renderMessages,Calendar:renderCalendar,Documents:renderDocuments,Billing:()=>renderFinance(true),Certificates:renderCertificates,System:renderSystem,Support:renderSupport,'Clinical Review Queue':renderClinicalQueue,'Academic Records':renderAcademicRecords,'API Explorer':renderAPIExplorer,'Persona Configuration':renderPersonaConfig,'Audit Logs':renderAuditLogs,Exports:renderExports,Tests:renderTests,'Test Center':renderTestCenter,'Mock Payments':renderMockPayments
  };
  (renderers[view] || renderDashboard)();
  bindDynamicActions();
  renderRightRail();
}

function renderRightRail() {
  $('#today-date').textContent = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date());
  $('#today-agenda').innerHTML = sim.calendar.slice(0,3).map(e=>`<div class="agenda-row"><strong>${escapeHtml(e.title)}</strong><small>${dateLabel(e.date)} · ${e.time}</small></div>`).join('');
  refreshEnrollment();
  const tasks = enrollment.tasks.filter(t=>t.status==='OPEN').slice(0,4);
  $('#rail-task-count').textContent = String(tasks.length);
  $('#rail-tasks').innerHTML = tasks.map(t=>`<div class="rail-task"><strong>${escapeHtml(t.label)}</strong><small>${escapeHtml(t.ownerRole)}</small></div>`).join('') || '<small>No open tasks.</small>';
  $('#rail-system-health').innerHTML = systemList();
}

function openDetail(title,html) {
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modal.showModal();
}

function runWorkflow(action) {
  try {
    if (action==='payment') enrollment = engine.recordPayment(enrollment.enrollmentId,{providerReference:`demo-${Date.now()}`,amount:0,currency:'USD',actor:actor(),role});
    if (action==='approve') enrollment = engine.approveEnrollment(enrollment.enrollmentId,{actor:actor(),role});
    if (action==='identity') enrollment = engine.recordIdentityProvisioned(enrollment.enrollmentId,{userPrincipalName:'demo.learner@condreroutlook626.onmicrosoft.com',objectId:`demo-${Date.now()}`,actor:actor(),role});
    if (action==='workspace') enrollment = engine.activateWorkspace(enrollment.enrollmentId,{workspaceId:`LMS-${Date.now()}`,personas:['TEACHING_ASSISTANT','DR_JENIFER_MARTIN_PHD'],actor:actor(),role});
    toast(`${action} workflow action recorded.`,'ok');
    renderView();
  } catch (error) { toast(error.message,'danger'); }
}

function bindDynamicActions() {
  document.querySelectorAll('[data-open-view]').forEach(btn=>btn.addEventListener('click',()=>{view=btn.dataset.openView;renderView();}));
  document.querySelectorAll('[data-course]').forEach(btn=>btn.addEventListener('click',()=>{
    const c=sim.courses.find(x=>x.id===btn.dataset.course);openDetail(c.title,`<p><strong>Course ID:</strong> ${c.id}</p><p><strong>Instructor:</strong> ${c.instructor}</p><p><strong>Progress:</strong> ${c.progress}%</p>${progress(c.progress)}<p><strong>Next activity:</strong> ${c.next}</p><p><strong>Meeting:</strong> ${c.meeting}</p>`);
  }));
  document.querySelectorAll('[data-assignment]').forEach(btn=>btn.addEventListener('click',()=>{
    const a=sim.assignments.find(x=>x.id===btn.dataset.assignment);openDetail(a.title,`<p><strong>Course:</strong> ${a.course}</p><p><strong>Due:</strong> ${dateLabel(a.due)}</p><p><strong>Status:</strong> ${a.status}</p><p><strong>Points:</strong> ${a.points}</p><p><strong>Review:</strong> ${a.review}</p>${role==='STUDENT'&&a.status!=='SUBMITTED'?'<button class="button" id="demo-submit">Record demo submission</button>':''}`);setTimeout(()=>$('#demo-submit')?.addEventListener('click',()=>{a.status='SUBMITTED';a.review='PENDING';engine.audit('ASSIGNMENT_SUBMITTED_SIMULATION',actor(),{assignmentId:a.id});modal.close();renderView();toast('Demo submission recorded.','ok');}),0);
  }));
  document.querySelectorAll('[data-simulation]').forEach(btn=>btn.addEventListener('click',()=>{const s=sim.simulations.find(x=>x.id===btn.dataset.simulation);openDetail(s.title,`<div class="callout info"><strong>Educational scenario only.</strong><p>${escapeHtml(s.description)}</p></div><p><strong>Level:</strong> ${s.level}</p><p><strong>Human review:</strong> Required</p><button class="button" id="open-sandbox-from-sim">Open supervised sandbox</button>`);setTimeout(()=>$('#open-sandbox-from-sim')?.addEventListener('click',()=>{modal.close();openAssist(s.title);}),0);}));
  document.querySelectorAll('[data-flow]').forEach(btn=>btn.addEventListener('click',()=>runWorkflow(btn.dataset.flow)));
  document.querySelectorAll('[data-message]').forEach(btn=>btn.addEventListener('click',()=>{const m=sim.messages.find(x=>x.id===btn.dataset.message);m.unread=false;openDetail(m.subject,`<p><strong>From:</strong> ${escapeHtml(m.from)}</p><p>${escapeHtml(m.preview)}</p><p class="callout">Message content is simulated.</p>`);renderNav();}));
  document.querySelectorAll('[data-document]').forEach(btn=>btn.addEventListener('click',()=>{const d=sim.documents.find(x=>x.id===btn.dataset.document);openDetail(d.name,`<div class="key-value"><b>Document ID</b><span>${d.id}</span></div><div class="key-value"><b>Category</b><span>${d.category}</span></div><div class="key-value"><b>Status</b><span>${d.status}</span></div><div class="key-value"><b>Retention class</b><span>${d.retention}</span></div><p class="callout info">This simulation exposes document metadata only, not sensitive file contents.</p>`);}));
  document.querySelectorAll('[data-review]').forEach(btn=>btn.addEventListener('click',()=>{const a=sim.assignments.find(x=>x.id===btn.dataset.review);openDetail(`Human review · ${a.title}`,`<p>Review rubric, learner artifact, and AI-generated formative notes. Final evaluation must be entered by an authorized human reviewer.</p><button class="button" id="mark-reviewed">Mark simulation reviewed</button>`);setTimeout(()=>$('#mark-reviewed')?.addEventListener('click',()=>{a.review='FACULTY_REVIEWED';engine.audit('HUMAN_REVIEW_RECORDED',actor(),{assignmentId:a.id});modal.close();renderView();toast('Human-review simulation recorded.','ok');}),0);}));
  document.querySelectorAll('[data-persona]').forEach(btn=>btn.addEventListener('click',()=>{const p=spec.personas.find(x=>x.id===btn.dataset.persona);openDetail(p.displayName,`<p><strong>Steward:</strong> ${p.stewardRole}</p><p><strong>Human review required:</strong> ${p.humanReviewRequired?'Yes':'No'}</p><p><strong>Functions:</strong></p><ul>${p.functions.map(f=>`<li>${escapeHtml(f)}</li>`).join('')}</ul>`);}));
  document.querySelectorAll('[data-export]').forEach(btn=>btn.addEventListener('click',()=>generateNamedExport(btn.dataset.export)));
  $('#evidence-export')?.addEventListener('click',()=>download(`ggh-evidence-${Date.now()}.json`,JSON.stringify({generatedAt:new Date().toISOString(),role,enrollment:engine.exportEvidence(),documents:sim.documents},null,2)));
  $('#audit-export')?.addEventListener('click',()=>download(`ggh-audit-${Date.now()}.json`,JSON.stringify(engine.auditEvents,null,2)));
  $('#stream-compose')?.addEventListener('click',()=>openDetail('Create simulation announcement','<p>This action demonstrates the faculty/admin announcement composer.</p><label>Announcement<textarea id="announcement-text" rows="4" style="width:100%"></textarea></label><button class="button" id="post-announcement">Post simulation</button>'));
  $('#new-ticket')?.addEventListener('click',()=>{sim.support.openTickets+=1;sim.support.tickets.push({id:`TKT-${Date.now()}`,subject:'New simulation support request',status:'OPEN',priority:'NORMAL',owner:'Support Persona'});engine.audit('SUPPORT_TICKET_CREATED',actor(),{});renderView();toast('Simulation support ticket created.','ok');});
  $('#mock-payment-event')?.addEventListener('click',()=>{engine.audit('MOCK_PAYMENT_EVENT',actor(),{providerReference:`mock-${Date.now()}`,amount:0});toast('Mock payment event generated; no money moved.','ok');});
  $('#rerun-tests')?.addEventListener('click',()=>{engine.audit('TEST_SUITE_SIMULATED',actor(),{result:'PASS'});toast('Simulation test suite passed.','ok');renderView();});
  $('#test-routes')?.addEventListener('click',()=>toast(`${NAV[role].length} role-facing routes validated.`,'ok'));
  $('#test-workflow')?.addEventListener('click',()=>toast('Workflow permission gates exercised in simulation.','ok'));
}

function generateNamedExport(name) {
  let content;
  if (name==='Course gradebook') content=['course,earned,possible,percent,letter',...sim.gradebook.map(g=>`"${g.course}",${g.earned},${g.possible},${g.percent},${g.letter}`)].join('\n');
  else if (name==='Document registry') content=['id,name,category,status,retention',...sim.documents.map(d=>`${d.id},"${d.name}",${d.category},${d.status},${d.retention}`)].join('\n');
  else content=JSON.stringify({name,generatedAt:new Date().toISOString(),role,learner:sim.learner,system:sim.system,audit:engine.auditEvents},null,2);
  download(`ggh-${name.toLowerCase().replaceAll(' ','-')}-${Date.now()}.${name.includes('gradebook')||name.includes('registry')?'csv':'json'}`,content,name.includes('gradebook')||name.includes('registry')?'text/csv':'application/json');
  engine.audit('EXPORT_GENERATED',actor(),{name});toast(`${name} export generated.`,'ok');
}

function openAssist(context='General learning support') {
  chatWindow.innerHTML = `<div class="chat-bubble assistant"><strong>Great Gray Horizon AI Assist</strong><br>Context: ${escapeHtml(context)}. I can provide study explanations, rubric-oriented formative feedback, navigation help, and administrative checklists. Human reviewers retain authority over consequential decisions.</div>`;
  chatInput.value='';
  assistModal.showModal();
}

function assistReply(prompt) {
  const text=prompt.toLowerCase();
  if (/diagnos|prescri|treat|medicat|emergency/.test(text)) return 'This educational sandbox cannot diagnose, prescribe, or direct treatment. For coursework, I can help compare concepts, identify what evidence a rubric asks for, or suggest questions to discuss with an authorized instructor.';
  if (/grade|score|pass|fail/.test(text)) return 'I can provide formative rubric feedback, but I cannot issue or change a final grade. A human instructor must review and approve academic evaluation.';
  if (/job|hire|fire|employee decision/.test(text)) return 'I can summarize workflow criteria and documentation requirements, but employment decisions require authorized human review.';
  if (/audit|compliance|evidence/.test(text)) return 'For an evidence package, organize the control objective, governing policy, responsible role, timestamped event evidence, document references, exceptions, remediation status, and reviewer approval.';
  if (/assignment|study|course|explain/.test(text)) return 'A useful study structure is: identify the learning objective, define the key concept in your own words, map it to the rubric, work through one example, then write a short reflection identifying what evidence supports your reasoning.';
  return 'I can help with course navigation, study planning, simulated workflow questions, policy checklists, and formative educational feedback. Tell me which module or task you are working on.';
}

function buildSearchIndex() {
  searchIndex=[
    ...sim.courses.map(x=>({type:'Course',title:x.title,detail:x.id,view:'Courses'})),
    ...sim.assignments.map(x=>({type:'Assignment',title:x.title,detail:x.course,view:'Classwork'})),
    ...sim.people.map(x=>({type:'Person',title:x.name,detail:x.role,view:'People'})),
    ...sim.documents.map(x=>({type:'Document',title:x.name,detail:x.category,view:'Documents'})),
    ...sim.messages.map(x=>({type:'Message',title:x.subject,detail:x.from,view:'Messages'})),
    ...sim.support.tickets.map(x=>({type:'Ticket',title:x.subject,detail:x.id,view:'Support'}))
  ];
}

function openSearch(query) {
  const q=String(query).trim().toLowerCase();
  if (!q) return;
  const hits=searchIndex.filter(x=>`${x.title} ${x.detail} ${x.type}`.toLowerCase().includes(q)).slice(0,12);
  openDetail(`Search · ${query}`,hits.length?`<div class="search-results">${hits.map((x,i)=>`<div class="search-result" data-search-index="${i}"><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.type)} · ${escapeHtml(x.detail)}</small></div>`).join('')}</div>`:'<div class="empty-state">No simulation records matched your search.</div>');
  setTimeout(()=>document.querySelectorAll('[data-search-index]').forEach((el,i)=>el.addEventListener('click',()=>{modal.close();view=hits[i].view;renderView();})),0);
}

async function initialize() {
  const [specResponse,simResponse]=await Promise.all([
    fetch('./data/program-spec.json',{cache:'no-store'}),
    fetch('./data/lms-simulation.json',{cache:'no-store'})
  ]);
  if (!specResponse.ok) throw new Error(`Unable to load program specification: ${specResponse.status}`);
  if (!simResponse.ok) throw new Error(`Unable to load LMS simulation data: ${simResponse.status}`);
  spec=await specResponse.json();sim=await simResponse.json();
  const persisted=loadLocalState();
  if (persisted.role && LEARNING_ROLES[persisted.role]) role=persisted.role;
  if (persisted.view && (NAV[role]||[]).some(([label])=>label===persisted.view)) view=persisted.view;
  registerDemoEnrollment();
  buildSearchIndex();

  roleSelect.innerHTML=Object.keys(LEARNING_ROLES).map(r=>`<option value="${r}">${escapeHtml((spec.roles?.[r]?.label||r).replaceAll('_',' '))}</option>`).join('');
  roleSelect.value=role;
  renderView();

  nav.addEventListener('click',e=>{const button=e.target.closest('[data-view]');if(!button)return;view=button.dataset.view;saveLocalState({role,view});renderView();$('#lms-sidebar').classList.remove('open');});
  roleSelect.addEventListener('change',()=>{role=roleSelect.value;view=(NAV[role]||[['Dashboard']])[0][0];saveLocalState({role,view});engine.audit('ROLE_FACING_CHANGED',actor(),{role});renderView();toast(`Switched to ${role.replaceAll('_',' ')} facing.`,'warn');});
  $('#mobile-nav-toggle').addEventListener('click',()=>$('#lms-sidebar').classList.toggle('open'));
  $('#global-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();openSearch(e.currentTarget.value);}});
  $('#quick-create').addEventListener('click',()=>openDetail('Quick actions',`<div class="grid grid-2"><button class="button secondary" data-quick="ticket">New support ticket</button><button class="button secondary" data-quick="export">Export evidence</button><button class="button secondary" data-quick="course">Open courses</button><button class="button secondary" data-quick="sandbox">Launch AI sandbox</button></div>`));
  $('#notifications-button').addEventListener('click',()=>openDetail('Notifications',announcementList(3)));
  $('#profile-button').addEventListener('click',()=>openDetail('Simulation session',`<div class="key-value"><b>Role</b><span>${role.replaceAll('_',' ')}</span></div><div class="key-value"><b>Environment</b><span>${sim.system.environment}</span></div><div class="key-value"><b>Release</b><span>${sim.system.release}</span></div><div class="key-value"><b>Actor</b><span>${actor()}</span></div>`));
  $('#launch-assist').addEventListener('click',()=>openAssist(view));
  $('#export-current-view').addEventListener('click',()=>generateNamedExport(`${view} view`));
  $('#send-chat').addEventListener('click',()=>{const prompt=chatInput.value.trim();if(!prompt)return;chatWindow.insertAdjacentHTML('beforeend',`<div class="chat-bubble user">${escapeHtml(prompt)}</div><div class="chat-bubble assistant">${escapeHtml(assistReply(prompt))}</div>`);chatInput.value='';chatWindow.scrollTop=chatWindow.scrollHeight;engine.audit('AI_ASSIST_SIMULATION',actor(),{view,category:'EDUCATIONAL'});});
  modal.addEventListener('click',e=>{const quick=e.target.dataset.quick;if(!quick)return;if(quick==='ticket'){modal.close();view='Support';renderView();}if(quick==='export'){modal.close();generateNamedExport('Session evidence');}if(quick==='course'){modal.close();view='Courses';renderView();}if(quick==='sandbox'){modal.close();openAssist(view);}});
}

initialize().catch(error=>{showAlert(error.message,'danger');console.error(error);});
