# generar_dashboard_v2.py
# Delegador: llama a v2/scripts/generate_data_local.py para generar
# v2/data/data.json y v2/data/data.js (arquitectura actual del Dashboard V2).
#
# NOTA: El flujo anterior que inyectaba datos cifrados en index_v2.html via
# _RECORDS_ENC/_RECORDS_SS_ENC/_IXC_ENC fue reemplazado. index_v2.html ya no
# tiene esas variables — la arquitectura V2 usa v2/data/data.json + data.js.

import sys, io, os, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from datetime import datetime

BASE   = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(BASE, "v2", "scripts", "generate_data_local.py")


def main():
    print(f"\n{'='*50}")
    print(f"  Tablero GDI v2 - Generador de Dashboard")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}\n")

    if not os.path.exists(SCRIPT):
        print(f"ERROR No se encontro el script: {SCRIPT}")
        sys.exit(1)

    print(f"  Ejecutando: v2/scripts/generate_data_local.py")
    result = subprocess.run(
        [sys.executable, SCRIPT],
        capture_output=True, text=True,
        encoding="utf-8", errors="replace",
        cwd=os.path.join(BASE, "v2")
    )

    # Redirigir stdout/stderr del sub-proceso a la consola
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)

    if result.returncode != 0:
        print(f"\n[v2] ERROR generate_data_local.py salio con codigo {result.returncode}")
        sys.exit(1)

    print("\nOK v2/data/data.json y data.js actualizados.")


if __name__ == "__main__":
    main()
