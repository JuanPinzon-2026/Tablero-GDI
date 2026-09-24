@echo off
chcp 65001 >nul
echo ============================================
echo   Tablero GDI - Actualizar y Publicar
echo ============================================
echo.

set "REPO=C:\Users\jpinz390\OneDrive - Software Broker\Dashboard"
cd /d "%REPO%"

REM ── 1. Generar V1 ─────────────────────────────
echo [1/4] Generando dashboard V1...
python "%REPO%\generar_dashboard.py"
if errorlevel 1 (
    echo ERROR: Fallo al generar el dashboard V1.
    pause
    exit /b 1
)
echo     V1 OK

REM ── 2. Generar V2 ─────────────────────────────
echo [2/4] Generando dashboard V2...
python "%REPO%\generar_dashboard_v2.py"
if errorlevel 1 (
    echo WARN: Fallo la generacion de V2, continuando...
) else (
    echo     V2 OK
)

REM ── 3. Guardar en git ─────────────────────────
echo [3/4] Guardando en git...

REM Limpiar lock files si existen
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock"
if exist ".git\refs\heads\main.lock" del /f /q ".git\refs\heads\main.lock"

git add .
git commit -m "GDI-Dashboard %date% %time:~0,8%"
if errorlevel 1 (
    echo     Sin cambios nuevos para commitear.
)

REM ── 4. Publicar ───────────────────────────────
echo [4/4] Publicando en GitHub Pages...
git -c http.postBuffer=524288000 push origin main
if errorlevel 1 (
    echo ERROR: Fallo el push. Verifica conexion y credenciales de GitHub.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   LISTO - Ambas versiones actualizadas
echo   - V1 local : index.html
echo   - V2 local : v2\src\index.html
echo   - GitHub Pages: actualizado (~2 min)
echo ============================================
pause
