#!/usr/bin/env python3
"""
generate_data.py
================
Lee los archivos Excel desde SharePoint via Microsoft Graph API
y genera data/data.json para el Dashboard v2.

Requiere variables de entorno (GitHub Secrets):
  AZURE_TENANT_ID    – ID del tenant Azure AD
  AZURE_CLIENT_ID    – App Registration Client ID
  AZURE_CLIENT_SECRET – App Registration Secret
  SHAREPOINT_SITE_ID – ID del sitio SharePoint (ver instrucciones abajo)
  DRIVE_ID           – ID del drive/biblioteca de documentos

Para obtener SHAREPOINT_SITE_ID y DRIVE_ID:
  GET https://graph.microsoft.com/v1.0/sites/{tenant}.sharepoint.com:/sites/{siteName}
  GET https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives
"""

import os, json, sys
from datetime import datetime, timezone
import requests

# ─── Config ────────────────────────────────────────────────────────────────
TENANT_ID     = os.environ['AZURE_TENANT_ID']
CLIENT_ID     = os.environ['AZURE_CLIENT_ID']
CLIENT_SECRET = os.environ['AZURE_CLIENT_SECRET']
SITE_ID       = os.environ['SHAREPOINT_SITE_ID']
DRIVE_ID      = os.environ['DRIVE_ID']

# Rutas en SharePoint (ajustar según la estructura real)
FILE_INCIDENCIAS = os.environ.get('FILE_INCIDENCIAS', 'Nathalia Moreno - Ordenes incidentadas 2026/Ordenes con novedad Junio - dic.xlsx')
FILE_INGRESADAS  = os.environ.get('FILE_INGRESADAS',  'Nathalia Moreno - Ordenes incidentadas 2026/Ingresadas diarias/ingresadas.xlsx')

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'data.json')

# ─── Auth ────────────────────────────────────────────────────────────────
def get_token():
    url = f'https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token'
    resp = requests.post(url, data={
        'grant_type':    'client_credentials',
        'client_id':     CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'scope':         'https://graph.microsoft.com/.default',
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()['access_token']

# ─── Download Excel from SharePoint ─────────────────────────────────────
def download_excel(token, file_path):
    """Descarga un archivo de SharePoint por su ruta relativa en el drive."""
    encoded = requests.utils.quote(file_path)
    url = f'https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{encoded}:/content'
    resp = requests.get(url, headers={'Authorization': f'Bearer {token}'}, timeout=60)
    if resp.status_code == 404:
        print(f'  [WARN] Archivo no encontrado: {file_path}')
        return None
    resp.raise_for_status()
    return resp.content

# ─── Parse Excel ────────────────────────────────────────────────────────
def parse_excel(content, label):
    """Lee el Excel y devuelve lista de dicts."""
    if content is None:
        return []
    try:
        import openpyxl
        from io import BytesIO
        wb = openpyxl.load_workbook(BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(h).strip() if h is not None else f'col{i}' for i, h in enumerate(rows[0])]
        result = []
        for row in rows[1:]:
            if all(v is None for v in row):
                continue
            rec = {}
            for h, v in zip(headers, row):
                if isinstance(v, datetime):
                    rec[h] = v.strftime('%Y-%m-%d')
                elif v is None:
                    rec[h] = ''
                else:
                    rec[h] = str(v).strip()
            result.append(rec)
        print(f'  [{label}] {len(result)} filas leídas')
        return result
    except Exception as e:
        print(f'  [ERROR parse {label}] {e}')
        return []

# ─── Normalize record keys ───────────────────────────────────────────────
def normalize(r):
    """Mapea columnas del Excel real a claves del dashboard."""
    # Ajustar estos mapeos según las columnas reales del Excel
    return {
        'fecha':  r.get('Fecha') or r.get('fecha') or '',
        'marca':  r.get('Marca') or r.get('marca') or '',
        'pais':   r.get('País') or r.get('Pais') or r.get('pais') or '',
        'estado': r.get('Estado') or r.get('estado') or '',
        'ops':    r.get('Ops') or r.get('ops') or r.get('Operador') or '',
        'com':    r.get('Comentario') or r.get('com') or r.get('Com') or '',
        'ov':     r.get('Orden Venta') or r.get('OV') or r.get('ov') or '',
    }

# ─── Main ────────────────────────────────────────────────────────────────
def main():
    print('=== generate_data.py ===')
    print(f'Inicio: {datetime.now(timezone.utc).isoformat()}')

    token = get_token()
    print('Token obtenido OK')

    print(f'Descargando incidencias: {FILE_INCIDENCIAS}')
    raw_inc = download_excel(token, FILE_INCIDENCIAS)
    rows_inc = parse_excel(raw_inc, 'incidencias')
    incidencias = [normalize(r) for r in rows_inc]

    print(f'Descargando ingresadas: {FILE_INGRESADAS}')
    raw_ing = download_excel(token, FILE_INGRESADAS)
    rows_ing = parse_excel(raw_ing, 'ingresadas')
    # Para ingresadas solo necesitamos la fecha
    ingresadas = [{'fecha': r.get('Fecha') or r.get('fecha') or ''} for r in rows_ing]

    data = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'incidencias': incidencias,
        'ingresadas':  ingresadas,
        'jiras':       [],   # Completar si hay fuente de Jiras
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f'data.json generado: {len(incidencias)} incidencias, {len(ingresadas)} ingresadas')
    print(f'Archivo: {os.path.abspath(OUTPUT_PATH)}')

if __name__ == '__main__':
    main()
