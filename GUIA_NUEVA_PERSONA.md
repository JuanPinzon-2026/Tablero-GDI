# Guía: Cómo habilitar a otra persona para actualizar el Tablero GDI

---

## Parte A — Lo que hace Juan (una sola vez)

### A1. Agregar a la persona como colaborador en GitHub

1. Ir a: `https://github.com/JuanPinzon-2026/Tablero-GDI/settings/access`
2. Clic en **"Add people"**
3. Buscar por usuario o correo de GitHub de la otra persona
4. Asignar rol **Write**
5. La otra persona recibirá un correo de invitación — debe aceptarlo

### A2. Generar un PAT (Token Personal de Acceso)

Si la otra persona no tiene cuenta de GitHub propia con acceso, puedes generarle un token:

1. Ir a: `https://github.com/settings/tokens/new`
2. Nombre: `Tablero GDI - [nombre persona]`
3. Expiración: 90 días (o sin expiración)
4. Scopes: marcar solo ✅ **repo**
5. Clic **Generate token**
6. **Copiar el token** y enviárselo a la persona de forma segura

---

## Parte B — Lo que hace la otra persona (una sola vez)

### Requisitos previos

| Herramienta | Descarga |
|---|---|
| Python 3.10+ | https://www.python.org/downloads/ — marcar **"Add Python to PATH"** |
| Git | https://git-scm.com/download/win — opciones por defecto |

### Paso 1 — Verificar que la carpeta OneDrive está sincronizada

La carpeta del Dashboard debe estar disponible en su equipo:
```
%USERPROFILE%\OneDrive - Software Broker\Dashboard\
```
Si no aparece, pedirle a Juan que comparta la carpeta desde OneDrive.

### Paso 2 — Ejecutar el setup

1. Abrir la carpeta `Dashboard` en el explorador
2. Hacer doble clic en **`SETUP_primera_vez.bat`**
3. Seguir las instrucciones en pantalla:
   - Ingresar nombre y correo
   - Pegar el PAT que Juan le envió
4. Al final debe mostrar ✅ CONFIGURACION COMPLETA

### Paso 3 — Actualizar el tablero

Desde ese momento, para actualizar el tablero basta con:

1. Abrir la carpeta `Dashboard`
2. Hacer doble clic en **`actualizar_dashboard.pyw`**
3. Clic en el botón **Actualizar Dashboard**

---

## Notas importantes

- El Excel de órdenes debe estar en: `%USERPROFILE%\Software Broker\Nathalia Moreno - Ordenes incidentadas 2026\`
- Si el PAT expira, hay que generar uno nuevo y volver a correr `SETUP_primera_vez.bat`
- Solo una persona debe actualizar a la vez para evitar conflictos en Git
