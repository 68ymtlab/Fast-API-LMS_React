@echo off
setlocal enabledelayedexpansion

echo === 🧹 Supabase Test Reset Script (Windows) ===

REM プロジェクトルートに移動（scripts の1階層上）
cd /d "%~dp0.."

REM 1. サービスを停止・削除
echo → Stopping and removing containers...
docker compose -p supabase-test down --remove-orphans

REM 2. ボリュームを削除
echo → Removing volume: supabase-test_db-config...
docker volume rm supabase-test_db-config

REM 3. bind mount 削除
if exist volumes\db\init\data (
  echo → Removing local Postgres data directory...
  rmdir /s /q volumes\db\init\data
)
mkdir volumes\db\init\data

REM 4. 再構築
echo → Starting containers...
docker compose --env-file ./db/.env.example up -d

echo ⏳ Waiting for supabase-db to become healthy...
:waitloop
for /f "usebackq tokens=*" %%A in (`powershell -Command "(docker inspect --format='{{.State.Health.Status}}' supabase-db) 2>$null"`) do set STATUS=%%A
if "%STATUS%"=="healthy" (
    echo ✅ supabase-db is healthy!
) else (
    timeout /t 3 >nul
    goto waitloop
)

REM Healthyになったら .gitkeep を復元
type nul > volumes\db\init\data\.gitkeep

echo ✅ Reset complete and .gitkeep restored.
endlocal
pause