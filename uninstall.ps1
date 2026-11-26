$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$GhRoot = Join-Path $env:LOCALAPPDATA "GitHubDesktop"
if (-not (Test-Path $GhRoot)) {
    Write-Host "[ИНФО] Папка GitHub Desktop не найдена: $GhRoot" -ForegroundColor Yellow
    exit 0
}

$AppDirs = Get-ChildItem -Path $GhRoot -Directory -Filter "app-*"
$RemovedCount = 0

foreach ($Dir in $AppDirs) {
    $ResAppDir = Join-Path $Dir.FullName "resources\app"
    if (-not (Test-Path $ResAppDir)) { continue }

    $IndexHtml = Join-Path $ResAppDir "index.html"
    $IndexBak = Join-Path $ResAppDir "index.html.bak"
    $LocFile = Join-Path $ResAppDir "ru-localization.js"

    if (Test-Path $IndexBak) {
        Copy-Item -Path $IndexBak -Destination $IndexHtml -Force
        Remove-Item -Path $IndexBak -Force
        Write-Host "[OK] Восстановлен оригинальный index.html из резервной копии в $($Dir.Name)" -ForegroundColor Green
        $RemovedCount++
    } elseif (Test-Path $IndexHtml) {
        $Html = [System.IO.File]::ReadAllText($IndexHtml, [System.Text.Encoding]::UTF8)
        if ($Html -match "<script src=ru-localization\.js></script>") {
            $Restored = $Html.Replace("<script src=ru-localization.js></script>", "")
            [System.IO.File]::WriteAllText($IndexHtml, $Restored, (New-Object System.Text.UTF8Encoding($false)))
            Write-Host "[OK] Удалена инъекция из index.html в $($Dir.Name)" -ForegroundColor Green
            $RemovedCount++
        }
    }

    if (Test-Path $LocFile) {
        Remove-Item -Path $LocFile -Force
        Write-Host "[OK] Удалён файл $LocFile" -ForegroundColor Green
    }
}

if ($RemovedCount -eq 0) {
    Write-Host "[ИНФО] Следов русификатора в $GhRoot не обнаружено." -ForegroundColor Cyan
} else {
    Write-Host "[УСПЕХ] Русификатор GitHub Desktop полностью удалён. Перезапустите GitHub Desktop." -ForegroundColor Green
}
