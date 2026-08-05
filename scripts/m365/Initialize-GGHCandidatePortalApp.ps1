#Requires -Version 7.2
<#+
.SYNOPSIS
Creates or updates the Microsoft Entra application registration and enterprise application instance
for the Great Gray Horizon Candidate Access Portal.

.DESCRIPTION
Uses Azure CLI authenticated Microsoft Graph REST calls to avoid Microsoft.Graph PowerShell module
assembly collisions in Azure Cloud Shell. The application is a public SPA using OAuth 2.0 authorization
code flow with PKCE. No client secret is created or required.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId = 'eb6c9e4e-0943-4ada-b473-fbafda77eb27',

    [string]$DisplayName = 'Great Gray Horizon Candidate Access Portal',

    [ValidateSet('AzureADMyOrg','AzureADMultipleOrgs','AzureADandPersonalMicrosoftAccount')]
    [string]$SignInAudience = 'AzureADandPersonalMicrosoftAccount',

    [string[]]$RedirectUris = @(
        'http://localhost:8080/portal/candidate-access.html',
        'https://great-gray-horizon.pages.dev/candidate-access.html',
        'https://ceortpsc.github.io/ourgray/candidate-access.html'
    ),

    [string]$ConfigPath = './portal/data/candidate-access-config.json',
    [switch]$SkipConfigUpdate,
    [string]$OutputPath = './ggh-candidate-portal-app-registration.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Invoke-GGHGraph {
    param(
        [Parameter(Mandatory)][ValidateSet('GET','POST','PATCH')][string]$Method,
        [Parameter(Mandatory)][string]$Uri,
        $Body = $null
    )
    $arguments = @('rest','--method',$Method.ToLowerInvariant(),'--url',$Uri,'--output','json','--only-show-errors')
    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 30 -Compress
        $arguments += @('--headers','Content-Type=application/json','--body',$json)
    }
    $raw = & az @arguments
    if ($LASTEXITCODE -ne 0) { throw "Microsoft Graph request failed: $Method $Uri" }
    if ([string]::IsNullOrWhiteSpace(($raw -join "`n"))) { return $null }
    return (($raw -join "`n") | ConvertFrom-Json -Depth 50)
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI is required.'
}

$account = az account show --output json --only-show-errors | ConvertFrom-Json
if (-not $account) { throw 'Azure CLI is not authenticated.' }
if ($account.tenantId -ne $TenantId) {
    throw "Azure CLI is authenticated to tenant $($account.tenantId), not requested tenant $TenantId."
}

$normalizedRedirects = @($RedirectUris | ForEach-Object { ([uri]$_).AbsoluteUri.TrimEnd('/') } | Sort-Object -Unique)
if ($normalizedRedirects.Count -eq 0) { throw 'At least one redirect URI is required.' }

$escapedName = $DisplayName.Replace("'", "''")
$filter = [uri]::EscapeDataString("displayName eq '$escapedName'")
$existingResponse = Invoke-GGHGraph -Method GET -Uri "https://graph.microsoft.com/v1.0/applications?`$filter=$filter&`$select=id,appId,displayName,signInAudience,spa,appRoles"
$application = @($existingResponse.value) | Select-Object -First 1

$appRoles = @(
    [ordered]@{
        allowedMemberTypes = @('User')
        description = 'Candidate applicant access to the candidate application portal.'
        displayName = 'Candidate Applicant'
        id = '3e6176bd-5b84-4fb3-9b50-d38af3047e94'
        isEnabled = $true
        origin = 'Application'
        value = 'CandidateApplicant'
    },
    [ordered]@{
        allowedMemberTypes = @('User')
        description = 'Employer candidate operations administration and review access.'
        displayName = 'Candidate Operations Administrator'
        id = '8d5215ca-8759-47db-8ce8-d2011d0fbd13'
        isEnabled = $true
        origin = 'Application'
        value = 'CandidateOperationsAdmin'
    }
)

$applicationBody = [ordered]@{
    displayName = $DisplayName
    signInAudience = $SignInAudience
    spa = [ordered]@{
        redirectUris = $normalizedRedirects
    }
    api = [ordered]@{
        requestedAccessTokenVersion = 2
    }
    optionalClaims = [ordered]@{
        idToken = @(
            [ordered]@{ name = 'email'; essential = $false; additionalProperties = @() },
            [ordered]@{ name = 'preferred_username'; essential = $false; additionalProperties = @() }
        )
    }
    appRoles = $appRoles
    requiredResourceAccess = @(
        [ordered]@{
            resourceAppId = '00000003-0000-0000-c000-000000000000'
            resourceAccess = @(
                [ordered]@{
                    id = 'e1fe6dd8-ba31-4d61-89e7-88639da4683d'
                    type = 'Scope'
                }
            )
        }
    )
    notes = 'Ross Tax Pro Software Co. candidate access SPA. OAuth2 authorization code with PKCE. No client secret.'
}

$action = if ($application) { 'Update application registration' } else { 'Create application registration' }
if ($PSCmdlet.ShouldProcess($DisplayName, $action)) {
    if ($application) {
        Invoke-GGHGraph -Method PATCH -Uri "https://graph.microsoft.com/v1.0/applications/$($application.id)" -Body $applicationBody | Out-Null
        $application = Invoke-GGHGraph -Method GET -Uri "https://graph.microsoft.com/v1.0/applications/$($application.id)?`$select=id,appId,displayName,signInAudience,spa,appRoles"
        $registrationStatus = 'UPDATED'
    } else {
        $application = Invoke-GGHGraph -Method POST -Uri 'https://graph.microsoft.com/v1.0/applications' -Body $applicationBody
        $registrationStatus = 'CREATED'
    }
} else {
    $registrationStatus = 'WHATIF'
}

if (-not $application) {
    throw 'No application object is available. The operation may have been skipped by -WhatIf.'
}

$spFilter = [uri]::EscapeDataString("appId eq '$($application.appId)'")
$spResponse = Invoke-GGHGraph -Method GET -Uri "https://graph.microsoft.com/v1.0/servicePrincipals?`$filter=$spFilter&`$select=id,appId,displayName,accountEnabled,appRoleAssignmentRequired"
$servicePrincipal = @($spResponse.value) | Select-Object -First 1
if (-not $servicePrincipal -and $PSCmdlet.ShouldProcess($DisplayName, 'Create enterprise application service principal')) {
    $servicePrincipal = Invoke-GGHGraph -Method POST -Uri 'https://graph.microsoft.com/v1.0/servicePrincipals' -Body ([ordered]@{
        appId = $application.appId
        accountEnabled = $true
        appRoleAssignmentRequired = $false
        tags = @('WindowsAzureActiveDirectoryIntegratedApp')
    })
    $servicePrincipalStatus = 'CREATED'
} elseif ($servicePrincipal) {
    $servicePrincipalStatus = 'EXISTING'
} else {
    $servicePrincipalStatus = 'WHATIF'
}

if (-not $SkipConfigUpdate -and $PSCmdlet.ShouldProcess($ConfigPath, 'Write OAuth client ID and tenant configuration')) {
    if (-not (Test-Path $ConfigPath -PathType Leaf)) { throw "Configuration file not found: $ConfigPath" }
    $config = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 30
    $config.clientId = $application.appId
    $config.tenantId = $TenantId
    $config.authorityMode = if ($SignInAudience -eq 'AzureADMyOrg') { 'tenant' } else { 'common' }
    $config.oauthEnabled = $true
    $config | ConvertTo-Json -Depth 30 | Set-Content -Path $ConfigPath -Encoding UTF8
}

$result = [ordered]@{
    schemaVersion = 1
    completedAt = (Get-Date).ToUniversalTime().ToString('o')
    tenantId = $TenantId
    displayName = $application.displayName
    applicationObjectId = $application.id
    clientId = $application.appId
    signInAudience = $application.signInAudience
    redirectUris = @($application.spa.redirectUris)
    registrationStatus = $registrationStatus
    servicePrincipalObjectId = $servicePrincipal.id
    servicePrincipalStatus = $servicePrincipalStatus
    appRoles = @($appRoles | Select-Object displayName,value,id)
    configPath = if ($SkipConfigUpdate) { $null } else { $ConfigPath }
    secretCreated = $false
    oauthFlow = 'Authorization code with PKCE'
    controls = [ordered]@{
        publicClient = $true
        clientSecretRequired = $false
        serverValidationRequiredForProtectedResources = $true
    }
}

$result | ConvertTo-Json -Depth 30 | Set-Content -Path $OutputPath -Encoding UTF8
Write-Host "Candidate portal application registration report: $OutputPath" -ForegroundColor Green
Write-Host "Client ID: $($application.appId)" -ForegroundColor Green
Write-Host 'Redirect URIs:' -ForegroundColor Cyan
$application.spa.redirectUris | ForEach-Object { Write-Host " - $_" }
Write-Host 'Review portal/data/candidate-access-config.json, then commit the generated client ID without adding secrets.' -ForegroundColor Yellow
$result | ConvertTo-Json -Depth 30
