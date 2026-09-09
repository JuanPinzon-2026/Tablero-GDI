@echo off
:: setup_tarea_programada.bat
:: Registra la tarea de actualizacion automatica en Windows Task Scheduler
:: Ejecutar UNA SOLA VEZ como administrador
:: Intervalo por defecto: cada 30 minutos

setlocal

:: ── Configuracion ────────────────────────────────────────────────────────────
set NOMBRE_TAREA=Tablero GDI - Actualizacion Automatica
set INTERVALO_MIN=30
set SCRIPT=%~dp0auto_actualizar.py

:: Buscar pythonw.exe (corre sin ventana negra)
for /f "delims=" %%i in ('where pythonw.exe 2^>nul') do set PYTHON=%%i
if not defined PYTHON (
    for /f "delims=" %%i in ('where python.exe 2^>nul') do set PYTHON=%%i
)
if not defined PYTHON (
    echo ERROR: No se encontro python.exe en el PATH.
    echo Instala Python desde https://python.org y asegurate de marcarlo en PATH.
    pause
    exit /b 1
)

echo.
echo  Tablero GDI - Configurar Tarea Programada
echo  ==========================================
echo  Script  : %SCRIPT%
echo  Python  : %PYTHON%
echo  Intervalo: cada %INTERVALO_MIN% minutos
echo.

:: Eliminar tarea anterior si existe
schtasks /delete /tn "%NOMBRE_TAREA%" /f >nul 2>&1

:: Crear la nueva tarea (sin requerir admin)
schtasks /create ^
  /tn "%NOMBRE_TAREA%" ^
  /tr "\"%PYTHON%\" \"%SCRIPT%\"" ^
  /sc minute ^
  /mo %INTERVALO_MIN% ^
  /f

if %errorlevel% == 0 (
    echo.
    echo  OK Tarea registrada correctamente.
    echo  El tablero se actualizara cada %INTERVALO_MIN% minutos automaticamente.
    echo.
    echo  Para verla: Inicio ^> Programador de tareas ^> "%NOMBRE_TAREA%"
    echo  Para cambiar el intervalo: edita INTERVALO_MIN en este .bat y ejecútalo de nuevo.
    echo  Para detenerla: schtasks /delete /tn "%NOMBRE_TAREA%" /f
    echo.
    echo  Log de ejecuciones: %~dp0auto_update.log
) else (
    echo.
    echo  ERROR al crear la tarea. Intenta ejecutar este .bat como Administrador:
    echo  clic derecho sobre el archivo ^> "Ejecutar como administrador"
)

pause
