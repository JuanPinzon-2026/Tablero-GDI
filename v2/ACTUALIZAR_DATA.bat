@echo off
title Actualizar Data - Dashboard GDI v2

echo.
echo ==========================================
echo   DASHBOARD GDI v2 - Actualizar Data
echo ==========================================
echo.
echo Leyendo archivos Excel y generando data.js...
echo.

cd /d "%~dp0"
python scripts\generate_data_local.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Algo salio mal.
    echo Verifica que Python este instalado.
    echo Descargalo en: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo.
echo Data actualizada correctamente.
echo Abre src\index.html en el navegador para ver los cambios.
echo.
pause
