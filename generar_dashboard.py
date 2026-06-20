# generar_dashboard.py
# Lee los Excel de órdenes y actualiza el index.html del Tablero GDI
# También consulta Jira API → actualiza jira_tickets.db → exporta jira_data.json

import openpyxl
import json
import re
import os
import sqlite3
import urllib.request
import urllib.parse
import base64
from datetime import datetime, date

# ── Rutas ────────────────────────────────────────────────────────────────────
# Este script vive en la carpeta Dashboard
BASE = os.path.dirname(os.path.abspath(__file__))

# Los Excel viven en la carpeta de Órdenes Incidentadas
ORDENES_DIR = r"C:\Users\jpinz390\Software Broker\Nathalia Moreno - Ordenes incidentadas 2026"

DASHBOARD = os.path.join(BASE, "index.html")
JIRA_DB   = os.path.join(BASE, "jira_tickets.db")
JIRA_JSON = os.path.join(BASE, "jira_data.json")

EXCELS_MAIN = [
    os.path.join(ORDENES_DIR, "Ordenes con novedad Junio - dic.xlsx"),
]

EXCELS_SS = [
    os.path.join(ORDENES_DIR, "Ordenes con novedad Enero (1).xlsx"),
    os.path.join(ORDENES_DIR, "Ordenes con novedad Junio - dic.xlsx"),
]

# ── Mapeo de columnas ─────────────────────────────────────────────────────────
PRIORITY_SHEETS = ["novedad", "ordenes", "data", "datos", "incidentadas"]

COLUMN_MAP = {
    "fo":    ["fecha de orden", "fecha orden", "fecha_orden", "fo", "f. orden", "fecha oc"],
    "fn":    ["fecha de notificacion jira", "fecha notificacion", "fecha novedad", "fecha_novedad", "fn", "f. novedad", "fecha nov", "fecha de notificacion"],
    "com":   ["comentario continuidad", "rta continuidad", "comentario", "continuidad", "com", "comentarios"],
    "est":   ["estado caso", "error", "estado", "error / estado", "error/estado", "est", "descripcion", "descripción", "motivo"],
    "pen":   ["pendiente por:", "pendiente por", "pendiente", "pen", "pendiente x", "pend"],
    "marca": ["marca", "brand", "cliente", "tienda"],
    "pais":  ["marca pais", "pais", "país", "marca_pais", "country"],
    "ops":   ["accion ops", "acción ops", "ops", "accion_ops", "accion", "acción"],
    "venta": ["venta", "nro venta", "nº venta", "numero venta", "orden", "order", "nro orden", "numero de orden", "ticket"],
}

def normalizar(s):
    if not isinstance(s, str):
        return ""
    s = s.lower().strip()
    for a, b in [("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),("ñ","n")]:
        s = s.replace(a, b)
    return s

def detectar_columnas(headers):
    norm_headers = [(i, normalizar(str(h))) for i, h in enumerate(headers) if h]
    mapping = {}
    for campo, candidatos in COLUMN_MAP.items():
        best_col = None
        best_score = -1
        for i, nh in norm_headers:
            for c in candidatos:
                if c == nh:
                    score = len(c) * 100
                elif c in nh:
                    score = len(c)
                elif nh in c:
                    score = len(nh)
                else:
                    continue
                if score > best_score:
                    best_score = score
                    best_col = i
        if best_col is not None:
            mapping[campo] = best_col
    requeridos = {"fo", "fn", "com", "est", "pen", "marca", "ops"}
    faltantes = requeridos - set(mapping.keys())
    if faltantes:
        print(f"  ⚠️  Columnas no encontradas: {faltantes}")
        print(f"  Headers detectados: {[h for _,h in norm_headers]}")
    return mapping

def fmt_fecha(val):
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, str) and val.strip():
        return val.strip()[:10]
    return ""

def leer_excel(path):
    print(f"  Leyendo: {os.path.basename(path)}")
    if not os.path.exists(path):
        print(f"  ❌ No existe: {path}")
        return []

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    records = []

    sheets_to_read = wb.sheetnames
    priority = [s for s in wb.sheetnames if normalizar(s) in PRIORITY_SHEETS]
    if priority:
        sheets_to_read = priority
        print(f"  → Hojas prioritarias: {priority}")

    for sheet_name in sheets_to_read:
        ws = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue

        header_row = None
        header_idx = 0
        for idx, row in enumerate(rows[:5]):
            if any(cell for cell in row if cell):
                header_row = row
                header_idx = idx
                break

        if header_row is None:
            print(f"  ⚠️  Hoja '{sheet_name}' vacía, omitiendo.")
            continue

        col_map = detectar_columnas(header_row)
        if len(col_map) < 6:
            print(f"  ⚠️  Hoja '{sheet_name}': pocas columnas ({len(col_map)}), omitiendo.")
            continue

        print(f"  ✅ Hoja '{sheet_name}': {len(col_map)} columnas mapeadas")

        for row in rows[header_idx + 1:]:
            if not any(row):
                continue

            def get(campo):
                idx = col_map.get(campo)
                if idx is None or idx >= len(row):
                    return ""
                val = row[idx]
                return str(val).strip() if val is not None else ""

            fo = fmt_fecha(row[col_map["fo"]] if "fo" in col_map and col_map["fo"] < len(row) else "")
            fn = fmt_fecha(row[col_map["fn"]] if "fn" in col_map and col_map["fn"] < len(row) else "")
            ops_val = get("ops")
            if not fo and not fn and not ops_val:
                continue

            records.append({
                "fo":    fo,
                "fn":    fn,
                "com":   get("com"),
                "est":   get("est"),
                "pen":   get("pen"),
                "marca": get("marca"),
                "pais":  get("pais"),
                "ops":   ops_val,
                "venta": get("venta"),
            })

    wb.close()
    print(f"  → {len(records)} registros leídos")
    return records

def reemplazar_array(content, variable, records):
    m = re.search(rf'{variable}\s*=\s*\[', content)
    if not m:
        print(f"❌ No se encontró '{variable}' en index.html")
        return None
    start_bracket = m.end() - 1
    depth = 0
    end_bracket = start_bracket
    for i in range(start_bracket, len(content)):
        if content[i] == '[': depth += 1
        elif content[i] == ']':
            depth -= 1
            if depth == 0: end_bracket = i; break
    new_json = json.dumps(records, ensure_ascii=False, separators=(",", ":"))
    return content[:start_bracket] + new_json + content[end_bracket + 1:]

def actualizar_html(records_main, records_ss):
    if not os.path.exists(DASHBOARD):
        print(f"❌ No se encontró: {DASHBOARD}")
        return False
    with open(DASHBOARD, "r", encoding="utf-8") as f:
        content = f.read()
    content = reemplazar_array(content, "RECORDS_SS", records_ss)
    if content is None: return False
    print(f"✅ RECORDS_SS actualizado con {len(records_ss)} registros")
    content = reemplazar_array(content, "RECORDS", records_main)
    if content is None: return False
    print(f"✅ RECORDS actualizado con {len(records_main)} registros")
    with open(DASHBOARD, "w", encoding="utf-8") as f:
        f.write(content)
    return True

# ── Jira ─────────────────────────────────────────────────────────────────────
def init_jira_db():
    conn = sqlite3.connect(JIRA_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tickets (
            key            TEXT PRIMARY KEY,
            summary        TEXT,
            status         TEXT,
            status_cat     TEXT,
            assignee       TEXT,
            assignee_email TEXT,
            priority       TEXT,
            created        TEXT,
            updated        TEXT,
            auto_updated   TEXT,
            comentario_gdi   TEXT DEFAULT '',
            escalamiento     TEXT DEFAULT '',
            seguimiento      TEXT DEFAULT '',
            estado_interno   TEXT DEFAULT ''
        )
    """)
    conn.commit()
    return conn

def consultar_jira(email, token, domain, jql, max_results=200):
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    url = f"https://{domain}.atlassian.net/rest/api/3/search"

    # Usar POST (método recomendado por Jira Cloud para queries complejas)
    payload = json.dumps({
        "jql": jql,
        "maxResults": max_results,
        "fields": ["summary", "status", "assignee", "priority", "created", "updated"]
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Basic {auth}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        issues = []
        for i in data.get("issues", []):
            f = i.get("fields", {})
            issues.append({
                "key":           i["key"],
                "summary":       f.get("summary") or "",
                "status":        (f.get("status") or {}).get("name") or "",
                "status_cat":    ((f.get("status") or {}).get("statusCategory") or {}).get("key") or "",
                "assignee":      (f.get("assignee") or {}).get("displayName") or "Sin asignar",
                "assignee_email":(f.get("assignee") or {}).get("emailAddress") or "",
                "priority":      (f.get("priority") or {}).get("name") or "",
                "created":       (f.get("created") or "")[:10],
                "updated":       (f.get("updated") or "")[:10],
            })
        print(f"  ✅ Jira: {len(issues)} tickets (total API: {data.get('total',0)})")
        return issues
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  ❌ Jira HTTP {e.code} {e.reason}: {body[:300]}")
        return None
    except Exception as e:
        print(f"  ❌ Error consultando Jira: {e}")
        return None

def actualizar_jira_db(conn, issues):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    nuevos = actualizados = 0
    for t in issues:
        existe = conn.execute("SELECT key FROM tickets WHERE key=?", (t["key"],)).fetchone()
        if existe:
            conn.execute("""
                UPDATE tickets SET summary=?, status=?, status_cat=?, assignee=?,
                assignee_email=?, priority=?, created=?, updated=?, auto_updated=?
                WHERE key=?
            """, (t["summary"], t["status"], t["status_cat"], t["assignee"],
                  t["assignee_email"], t["priority"], t["created"], t["updated"],
                  now, t["key"]))
            actualizados += 1
        else:
            conn.execute("""
                INSERT INTO tickets
                (key, summary, status, status_cat, assignee, assignee_email,
                 priority, created, updated, auto_updated,
                 comentario_gdi, escalamiento, seguimiento, estado_interno)
                VALUES (?,?,?,?,?,?,?,?,?,?,'','','','')
            """, (t["key"], t["summary"], t["status"], t["status_cat"],
                  t["assignee"], t["assignee_email"], t["priority"],
                  t["created"], t["updated"], now))
            nuevos += 1
    conn.commit()
    print(f"  ✅ SQLite: {nuevos} nuevos, {actualizados} actualizados")

def exportar_jira_json(conn):
    rows = conn.execute("""
        SELECT key, summary, status, status_cat, assignee, assignee_email,
               priority, created, updated, auto_updated,
               comentario_gdi, escalamiento, seguimiento, estado_interno
        FROM tickets ORDER BY updated DESC
    """).fetchall()
    cols = ["key","summary","status","cat","asignado","email",
            "prioridad","creado","actualizado","auto_updated",
            "comentario_gdi","escalamiento","seguimiento","estado_interno"]
    issues = [dict(zip(cols, r)) for r in rows]
    data = {"total": len(issues), "issues": issues, "ts": datetime.now().isoformat()}
    with open(JIRA_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",",":"))
    print(f"  ✅ jira_data.json: {len(issues)} tickets exportados")

def procesar_jira():
    print("\n── Integración Jira ─────────────────────────────────────────────")
    import sys
    if BASE not in sys.path:
        sys.path.insert(0, BASE)
    try:
        from jira_config import JIRA_EMAIL, JIRA_TOKEN, JIRA_DOMAIN, JIRA_JQL, JIRA_MAX_RESULTS
    except ImportError:
        print("  ⚠️  jira_config.py no encontrado — omitiendo integración Jira")
        return
    conn = init_jira_db()
    issues = consultar_jira(JIRA_EMAIL, JIRA_TOKEN, JIRA_DOMAIN, JIRA_JQL, JIRA_MAX_RESULTS)
    if issues is not None:
        actualizar_jira_db(conn, issues)
    exportar_jira_json(conn)
    conn.close()

# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"\n{'='*50}")
    print(f"  Tablero GDI — Generador de Dashboard")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}\n")

    records_main = []
    for path in EXCELS_MAIN:
        records_main.extend(leer_excel(path))
    print(f"\nRECORDS (principal): {len(records_main)} registros\n")

    records_ss = []
    for path in EXCELS_SS:
        records_ss.extend(leer_excel(path))
    print(f"RECORDS_SS (sin stock): {len(records_ss)} registros\n")

    if not records_main:
        print("⚠️  Sin registros en archivo principal.")
        exit(1)

    ok = actualizar_html(records_main, records_ss)
    if not ok:
        exit(1)

    procesar_jira()

    print("\n✅ ¡Listo! Dashboard y datos Jira actualizados.")
