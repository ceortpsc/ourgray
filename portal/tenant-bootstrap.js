const TENANT_PROFILE_URL = './data/tenant-profile.json';

function setValue(form, name, value) {
  const field = form.elements[name];
  if (!field || value === null || value === undefined) return;
  field.value = value;
}

function renderTenantSummary(profile) {
  const target = document.querySelector('#tenant-summary');
  if (!target) return;
  const devices = profile.inventory.devices === null ? 'Not supplied' : profile.inventory.devices;
  target.innerHTML = `
    <div class="card tenant-card"><strong>${profile.directoryName}</strong><span>Directory</span></div>
    <div class="card tenant-card"><strong class="mono">${profile.tenantId}</strong><span>Tenant ID</span></div>
    <div class="card tenant-card"><strong>${profile.primaryDomain}</strong><span>Primary domain</span></div>
    <div class="card tenant-card"><strong>${profile.entraLicense}</strong><span>Current identity license</span></div>
    <div class="card tenant-card"><strong>${profile.inventory.users}</strong><span>Users</span></div>
    <div class="card tenant-card"><strong>${profile.inventory.groups}</strong><span>Groups</span></div>
    <div class="card tenant-card"><strong>${profile.inventory.applications}</strong><span>Applications</span></div>
    <div class="card tenant-card"><strong>${devices}</strong><span>Devices</span></div>`;

  const capability = document.querySelector('#tenant-capability-notice');
  if (capability) {
    capability.innerHTML = `
      <div class="alert-warn"><b>Identity-only tenant state:</b> Microsoft Entra ID Free supports directory identities, but an Exchange-capable Microsoft 365 or Exchange Online license must be added before a normal Outlook user mailbox can be issued. The onboarding package therefore defaults to staged identity creation with Exchange configuration disabled.</div>`;
  }
}

async function applyTenantProfile() {
  const response = await fetch(TENANT_PROFILE_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load tenant profile: ${response.status}`);
  const profile = await response.json();
  const form = document.querySelector('#provisioning-form');
  if (!form) return;

  renderTenantSummary(profile);
  setValue(form, 'tenantId', profile.tenantId);
  setValue(form, 'tenantDomain', profile.primaryDomain);

  if (!form.elements.skuPartNumber.value || form.elements.skuPartNumber.value === 'SPE_E3') {
    form.elements.skuPartNumber.value = '';
  }
  form.elements.configureExchange.checked = false;

  for (const name of ['tenantId', 'tenantDomain', 'skuPartNumber', 'configureExchange']) {
    form.elements[name]?.dispatchEvent(new Event('input', { bubbles: true }));
    form.elements[name]?.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

window.addEventListener('load', () => {
  window.setTimeout(() => applyTenantProfile().catch(error => {
    console.error(error);
    const notice = document.querySelector('#tenant-capability-notice');
    if (notice) notice.innerHTML = `<div class="alert-danger">${error.message}</div>`;
  }), 75);
});
