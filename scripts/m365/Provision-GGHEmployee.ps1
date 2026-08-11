#Requires -Version 7.2
<#+
.SYNOPSIS
Creates or updates a staged Microsoft Entra workforce identity, assigns Microsoft 365 licensing,
and adds approved group memberships using Azure CLI authenticated Microsoft Graph REST calls.

.DESCRIPTION
Designed for The Great Gray Horizon Counseling Center, powered by Ross Tax Pro Software Co.
The script consumes an approved JSON package exported by portal/onboarding-admin.html or direct
parameters. It avoids Microsoft.Graph PowerShell module assembly conflicts in Azure Cloud Shell.

No client secret, access token, or temporary password is written into the audit report. A generated
one-time password is displayed only in the current administrative console when a new account is
created. Run with -WhatIf before execution.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory = $false)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$InputFile,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId,

    [string]$TenantDomain,
    [string]$DisplayName,
    [string]$GivenName,
    [string]$Surname,
    [string]$Alias,
    [string]$EmployeeId,
    [string]$PersonalEmail,
    [string]$JobTitle,
    [string]$Department,
    [string]$ManagerUpn,
    [ValidatePattern('^[A-Za-z]{2}$')]
    [string]$UsageLocation = 'US',
    [string]$SkuPartNumber,
    [string[]]$GroupIds = @(),
    [string[]]$MailAliases = @(),
    [switch]$EnableOnCreate,
    [switch]$SkipExchange,
    [switch]$DisableLegacyMailProtocols,
    [ValidateRange(1, 60)]
    [int]$MailboxWaitMinutes = 20,
    [switch]$InstallMissingModules,
    [string]$AuditOutputPath = (Join-Path $PWD "ggh-m365-provisioning-$(Get-Date -Format 'yyyyMMdd-HHmmss').json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:AuditEvents = [System.Collections.Generic.List[object]]::new()

function Add-GGHAuditEvent {
    param(
        [Parameter(Mandatory)][string]$Action,
        [Parameter(Mandatory)][string]$Status,
        [hashtable]$Details = @{}
    )
    $script:AuditEvents.Add([ordered]@{
        eventId     = [guid]::NewGuid().Guid
        timestamp   = (Get-Date).ToUniversalTime().ToString('o')
        action      = $Action
        status      = $Status
        actor       = [Environment]::UserName
        workstation = [Environment]::MachineName
        details     = $Details
    })
}

function Invoke-GGHGraph {
    param(
        [Parameter(Mandatory)][ValidateSet('GET','POST','PATCH','PUT')][string]$Method,
        [Parameter(Mandatory)][string]$Uri,
        $Body = $null,
        [switch]$AllowConflict
    )

    $arguments = @(
        'rest',
        '--method', $Method.ToLowerInvariant(),
        '--url', $Uri,
        '--output', 'json',
        '--only-show-errors'
    )
    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 40 -Compress
        $arguments += @('--headers', 'Content-Type=application/json', '--body', $json)
    }

    $output = & az @arguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output -join "`n")
    if ($exitCode -ne 0) {
        if ($AllowConflict -and $text -match 'already exist|added object references already exist|Request_BadRequest') {
            return [ordered]@{ conflict = $true; message = $text }
        }
        throw "Microsoft Graph request failed: $Method $Uri`n$text"
    }
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return ($text | ConvertFrom-Json -Depth 50)
}

function New-GGHStrongTemporaryPassword {
    $upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    $lower = 'abcdefghijkmnopqrstuvwxyz'
    $digits = '23456789'
    $symbols = '!@#$%*-_+=?'
    $all = ($upper + $lower + $digits + $symbols).ToCharArray()
    $required = [System.Collections.Generic.List[char]]::new()
    $required.Add($upper[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($upper.Length)])
    $required.Add($lower[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($lower.Length)])
    $required.Add($digits[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($digits.Length)])
    $required.Add($symbols[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($symbols.Length)])
    while ($required.Count -lt 20) {
        $required.Add($all[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($all.Length)])
    }
    $array = $required.ToArray()
    for ($index = $array.Length - 1; $index -gt 0; $index--) {
        $swapIndex = [System.Security.Cryptography.RandomNumberGenerator]::GetInt32($index + 1)
        $temporary = $array[$index]
        $array[$index] = $array[$swapIndex]
        $array[$swapIndex] = $temporary
    }
    return -join $array
}

function Assert-GGHRequiredValue {
    param([string]$Name, $Value)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        throw "Required value '$Name' is missing."
    }
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI is required. Azure Cloud Shell already includes it.'
}

$account = az account show --output json --only-show-errors | ConvertFrom-Json
if (-not $account) { throw 'Azure CLI is not authenticated.' }
if ($account.tenantId -ne $TenantId) {
    throw "Azure CLI is authenticated to tenant $($account.tenantId), not requested tenant $TenantId."
}
Add-GGHAuditEvent -Action 'AZURE_CONTEXT_VALIDATED' -Status 'SUCCESS' -Details @{ tenantId = $account.tenantId; subscriptionId = $account.id }

$package = $null
if ($InputFile) {
    $package = Get-Content -Path $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 30
    Add-GGHAuditEvent -Action 'INPUT_PACKAGE_LOADED' -Status 'SUCCESS' -Details @{ inputFile = (Resolve-Path $InputFile).Path; packageId = $package.packageId }

    if ($package.status -ne 'APPROVED_FOR_IT_EXECUTION') {
        throw "Package status must be APPROVED_FOR_IT_EXECUTION. Current status: $($package.status)"
    }
    if ($package.allGatesComplete -ne $true) {
        throw 'The package does not show all approval and compliance gates as complete.'
    }

    if (-not $TenantDomain) { $TenantDomain = [string]$package.identity.tenantDomain }
    if (-not $DisplayName) { $DisplayName = [string]$package.identity.displayName }
    if (-not $GivenName) { $GivenName = [string]$package.identity.givenName }
    if (-not $Surname) { $Surname = [string]$package.identity.surname }
    if (-not $Alias) { $Alias = [string]$package.identity.alias }
    if (-not $EmployeeId) { $EmployeeId = [string]$package.candidate.employeeId }
    if (-not $PersonalEmail) { $PersonalEmail = [string]$package.candidate.personalEmail }
    if (-not $JobTitle) { $JobTitle = [string]$package.employment.jobTitle }
    if (-not $Department) { $Department = [string]$package.employment.department }
    if (-not $ManagerUpn) { $ManagerUpn = [string]$package.employment.managerUpn }
    if (-not $UsageLocation -or $UsageLocation -eq 'US') { $UsageLocation = [string]($package.identity.usageLocation ?? 'US') }
    if (-not $SkuPartNumber) { $SkuPartNumber = [string]$package.microsoft365.skuPartNumber }
    if ($GroupIds.Count -eq 0 -and $package.microsoft365.groupIds) { $GroupIds = @($package.microsoft365.groupIds) }
    if ($MailAliases.Count -eq 0 -and $package.microsoft365.mailAliases) { $MailAliases = @($package.microsoft365.mailAliases) }
    if (-not $PSBoundParameters.ContainsKey('EnableOnCreate') -and $package.identity.stagedAccount -eq $false) { $EnableOnCreate = $true }
    if (-not $PSBoundParameters.ContainsKey('SkipExchange') -and $package.microsoft365.configureExchange -eq $false) { $SkipExchange = $true }
}

foreach ($required in @{
    TenantDomain  = $TenantDomain
    DisplayName   = $DisplayName
    GivenName     = $GivenName
    Surname       = $Surname
    Alias         = $Alias
    EmployeeId    = $EmployeeId
    JobTitle      = $JobTitle
    Department    = $Department
    UsageLocation = $UsageLocation
}.GetEnumerator()) {
    Assert-GGHRequiredValue -Name $required.Key -Value $required.Value
}

$Alias = $Alias.Trim().ToLowerInvariant()
$TenantDomain = $TenantDomain.Trim().ToLowerInvariant()
$UsageLocation = $UsageLocation.Trim().ToUpperInvariant()
if ($Alias -notmatch '^[a-z0-9][a-z0-9._-]{0,63}$') { throw 'Alias contains unsupported characters.' }
if ($TenantDomain -notmatch '^[a-z0-9.-]+\.[a-z]{2,}$') { throw 'TenantDomain is not a valid DNS domain name.' }
if ($UsageLocation -notmatch '^[A-Z]{2}$') { throw 'UsageLocation must be a two-letter country code.' }
$UserPrincipalName = "$Alias@$TenantDomain"

$domains = Invoke-GGHGraph -Method GET -Uri 'https://graph.microsoft.com/v1.0/domains?$select=id,isVerified,isDefault'
$verifiedDomain = @($domains.value | Where-Object { $_.id -eq $TenantDomain -and $_.isVerified -eq $true }) | Select-Object -First 1
if (-not $verifiedDomain) { throw "Domain '$TenantDomain' is not verified in the connected Microsoft Entra tenant." }
Add-GGHAuditEvent -Action 'TENANT_DOMAIN_VERIFIED' -Status 'SUCCESS' -Details @{ tenantDomain = $TenantDomain }

$escapedUpn = $UserPrincipalName.Replace("'", "''")
$encodedFilter = [uri]::EscapeDataString("userPrincipalName eq '$escapedUpn'")
$userResponse = Invoke-GGHGraph -Method GET -Uri "https://graph.microsoft.com/v1.0/users?`$filter=$encodedFilter&`$select=id,displayName,userPrincipalName,accountEnabled,employeeId,assignedLicenses"
$user = @($userResponse.value) | Select-Object -First 1
$temporaryPassword = $null
$userStatus = 'EXISTING'

if ($user) {
    if ($user.employeeId -and $user.employeeId -ne $EmployeeId) {
        throw "UPN '$UserPrincipalName' already belongs to a different Employee ID."
    }
    $updateBody = [ordered]@{
        displayName   = $DisplayName
        givenName     = $GivenName
        surname       = $Surname
        usageLocation = $UsageLocation
        employeeId    = $EmployeeId
        jobTitle      = $JobTitle
        department    = $Department
    }
    if ($PersonalEmail) { $updateBody.otherMails = @($PersonalEmail) }
    if ($PSCmdlet.ShouldProcess($UserPrincipalName, 'Update Microsoft Entra workforce identity')) {
        Invoke-GGHGraph -Method PATCH -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)" -Body $updateBody | Out-Null
        $userStatus = 'UPDATED'
        Add-GGHAuditEvent -Action 'ENTRA_USER_UPDATED' -Status 'SUCCESS' -Details @{ objectId = $user.id; upn = $UserPrincipalName; employeeId = $EmployeeId }
    }
} else {
    $temporaryPassword = New-GGHStrongTemporaryPassword
    $userBody = [ordered]@{
        accountEnabled    = [bool]$EnableOnCreate
        displayName       = $DisplayName
        givenName         = $GivenName
        surname           = $Surname
        mailNickname      = $Alias
        userPrincipalName = $UserPrincipalName
        usageLocation     = $UsageLocation
        employeeId        = $EmployeeId
        jobTitle          = $JobTitle
        department        = $Department
        passwordProfile   = [ordered]@{
            password = $temporaryPassword
            forceChangePasswordNextSignIn = $true
        }
    }
    if ($PersonalEmail) { $userBody.otherMails = @($PersonalEmail) }

    if ($PSCmdlet.ShouldProcess($UserPrincipalName, "Create Microsoft Entra user (enabled=$([bool]$EnableOnCreate))")) {
        $user = Invoke-GGHGraph -Method POST -Uri 'https://graph.microsoft.com/v1.0/users' -Body $userBody
        $userStatus = 'CREATED'
        Add-GGHAuditEvent -Action 'ENTRA_USER_CREATED' -Status 'SUCCESS' -Details @{ objectId = $user.id; upn = $UserPrincipalName; accountEnabled = [bool]$EnableOnCreate; employeeId = $EmployeeId }
        Write-Warning 'A one-time temporary password was generated. Deliver it only through an approved secure channel. It is excluded from the audit file.'
        Write-Host "ONE-TIME TEMPORARY PASSWORD FOR ${UserPrincipalName}: $temporaryPassword" -ForegroundColor Yellow
    }
}

if (-not $user -or -not $user.id) {
    throw 'No Entra user object is available. The operation may have been skipped by -WhatIf.'
}

if ($ManagerUpn) {
    $managerEncoded = [uri]::EscapeDataString($ManagerUpn)
    $manager = Invoke-GGHGraph -Method GET -Uri "https://graph.microsoft.com/v1.0/users/$managerEncoded?`$select=id,userPrincipalName"
    if ($manager -and $PSCmdlet.ShouldProcess($UserPrincipalName, "Assign manager $ManagerUpn")) {
        Invoke-GGHGraph -Method PUT -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)/manager/`$ref" -Body ([ordered]@{
            '@odata.id' = "https://graph.microsoft.com/v1.0/users/$($manager.id)"
        }) | Out-Null
        Add-GGHAuditEvent -Action 'MANAGER_ASSIGNED' -Status 'SUCCESS' -Details @{ managerUpn = $ManagerUpn; managerId = $manager.id }
    }
}

$licenseAssigned = $false
$assignedSku = $null
if ($SkuPartNumber) {
    $skuResponse = Invoke-GGHGraph -Method GET -Uri 'https://graph.microsoft.com/v1.0/subscribedSkus?$select=skuId,skuPartNumber,capabilityStatus,consumedUnits,prepaidUnits,servicePlans'
    $sku = @($skuResponse.value | Where-Object { $_.skuPartNumber -eq $SkuPartNumber }) | Select-Object -First 1
    if (-not $sku) { throw "Microsoft 365 SKU '$SkuPartNumber' is not available in the connected tenant." }
    $enabledUnits = [int]($sku.prepaidUnits.enabled ?? 0)
    $consumedUnits = [int]($sku.consumedUnits ?? 0)
    if (($enabledUnits - $consumedUnits) -le 0) { throw "Microsoft 365 SKU '$SkuPartNumber' has no available units." }

    if ($PSCmdlet.ShouldProcess($UserPrincipalName, "Assign Microsoft 365 license $SkuPartNumber")) {
        Invoke-GGHGraph -Method POST -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)/assignLicense" -Body ([ordered]@{
            addLicenses = @([ordered]@{ skuId = $sku.skuId })
            removeLicenses = @()
        }) | Out-Null
        $licenseAssigned = $true
        $assignedSku = [ordered]@{ skuPartNumber = $sku.skuPartNumber; skuId = $sku.skuId }
        Add-GGHAuditEvent -Action 'M365_LICENSE_ASSIGNED' -Status 'SUCCESS' -Details @{ skuPartNumber = $sku.skuPartNumber; skuId = $sku.skuId }
    }
}

$groupResults = [System.Collections.Generic.List[object]]::new()
foreach ($groupId in @($GroupIds | Where-Object { $_ })) {
    if ($groupId -notmatch '^[0-9a-fA-F-]{36}$') { throw "Group ID '$groupId' is not a GUID." }
    if ($PSCmdlet.ShouldProcess($UserPrincipalName, "Add user to group $groupId")) {
        $groupResult = Invoke-GGHGraph -Method POST -Uri "https://graph.microsoft.com/v1.0/groups/$groupId/members/`$ref" -Body ([ordered]@{
            '@odata.id' = "https://graph.microsoft.com/v1.0/directoryObjects/$($user.id)"
        }) -AllowConflict
        if ($groupResult -and $groupResult.conflict) {
            $groupResults.Add([ordered]@{ groupId = $groupId; status = 'ALREADY_MEMBER' })
            Add-GGHAuditEvent -Action 'GROUP_MEMBERSHIP_ASSIGNED' -Status 'NO_CHANGE' -Details @{ groupId = $groupId; reason = 'Already a member' }
        } else {
            $groupResults.Add([ordered]@{ groupId = $groupId; status = 'ADDED' })
            Add-GGHAuditEvent -Action 'GROUP_MEMBERSHIP_ASSIGNED' -Status 'SUCCESS' -Details @{ groupId = $groupId; userId = $user.id }
        }
    }
}

$mailboxStatus = 'SKIPPED'
if (-not $SkipExchange) {
    if (-not $SkuPartNumber) {
        $mailboxStatus = 'LICENSE_REQUIRED'
        Add-GGHAuditEvent -Action 'EXCHANGE_MAILBOX_STATUS' -Status 'BLOCKED' -Details @{ reason = 'No Exchange-capable SKU was supplied.' }
    } elseif ($licenseAssigned) {
        $mailboxStatus = 'LICENSE_ASSIGNED_PENDING_MICROSOFT_PROVISIONING'
        Add-GGHAuditEvent -Action 'EXCHANGE_MAILBOX_STATUS' -Status 'PENDING' -Details @{ skuPartNumber = $SkuPartNumber; waitGuidanceMinutes = $MailboxWaitMinutes }
    } else {
        $mailboxStatus = 'EXISTING_LICENSE_REVIEW_REQUIRED'
    }
}

if ($MailAliases.Count -gt 0) {
    Add-GGHAuditEvent -Action 'MAIL_ALIASES_DEFERRED' -Status 'PENDING' -Details @{ aliases = @($MailAliases); reason = 'Exchange Online mailbox administration must occur after mailbox provisioning through an approved Exchange administrative session.' }
}
if ($DisableLegacyMailProtocols) {
    Add-GGHAuditEvent -Action 'LEGACY_MAIL_PROTOCOL_CONTROL_DEFERRED' -Status 'PENDING' -Details @{ reason = 'Apply through Exchange Online after mailbox provisioning.' }
}

$verifiedUser = Invoke-GGHGraph -Method GET -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)?`$select=id,displayName,userPrincipalName,accountEnabled,employeeId,jobTitle,department,assignedLicenses"

$result = [ordered]@{
    schemaVersion            = 2
    completedAt              = (Get-Date).ToUniversalTime().ToString('o')
    collectionMethod         = 'Azure CLI az rest to Microsoft Graph'
    tenantId                 = $TenantId
    tenantDomain             = $TenantDomain
    userObjectId             = $verifiedUser.id
    userPrincipalName        = $verifiedUser.userPrincipalName
    employeeId               = $verifiedUser.employeeId
    userStatus               = $userStatus
    accountEnabled           = $verifiedUser.accountEnabled
    stagedAccount            = -not [bool]$verifiedUser.accountEnabled
    skuPartNumber            = $SkuPartNumber
    assignedSku              = $assignedSku
    licenseAssigned          = $licenseAssigned
    groupAssignments         = @($groupResults)
    mailboxStatus            = $mailboxStatus
    deferredMailAliases      = @($MailAliases)
    auditEvents              = $script:AuditEvents
    temporaryPasswordInAudit = $false
    controls                 = [ordered]@{
        graphPowerShellModulesUsed = $false
        clientSecretUsed = $false
        accessTokenWritten = $false
        temporaryPasswordWritten = $false
        exchangePostProvisioningRequired = (-not $SkipExchange)
    }
}

$result | ConvertTo-Json -Depth 30 | Set-Content -Path $AuditOutputPath -Encoding UTF8
Write-Host "Provisioning audit written to: $AuditOutputPath" -ForegroundColor Green
$result | ConvertTo-Json -Depth 30
