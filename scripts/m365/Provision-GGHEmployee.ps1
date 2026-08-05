#Requires -Version 7.2
<#+
.SYNOPSIS
Creates a staged or active Microsoft Entra ID workforce account, assigns Microsoft 365 licensing,
adds approved group-based platform access, and configures the Exchange Online mailbox.

.DESCRIPTION
Designed for The Great Gray Horizon Counseling Center, powered by Ross Tax Pro Software Co.
The script accepts a JSON package exported by portal/onboarding-admin.html or direct parameters.
It does not store credentials, client secrets, access tokens, or temporary passwords in source control.

Run only from an authorized administrative workstation. Use -WhatIf first.
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
        [Parameter(Mandatory)] [string]$Action,
        [Parameter(Mandatory)] [string]$Status,
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

function Assert-GGHModule {
    param([Parameter(Mandatory)][string]$Name)
    if (-not (Get-Module -ListAvailable -Name $Name)) {
        if (-not $InstallMissingModules) {
            throw "Required PowerShell module '$Name' is not installed. Install it first or rerun with -InstallMissingModules."
        }
        Write-Host "Installing $Name from PowerShell Gallery..." -ForegroundColor Yellow
        Install-Module -Name $Name -Scope CurrentUser -Repository PSGallery -Force -AllowClobber
    }
    Import-Module $Name -ErrorAction Stop
}

function New-GGHStrongTemporaryPassword {
    $upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    $lower = 'abcdefghijkmnopqrstuvwxyz'
    $digits = '23456789'
    $symbols = '!@#$%*-_+=?'
    $all = ($upper + $lower + $digits + $symbols).ToCharArray()
    $required = @(
        $upper[(Get-Random -Maximum $upper.Length)]
        $lower[(Get-Random -Maximum $lower.Length)]
        $digits[(Get-Random -Maximum $digits.Length)]
        $symbols[(Get-Random -Maximum $symbols.Length)]
    )
    $remaining = 16 - $required.Count
    $characters = $required + (1..$remaining | ForEach-Object { $all[(Get-Random -Maximum $all.Length)] })
    return -join ($characters | Sort-Object { Get-Random })
}

function Get-GGHResolvedValue {
    param(
        [string]$ParameterName,
        $DirectValue,
        $PackageValue,
        $Fallback = $null
    )
    if ($PSBoundParameters.ContainsKey($ParameterName) -and $null -ne $DirectValue -and "$DirectValue" -ne '') {
        return $DirectValue
    }
    if ($null -ne $PackageValue -and "$PackageValue" -ne '') {
        return $PackageValue
    }
    return $Fallback
}

function Assert-GGHRequiredValue {
    param([string]$Name, $Value)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        throw "Required value '$Name' is missing."
    }
}

$package = $null
if ($InputFile) {
    $package = Get-Content -Path $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 20
    Add-GGHAuditEvent -Action 'INPUT_PACKAGE_LOADED' -Status 'SUCCESS' -Details @{ inputFile = (Resolve-Path $InputFile).Path; packageId = $package.packageId }
}

$TenantDomain = Get-GGHResolvedValue -ParameterName 'TenantDomain' -DirectValue $TenantDomain -PackageValue $package.identity.tenantDomain
$DisplayName = Get-GGHResolvedValue -ParameterName 'DisplayName' -DirectValue $DisplayName -PackageValue $package.identity.displayName
$GivenName = Get-GGHResolvedValue -ParameterName 'GivenName' -DirectValue $GivenName -PackageValue $package.identity.givenName
$Surname = Get-GGHResolvedValue -ParameterName 'Surname' -DirectValue $Surname -PackageValue $package.identity.surname
$Alias = Get-GGHResolvedValue -ParameterName 'Alias' -DirectValue $Alias -PackageValue $package.identity.alias
$EmployeeId = Get-GGHResolvedValue -ParameterName 'EmployeeId' -DirectValue $EmployeeId -PackageValue $package.candidate.employeeId
$PersonalEmail = Get-GGHResolvedValue -ParameterName 'PersonalEmail' -DirectValue $PersonalEmail -PackageValue $package.candidate.personalEmail
$JobTitle = Get-GGHResolvedValue -ParameterName 'JobTitle' -DirectValue $JobTitle -PackageValue $package.employment.jobTitle
$Department = Get-GGHResolvedValue -ParameterName 'Department' -DirectValue $Department -PackageValue $package.employment.department
$ManagerUpn = Get-GGHResolvedValue -ParameterName 'ManagerUpn' -DirectValue $ManagerUpn -PackageValue $package.employment.managerUpn
$UsageLocation = (Get-GGHResolvedValue -ParameterName 'UsageLocation' -DirectValue $UsageLocation -PackageValue $package.identity.usageLocation -Fallback 'US').ToUpperInvariant()
$SkuPartNumber = Get-GGHResolvedValue -ParameterName 'SkuPartNumber' -DirectValue $SkuPartNumber -PackageValue $package.microsoft365.skuPartNumber

if (-not $PSBoundParameters.ContainsKey('GroupIds') -and $package.microsoft365.groupIds) {
    $GroupIds = @($package.microsoft365.groupIds)
}
if (-not $PSBoundParameters.ContainsKey('MailAliases') -and $package.microsoft365.mailAliases) {
    $MailAliases = @($package.microsoft365.mailAliases)
}
if (-not $PSBoundParameters.ContainsKey('SkipExchange') -and $package.microsoft365.configureExchange -eq $false) {
    $SkipExchange = $true
}
if (-not $PSBoundParameters.ContainsKey('EnableOnCreate') -and $package.identity.stagedAccount -eq $false) {
    $EnableOnCreate = $true
}

foreach ($required in @{
    TenantDomain = $TenantDomain
    DisplayName = $DisplayName
    GivenName = $GivenName
    Surname = $Surname
    Alias = $Alias
    EmployeeId = $EmployeeId
    JobTitle = $JobTitle
    Department = $Department
    UsageLocation = $UsageLocation
}.GetEnumerator()) {
    Assert-GGHRequiredValue -Name $required.Key -Value $required.Value
}

if ($package) {
    if ($package.status -ne 'APPROVED_FOR_IT_EXECUTION') {
        throw "Package status must be APPROVED_FOR_IT_EXECUTION. Current status: $($package.status)"
    }
    if ($package.allGatesComplete -ne $true) {
        throw 'The package does not show all approval and compliance gates as complete.'
    }
}

$Alias = $Alias.Trim().ToLowerInvariant()
$TenantDomain = $TenantDomain.Trim().ToLowerInvariant()
if ($Alias -notmatch '^[a-z0-9][a-z0-9._-]{0,63}$') {
    throw 'Alias contains unsupported characters.'
}
if ($TenantDomain -notmatch '^[a-z0-9.-]+\.[a-z]{2,}$') {
    throw 'TenantDomain is not a valid DNS domain name.'
}
$UserPrincipalName = "$Alias@$TenantDomain"

Assert-GGHModule -Name 'Microsoft.Graph.Authentication'
Assert-GGHModule -Name 'Microsoft.Graph.Users'
Assert-GGHModule -Name 'Microsoft.Graph.Groups'
Assert-GGHModule -Name 'Microsoft.Graph.Users.Actions'
Assert-GGHModule -Name 'Microsoft.Graph.Identity.DirectoryManagement'
if (-not $SkipExchange) {
    Assert-GGHModule -Name 'ExchangeOnlineManagement'
}

$graphScopes = @(
    'User.ReadWrite.All',
    'User.EnableDisableAccount.All',
    'GroupMember.ReadWrite.All',
    'Directory.ReadWrite.All',
    'Organization.Read.All',
    'LicenseAssignment.ReadWrite.All',
    'Domain.Read.All'
)

Connect-MgGraph -TenantId $TenantId -Scopes $graphScopes -NoWelcome
$context = Get-MgContext
if (-not $context -or $context.TenantId -ne $TenantId) {
    throw 'Microsoft Graph connection did not resolve to the requested tenant.'
}
Add-GGHAuditEvent -Action 'GRAPH_CONNECTED' -Status 'SUCCESS' -Details @{ tenantId = $context.TenantId; account = $context.Account; authType = $context.AuthType }

$verifiedDomain = Get-MgDomain -All | Where-Object { $_.Id -eq $TenantDomain -and $_.IsVerified }
if (-not $verifiedDomain) {
    throw "Domain '$TenantDomain' is not verified in the connected Microsoft Entra tenant."
}
Add-GGHAuditEvent -Action 'TENANT_DOMAIN_VERIFIED' -Status 'SUCCESS' -Details @{ tenantDomain = $TenantDomain }

$filterUpn = $UserPrincipalName.Replace("'", "''")
$existingUser = Get-MgUser -Filter "userPrincipalName eq '$filterUpn'" -Property Id,DisplayName,UserPrincipalName,AccountEnabled,EmployeeId -ConsistencyLevel eventual | Select-Object -First 1
if ($existingUser) {
    if ($existingUser.EmployeeId -and $existingUser.EmployeeId -ne $EmployeeId) {
        throw "UPN '$UserPrincipalName' already belongs to a different Employee ID."
    }
    $user = $existingUser
    Add-GGHAuditEvent -Action 'ENTRA_USER_FOUND' -Status 'EXISTING' -Details @{ objectId = $user.Id; upn = $UserPrincipalName }
} else {
    $temporaryPassword = New-GGHStrongTemporaryPassword
    $passwordProfile = @{
        password = $temporaryPassword
        forceChangePasswordNextSignIn = $true
    }
    $userBody = @{
        accountEnabled = [bool]$EnableOnCreate
        displayName = $DisplayName
        givenName = $GivenName
        surname = $Surname
        mailNickname = $Alias
        userPrincipalName = $UserPrincipalName
        usageLocation = $UsageLocation
        employeeId = $EmployeeId
        jobTitle = $JobTitle
        department = $Department
        otherMails = @($PersonalEmail | Where-Object { $_ })
        passwordProfile = $passwordProfile
    }

    if ($PSCmdlet.ShouldProcess($UserPrincipalName, "Create Microsoft Entra user (enabled=$([bool]$EnableOnCreate))")) {
        $user = New-MgUser -BodyParameter $userBody
        Add-GGHAuditEvent -Action 'ENTRA_USER_CREATED' -Status 'SUCCESS' -Details @{ objectId = $user.Id; upn = $UserPrincipalName; accountEnabled = [bool]$EnableOnCreate; employeeId = $EmployeeId }
        Write-Warning 'A one-time temporary password was generated. Deliver it only through an approved secure channel; it is intentionally excluded from the audit file.'
        Write-Host "ONE-TIME TEMPORARY PASSWORD FOR $UserPrincipalName: $temporaryPassword" -ForegroundColor Yellow
    }
}

if (-not $user) {
    throw 'No Entra user object is available. The operation may have been skipped by -WhatIf.'
}

if ($ManagerUpn) {
    $manager = Get-MgUser -UserId $ManagerUpn -Property Id,UserPrincipalName
    $managerReference = @{ '@odata.id' = "https://graph.microsoft.com/v1.0/users/$($manager.Id)" }
    if ($PSCmdlet.ShouldProcess($UserPrincipalName, "Assign manager $ManagerUpn")) {
        Set-MgUserManagerByRef -UserId $user.Id -BodyParameter $managerReference
        Add-GGHAuditEvent -Action 'MANAGER_ASSIGNED' -Status 'SUCCESS' -Details @{ managerUpn = $ManagerUpn; managerId = $manager.Id }
    }
}

$licenseAssigned = $false
if ($SkuPartNumber) {
    $sku = Get-MgSubscribedSku -All | Where-Object { $_.SkuPartNumber -eq $SkuPartNumber } | Select-Object -First 1
    if (-not $sku) {
        throw "Microsoft 365 SKU '$SkuPartNumber' is not available in the connected tenant."
    }
    if ($PSCmdlet.ShouldProcess($UserPrincipalName, "Assign Microsoft 365 license $SkuPartNumber")) {
        Set-MgUserLicense -UserId $user.Id -AddLicenses @(@{ SkuId = $sku.SkuId }) -RemoveLicenses @() | Out-Null
        $licenseAssigned = $true
        Add-GGHAuditEvent -Action 'M365_LICENSE_ASSIGNED' -Status 'SUCCESS' -Details @{ skuPartNumber = $SkuPartNumber; skuId = $sku.SkuId }
    }
}

$groupResults = @()
foreach ($groupId in @($GroupIds | Where-Object { $_ })) {
    if ($groupId -notmatch '^[0-9a-fA-F-]{36}$') {
        throw "Group ID '$groupId' is not a GUID."
    }
    $reference = @{ '@odata.id' = "https://graph.microsoft.com/v1.0/directoryObjects/$($user.Id)" }
    try {
        if ($PSCmdlet.ShouldProcess($UserPrincipalName, "Add user to group $groupId")) {
            New-MgGroupMemberByRef -GroupId $groupId -BodyParameter $reference
            $groupResults += [ordered]@{ groupId = $groupId; status = 'ADDED' }
            Add-GGHAuditEvent -Action 'GROUP_MEMBERSHIP_ASSIGNED' -Status 'SUCCESS' -Details @{ groupId = $groupId; userId = $user.Id }
        }
    } catch {
        if ($_.Exception.Message -match 'already exist|added object references already exist|One or more added object references already exist') {
            $groupResults += [ordered]@{ groupId = $groupId; status = 'ALREADY_MEMBER' }
            Add-GGHAuditEvent -Action 'GROUP_MEMBERSHIP_ASSIGNED' -Status 'NO_CHANGE' -Details @{ groupId = $groupId; reason = 'Already a member' }
        } else {
            throw
        }
    }
}

$mailboxStatus = 'SKIPPED'
if (-not $SkipExchange -and ($licenseAssigned -or $existingUser)) {
    Connect-ExchangeOnline -ShowBanner:$false
    Add-GGHAuditEvent -Action 'EXCHANGE_CONNECTED' -Status 'SUCCESS' -Details @{ tenantDomain = $TenantDomain }

    $deadline = (Get-Date).AddMinutes($MailboxWaitMinutes)
    $mailbox = $null
    do {
        try {
            $mailbox = Get-EXOMailbox -Identity $UserPrincipalName -Properties DisplayName,EmailAddresses,Alias -ErrorAction Stop
        } catch {
            if ((Get-Date) -lt $deadline) {
                Start-Sleep -Seconds 30
            }
        }
    } while (-not $mailbox -and (Get-Date) -lt $deadline)

    if (-not $mailbox) {
        $mailboxStatus = 'PENDING_PROVISIONING'
        Add-GGHAuditEvent -Action 'EXCHANGE_MAILBOX_WAIT' -Status 'PENDING' -Details @{ upn = $UserPrincipalName; waitedMinutes = $MailboxWaitMinutes }
        Write-Warning "Mailbox was not available within $MailboxWaitMinutes minutes. Rerun mailbox configuration after Microsoft 365 provisioning completes."
    } else {
        if ($PSCmdlet.ShouldProcess($UserPrincipalName, 'Apply Exchange Online mailbox metadata and aliases')) {
            Set-Mailbox -Identity $UserPrincipalName -CustomAttribute1 'GGH' -CustomAttribute2 $EmployeeId
            $normalizedAliases = @($MailAliases | Where-Object { $_ } | ForEach-Object {
                $value = $_.Trim().ToLowerInvariant()
                if ($value -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw "Invalid mail alias '$value'." }
                "smtp:$value"
            })
            if ($normalizedAliases.Count -gt 0) {
                Set-Mailbox -Identity $UserPrincipalName -EmailAddresses @{ Add = $normalizedAliases }
            }
            if ($DisableLegacyMailProtocols) {
                Set-CASMailbox -Identity $UserPrincipalName -PopEnabled:$false -ImapEnabled:$false
            }
            $mailboxStatus = 'CONFIGURED'
            Add-GGHAuditEvent -Action 'EXCHANGE_MAILBOX_CONFIGURED' -Status 'SUCCESS' -Details @{ upn = $UserPrincipalName; aliasesAdded = $normalizedAliases; legacyProtocolsDisabled = [bool]$DisableLegacyMailProtocols }
        }
    }
}

$result = [ordered]@{
    schemaVersion       = 1
    completedAt         = (Get-Date).ToUniversalTime().ToString('o')
    tenantId            = $TenantId
    tenantDomain        = $TenantDomain
    userObjectId        = $user.Id
    userPrincipalName   = $UserPrincipalName
    employeeId          = $EmployeeId
    accountEnabled      = [bool]$EnableOnCreate
    stagedAccount       = -not [bool]$EnableOnCreate
    skuPartNumber       = $SkuPartNumber
    licenseAssigned     = $licenseAssigned
    groupAssignments    = $groupResults
    mailboxStatus       = $mailboxStatus
    auditEvents         = $script:AuditEvents
    temporaryPasswordInAudit = $false
}

$result | ConvertTo-Json -Depth 20 | Set-Content -Path $AuditOutputPath -Encoding UTF8
Write-Host "Provisioning audit written to: $AuditOutputPath" -ForegroundColor Green
$result | ConvertTo-Json -Depth 20

Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
