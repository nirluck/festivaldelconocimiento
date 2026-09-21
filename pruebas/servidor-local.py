"""
SERVIDOR LOCAL CON LAS REGLAS DE NETLIFY · Festival del Conocimiento
====================================================================

«python -m http.server» no sabe de netlify.toml, así que en local dan 404 las
páginas que en producción se reescriben: /programa/<slug>/ y /b/<slug> no
tienen un archivo propio, Netlify las sirve con la misma página y el JS decide
qué pintar leyendo la dirección.

Este servidor lee las reglas de netlify.toml y las aplica como Netlify:

  · Si la ruta existe como archivo, se sirve el archivo y la regla no cuenta
    (salvo que la regla lleve force = true).
  · status 200 reescribe: sirve el destino sin cambiar la dirección.
  · 301 y 302 redirigen.
  · «/algo/*» cubre «/algo/» y todo lo que cuelgue de ahí.

Apunta a la base REAL: config.js no se toca. Sirve para mirar las páginas
públicas con datos de verdad. Para probar escrituras sin tocar producción está
pruebas/boletos/servidor.py, contra la base desechable de Docker.

    python pruebas/servidor-local.py [puerto]         → http://localhost:8803
"""

import http.server
import os
import sys
import tomllib
from urllib.parse import urlsplit

RAIZ    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLICO = os.path.join(RAIZ, 'public')

with open(os.path.join(RAIZ, 'netlify.toml'), 'rb') as f:
    REGLAS = tomllib.load(f).get('redirects', [])


def coincide(regla, ruta):
    desde = regla['from']
    if desde.endswith('/*'):
        base = desde[:-2]
        return ruta == base or ruta == base + '/' or ruta.startswith(base + '/')
    return ruta.rstrip('/') == desde.rstrip('/')


def existe(ruta):
    local = os.path.join(PUBLICO, ruta.lstrip('/').replace('/', os.sep))
    if os.path.isfile(local):
        return True
    return os.path.isdir(local) and os.path.isfile(os.path.join(local, 'index.html'))


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=PUBLICO, **k)

    def do_GET(self):
        partes = urlsplit(self.path)
        ruta = partes.path
        for regla in REGLAS:
            if not coincide(regla, ruta):
                continue
            if existe(ruta) and not regla.get('force'):
                break
            estado = int(regla.get('status', 301))
            if estado == 200:
                self.path = regla['to'] + ('?' + partes.query if partes.query else '')
                break
            self.send_response(estado)
            self.send_header('Location', regla['to'])
            self.end_headers()
            return
        super().do_GET()

    # Sin caché: en local se trata justamente de ver el último cambio.
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8803
    print(f'Sirviendo {PUBLICO} en http://localhost:{puerto}  ({len(REGLAS)} reglas de netlify.toml)')
    http.server.ThreadingHTTPServer(('', puerto), Manejador).serve_forever()
