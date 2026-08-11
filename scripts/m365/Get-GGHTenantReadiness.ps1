#Requires -Version 7.2
<#+
.SYNOPSIS
Inspects Microsoft Entra ID and Microsoft 365 readiness for Great Gray Horizon employee onboarding.

.DESCRIPTION
Returns verified tenant domains, users, groups, applications, devices, subscribed SKUs, license capacity,
and Exchange-capable SKU signals. The script is read-only.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId = 'eb6c9e4e-0943-4ada-b473-fbafda77eb27',

    [switch]$InstallMissingModules,
    [string]$OutputPath = (Join-Path $PWD "ggh-tenant-readiness-$(Get-Date -Format 'yyyyMMdd-HHmmss').json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Assert-GGHModule {
    param([Parameter(Mandatory)][string]$Name)
    if (-not (Get-Module -ListAvailable -Name $Name)) {
        if (-not $InstallMissingModules) {
            throw "Required module '$Name' is not installed. Install it first or rerun with -InstallMissingModules."
        }
        Install-Module -Name $Name -Scope CurrentUser -Repository PSGallery -Force -AllowClobber
    }
    Import-Module $Name -ErrorAction Stop
}

Assert-GGHModule -Name 'Microsoft.Graph.Authentication'
Assert-GGHModule -Name 'Microsoft.Graph.Identity.DirectoryManagement'
Assert-GGHModule -Name 'Microsoft.Graph.Users'
Assert-GGHModule -Name 'Microsoft.Graph.Groups'
Assert-GGHModule -Name 'Microsoft.Graph.Applications'
Assert-GGHModule -Name 'Microsoft.Graph.Identity.DirectoryManagement'

$scopes = @(
    'Organization.Read.All',
    'Domain.Read.All',
    'Directory.Read.All',
    'User.Read.All',
    'Group.Read.All',
    'Application.Read.All',
    'Device.Read.All'
)
Connect-MgGraph -TenantId $TenantId -Scopes $scopes -NoWelcome
$context = Get-MgContext
if (-not $context -or $context.TenantId -ne $TenantId) {
    throw 'Microsoft Graph connection did not resolve to the requested tenant.'
}

$organization = Get-MgOrganization | Select-Object -First 1
$domains = @(Get-MgDomain -All | Select-Object Id,IsDefault,IsInitial,IsVerified,AuthenticationType)
$users = @(Get-MgUser -All -Property Id,DisplayName,UserPrincipalName,AccountEnabled,AssignedLicenses,EmployeeId)
$groups = @(Get-MgGroup -All -Property Id,DisplayName,MailEnabled,SecurityEnabled,GroupTypes)
$applications = @(Get-MgApplication -All -Property Id,AppId,DisplayName,SignInAudience)
$devices = @(Get-MgDevice -All -Property Id,DisplayName,AccountEnabled,OperatingSystem,TrustType,ApproximateLastSignInDateTime)
$skus = @(Get-MgSubscribedSku -All)

$skuRows = foreach ($sku in $skus) {
    $enabled = [int]$sku.PrepaidUnits.Enabled
    $consumed = [int]$sku.ConsumedUnits
    [ordered]@{
        skuId = $sku.SkuId
        skuPartNumber = $sku.SkuPartNumber
        capabilityStatus = $sku.CapabilityStatus
        enabledUnits = $enabled
        consumedUnits = $consumed
        availableUnits = [math]::Max(0, $enabled - $consumed)
        servicePlans = @($sku.ServicePlans | ForEach-Object {
            [ordered]@{
                servicePlanName = $_.ServicePlanName
                servicePlanId = $_.ServicePlanId
                provisioningStatus = $_.ProvisioningStatus
                appliesTo = $_.AppliesTo
            }
        })
    }
}

$exchangePlans = @(
    'EXCHANGE_S_STANDARD',
    'EXCHANGE_S_ENTERPRISE',
    'EXCHANGE_S_DESKLESS',
    'EXCHANGE_L_STANDARD',
    'EXCHANGE_S_ARCHIVE'
)
$exchangeCapableSkus = @($skuRows | Where-Object {
    @($_.servicePlans.servicePlanName | Where-Object { $exchangePlans -contains $_ }).Count -gt 0
})

$result = [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    tenant = [ordered]@{
        tenantId = $context.TenantId
        displayName = $organization.DisplayName
        primaryDomain = ($domains | Where-Object IsDefault | Select-Object -ExpandProperty Id -First 1)
        verifiedDomains = @($domains | Where-Object IsVerified | Select-Object -ExpandProperty Id)
        technicalNotificationMails = @($organization.TechnicalNotificationMails)
    }
    inventory = [ordered]@{
        users = $users.Count
        enabledUsers = @($users | Where-Object AccountEnabled).Count
        groups = $groups.Count
        applications = $applications.Count
        devices = $devices.Count
        subscribedSkus = $skus.Count
    }
    exchangeOnline = [ordered]@{
        exchangeCapableSkuCount = $exchangeCapableSkus.Count
        exchangeCapableSkus = @($exchangeCapableSkus | Select-Object skuId,skuPartNumber,availableUnits,capabilityStatus)
        mailboxProvisioningReady = @($exchangeCapableSkus | Where-Object { $_.availableUnits -gt 0 -and $_.capabilityStatus -eq 'Enabled' }).Count -gt 0
    }
    subscribedSkus = $skuRows
    groups = @($groups | Select-Object Id,DisplayName,MailEnabled,SecurityEnabled,GroupTypes)
    applications = @($applications | Select-Object Id,AppId,DisplayName,SignInAudience)
    devices = @($devices | Select-Object Id,DisplayName,AccountEnabled,OperatingSystem,TrustType,ApproximateLastSignInDateTime)
    controls = [ordered]@{
        readOnlyInspection = $true
        noSecretsWritten = $true
        generatedBy = [Environment]::UserName
        workstation = [Environment]::MachineName
    }
}

$result | ConvertTo-Json -Depth 30 | Set-Content -Path $OutputPath -Encoding UTF8
Write-Host "Tenant readiness report written to: $OutputPath" -ForegroundColor Green
$result | ConvertTo-Json -Depth 30
Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
