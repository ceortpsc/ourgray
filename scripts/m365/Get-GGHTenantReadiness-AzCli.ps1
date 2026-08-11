#Requires -Version 7.2
<#+
.SYNOPSIS
Cloud Shell-safe Microsoft Entra and Microsoft 365 readiness inspection using Azure CLI REST calls.

.DESCRIPTION
Avoids Microsoft.Graph PowerShell module assembly collisions by using the Azure CLI's authenticated
`az rest` command against Microsoft Graph. This script is read-only and writes no credentials or tokens.
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId = 'eb6c9e4e-0943-4ada-b473-fbafda77eb27',

    [string]$OutputPath = (Join-Path $PWD "ggh-tenant-readiness-azcli-$(Get-Date -Format 'yyyyMMdd-HHmmss').json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Invoke-GGHGraphGet {
    param(
        [Parameter(Mandatory)]
        [string]$Uri,
        [switch]$ConsistencyLevelEventual
    )

    $arguments = @('rest', '--method', 'get', '--url', $Uri, '--output', 'json', '--only-show-errors')
    if ($ConsistencyLevelEventual) {
        $arguments += @('--headers', 'ConsistencyLevel=eventual')
    }

    $raw = & az @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI Graph request failed for $Uri"
    }
    return ($raw | ConvertFrom-Json -Depth 50)
}

function Get-GGHGraphCount {
    param([Parameter(Mandatory)][string]$Resource)
    $uri = "https://graph.microsoft.com/v1.0/$Resource?`$count=true&`$top=1&`$select=id"
    $response = Invoke-GGHGraphGet -Uri $uri -ConsistencyLevelEventual
    if ($null -ne $response.'@odata.count') {
        return [int]$response.'@odata.count'
    }
    return @($response.value).Count
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI is not available in this shell.'
}

$account = az account show --output json --only-show-errors | ConvertFrom-Json
if (-not $account) {
    throw 'No active Azure CLI session is available.'
}
if ($account.tenantId -ne $TenantId) {
    Write-Warning "Azure CLI is authenticated to tenant $($account.tenantId), while the requested tenant is $TenantId."
}

$organizationResponse = Invoke-GGHGraphGet -Uri 'https://graph.microsoft.com/v1.0/organization?$select=id,displayName,verifiedDomains,technicalNotificationMails'
$organization = @($organizationResponse.value) | Select-Object -First 1
if (-not $organization) {
    throw 'Microsoft Graph returned no organization record.'
}

$domains = @($organization.verifiedDomains)
$primaryDomain = @($domains | Where-Object { $_.isDefault -eq $true } | Select-Object -ExpandProperty name -First 1)
$verifiedDomains = @($domains | Where-Object { $_.isVerified -eq $true } | Select-Object -ExpandProperty name)

$usersCount = Get-GGHGraphCount -Resource 'users'
$groupsCount = Get-GGHGraphCount -Resource 'groups'
$applicationsCount = Get-GGHGraphCount -Resource 'applications'
$devicesCount = Get-GGHGraphCount -Resource 'devices'

$skuResponse = Invoke-GGHGraphGet -Uri 'https://graph.microsoft.com/v1.0/subscribedSkus?$select=skuId,skuPartNumber,capabilityStatus,consumedUnits,prepaidUnits,servicePlans'
$skuRows = foreach ($sku in @($skuResponse.value)) {
    $enabled = [int]($sku.prepaidUnits.enabled ?? 0)
    $consumed = [int]($sku.consumedUnits ?? 0)
    [ordered]@{
        skuId = $sku.skuId
        skuPartNumber = $sku.skuPartNumber
        capabilityStatus = $sku.capabilityStatus
        enabledUnits = $enabled
        consumedUnits = $consumed
        availableUnits = [math]::Max(0, $enabled - $consumed)
        servicePlans = @($sku.servicePlans | ForEach-Object {
            [ordered]@{
                servicePlanName = $_.servicePlanName
                servicePlanId = $_.servicePlanId
                provisioningStatus = $_.provisioningStatus
                appliesTo = $_.appliesTo
            }
        })
    }
}

$exchangePlanNames = @(
    'EXCHANGE_S_STANDARD',
    'EXCHANGE_S_ENTERPRISE',
    'EXCHANGE_S_DESKLESS',
    'EXCHANGE_L_STANDARD',
    'EXCHANGE_S_ARCHIVE'
)

$exchangeCapableSkus = @($skuRows | Where-Object {
    @($_.servicePlans | Where-Object { $exchangePlanNames -contains $_.servicePlanName }).Count -gt 0
})

$result = [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    collectionMethod = 'Azure CLI az rest to Microsoft Graph'
    tenant = [ordered]@{
        requestedTenantId = $TenantId
        authenticatedTenantId = $account.tenantId
        subscriptionId = $account.id
        subscriptionName = $account.name
        organizationId = $organization.id
        displayName = $organization.displayName
        primaryDomain = $primaryDomain
        verifiedDomains = $verifiedDomains
        technicalNotificationMails = @($organization.technicalNotificationMails)
    }
    inventory = [ordered]@{
        users = $usersCount
        groups = $groupsCount
        applications = $applicationsCount
        devices = $devicesCount
        subscribedSkus = @($skuRows).Count
    }
    exchangeOnline = [ordered]@{
        exchangeCapableSkuCount = $exchangeCapableSkus.Count
        exchangeCapableSkus = @($exchangeCapableSkus | Select-Object skuId,skuPartNumber,availableUnits,capabilityStatus)
        mailboxProvisioningReady = @($exchangeCapableSkus | Where-Object {
            $_.availableUnits -gt 0 -and $_.capabilityStatus -eq 'Enabled'
        }).Count -gt 0
    }
    subscribedSkus = @($skuRows)
    controls = [ordered]@{
        readOnlyInspection = $true
        graphPowerShellModulesUsed = $false
        secretsWritten = $false
        generatedBy = [Environment]::UserName
        workstation = [Environment]::MachineName
    }
}

$result | ConvertTo-Json -Depth 50 | Set-Content -Path $OutputPath -Encoding UTF8
Write-Host "Tenant readiness report written to: $OutputPath" -ForegroundColor Green
$result | ConvertTo-Json -Depth 50
