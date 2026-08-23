# Kill any process listening on 5010
$conns = Get-NetTCPConnection -LocalPort 5010 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
'KILLED' | Out-File -FilePath 'd:\Mujahid\LMS\kill5010.txt' -Encoding ascii