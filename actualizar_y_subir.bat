@echo off
chcp 65001 >nul
echo ============================================
echo   Tablero GDI - Actualizar Dashboard
echo ============================================
echo.

set "REPO=C:\Users\jpinz390\OneDrive - Software Broker\Dashboard"

echo [1/2] Generando dashboard desde Excel...
cd /d "%REPO%"
python "%REPO%\generar_dashboard.py"
if errorlevel 1 (
    echo ERROR: Fallo al generar el dashboard.
    pause
    exit /b 1
)
echo     Dashboard generado OK

echo [2/2] Guardando respaldo en git...
cd /d "%REPO%"

REM Limpiar lock files si existen
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock"
if exist ".git\refs\heads\main.lock" del /f /q ".git\refs\heads\main.lock"

git add index.html generar_dashboard.py .gitignore
git commit -m "Actualizacion %date% %time%"

echo.
echo ============================================
echo   LISTO - Abre index.html para ver el tablero
echo ============================================
pause
