#Requires -Version 7.2
<#+
.SYNOPSIS
Deploys the Great Gray Horizon static portal to Cloudflare Pages without a global npm install.

.DESCRIPTION
Installs Wrangler as a project development dependency, authenticates interactively when required,
creates the Cloudflare Pages project when absent, and deploys the portal directory. No Cloudflare
API token is written into source control by this script.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [string]$ProjectName = 'great-gray-horizon',
    [string]$Directory = 'portal',
    [string]$ProductionBranch = 'feature-ggh-candidate-portal-v3',
    [switch]$SkipLogin,
    [switch]$SkipInstall,
    [switch]$PreviewOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm is required.'
}
if (-not (Test-Path $Directory -PathType Container)) {
    throw "Deployment directory '$Directory' does not exist."
}

Write-Host "Node: $(node --version)" -ForegroundColor Cyan
Write-Host "npm:  $(npm --version)" -ForegroundColor Cyan

if (-not $SkipInstall) {
    if ($PSCmdlet.ShouldProcess('package.json', 'Install project-local Wrangler development dependency')) {
        npm install --save-dev wrangler@latest
        if ($LASTEXITCODE -ne 0) {
            throw 'Project-local Wrangler installation failed.'
        }
    }
}

npx wrangler --version
if ($LASTEXITCODE -ne 0) {
    throw 'Wrangler is unavailable through npx.'
}

if (-not $SkipLogin) {
    npx wrangler whoami
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Cloudflare authentication is required. Complete the browser login flow.' -ForegroundColor Yellow
        npx wrangler login
        if ($LASTEXITCODE -ne 0) {
            throw 'Cloudflare authentication failed.'
        }
        npx wrangler whoami
        if ($LASTEXITCODE -ne 0) {
            throw 'Cloudflare login could not be verified.'
        }
    }
}

$projectsJson = npx wrangler pages project list --json 2>$null
$projectExists = $false
if ($LASTEXITCODE -eq 0 -and $projectsJson) {
    try {
        $projects = $projectsJson | ConvertFrom-Json
        $projectExists = @($projects | Where-Object { $_.name -eq $ProjectName }).Count -gt 0
    } catch {
        Write-Warning 'Cloudflare project-list output could not be parsed; project creation will be attempted.'
    }
}

if (-not $projectExists) {
    if ($PSCmdlet.ShouldProcess($ProjectName, "Create Cloudflare Pages project with production branch '$ProductionBranch'")) {
        npx wrangler pages project create $ProjectName --production-branch $ProductionBranch
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to create Pages project '$ProjectName'. If it already exists, rerun after verifying the project name."
        }
    }
}

$branch = if ($PreviewOnly) { (git branch --show-current).Trim() } else { $ProductionBranch }
$commitHash = (git rev-parse HEAD).Trim()
$commitMessage = (git log -1 --pretty=%s).Trim()

if ($PSCmdlet.ShouldProcess("$ProjectName/$branch", "Deploy '$Directory' to Cloudflare Pages")) {
    npx wrangler pages deploy $Directory `
        --project-name $ProjectName `
        --branch $branch `
        --commit-hash $commitHash `
        --commit-message $commitMessage

    if ($LASTEXITCODE -ne 0) {
        throw 'Cloudflare Pages deployment failed.'
    }
}

Write-Host 'Latest deployments:' -ForegroundColor Green
npx wrangler pages deployment list --project-name $ProjectName
