@echo off
setlocal enabledelayedexpansion

echo === 🧹 LMS DB Reset Script (Windows) ===

REM プロジェクトルートに移動（scripts の1階層上）
cd /d "%~dp0.."

REM 1. サービスを停止・ボリューム削除（完全リセット）
echo → Stopping containers and removing volumes...
docker compose down -v --remove-orphans

REM 2. 再構築
echo → Starting containers...
if exist db\.env (
  docker compose --env-file ./db/.env up -d
) else (
  docker compose --env-file ./db/.env.example up -d
)

REM 3. lms-db のヘルスチェックを待機
echo ⏳ Waiting for lms-db to become healthy...
:waitloop
for /f "usebackq tokens=*" %%A in (`powershell -Command "(docker inspect --format='{{.State.Health.Status}}' lms-db) 2>$null"`) do set STATUS=%%A
if "!STATUS!"=="healthy" (
    echo ✅ lms-db is healthy!
    goto done
) else (
    timeout /t 3 >nul
    goto waitloop
)
:done

echo ✅ Reset complete! All services are running fresh.
endlocal
pause
