$ErrorActionPreference = "Stop"
$manifestUrl = "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/latest/download/latest.json"
$manifest = Invoke-RestMethod -Uri $manifestUrl
$asset = $manifest.platforms.windows
if (-not $asset.url -or -not $asset.sha256) { throw "No Windows installer is listed in the latest release." }
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetFileName($asset.url))
Invoke-WebRequest -Uri $asset.url -OutFile $temp
$actual = (Get-FileHash -Path $temp -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $asset.sha256.ToLowerInvariant()) { Remove-Item $temp -Force; throw "Checksum mismatch; the installer was not opened." }
Write-Host "Verified SHA-256. Starting the unsigned Reminder Mailroom installer..."
if ($temp.EndsWith(".msi")) {
  Start-Process msiexec.exe -ArgumentList "/i `"$temp`"" -Wait
} else {
  Start-Process $temp -Wait
}
Write-Host "Reminder Mailroom installer finished. Windows may have shown a publisher warning because v0.1 is unsigned."
