#Requires -Version 7.2
[CmdletBinding()]
param(
    [string]$Environment = 'local',
    [int]$Port = 8080,
    [switch]$SkipInstall,
    [switch]$SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ScriptRoot = Split-Path -Parent $PSCommandPath
$RepositoryRoot = (Resolve-Path (Join-Path $ScriptRoot '../..')).Path
Set-Location $RepositoryRoot

Write-Host 'Great Gray Horizon Environment Bootstrap' -ForegroundColor Cyan
Write-Host "Repository: $RepositoryRoot" -ForegroundColor DarkGray
Write-Host "Profile:    $Environment" -ForegroundColor DarkGray
Write-Host "Port:       $Port" -ForegroundColor DarkGray

function Assert-Command {
    param([Parameter(Mandatory)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found."
    }
}

Assert-Command node
Assert-Command npm
Assert-Command git

$NodeVersionRaw = (node --version).Trim().TrimStart('v')
$NodeMajor = [int]($NodeVersionRaw.Split('.')[0])
if ($NodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Detected: $NodeVersionRaw"
}

Write-Host "Node.js: v$NodeVersionRaw" -ForegroundColor Green
Write-Host "npm:     $(npm --version)" -ForegroundColor Green
Write-Host "git:     $(git --version)" -ForegroundColor Green

$RequiredFiles = @(
    'package.json',
    'portal/index.html',
    'portal/learning-portal.html',
    'portal/learning-portal.js',
    'portal/terminal.html',
    'portal/terminal.js',
    'portal/data/program-spec.json',
    'portal/data/lms-simulation.json',
    'portal/data/environment-config.json'
)

foreach ($Path in $RequiredFiles) {
    if (-not (Test-Path $Path -PathType Leaf)) {
        throw "Required application asset is missing: $Path"
    }
}
Write-Host 'Required application assets: PASS' -ForegroundColor Green

if (-not $SkipInstall) {
    Write-Host 'Installing repository dependencies...' -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        throw 'npm install failed.'
    }
}
else {
    Write-Host 'Dependency install skipped by request.' -ForegroundColor Yellow
}

Write-Host 'Validating JSON manifests...' -ForegroundColor Cyan
$JsonFiles = @(
    'portal/data/program-spec.json',
    'portal/data/lms-simulation.json',
    'portal/data/environment-config.json',
    'portal/data/engine-config.json',
    'portal/data/candidate-access-config.json'
)
foreach ($Path in $JsonFiles) {
    Get-Content $Path -Raw | ConvertFrom-Json | Out-Null
    Write-Host "  PASS $Path" -ForegroundColor DarkGreen
}

Write-Host 'Validating JavaScript syntax...' -ForegroundColor Cyan
$JavaScriptFiles = @(
    'portal/learning-portal.js',
    'portal/terminal.js',
    'portal/lib/learning-engine.js',
    'portal/lib/platform-engine.js',
    'portal/lib/application-engine.js'
)
foreach ($Path in $JavaScriptFiles) {
    node --check $Path
    if ($LASTEXITCODE -ne 0) {
        throw "JavaScript validation failed: $Path"
    }
    Write-Host "  PASS $Path" -ForegroundColor DarkGreen
}

if (-not $SkipTests) {
    Write-Host 'Running portal tests...' -ForegroundColor Cyan
    npm run test:portal
    if ($LASTEXITCODE -ne 0) {
        throw 'Portal tests failed.'
    }
}
else {
    Write-Host 'Portal tests skipped by request.' -ForegroundColor Yellow
}

$StateDirectory = Join-Path $RepositoryRoot '.ggh'
New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
$StatePath = Join-Path $StateDirectory 'environment-state.json'

$State = [ordered]@{
    schemaVersion = 1
    application = 'Great Gray Horizon Learning & Operations Platform'
    profile = $Environment
    port = $Port
    repositoryRoot = $RepositoryRoot
    nodeVersion = $NodeVersionRaw
    npmVersion = (npm --version).Trim()
    branch = (git branch --show-current).Trim()
    commit = (git rev-parse HEAD).Trim()
    configuredAt = [DateTimeOffset]::UtcNow.ToString('o')
    browserTerminal = 'ALLOWLISTED_VIRTUAL_COMMANDS'
    liveProviders = $false
}

$State | ConvertTo-Json -Depth 6 | Set-Content -Path $StatePath -Encoding utf8
Write-Host "Environment state written to: $StatePath" -ForegroundColor Green

Write-Host ''
Write-Host 'Environment configuration completed.' -ForegroundColor Green
Write-Host 'Start the static LMS with:' -ForegroundColor Cyan
Write-Host "python3 -m http.server $Port --directory ./portal" -ForegroundColor White
Write-Host ''
Write-Host 'Then open:' -ForegroundColor Cyan
Write-Host "  /learning-portal.html" -ForegroundColor White
Write-Host "  /terminal.html" -ForegroundColor White
Write-Host ''
Write-Host 'For Azure Cloud Shell, use Web Preview for the selected port.' -ForegroundColor DarkGray
