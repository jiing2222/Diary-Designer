# Rings 로컬 실행 — 계정 서버(PocketBase)와 앱 개발 서버를 함께 켠다(start-local.bat이 부른다).
# 처음 한 번: PocketBase가 없으면 공식 GitHub 릴리스에서 받고, 앱이 이 서버를 보도록 app/.env.local을 만든다.
# 서버 데이터(계정·동기화한 작업)는 server/local/pb_data에 남는다 — 이 컴퓨터에만 있다.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$local = Join-Path $root 'server\local'
$exe = Join-Path $local 'pocketbase.exe'

if (-not (Test-Path $exe)) {
  Write-Host 'PocketBase를 받는 중...'
  New-Item -ItemType Directory -Force $local | Out-Null
  $v = (Invoke-RestMethod 'https://api.github.com/repos/pocketbase/pocketbase/releases/latest').tag_name.TrimStart('v')
  $zip = Join-Path $local 'pb.zip'
  Invoke-WebRequest "https://github.com/pocketbase/pocketbase/releases/download/v$v/pocketbase_${v}_windows_amd64.zip" -OutFile $zip
  Expand-Archive -Force $zip $local
  Remove-Item $zip
}

$envFile = Join-Path $root 'app\.env.local'
if (-not (Test-Path $envFile)) { Set-Content -Encoding utf8 $envFile 'VITE_PB_URL=http://127.0.0.1:8090' }

$data = Join-Path $local 'pb_data'
$migrations = Join-Path $root 'server\pb_migrations'
Start-Process $exe -ArgumentList @('serve', '--http=127.0.0.1:8090', "--dir=$data", "--migrationsDir=$migrations") -WorkingDirectory $local
Start-Process 'cmd.exe' -ArgumentList '/k', 'npm run dev' -WorkingDirectory $root
Start-Sleep -Seconds 4
Start-Process 'http://localhost:5173'
Write-Host ''
Write-Host '켜졌어요. 앱: http://localhost:5173  /  계정 서버 관리자 화면: http://127.0.0.1:8090/_/'
Write-Host '끝내려면 열린 검은 창 두 개(계정 서버, 앱)를 닫으세요.'
