# Great Gray Horizon Microsoft Entra ID and Microsoft 365 Onboarding Runbook

**Parent corporation:** Ross Tax Pro Software Co.  
**Program:** The Great Gray Horizon Counseling Center  
**Directory:** Default Directory  
**Tenant ID:** `eb6c9e4e-0943-4ada-b473-fbafda77eb27`  
**Primary domain:** `condreroutlook626.onmicrosoft.com`  
**Current tenant summary:** Microsoft Entra ID Free; 1 user; 0 groups; 1 application; device count not supplied.

## Important license boundary

Microsoft Entra ID Free supports cloud directory identities. A normal Outlook/Exchange Online user mailbox requires an Exchange-capable Microsoft 365 or Exchange Online license. The portal therefore defaults to:

1. create a disabled staged Entra identity;
2. leave the Microsoft 365 SKU blank;
3. disable Exchange mailbox configuration;
4. activate mailbox provisioning only after an eligible subscription is purchased and a license is available.

Do not enter passwords, client secrets, access tokens, certificate private keys or employee documents into GitHub, browser source code or exported onboarding JSON.

## Files

- `Get-GGHTenantReadiness.ps1` — read-only inventory and license-capacity report.
- `Initialize-GGHTenantAccessGroups.ps1` — creates baseline static security groups.
- `Provision-GGHEmployee.ps1` — creates/updates a staged identity, assigns a license when supplied, assigns groups and configures Exchange after mailbox provisioning.
- `Enable-GGHEmployeeAccess.ps1` — day-one account activation after package approval and date checks.
- `portal/onboarding-admin.html` — employer-facing RBAC administration interface.

## Administrator prerequisites

- PowerShell 7.2 or later.
- An authorized Microsoft Entra account in the correct tenant.
- Microsoft Graph and Exchange administrative roles appropriate to the requested actions.
- Approved onboarding package exported from the portal.
- A verified Microsoft 365 domain.
- Available Exchange-capable license before Outlook mailbox issuance.

## Full setup and execution command block

Run from the repository root in PowerShell 7. Use `-WhatIf` for every write operation first.

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$TenantId     = 'eb6c9e4e-0943-4ada-b473-fbafda77eb27'
$TenantDomain = 'condreroutlook626.onmicrosoft.com'
$RepoRoot     = (Get-Location).Path

# -----------------------------------------------------------------------------
# 1. Trust and module preparation
# -----------------------------------------------------------------------------
Set-PSRepository -Name PSGallery -InstallationPolicy Trusted

$Modules = @(
    'Microsoft.Graph.Authentication',
    'Microsoft.Graph.Users',
    'Microsoft.Graph.Users.Actions',
    'Microsoft.Graph.Groups',
    'Microsoft.Graph.Applications',
    'Microsoft.Graph.Identity.DirectoryManagement',
    'ExchangeOnlineManagement'
)

foreach ($Module in $Modules) {
    if (-not (Get-Module -ListAvailable -Name $Module)) {
        Install-Module -Name $Module -Scope CurrentUser -Repository PSGallery -Force -AllowClobber
    }
}

# -----------------------------------------------------------------------------
# 2. Read-only tenant readiness and license inventory
# -----------------------------------------------------------------------------
pwsh "$RepoRoot/scripts/m365/Get-GGHTenantReadiness.ps1" `
    -TenantId $TenantId `
    -OutputPath "$RepoRoot/ggh-tenant-readiness.json"

$Readiness = Get-Content "$RepoRoot/ggh-tenant-readiness.json" -Raw | ConvertFrom-Json
$Readiness.tenant | Format-List
$Readiness.inventory | Format-List
$Readiness.exchangeOnline | Format-List
$Readiness.subscribedSkus | Format-Table skuPartNumber, capabilityStatus, enabledUnits, consumedUnits, availableUnits

# Stop here when mailboxProvisioningReady is False. The Entra identity can still
# be staged, but a normal Outlook user mailbox is not ready for issuance.

# -----------------------------------------------------------------------------
# 3. Create the baseline static security groups (tenant currently reports 0)
# -----------------------------------------------------------------------------
pwsh "$RepoRoot/scripts/m365/Initialize-GGHTenantAccessGroups.ps1" `
    -TenantId $TenantId `
    -WhatIf

# After reviewing the WhatIf output:
pwsh "$RepoRoot/scripts/m365/Initialize-GGHTenantAccessGroups.ps1" `
    -TenantId $TenantId `
    -Confirm:$false `
    -OutputPath "$RepoRoot/ggh-access-groups.json"

$Groups = Get-Content "$RepoRoot/ggh-access-groups.json" -Raw | ConvertFrom-Json
$Groups.groups | Format-Table displayName, id, status

# Copy the approved group IDs into the Employer Onboarding Admin interface.

# -----------------------------------------------------------------------------
# 4. Start the portal and prepare the approved onboarding package
# -----------------------------------------------------------------------------
python -m http.server 8080
# Open: http://localhost:8080/portal/onboarding-admin.html
# Complete the approval gates, issue the Employee ID, stage the package,
# approve it for IT execution and export the JSON file.

# Example exported package filename:
$InputFile = "$RepoRoot/ggh-onboarding-jennifer-martin-approved.json"

# -----------------------------------------------------------------------------
# 5. Validate and simulate staged Entra identity creation
# -----------------------------------------------------------------------------
pwsh "$RepoRoot/scripts/m365/Provision-GGHEmployee.ps1" `
    -InputFile $InputFile `
    -TenantId $TenantId `
    -SkipExchange `
    -WhatIf

# -----------------------------------------------------------------------------
# 6. Execute staged identity creation without Outlook mailbox provisioning
#    Appropriate for the current Entra ID Free / no Exchange SKU state.
# -----------------------------------------------------------------------------
pwsh "$RepoRoot/scripts/m365/Provision-GGHEmployee.ps1" `
    -InputFile $InputFile `
    -TenantId $TenantId `
    -SkipExchange `
    -Confirm:$false `
    -AuditOutputPath "$RepoRoot/ggh-jennifer-provisioning-audit.json"

# The script creates a disabled Entra identity by default and outputs a one-time
# temporary password only to the current administrative console. Deliver it
# through an approved secure channel. It is not written into the audit JSON.

# -----------------------------------------------------------------------------
# 7. Outlook / Microsoft 365 license step - run only after acquiring a license
# -----------------------------------------------------------------------------
# First rerun readiness inspection and choose a real tenant SKU part number with
# availableUnits greater than zero and an Exchange service plan.
pwsh "$RepoRoot/scripts/m365/Get-GGHTenantReadiness.ps1" `
    -TenantId $TenantId `
    -OutputPath "$RepoRoot/ggh-tenant-readiness-after-license.json"

$LicensedReadiness = Get-Content "$RepoRoot/ggh-tenant-readiness-after-license.json" -Raw | ConvertFrom-Json
$LicensedReadiness.exchangeOnline.exchangeCapableSkus | Format-Table skuPartNumber, availableUnits, capabilityStatus

# Enter the verified SKU part number in the onboarding package, enable Exchange
# configuration in the portal, reapprove and export a new package. Then rerun:
pwsh "$RepoRoot/scripts/m365/Provision-GGHEmployee.ps1" `
    -InputFile $InputFile `
    -TenantId $TenantId `
    -Confirm:$false `
    -MailboxWaitMinutes 30 `
    -DisableLegacyMailProtocols `
    -AuditOutputPath "$RepoRoot/ggh-jennifer-mailbox-audit.json"

# -----------------------------------------------------------------------------
# 8. Day-one access activation after every gate and effective-date check
# -----------------------------------------------------------------------------
pwsh "$RepoRoot/scripts/m365/Enable-GGHEmployeeAccess.ps1" `
    -InputFile $InputFile `
    -TenantId $TenantId `
    -WhatIf

# After review:
pwsh "$RepoRoot/scripts/m365/Enable-GGHEmployeeAccess.ps1" `
    -InputFile $InputFile `
    -TenantId $TenantId `
    -Confirm:$false `
    -AuditOutputPath "$RepoRoot/ggh-jennifer-access-activation-audit.json"
```

## Direct parameter example without a portal package

The package-based method is preferred because it preserves approval status, Employee ID, roles and audit context. For controlled testing only:

```powershell
pwsh ./scripts/m365/Provision-GGHEmployee.ps1 `
  -TenantId 'eb6c9e4e-0943-4ada-b473-fbafda77eb27' `
  -TenantDomain 'condreroutlook626.onmicrosoft.com' `
  -DisplayName 'Jennifer Martin' `
  -GivenName 'Jennifer' `
  -Surname 'Martin' `
  -Alias 'jennifer.martin' `
  -EmployeeId '<ISSUED-GGH-EMP-ID>' `
  -PersonalEmail 'Jmartin@thesolastagroup.org' `
  -JobTitle 'Chief Clinical & Program Development Officer' `
  -Department 'Clinical Programs' `
  -UsageLocation 'US' `
  -SkipExchange `
  -WhatIf
```

## RBAC separation

- HR issues the Employee ID, stages the package and records business approvals.
- Executive may approve compensation, title, equity and all high-risk onboarding gates.
- IT Administrator executes Entra ID, license, group and account-status operations.
- Compliance and Ethics roles review but do not autonomously provision identities.
- Auditor and Records Manager receive read/export access but no Microsoft tenant write authority.
- Candidate has no tenant administration permission.

## Failure and rollback expectations

- A failed identity creation must not be retried with a different UPN until the existing-object check is completed.
- A failed license assignment leaves the identity staged and disabled.
- A missing Exchange license keeps mailbox status pending or skipped.
- Group assignment failures must be resolved before day-one activation when the group represents required platform access.
- Activation must stop when the package is not approved, gates are incomplete, Employee ID mismatches, or the effective date is in the future.
- Offboarding must disable the Entra account, revoke sessions, remove group entitlements and preserve audit evidence through the designated retention file.
