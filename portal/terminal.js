const output = document.querySelector('#terminal-output');
const form = document.querySelector('#terminal-form');
const input = document.querySelector('#terminal-input');
const profileSelect = document.querySelector('#environment-profile');
const environmentDescription = document.querySelector('#environment-description');
const environmentDetails = document.querySelector('#environment-details');
const environmentBadge = document.querySelector('#environment-badge');
const terminalPrompt = document.querySelector('#terminal-prompt');
const terminalContext = document.querySelector('#terminal-context');
const commandReference = document.querySelector('#command-reference-grid');
const bootstrapCommand = document.querySelector('#bootstrap-command');
const toastRegion = document.querySelector('#toast-region');

let config;
let lms;
let profile = 'simulation';
const history = [];
let historyIndex = 0;

const COMMANDS = Object.freeze({
  help: 'Show supported commands',
  clear: 'Clear the terminal output',
  env: 'Show active environment configuration',
  status: 'Show LMS and service status',
  routes: 'List application routes',
  services: 'List simulated platform adapters',
  version: 'Show application release and runtime requirements',
  whoami: 'Show active virtual terminal identity',
  install: 'Show the real dependency installation plan',
  configure: 'Persist the selected browser environment profile',
  test: 'Show the repository validation command',
  start: 'Show the local portal launch command',
  cloudflare: 'Show the Cloudflare preview deployment command',
  security: 'Show terminal execution boundaries'
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function line(text = '', tone = '') {
  const row = document.createElement('div');
  row.className = `terminal-line ${tone}`.trim();
  row.textContent = text;
  output.append(row);
  output.scrollTop = output.scrollHeight;
}

function toast(message) {
  const item = document.createElement('div');
  item.className = 'toast-item';
  item.textContent = message;
  toastRegion.append(item);
  setTimeout(() => item.remove(), 3000);
}

function currentProfile() {
  return config.profiles[profile] || config.profiles.simulation;
}

function commandPlan() {
  return [
    'git clone https://github.com/ceortpsc/ourgray.git',
    'cd ourgray',
    'git checkout feature/ggh-candidate-portal-v3',
    config.commands.powershellBootstrap
  ].join('\n');
}

function renderProfile() {
  const selected = currentProfile();
  environmentDescription.textContent = selected.description;
  environmentBadge.textContent = selected.label.toUpperCase();
  environmentBadge.className = `badge ${profile === 'simulation' ? 'warn' : 'ok'}`;
  terminalPrompt.textContent = `ggh@${profile}:~$`;
  terminalContext.textContent = `${profile}@ggh:/portal`;
  environmentDetails.innerHTML = [
    ['Application', config.application],
    ['Release', config.release],
    ['Node', config.runtime.node],
    ['Package manager', config.runtime.packageManager],
    ['Port', config.runtime.portalPort],
    ['Live providers', selected.liveProviders ? 'YES' : 'NO'],
    ['Shell mode', config.security.browserTerminalMode]
  ].map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('');
  bootstrapCommand.textContent = commandPlan();
}

function renderReference() {
  commandReference.innerHTML = Object.entries(COMMANDS)
    .map(([command, description]) => `<div class="command-chip"><code>${escapeHtml(command)}</code><p>${escapeHtml(description)}</p></div>`)
    .join('');
}

function showHelp() {
  line('Supported commands:', 'success');
  Object.entries(COMMANDS).forEach(([command, description]) => line(`  ${command.padEnd(12)} ${description}`));
}

function showEnvironment() {
  const selected = currentProfile();
  line(`profile=${profile}`, 'success');
  line(`label=${selected.label}`);
  line(`release=${config.release}`);
  line(`node=${config.runtime.node}`);
  line(`package_manager=${config.runtime.packageManager}`);
  line(`portal_port=${config.runtime.portalPort}`);
  line(`portal_directory=${config.runtime.portalDirectory}`);
  line(`entry_point=${config.runtime.entryPoint}`);
  line(`live_providers=${selected.liveProviders}`);
}

function showStatus() {
  line(`application: ${config.application}`, 'success');
  line(`environment: ${lms.system.environment}`);
  line(`release: ${lms.system.release}`);
  line(`audit mode: ${lms.system.auditMode}`);
  lms.system.services.forEach(service => {
    const tone = service.status === 'HEALTHY' ? 'success' : 'warn';
    line(`${service.name.padEnd(24)} ${service.status.padEnd(12)} ${service.latencyMs}ms`, tone);
  });
}

function showRoutes() {
  config.routes.forEach(route => line(route, 'success'));
}

function showServices() {
  lms.system.services.forEach(service => line(`${service.name}: ${service.status}`));
}

function showVersion() {
  line(`Great Gray Horizon LMS ${config.release}`, 'success');
  line(`Node requirement: ${config.runtime.node}`);
  line(`Package manager: ${config.runtime.packageManager}`);
}

function showInstall() {
  line('Real installation is performed outside the browser terminal.', 'warn');
  line(config.commands.install, 'success');
  line(`Recommended bootstrap: ${config.commands.powershellBootstrap}`, 'success');
}

function configure() {
  localStorage.setItem('ggh.environment.profile', profile);
  line(`Environment profile saved: ${profile}`, 'success');
  line('Browser configuration updated. No operating-system settings were changed.', 'warn');
}

function showSecurity() {
  line(`browser_terminal=${config.security.browserTerminalMode}`, 'success');
  line(`arbitrary_shell_execution=${config.security.arbitraryShellExecution}`);
  line(`secrets_in_browser=${config.security.secretsInBrowser}`);
  line(`secrets_in_repository=${config.security.secretsInRepository}`);
  line(`production_authorization=${config.security.productionAuthorization}`);
}

function execute(rawCommand) {
  const command = String(rawCommand || '').trim();
  if (!command) return;
  history.push(command);
  historyIndex = history.length;
  line(`${terminalPrompt.textContent} ${command}`, 'command');

  const [name] = command.toLowerCase().split(/\s+/);
  switch (name) {
    case 'help': showHelp(); break;
    case 'clear': output.innerHTML = ''; break;
    case 'env': showEnvironment(); break;
    case 'status': showStatus(); break;
    case 'routes': showRoutes(); break;
    case 'services': showServices(); break;
    case 'version': showVersion(); break;
    case 'whoami': line(`virtual-user=${profile}@ggh`, 'success'); break;
    case 'install': showInstall(); break;
    case 'configure': configure(); break;
    case 'test': line(config.commands.test, 'success'); break;
    case 'start':
      line('Run this in an authenticated terminal:', 'warn');
      line(config.commands.serve, 'success');
      line(`Then open /${config.runtime.entryPoint}`);
      break;
    case 'cloudflare':
      line('Preview deployment command:', 'warn');
      line(config.commands.cloudflarePreview, 'success');
      break;
    case 'security': showSecurity(); break;
    default:
      line(`Command not available: ${name}`, 'error');
      line('This embedded console accepts only allow-listed virtual commands. Type help.', 'muted');
  }
}

function downloadPlan() {
  const payload = {
    generatedAt: new Date().toISOString(),
    profile,
    environment: currentProfile(),
    runtime: config.runtime,
    commands: config.commands,
    routes: config.routes,
    security: config.security
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ggh-environment-plan-${profile}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function initialize() {
  const [configResponse, lmsResponse] = await Promise.all([
    fetch('./data/environment-config.json', { cache: 'no-store' }),
    fetch('./data/lms-simulation.json', { cache: 'no-store' })
  ]);
  if (!configResponse.ok) throw new Error(`Unable to load environment config: ${configResponse.status}`);
  if (!lmsResponse.ok) throw new Error(`Unable to load LMS status: ${lmsResponse.status}`);
  config = await configResponse.json();
  lms = await lmsResponse.json();

  profile = localStorage.getItem('ggh.environment.profile') || 'simulation';
  if (!config.profiles[profile]) profile = 'simulation';

  profileSelect.innerHTML = Object.entries(config.profiles)
    .map(([key, value]) => `<option value="${escapeHtml(key)}">${escapeHtml(value.label)}</option>`)
    .join('');
  profileSelect.value = profile;
  renderProfile();
  renderReference();

  line('Great Gray Horizon integrated terminal initialized.', 'success');
  line('Mode: safe virtual shell. Arbitrary OS execution is disabled.', 'warn');
  line('Type help to list supported commands.', 'muted');

  profileSelect.addEventListener('change', () => {
    profile = profileSelect.value;
    renderProfile();
    execute('configure');
  });

  document.querySelectorAll('[data-command]').forEach(button => {
    button.addEventListener('click', () => execute(button.dataset.command));
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    execute(input.value);
    input.value = '';
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] || '';
    } else if (event.key === 'ArrowDown' && history.length) {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] || '';
    }
  });

  document.querySelector('#copy-bootstrap').addEventListener('click', async () => {
    await navigator.clipboard.writeText(commandPlan());
    toast('Bootstrap command copied.');
  });

  document.querySelector('#download-plan').addEventListener('click', downloadPlan);
  input.focus();
}

initialize().catch(error => {
  line(`Initialization failed: ${error.message}`, 'error');
});
