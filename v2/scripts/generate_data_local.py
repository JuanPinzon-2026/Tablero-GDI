#!/usr/bin/env python3
"""
generate_data_local.py
======================
Genera data/data.json leyendo los Excel locales.
Ejecutar con doble clic o: python scripts/generate_data_local.py

No requiere Azure ni SharePoint — usa las rutas locales.
"""

import os, sys, json, glob
from datetime import datetime, timezone

try:
    import openpyxl
except ImportError:
    print("Instalando openpyxl...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'openpyxl', '--break-system-packages', '-q'])
    import openpyxl

# ─── Rutas ──────────────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # v2/

EXCEL_INCIDENCIAS = os.path.join(
    os.path.expanduser('~'), 'Software Broker',
    'Nathalia Moreno - Ordenes incidentadas 2026',
    'Ordenes con novedad Junio - dic.xlsx'
)
EXCEL_INGRESADAS_DIR = os.path.join(
    os.path.expanduser('~'), 'Software Broker',
    'Nathalia Moreno - Ordenes incidentadas 2026',
    'Ingresadas diarias'
)
OUTPUT_PATH = os.path.join(BASE, 'data', 'data.json')


# ─── Helpers ────────────────────────────────────────────────────────────────
def fmt_date(v):
    if v is None:
        return ''
    if isinstance(v, datetime):
        return v.strftime('%Y-%m-%d')
    s = str(v).strip()
    # intentar parsear si viene como string
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(s[:10], fmt[:10]).strftime('%Y-%m-%d')
        except Exception:
            pass
    return s[:10]

def clean(v):
    if v is None:
        return ''
    return str(v).strip()

def extract_pais(marca_pais, marca):
    """Extrae el país de 'Marca PAIS' quitando la marca."""
    mp = clean(marca_pais)
    m  = clean(marca)
    if mp.upper().startswith(m.upper()):
        pais = mp[len(m):].strip()
    else:
        pais = mp
    return pais or mp


# ─── Leer incidencias ────────────────────────────────────────────────────────
def read_incidencias():
    print(f'\nLeyendo: {EXCEL_INCIDENCIAS}')
    if not os.path.exists(EXCEL_INCIDENCIAS):
        print(f'  [ERROR] No existe: {EXCEL_INCIDENCIAS}')
        return []

    wb = openpyxl.load_workbook(EXCEL_INCIDENCIAS, read_only=True, data_only=True)
    ws = wb.active
    records = []
    headers = None

    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            headers = list(row)
            continue
        if all(v is None for v in row[:6]):
            break
        rec = dict(zip(headers, row))

        marca     = clean(rec.get('marca'))
        marca_pais= clean(rec.get('Marca PAIS'))
        pais      = extract_pais(marca_pais, marca)
        fecha     = fmt_date(rec.get('fecha de orden'))
        # estado Y com = 'Comentario continuidad'
        com_cont  = clean(rec.get('Comentario continuidad'))
        ops       = clean(rec.get('Duplicado'))
        ov        = clean(rec.get('VENTA'))
        ticket    = clean(rec.get('Ticket'))
        pendiente = clean(rec.get('Pendiente por:'))
        proveedor = clean(rec.get('Proveedor'))
        canal     = clean(rec.get('Canal '))

        if not fecha and not ov:
            continue

        records.append({
            'fecha':     fecha,
            'fn':        fmt_date(rec.get('Fecha de notificacion JIRA')),  # fecha notif JIRA
            'marca':     marca,
            'pais':      pais,
            'estado':    com_cont,   # Comentario continuidad
            'com':       com_cont,   # mismo — para filtros isSinStock / isKrono
            'ops':       ops,        # Duplicado / Acción OPS (para isEnRevIT)
            'pen':       clean(rec.get('Pendiente por:')),  # Pendiente por
            'ov':        ov,
            'ticket':    ticket,
            'pendiente': pendiente,
            'proveedor': proveedor,
            'canal':     canal,
            'detalle':   clean(rec.get('Estado Caso')),
        })

    wb.close()
    print(f'  {len(records)} registros de incidencias')
    return records


# ─── Leer ingresadas diarias ─────────────────────────────────────────────────
def read_ingresadas():
    pattern = os.path.join(EXCEL_INGRESADAS_DIR, '*.xlsx')
    files   = glob.glob(pattern)
    print(f'\nBuscando ingresadas en: {EXCEL_INGRESADAS_DIR}')
    print(f'  {len(files)} archivos encontrados')

    records = []
    for fpath in sorted(files):
        fname = os.path.basename(fpath)
        try:
            wb = openpyxl.load_workbook(fpath, read_only=True, data_only=True)
            ws = wb.active
            headers = None
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i == 0:
                    headers = list(row)
                    continue
                if all(v is None for v in row):
                    break
                if headers is None:
                    continue
                rec = dict(zip(headers, row))

                # Intentar múltiples nombres de columna para la fecha
                fecha = (fmt_date(rec.get('fecha de orden'))
                      or fmt_date(rec.get('Fecha de orden'))
                      or fmt_date(rec.get('fecha notificacion jira'))
                      or '')

                ov    = clean(rec.get('VENTA') or rec.get('venta') or '')
                pais  = clean(rec.get('PAIS') or rec.get('Pais') or rec.get('pais') or '')
                marca = clean(rec.get('marca') or rec.get('Marca') or '')

                if not fecha:
                    continue

                records.append({
                    'fecha': fecha,
                    'ov':    ov,
                    'pais':  pais,
                    'marca': marca,
                })
            wb.close()
        except Exception as e:
            print(f'  [WARN] {fname}: {e}')

    print(f'  {len(records)} registros de ingresadas')
    return records


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    print('=' * 50)
    print('generate_data_local.py')
    print(f'Inicio: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print('=' * 50)

    incidencias = read_incidencias()
    ingresadas  = read_ingresadas()

    data = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'source': 'local',
        'incidencias': incidencias,
        'ingresadas':  ingresadas,
        'jiras':       [],
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    # Escribir data.json (para servidor HTTP / Azure)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Escribir data.js (para abrir index.html directamente sin servidor)
    js_path = OUTPUT_PATH.replace('.json', '.js')
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write('// Generado automáticamente — no editar\n')
        f.write('window.DASHBOARD_DATA = ')
        json.dump(data, f, ensure_ascii=False)
        f.write(';\n')

    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f'\n✓ Archivos generados:')
    print(f'  • {len(incidencias)} incidencias | {len(ingresadas)} ingresadas')
    print(f'  • data.json  → {size_kb:.1f} KB')
    print(f'  • data.js    → {os.path.getsize(js_path)/1024:.1f} KB')
    print(f'\nAbre src/index.html directamente en el navegador.')

if __name__ == '__main__':
    main()
