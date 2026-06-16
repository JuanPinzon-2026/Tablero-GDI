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
git add index.html
git commit -m "Actualizar dashboard %date% %time%"

echo [3/3] Subiendo a GitHub...
git push origin main

echo.
echo ============================================
echo   LISTO - https://JuanPinzon-2026.github.io/Tablero-GDI
echo ============================================
pause
