@echo off
chcp 65001 >nul
echo ============================================
echo   Tablero GDI - Actualizar y Publicar
echo ============================================
echo.

set "REPO=C:\Users\jpinz390\OneDrive - Software Broker\Dashboard"

echo [1/3] Generando dashboard desde Excel...
cd /d "%REPO%"
python "%REPO%\generar_dashboard.py"
if errorlevel 1 (
    echo ERROR: Fallo al generar el dashboard.
    pause
    exit /b 1
)
echo     Dashboard generado OK

echo [2/3] Guardando en git...
cd /d "%REPO%"

REM Limpiar lock files si existen
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock"
if exist ".git\refs\heads\main.lock" del /f /q ".git\refs\heads\main.lock"

git add -f index.html generar_dashboard.py .gitignore
git add .github\workflows\pages.yml
git commit -m "GDI-Dashboard %date% %time:~0,8%"
if errorlevel 1 (
    echo     Sin cambios nuevos para commitear.
)

echo [3/3] Publicando en GitHub Pages...
git push origin main
if errorlevel 1 (
    echo ERROR: Fallo el push. Verifica conexion y credenciales de GitHub.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   LISTO
echo   - Tablero local: index.html
echo   - GitHub Pages: en construccion (~2 min)
echo   - URL: https://^<tu-usuario^>.github.io/^<repo^>
echo ============================================
pause
