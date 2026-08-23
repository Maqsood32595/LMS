# Boot a persistent server on 5010, verify health, run both PIET suites, leave server running.
$ErrorActionPreference = 'Continue'
$ROOT = 'D:\Mujahid\LMS'

Get-NetTCPConnection -LocalPort 5010 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

$srv = Start-Process -FilePath 'node' -ArgumentList 'server/index.js' -WorkingDirectory $ROOT -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 8

$ok = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        $null = Invoke-RestMethod -Uri 'http://localhost:5010/api/features' -TimeoutSec 2
        $ok = $true
        break
    } catch { Start-Sleep -Seconds 1 }
}
"health=$ok pid=$($srv.Id)" | Out-File "$ROOT\ps1-run.txt" -Encoding ascii

& node "$ROOT\tests\piet\gate6.spec.mjs" *> "$ROOT\g6-final.txt"
"gate6 exit=$LASTEXITCODE" | Add-Content "$ROOT\ps1-run.txt"

& node "$ROOT\tests\piet\piet.mjs" *> "$ROOT\piet-final.txt"
"piet exit=$LASTEXITCODE" | Add-Content "$ROOT\ps1-run.txt"

"server still running pid=$($srv.Id)" | Add-Content "$ROOT\ps1-run.txt"