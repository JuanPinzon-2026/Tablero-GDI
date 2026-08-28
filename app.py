# app.py — Tablero GDI v2 — Flask API
# Sirve datos desde tablero.db (SQLite) y el HTML estático
# Correr localmente: python app.py
# En Azure App Service: gunicorn app:app

import os, sqlite3, json
from flask import Flask, jsonify, send_from_directory, abort
from datetime import datetime

BASE    = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "tablero.db")

app = Flask(__name__, static_folder=BASE)

# ── CORS (para desarrollo local con Live Server o similar) ───────────────────
@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

# ── Helpers ------------------------------------------------------------------
def get_db():
    if not os.path.exists(DB_PATH):
        abort(503, description="Base de datos no encontrada. Ejecuta sync_to_db.py primero.")
    return sqlite3.connect(DB_PATH)

def row_to_dict(cursor, row):
    cols = [d[0] for d in cursor.description]
    return dict(zip(cols, row))

# ── Endpoints ────────────────────────────────────────────────────────────────

@app.route("/api/data")
def api_data():
    """Devuelve todas las órdenes separadas en main y ss (sin stock)."""
    conn = get_db()
    cur  = conn.cursor()
    cur.execute("SELECT fo,fn,com,est,pen,marca,pais,dup,ops,venta,ticket,prov,sin_stock,fuente FROM ordenes")
    rows = cur.fetchall()
    conn.close()

    main_records = []
    ss_records   = []
    for row in rows:
        r = {
            "fo":     row[0] or "",
            "fn":     row[1] or "",
            "com":    row[2] or "",
            "est":    row[3] or "",
            "pen":    row[4] or "",
            "marca":  row[5] or "",
            "pais":   row[6] or "",
            "dup":    row[7] or "",
            "ops":    row[8] or "",
            "venta":  row[9] or "",
            "ticket": row[10] or "",
            "prov":   row[11] or "",
        }
        sin_stock = row[12]
        fuente    = row[13]
        main_records.append(r)
        if sin_stock:
            ss_records.append(r)

    return jsonify({"main": main_records, "ss": ss_records})


@app.route("/api/ixc")
def api_ixc():
    """Devuelve totales IXC por fecha: {YYYY-MM-DD: total}"""
    conn = get_db()
    cur  = conn.cursor()
    cur.execute("SELECT fecha, total FROM ixc_totales ORDER BY fecha")
    rows = cur.fetchall()
    conn.close()
    return jsonify({row[0]: row[1] for row in rows})


@app.route("/api/meta")
def api_meta():
    """Devuelve metadatos: última sincronización, total registros."""
    conn = get_db()
    cur  = conn.cursor()
    cur.execute("SELECT valor FROM meta WHERE clave='ultima_sync'")
    row = cur.fetchone()
    ultima_sync = row[0] if row else None
    cur.execute("SELECT COUNT(*) FROM ordenes")
    total = cur.fetchone()[0]
    conn.close()
    return jsonify({"ultima_sync": ultima_sync, "total_ordenes": total})


@app.route("/api/sync", methods=["POST"])
def api_sync():
    """Dispara sync_to_db.py manualmente (útil desde webhook de OneDrive)."""
    import subprocess
    script = os.path.join(BASE, "sync_to_db.py")
    if not os.path.exists(script):
        return jsonify({"ok": False, "error": "sync_to_db.py no encontrado"}), 404
    result = subprocess.run(
        ["python", script],
        capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=BASE
    )
    ok = result.returncode == 0
    return jsonify({
        "ok":     ok,
        "stdout": result.stdout[-2000:],
        "stderr": result.stderr[-500:] if not ok else ""
    }), 200 if ok else 500


# ── Sirve el HTML ------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(BASE, "index_v2.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(BASE, filename)


# ── Entry point --------------------------------------------------------------
if __name__ == "__main__":
    print(f"\n  Tablero GDI v2 — API Flask")
    print(f"  DB: {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print("  AVISO: tablero.db no existe. Ejecuta 'python sync_to_db.py' primero.")
    print(f"  Abre: http://localhost:5000\n")
    app.run(debug=True, port=5000)
