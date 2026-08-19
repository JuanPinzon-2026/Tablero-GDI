@echo off
chcp 65001 >nul
echo.
echo ============================================================
echo   Tablero GDI - Configuracion inicial (solo se hace 1 vez)
echo ============================================================
echo.

REM Paso 1: Verificar Python
echo [1/5] Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Python no esta instalado.
    echo Instala desde: https://www.python.org/downloads/
    echo IMPORTANTE: marcar la casilla "Add Python to PATH" al instalar.
    echo.
    pause
    exit /b 1
)
python --version
echo     OK Python detectado
echo.

REM Paso 2: Instalar dependencias
echo [2/5] Instalando dependencias Python...
set "SCRIPT_DIR=%~dp0"
python -m pip install openpyxl cryptography --quiet
if errorlevel 1 (
    echo ERROR: No se pudieron instalar las dependencias.
    pause
    exit /b 1
)
echo     OK dependencias instaladas
echo.

REM Paso 3: Verificar Git
echo [3/5] Verificando Git...
git --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Git no esta instalado.
    echo Instala desde: https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)
git --version
echo     OK Git detectado
echo.

REM Paso 4: Nombre y correo en Git
echo [4/5] Configurando identidad en Git...
set /p GIT_NAME=    Tu nombre completo (ej: Maria Lopez):
set /p GIT_EMAIL=   Tu correo (ej: maria@empresa.com):
git config --global user.name "%GIT_NAME%"
git config --global user.email "%GIT_EMAIL%"
echo     OK identidad configurada
echo.

REM Paso 5: Token de GitHub (PAT)
echo [5/5] Configurando acceso a GitHub...
echo.
echo Necesitas un Token de GitHub (PAT) que Juan debe enviarte.
echo Generado en: https://github.com/settings/tokens (scope: repo)
echo.
set /p GIT_PAT=    Pega aqui tu PAT y presiona Enter:

cd /d "%SCRIPT_DIR%"
git remote set-url origin "https://%GIT_PAT%@github.com/JuanPinzon-2026/Tablero-GDI.git"
echo     OK token guardado
echo.

REM Prueba de conexion
echo Probando conexion a GitHub...
git ls-remote origin HEAD >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: No se pudo conectar a GitHub.
    echo Verifica que el PAT es correcto y que Juan te dio acceso al repositorio.
    echo.
) else (
    echo     OK conexion exitosa a GitHub
    echo.
    echo ============================================================
    echo   CONFIGURACION COMPLETA
    echo   Ahora puedes usar: actualizar_dashboard.pyw
    echo   Haz doble clic en ese archivo para actualizar el tablero.
    echo ============================================================
)
echo.
pause
