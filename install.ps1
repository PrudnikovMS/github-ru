$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$InstallDir = Join-Path $env:USERPROFILE ".github-desktop-ru"
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$RepoRawBase = "https://raw.githubusercontent.com/PrudnikovMS/github-ru/main"
$LocalScriptDir = $PSScriptRoot

$Files = @(
    @{ Remote = "$RepoRawBase/dist/desktop/ru-localization.js"; Local = "dist\desktop\ru-localization.js"; Dest = "ru-localization.js" },
    @{ Remote = "$RepoRawBase/apply.ps1"; Local = "apply.ps1"; Dest = "apply.ps1" },
    @{ Remote = "$RepoRawBase/uninstall.ps1"; Local = "uninstall.ps1"; Dest = "uninstall.ps1" }
)

foreach ($f in $Files) {
    $DestPath = Join-Path $InstallDir $f.Dest
    $LocalCandidate = if ($LocalScriptDir) { Join-Path $LocalScriptDir $f.Local } else { $null }
    if ($LocalCandidate -and (Test-Path $LocalCandidate)) {
        Copy-Item -Path $LocalCandidate -Destination $DestPath -Force
    } else {
        Invoke-WebRequest -Uri $f.Remote -OutFile $DestPath -UseBasicParsing
    }
}

Write-Host "[OK] Файлы сохранены в $InstallDir" -ForegroundColor Green
& (Join-Path $InstallDir "apply.ps1")
