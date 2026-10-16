# RecruitGPT Local Helper installer (Windows). Run in PowerShell:  .\install.ps1 -Code ABCD-1234 -Server https://recruitgpt.ai
# Installs dependencies, pairs this computer, and registers the helper to start at sign-in.
param(
  [Parameter(Mandatory = $true)][string]$Code,
  [string]$Server = "https://recruitgpt.ai"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 20+ is required: https://nodejs.org" }
Write-Host "Installing helper dependencies..."
npm install --omit=dev --silent
npm install tsx --silent

Write-Host "Pairing this computer with your workspace..."
npx tsx src/index.ts pair $Code --server $Server

$cmd = "cd /d `"$PSScriptRoot`" && npx tsx src/index.ts run"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c $cmd"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName "RecruitGPT Local Helper" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host ""
Write-Host "Done. Next:"
Write-Host "  1. npx tsx src/index.ts chrome    (opens the dedicated browser; sign in to LinkedIn Recruiter / Indeed there)"
Write-Host "  2. Leave that browser open. The helper starts automatically at sign-in, or run: npx tsx src/index.ts run"
