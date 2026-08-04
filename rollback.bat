@echo off
chcp 65001 >nul
echo ============================================
echo   Tablero GDI - Rollback de version
echo ============================================
echo.

set "REPO=C:\Users\jpinz390\OneDrive - Software Broker\Dashboard"
cd /d "%REPO%"

echo Ultimas 10 versiones del tablero:
echo.
echo  #   Fecha/Hora                  Commit
echo  --  --------------------------  -------
git log --oneline --format="  %%d  %%ai  %%h  %%s" -10 index.html
echo.

REM Mostrar lista numerada para seleccion
echo Ingresa el HASH del commit al que deseas volver
echo (los 7 caracteres que aparecen en la columna Commit):
echo.
set /p HASH="Hash: "

if "%HASH%"=="" (
    echo Cancelado.
    pause
    exit /b 0
)

REM Verificar que el hash existe
git cat-file -e %HASH% 2>nul
if errorlevel 1 (
    echo ERROR: Hash no encontrado. Verifica los caracteres.
    pause
    exit /b 1
)

echo.
echo Restaurando index.html desde commit %HASH%...
git checkout %HASH% -- index.html
if errorlevel 1 (
    echo ERROR: No se pudo restaurar esa version.
    pause
    exit /b 1
)
echo     OK - index.html restaurado

echo.
set /p PUSH="Publicar este rollback en GitHub Pages? (S/N): "
if /i "%PUSH%"=="S" (
    git add -f index.html
    git commit -m "Rollback a version %HASH% - %date% %time%"
    git push origin main
    echo     Rollback publicado en GitHub Pages
) else (
    echo     Rollback aplicado solo localmente.
    echo     Abre index.html para verificar y luego corre actualizar_y_subir.bat si quieres publicarlo.
)

echo.
echo ============================================
echo   LISTO - Version restaurada: %HASH%
echo ============================================
pause
