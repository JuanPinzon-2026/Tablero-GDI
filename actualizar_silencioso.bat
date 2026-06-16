@echo off
chcp 65001 >nul

set "EXCEL_BASE=C:\Users\jpinz390\Software Broker\Nathalia Moreno - Ordenes incidentadas 2026"
set "REPO=C:\Users\jpinz390\OneDrive - Software Broker\Dashboard"
set "LOG=%REPO%\auto_update.log"

echo [%date% %time%] Verificando cambios... >> "%LOG%"

REM Solo correr si el Excel fue modificado en los últimos 20 minutos
forfiles /p "%EXCEL_BASE%" /m "*.xlsx" /d +0 /c "cmd /c exit 0" 2>nul
if errorlevel 1 (
    echo [%date% %time%] Sin cambios recientes en Excel. Omitiendo. >> "%LOG%"
    exit /b 0
)

echo [%date% %time%] Cambios detectados. Generando dashboard... >> "%LOG%"

python "%EXCEL_BASE%\generar_dashboard.py" >> "%LOG%" 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR al generar dashboard. >> "%LOG%"
    exit /b 1
)

cd /d "%REPO%"

REM Solo hacer commit si index.html cambió
git diff --quiet index.html
if errorlevel 1 (
    git add index.html
    git commit -m "Auto-update %date% %time:~0,5%" >> "%LOG%" 2>&1
    git push origin main >> "%LOG%" 2>&1
    echo [%date% %time%] Dashboard publicado OK. >> "%LOG%"
) else (
    echo [%date% %time%] index.html sin cambios. No se sube. >> "%LOG%"
)
