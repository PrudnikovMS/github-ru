$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$GhRoot = Join-Path $env:LOCALAPPDATA "GitHubDesktop"
if (-not (Test-Path $GhRoot)) {
    Write-Host "[ОШИБКА] Папка GitHub Desktop не найдена: $GhRoot" -ForegroundColor Red
    exit 1
}

$AppDirs = Get-ChildItem -Path $GhRoot -Directory -Filter "app-*" |
    Where-Object { Test-Path (Join-Path $_.FullName "resources\app\index.html") } |
    Sort-Object LastWriteTime -Descending

if (-not $AppDirs -or $AppDirs.Count -eq 0) {
    Write-Host "[ОШИБКА] Не найден каталог resources\app\index.html внутри $GhRoot" -ForegroundColor Red
    exit 1
}

$TargetApp = $AppDirs[0]
$ResAppDir = Join-Path $TargetApp.FullName "resources\app"
$SrcLoc = Join-Path $PSScriptRoot "ru-localization.js"
if (-not (Test-Path $SrcLoc)) {
    $SrcLoc = Join-Path $PSScriptRoot "dist\desktop\ru-localization.js"
}
$DstLoc = Join-Path $ResAppDir "ru-localization.js"
$IndexHtml = Join-Path $ResAppDir "index.html"
$IndexBak = Join-Path $ResAppDir "index.html.bak"

if (-not (Test-Path $SrcLoc)) {
    Write-Host "[ОШИБКА] Не найден файл локализации: $SrcLoc" -ForegroundColor Red
    exit 1
}

Copy-Item -Path $SrcLoc -Destination $DstLoc -Force

$HtmlContent = [System.IO.File]::ReadAllText($IndexHtml, [System.Text.Encoding]::UTF8)

if (-not (Test-Path $IndexBak) -and ($HtmlContent -notmatch "ru-localization\.js")) {
    Copy-Item -Path $IndexHtml -Destination $IndexBak -Force
    Write-Host "[OK] Сохранена резервная копия: $IndexBak" -ForegroundColor Green
}

$ScriptTag = "<script src=ru-localization.js></script>"
$RendererTag = "<script defer src=renderer.js></script>"

if ($HtmlContent -match "ru-localization\.js") {
    Write-Host "[OK] Скрипт локализации уже подключён в $IndexHtml (обновлён ru-localization.js)." -ForegroundColor Cyan
} elseif ($HtmlContent.Contains($RendererTag)) {
    $Patched = $HtmlContent.Replace($RendererTag, "$ScriptTag$RendererTag")
    [System.IO.File]::WriteAllText($IndexHtml, $Patched, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[УСПЕХ] Русификатор установлен в $($TargetApp.Name) ($ResAppDir)." -ForegroundColor Green
} else {
    Write-Host "[ОШИБКА] Не найден ожидаемый тег $RendererTag в $IndexHtml" -ForegroundColor Red
    exit 1
}
