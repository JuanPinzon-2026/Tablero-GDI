# iniciar_scheduler.pyw
# Corre en segundo plano (sin ventana) y actualiza el tablero cada X minutos.
# Para activarlo: copiar un acceso directo de este archivo a:
#   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
# Se lanzara automaticamente al iniciar sesion en Windows.

import time, subprocess, os, logging
from datetime import datetime

BASE          = os.path.dirname(os.path.abspath(__file__))
LOG           = os.path.join(BASE, "auto_update.log")
INTERVALO_SEG = 30 * 60   # 30 minutos — cambia aqui si quieres otro intervalo

logging.basicConfig(
    filename=LOG, level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S", encoding="utf-8"
)

def run(cmd):
    return subprocess.run(
        cmd, capture_output=True, text=True,
        encoding="utf-8", errors="replace", cwd=BASE
    )

def actualizar():
    logging.info("--- Inicio actualizacion ---")

    r = run(["python", os.path.join(BASE, "generar_dashboard.py")])
    if r.returncode != 0:
        logging.info(f"ERROR generar_dashboard.py: {r.stderr[:300]}")
        return

    v2 = os.path.join(BASE, "generar_dashboard_v2.py")
    if os.path.exists(v2):
        run(["python", v2])

    for lock in [".git\\index.lock", ".git\\HEAD.lock"]:
        lp = os.path.join(BASE, lock)
        if os.path.exists(lp):
            os.remove(lp)

    run(["git", "add", "."])
    commit = run(["git", "commit", "-m",
                  f"Auto {datetime.now().strftime('%Y-%m-%d %H:%M')}"])
    if "nothing to commit" in (commit.stdout + commit.stderr):
        logging.info("Sin cambios nuevos")
        return

    push = run(["git", "push", "origin", "main"])
    if push.returncode == 0:
        logging.info("OK publicado en GitHub Pages")
    else:
        logging.info(f"ERROR push: {push.stderr[:200]}")

if __name__ == "__main__":
    logging.info(f"Scheduler iniciado — intervalo: {INTERVALO_SEG//60} min")
    # Primera ejecucion al arrancar
    try:
        actualizar()
    except Exception as e:
        logging.exception(e)

    while True:
        time.sleep(INTERVALO_SEG)
        try:
            actualizar()
        except Exception as e:
            logging.exception(e)
