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

EXCEL_JIRA = os.path.join(BASE, "Jira Tickets GDI.xlsx")

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

def leer_jira_excel(path):
    """Lee Jira Tickets GDI.xlsx y devuelve lista de dicts."""
    if not os.path.exists(path):
        print(f"  ⚠️  No se encontró: {path}")
        return []
    print(f"  Leyendo Jira Excel: {os.path.basename(path)}")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        wb.close()
        return []
    # Mapeo de columnas conocidas
    headers = [str(h).strip().lower() if h else '' for h in rows[0]]
    def col(names):
        for n in names:
            for i, h in enumerate(headers):
                if n in h:
                    return i
        return None
    i_clave      = col(['clave'])
    i_resumen    = col(['resumen'])
    i_asignado   = col(['persona asignada', 'asignada'])
    i_estado     = col(['estado'])
    i_prioridad  = col(['prioridad'])
    i_creada     = col(['creada'])
    i_resuelta   = col(['resuelta'])
    i_marca      = col(['marcas', 'comerciales'])
    i_canal      = col(['canal'])
    i_informador = col(['informador', 'reporter', 'reportado'])
    records = []
    for row in rows[1:]:
        if not any(row):
            continue
        def gv(i):
            if i is None or i >= len(row): return ''
            v = row[i]
            if isinstance(v, (datetime, date)): return v.strftime('%Y-%m-%d')
            return str(v).strip() if v is not None else ''
        clave = gv(i_clave)
        if not clave:
            continue
        records.append({
            'key':        clave,
            'resumen':    gv(i_resumen),
            'asignado':   gv(i_asignado),
            'estado':     gv(i_estado),
            'prioridad':  gv(i_prioridad),
            'creada':     gv(i_creada),
            'resuelta':   gv(i_resuelta),
            'marca':      gv(i_marca),
            'canal':      gv(i_canal),
            'informador': gv(i_informador),
        })
    wb.close()
    print(f"  -> {len(records)} tickets Jira leidos")
    return records

JIRA_EST_COLORS_PY = {
    'Resuelto': '#16A34A', 'Nuevo': '#DC2626', 'Pendiente de proveedor': '#D97706',
    'En Nivel 1': '#2563EB', 'En consulta a usuario': '#7C3AED',
    'En atencion': '#0891B2', 'Categorizado': '#64748B'
}

def prerender_jira_html(content, records_jira):
    """Pre-renderiza KPIs y tabla Jira directamente en el HTML — sin depender de JS."""
    if not records_jira:
        return content
    total     = len(records_jira)
    resueltos = sum(1 for r in records_jira if r.get('estado') == 'Resuelto')
    abiertos  = total - resueltos

    # ── KPIs (id puede ir después de style u otros atributos) ─────────────────
    content = re.sub(r'(<div[^>]+id="jkTotal"[^>]*>)[^<]*(</div>)', rf'\g<1>{total}\g<2>', content)
    content = re.sub(r'(<div[^>]+id="jkOpen"[^>]*>)[^<]*(</div>)',  rf'\g<1>{abiertos}\g<2>', content)
    content = re.sub(r'(<div[^>]+id="jkDone"[^>]*>)[^<]*(</div>)',  rf'\g<1>{resueltos}\g<2>', content)

    # ── Filas de tabla ─────────────────────────────────────────────────────────
    JIRA_BASE_URL = 'https://ixglobalit.atlassian.net/browse/'
    rows_html = []
    for r in records_jira[:300]:
        estado   = r.get('estado', '')
        color    = JIRA_EST_COLORS_PY.get(estado, '#64748B')
        rowbg    = '#F0FDF4' if estado == 'Resuelto' else ('#FEF2F2' if estado in ('Nuevo', 'En Nivel 1') else '#FFFBEB')
        key      = r.get('key', '')
        resumen  = r.get('resumen', '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
        res_disp = resumen[:80] + ('...' if len(resumen) > 80 else '')
        asignado   = r.get('asignado', '').replace('<', '&lt;').replace('>', '&gt;')
        prioridad  = r.get('prioridad', '').replace('<', '&lt;').replace('>', '&gt;')
        creada     = r.get('creada', '')
        informador = r.get('informador', '').replace('<', '&lt;').replace('>', '&gt;')
        marca      = r.get('marca', '').replace('<', '&lt;').replace('>', '&gt;')
        rows_html.append(
            f'<tr style="border-bottom:1px solid #E2E8F0;background:{rowbg}">'
            f'<td style="padding:8px 10px;white-space:nowrap;font-weight:700">{key}</td>'
            f'<td style="padding:8px 10px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="{resumen}">{res_disp}</td>'
            f'<td style="padding:8px 10px;white-space:nowrap"><span style="background:{color};color:#fff;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:700">{estado}</span></td>'
            f'<td style="padding:8px 10px;white-space:nowrap">{asignado}</td>'
            f'<td style="padding:8px 10px;white-space:nowrap">{prioridad}</td>'
            f'<td style="padding:8px 10px;white-space:nowrap">{creada}</td>'
            f'<td style="padding:8px 10px;white-space:nowrap">{informador}</td>'
            f'<td style="padding:8px 10px;white-space:nowrap">{marca}</td>'
            f'</tr>'
        )
    tbody_content = ''.join(rows_html)
    content = re.sub(
        r'<tbody id="jiraExcelBody">.*?</tbody>',
        f'<tbody id="jiraExcelBody">{tbody_content}</tbody>',
        content, flags=re.DOTALL
    )

    # ── Contador ───────────────────────────────────────────────────────────────
    count_text = f'Mostrando {min(total, 300)} de {total} tickets'
    content = re.sub(
        r'<div id="jiraExcelCount"[^>]*>[^<]*</div>',
        f'<div id="jiraExcelCount" style="margin-top:8px;font-size:12px;color:#64748B;text-align:right">{count_text}</div>',
        content
    )

    # ── Dropdown asignados (pre-poblado) ───────────────────────────────────────
    asigs = sorted(set(r.get('asignado', '') for r in records_jira if r.get('asignado')))
    asig_options = '<option value="">Todos los asignados</option>' + ''.join(
        f'<option value="{a}">{a}</option>' for a in asigs
    )
    content = re.sub(
        r'(<select id="jiraFiltroAsig"[^>]*>).*?(</select>)',
        lambda m: m.group(1) + asig_options + m.group(2),
        content, flags=re.DOTALL
    )

    print(f"✅ Jira pre-renderizado en HTML: {total} tickets ({abiertos} abiertos, {resueltos} resueltos)")
    return content

def mover_page_jira_fuera(content):
    """Mueve page-jira fuera de page-main si está anidado dentro de él."""
    pj_start = content.find('<div id="page-jira"')
    pm_start = content.find('<div id="page-main"')
    if pj_start == -1 or pm_start == -1:
        return content
    # Encontrar cierre de page-main
    depth, j = 0, pm_start
    while j < len(content):
        if content[j:j+4] == '<div': depth += 1
        elif content[j:j+6] == '</div>':
            depth -= 1
            if depth == 0: pm_end = j + 6; break
        j += 1
    if pj_start >= pm_end:
        return content  # ya está fuera
    # Extraer page-jira
    depth, i = 0, pj_start
    while i < len(content):
        if content[i:i+4] == '<div': depth += 1
        elif content[i:i+6] == '</div>':
            depth -= 1
            if depth == 0: pj_end = i + 6; break
        i += 1
    pj_html = content[pj_start:pj_end]
    # Quitar de posición original
    content2 = content.replace('\n' + pj_html, '', 1)
    if len(content2) == len(content):
        content2 = content2.replace(pj_html, '', 1)
    # Recalcular cierre de page-main en el content sin page-jira
    pm_start2 = content2.find('<div id="page-main"')
    depth, j = 0, pm_start2
    while j < len(content2):
        if content2[j:j+4] == '<div': depth += 1
        elif content2[j:j+6] == '</div>':
            depth -= 1
            if depth == 0: pm_end2 = j + 6; break
        j += 1
    content3 = content2[:pm_end2] + '\n\n' + pj_html + content2[pm_end2:]
    print("✅ page-jira reubicado como hermano de page-main")
    return content3

def actualizar_html(records_main, records_ss, records_jira):
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
    content = reemplazar_array(content, "RECORDS_JIRA", records_jira)
    if content is None: return False
    print(f"✅ RECORDS_JIRA actualizado con {len(records_jira)} tickets")
    # ── Pre-renderizar Jira en HTML (no depende de JS) ───────────────────────
    content = prerender_jira_html(content, records_jira)
    # ── Asegurar que page-jira es hermano de page-main (no hijo) ─────────────
    content = mover_page_jira_fuera(content)
    # ── Asegurar que switchTab llame initJiraExcel (igual que doInitSS/doInitKrono)
    SWITCH_JIRA_MARKER = "if(tab==='jira'){\n    initJiraExcel();"
    SWITCH_JIRA_BLOCK  = "  if(tab==='jira'){\n    initJiraExcel();\n  }"
    SWITCH_KRONOTIME   = "  if(tab==='kronotime'){\n    doInitKrono();\n    setTimeout(function(){ if(chartKronoBar) chartKronoBar.resize(); }, 300);\n  }\n}"
    if SWITCH_JIRA_MARKER not in content:
        content = content.replace(
            SWITCH_KRONOTIME,
            SWITCH_KRONOTIME.rstrip('}') + '\n' + SWITCH_JIRA_BLOCK + '\n}',
            1
        )
        print("✅ switchTab: agregado initJiraExcel() para tab jira")
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
    # ── Añadir MutationObserver para page-jira si aún no existe ─────────────
    JIRA_OBS_MARKER = "obs-jira-excel"
    JIRA_OBS_SCRIPT = (
        "\n<script id=\"obs-jira-excel\">\n"
        "(function(){\n"
        "  var el=document.getElementById('page-jira');\n"
        "  if(!el) return;\n"
        "  new MutationObserver(function(muts){\n"
        "    muts.forEach(function(m){\n"
        "      if(m.attributeName==='class' && el.classList.contains('active')){\n"
        "        if(typeof initJiraExcel==='function') initJiraExcel();\n"
        "      }\n"
        "    });\n"
        "  }).observe(el,{attributes:true});\n"
        "})();\n"
        "</script>\n"
    )
    if JIRA_OBS_MARKER not in content:
        # Insertar justo antes de </body>
        content = content.replace("</body>", JIRA_OBS_SCRIPT + "</body>", 1)
        print("✅ MutationObserver Jira añadido")
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
    url = f"https://{domain}.atlassian.net/rest/api/3/search/jql"

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

    print("\n── Leyendo Jira Excel ───────────────────────────────────────────────")
    records_jira = leer_jira_excel(EXCEL_JIRA)

    ok = actualizar_html(records_main, records_ss, records_jira)
    if not ok:
        exit(1)

    procesar_jira()

    print("\n✅ ¡Listo! Dashboard y datos Jira actualizados.")
