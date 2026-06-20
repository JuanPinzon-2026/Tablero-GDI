# servidor_local.py
# Servidor HTTP local (puerto 5001) que actúa como puente entre el dashboard
# en el browser y la API de Jira. Las credenciales viven en jira_config.py
# y NUNCA salen al repositorio público.

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import json
import base64
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

# ── Importar credenciales ────────────────────────────────────────────────────
try:
    import jira_config as cfg
    EMAIL  = cfg.JIRA_EMAIL
    TOKEN  = cfg.JIRA_TOKEN
    DOMAIN = cfg.JIRA_DOMAIN
except ImportError:
    print("❌ No se encontró jira_config.py")
    sys.exit(1)

AUTH    = base64.b64encode(f"{EMAIL}:{TOKEN}".encode()).decode()
BASE_URL = f"https://{DOMAIN}.atlassian.net/rest/api/3"


def jira_get(path):
    req = urllib.request.Request(
        BASE_URL + path,
        headers={"Authorization": f"Basic {AUTH}", "Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def jira_post(path, data):
    payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        BASE_URL + path,
        data=payload,
        headers={
            "Authorization": f"Basic {AUTH}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    )
    req.get_method = lambda: "POST"
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read().decode()
            return json.loads(body) if body.strip() else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise Exception(f"HTTP {e.code}: {body}")


def get_transition_id(issue_key):
    """Devuelve el id de la transición que lleva a un estado de categoría 'done'."""
    data = jira_get(f"/issue/{issue_key}/transitions")
    transitions = data.get("transitions", [])

    # 1. Buscar por statusCategory = done (la más confiable)
    for t in transitions:
        cat = t.get("to", {}).get("statusCategory", {}).get("key", "")
        if cat == "done":
            return t["id"]

    # 2. Fallback por nombre conocido
    for name in ["Resuelto", "Cancelar", "Cerrar", "Done", "Closed", "Cerrado", "Resolved"]:
        for t in transitions:
            if name.lower() in t["name"].lower():
                return t["id"]

    names = [f"'{t['name']}'" for t in transitions]
    raise Exception(f"No se encontró transición de cierre. Disponibles: {names}")


def _parrafo(texto, bold=False):
    """Genera un nodo párrafo ADF."""
    marks = [{"type": "strong"}] if bold else []
    node = {"type": "text", "text": texto}
    if marks:
        node["marks"] = marks
    return {"type": "paragraph", "content": [node]}

def _parrafo2(label, valor):
    """Párrafo con label en negrita y valor normal."""
    return {
        "type": "paragraph",
        "content": [
            {"type": "text", "text": label, "marks": [{"type": "strong"}]},
            {"type": "text", "text": valor}
        ]
    }

def cerrar_jira(key, ordenes):
    """Agrega comentario estructurado con todas las órdenes del Excel y cierra el ticket."""
    fecha = datetime.now().strftime("%d/%m/%Y %H:%M")

    contenido = [
        _parrafo(f"✅ Ordenes resueltas según seguimiento Excel GDI — {fecha}", bold=True),
        {"type": "rule"},
    ]

    # Una fila por orden: Orden | Acción OPS | Comentario Continuidad | Estado de Caso (motivo del error)
    for o in ordenes:
        venta = o.get("venta", "—")
        ops   = o.get("ops",   "—")
        com   = o.get("com",   "—")
        est   = o.get("est",   "—")   # Estado de Caso / Motivo del error
        # Línea 1: Orden y acción OPS
        contenido.append(_parrafo2("Orden: ", f"{venta}  —  Acción OPS: {ops}"))
        # Línea 2: Comentario continuidad y motivo del error
        contenido.append(_parrafo2("Comentario continuidad: ", com))
        contenido.append(_parrafo2("Motivo del error: ", est))
        contenido.append({"type": "rule"})

    contenido.append(_parrafo("Cierre realizado desde el Tablero GDI (IX Comercio)."))

    jira_post(f"/issue/{key}/comment", {
        "body": {"type": "doc", "version": 1, "content": contenido}
    })

    # 2. Transicionar a Cerrado (categoría done)
    tid = get_transition_id(key)
    jira_post(f"/issue/{key}/transitions", {"transition": {"id": tid}})
    return True


# ── HTTP Handler ─────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        # Suprimir logs de acceso del servidor
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/ping":
            self._json({"ok": True, "msg": "Servidor Tablero GDI activo"})
        else:
            self._json({"ok": False, "error": "Usa POST para /cerrar-jira"}, 405)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        # ── Cerrar Jira ──────────────────────────────────────────────────────
        if parsed.path == "/cerrar-jira":
            length = int(self.headers.get("Content-Length", 0))
            raw    = self.rfile.read(length).decode("utf-8")
            try:
                body = json.loads(raw) if raw.strip() else {}
            except Exception:
                self._json({"ok": False, "error": "JSON inválido en el body"}, 400)
                return

            key     = (body.get("key") or "").strip()
            ordenes = body.get("ordenes", [])

            if not key:
                self._json({"ok": False, "error": "Falta campo 'key'"}, 400)
                return
            if not isinstance(ordenes, list):
                ordenes = [ordenes]

            print(f"  ▶ /cerrar-jira  key={key}  ordenes={len(ordenes)}")
            for i, o in enumerate(ordenes):
                print(f"    [{i}] {o}")

            try:
                cerrar_jira(key, ordenes)
                print(f"  ✅ Cerrado: {key} | {len(ordenes)} orden(es)")
                self._json({"ok": True, "key": key})
            except Exception as e:
                print(f"  ❌ Error cerrando {key}: {e}")
                self._json({"ok": False, "error": str(e)}, 500)
            return

        self._json({"ok": False, "error": "Ruta no encontrada"}, 404)

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)


# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    PORT = 5001
    server = HTTPServer(("localhost", PORT), Handler)
    print(f"🟢 Servidor Tablero GDI corriendo en http://localhost:{PORT}")
    print(f"   Endpoints: /ping  |  /cerrar-jira?key=ITHD-XXX&ops=...&com=...")
    print("   Ctrl+C para detener\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🔴 Servidor detenido.")
