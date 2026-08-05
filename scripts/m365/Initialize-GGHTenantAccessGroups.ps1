#Requires -Version 7.2
<#+
.SYNOPSIS
Creates the baseline Microsoft Entra ID security groups used by Great Gray Horizon onboarding.

.DESCRIPTION
The tenant currently reports zero groups. This script creates static assigned-membership security groups.
It intentionally does not create dynamic membership rules because those require separate licensing and governance review.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId = 'eb6c9e4e-0943-4ada-b473-fbafda77eb27',

    [switch]$InstallMissingModules,
    [string]$OutputPath = (Join-Path $PWD "ggh-access-groups-$(Get-Date -Format 'yyyyMMdd-HHmmss').json")
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
Assert-GGHModule -Name 'Microsoft.Graph.Groups'

Connect-MgGraph -TenantId $TenantId -Scopes @('Group.ReadWrite.All','Directory.ReadWrite.All') -NoWelcome
$context = Get-MgContext
if (-not $context -or $context.TenantId -ne $TenantId) {
    throw 'Microsoft Graph connection did not resolve to the requested tenant.'
}

$definitions = @(
    [ordered]@{ displayName = 'GGH-All-Employees'; mailNickname = 'ggh-all-employees'; description = 'Baseline workforce identity group for The Great Gray Horizon Counseling Center.' },
    [ordered]@{ displayName = 'GGH-Candidate-Portal-Users'; mailNickname = 'ggh-candidate-portal-users'; description = 'Users authorized for the Great Gray Horizon candidate and employee portal.' },
    [ordered]@{ displayName = 'GGH-Document-Signers'; mailNickname = 'ggh-document-signers'; description = 'Users authorized to receive and execute assigned electronic documents.' },
    [ordered]@{ displayName = 'GGH-Policy-Library-Readers'; mailNickname = 'ggh-policy-library-readers'; description = 'Users authorized to read corporate policy and governance resources.' },
    [ordered]@{ displayName = 'GGH-Training-Academy-Users'; mailNickname = 'ggh-training-academy-users'; description = 'Users authorized for the training academy and required learning modules.' },
    [ordered]@{ displayName = 'GGH-Clinical-Program-Executives'; mailNickname = 'ggh-clinical-program-executives'; description = 'Restricted executive group for verified clinical program leadership.' }
)

$results = [System.Collections.Generic.List[object]]::new()
foreach ($definition in $definitions) {
    $escaped = $definition.displayName.Replace("'", "''")
    $existing = Get-MgGroup -Filter "displayName eq '$escaped'" -Property Id,DisplayName,MailNickname,SecurityEnabled,GroupTypes | Select-Object -First 1
    if ($existing) {
        $results.Add([ordered]@{
            id = $existing.Id
            displayName = $existing.DisplayName
            mailNickname = $existing.MailNickname
            status = 'EXISTING'
        })
        continue
    }

    if ($PSCmdlet.ShouldProcess($definition.displayName, 'Create assigned-membership Entra security group')) {
        $group = New-MgGroup -DisplayName $definition.displayName -Description $definition.description -MailEnabled:$false -MailNickname $definition.mailNickname -SecurityEnabled:$true -GroupTypes @()
        $results.Add([ordered]@{
            id = $group.Id
            displayName = $group.DisplayName
            mailNickname = $group.MailNickname
            status = 'CREATED'
        })
    }
}

$result = [ordered]@{
    schemaVersion = 1
    completedAt = (Get-Date).ToUniversalTime().ToString('o')
    tenantId = $TenantId
    groupType = 'Assigned membership security groups'
    groups = $results
    generatedBy = [Environment]::UserName
    workstation = [Environment]::MachineName
}
$result | ConvertTo-Json -Depth 10 | Set-Content -Path $OutputPath -Encoding UTF8
Write-Host "Group bootstrap report written to: $OutputPath" -ForegroundColor Green
$result | ConvertTo-Json -Depth 10
Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
