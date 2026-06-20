@echo off
chcp 65001 >nul
echo ============================================
echo   Tablero GDI - Actualizar y Subir a GitHub
echo ============================================
echo.

set "EXCEL_BASE=C:\Users\jpinz390\Software Broker\Nathalia Moreno - Ordenes incidentadas 2026"
set "REPO=C:\Users\jpinz390\OneDrive - Software Broker\Dashboard"

echo [1/3] Generando dashboard desde Excel...
python "%EXCEL_BASE%\generar_dashboard.py"
if errorlevel 1 (
    echo ERROR: Fallo al generar el dashboard.
    pause
    exit /b 1
)
echo     Dashboard generado OK

echo [2/3] Preparando cambios para GitHub...
cd /d "%REPO%"

REM Limpiar lock files si existen
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock"
if exist ".git\refs\heads\main.lock" del /f /q ".git\refs\heads\main.lock"

git add .
git commit -m "Actualizacion automatica %date% %time%"

echo [3/3] Subiendo a GitHub...
git push origin main

echo.
echo ============================================
echo   LISTO - https://dashboardgdi.netlify.app
echo ============================================
pause
