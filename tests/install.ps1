$ErrorActionPreference = "Stop"
# @claim:windows-installer-checksum
$payload = [Text.Encoding]::UTF8.GetBytes("verified-reminder-mailroom")
$expected = ([Security.Cryptography.SHA256]::Create().ComputeHash($payload) | ForEach-Object { $_.ToString("x2") }) -join ""
$script:started = $false

function Invoke-RestMethod {
  [pscustomobject]@{ platforms = [pscustomobject]@{ windows = [pscustomobject]@{ url = "https://example.invalid/reminder.exe"; sha256 = $expected } } }
}
function Invoke-WebRequest {
  param([string]$Uri, [string]$OutFile)
  [IO.File]::WriteAllBytes($OutFile, $payload)
}
function Start-Process {
  param([string]$FilePath, [object]$ArgumentList, [switch]$Wait)
  if (-not (Test-Path $FilePath)) { throw "Installer payload was not downloaded." }
  $script:started = $true
}

. (Join-Path $PSScriptRoot ".." "public" "install.ps1")
if (-not $script:started) { throw "The checksum-verified installer was not started." }
