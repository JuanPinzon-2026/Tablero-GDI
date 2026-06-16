# ============================================================
#  Instalar tarea automática — Tablero GDI
#  Corre este script UNA VEZ en PowerShell como Administrador
# ============================================================

$taskName  = "TableroGDI-AutoUpdate"
$batPath   = "C:\Users\jpinz390\OneDrive - Software Broker\Dashboard\actualizar_silencioso.bat"
$logPath   = "C:\Users\jpinz390\OneDrive - Software Broker\Dashboard\auto_update.log"

# Verificar que el bat existe
if (-not (Test-Path $batPath)) {
    Write-Host "ERROR: No se encontró $batPath" -ForegroundColor Red
    exit 1
}

# Eliminar tarea anterior si existe
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Configurar la acción: correr el bat sin ventana visible
$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$batPath`" >> `"$logPath`" 2>&1"

# Disparador: cada 15 minutos, todos los días
$trigger = New-ScheduledTaskTrigger `
    -RepetitionInterval (New-TimeSpan -Minutes 15) `
    -Once `
    -At (Get-Date)

# Configuración: correr aunque el usuario no esté logueado, sin ventana
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -RunOnlyIfNetworkAvailable `
    -StartWhenAvailable

# Registrar con el usuario actual
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Actualiza el Tablero GDI cada 15 min si el Excel cambió"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Tarea '$taskName' instalada OK" -ForegroundColor Green
Write-Host "  Corre cada 15 minutos automáticamente" -ForegroundColor Green
Write-Host "  Log en: $logPath" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Para desinstalar después: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
