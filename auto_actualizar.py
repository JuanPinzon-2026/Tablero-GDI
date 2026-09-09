# auto_actualizar.py
# Version headless (sin GUI) de actualizar_dashboard.pyw
# Diseñado para correr via Windows Task Scheduler sin abrir ventana
# Log: auto_update.log en la misma carpeta

import subprocess, os, sys, logging
from datetime import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
LOG  = os.path.join(BASE, "auto_update.log")

logging.basicConfig(
    filename=LOG,
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    encoding="utf-8"
)

def log(msg):
    logging.info(msg)
    # Rotar log si supera 500 KB
    try:
        if os.path.getsize(LOG) > 500_000:
            with open(LOG, "r", encoding="utf-8") as f:
                lines = f.readlines()
            with open(LOG, "w", encoding="utf-8") as f:
                f.writelines(lines[-200:])  # conservar últimas 200 líneas
    except Exception:
        pass

def run(cmd, **kwargs):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding="utf-8", errors="replace", cwd=BASE, **kwargs
    )

def main():
    log("=" * 50)
    log("Inicio de actualización automática")

    # 1. Generar dashboard v1
    r = run(["python", os.path.join(BASE, "generar_dashboard.py")])
    if r.returncode != 0:
        log(f"ERROR generar_dashboard.py:\n{r.stderr[:500]}")
        return
    log(f"OK generar_dashboard.py — {len(r.stdout.splitlines())} líneas")

    # 2. Generar dashboard v2 (si existe)
    v2 = os.path.join(BASE, "generar_dashboard_v2.py")
    if os.path.exists(v2):
        r2 = run(["python", v2])
        if r2.returncode != 0:
            log(f"WARN generar_dashboard_v2.py:\n{r2.stderr[:300]}")
        else:
            log("OK generar_dashboard_v2.py")

    # 3. Limpiar locks de git
    for lock in [".git\\index.lock", ".git\\HEAD.lock", ".git\\refs\\heads\\main.lock"]:
        lp = os.path.join(BASE, lock)
        if os.path.exists(lp):
            os.remove(lp)
            log(f"Lock eliminado: {lock}")

    # 4. Git add + commit + push
    run(["git", "add", "."])
    commit_msg = f"Auto-actualizacion {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    commit = run(["git", "commit", "-m", commit_msg])
    if "nothing to commit" in (commit.stdout + commit.stderr):
        log("Sin cambios nuevos — nada que subir")
        return

    push = run(["git", "push", "origin", "main"])
    if push.returncode == 0:
        log("OK push a GitHub Pages exitoso")
    else:
        log(f"ERROR push:\n{push.stderr[:300]}")

    log("Actualización completada")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logging.exception(f"Error inesperado: {e}")
