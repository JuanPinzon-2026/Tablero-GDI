# generar_dashboard.py
# Lee los Excel de órdenes y actualiza el index.html del Tablero GDI
# También consulta Jira API -> actualiza jira_tickets.db -> exporta jira_data.json

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import openpyxl
import json
import re
import os
from datetime import datetime, date

# ── Rutas ────────────────────────────────────────────────────────────────────
# Este script vive en la carpeta Dashboard
BASE = os.path.dirname(os.path.abspath(__file__))

# Los Excel viven en la carpeta de Órdenes Incidentadas
ORDENES_DIR = r"C:\Users\jpinz390\Software Broker\Nathalia Moreno - Ordenes incidentadas 2026"

DASHBOARD = os.path.join(BASE, "index.html")

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
        print(f"  -> Hojas prioritarias: {priority}")

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
    print(f"  -> {len(records)} registros leidos")
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
    # ── Reparar tabla Sin Stock si quedó truncada (ss-tbl-body faltante) ───────
    SS_TRUNCATED = '<th>Fecha notif.</th>'
    SS_FULL_HDR  = (
        '<th>Fecha notif.</th>\n'
        '              <th>Marca</th>\n'
        '              <th>País</th>\n'
        '              <th>Acción OPS</th>\n'
        '              <th>Pendiente por</th>\n'
        '              <th>Estado / Error</th>\n'
        '            </tr>\n'
        '          </thead>\n'
        '          <tbody id="ss-tbl-body"></tbody>\n'
        '        </table>\n'
        '      </div><!-- /overflow-x -->\n'
        '    </div><!-- /card -->\n'
        '  </div><!-- /padding -->\n'
        '\n'
        '</div><!-- /page-sinstock -->\n'
    )
    # Si el header truncado aparece SIN el tbody, lo reemplazamos completo
    if SS_TRUNCATED in content and 'ss-tbl-body' not in content:
        # Encontrar posición de la tabla truncada y reemplazar desde el th hasta el marcador kronotime
        idx = content.find(SS_TRUNCATED)
        krono_marker = '<!-- ═══ KRONOTIME ═══ -->'
        idx2 = content.find(krono_marker, idx)
        if idx2 > idx:
            content = content[:idx] + SS_FULL_HDR + '\n' + content[idx2:]
            print("✅ Tabla Sin Stock reparada (estaba truncada)")
    with open(DASHBOARD, "w", encoding="utf-8") as f:
        f.write(content)
    return True


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


    print("\n✅ ¡Listo! Dashboard actualizado.")
