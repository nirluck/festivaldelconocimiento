"""
SERVIDOR DE PRUEBA · Festival del Conocimiento
==============================================

Sirve public/ como lo haría Netlify y responde /rest/v1/… como lo haría
Supabase, pero contra la base DESECHABLE de Docker (contenedor fdc-prueba).
Así se prueban las pantallas de boletos de punta a punta sin escribir nada en
la base real.

    bash pruebas/boletos/preparar.sh
    docker exec -i fdc-prueba psql -U postgres -q < pruebas/boletos/datos-ui.sql
    python pruebas/boletos/servidor.py          → http://localhost:8802

Lo que imita, y nada más:
  · GET  /rest/v1/<tabla o vista>   select, filtros eq/neq/gt/gte/lt/lte/is/in,
                                    order, limit, offset, Prefer: count=exact
  · POST /rest/v1/rpc/<función>     argumentos por nombre, como PostgREST
  · Las reescrituras con status 200 de netlify.toml
  · config.js apunta la API a este mismo servidor

Cada consulta corre con «set role anon» y con las cabeceras en
request.headers, igual que en Supabase: las reglas por fila y los permisos son
los de verdad. La cabecera X-Prueba-IP permite simular otra dirección.

No es seguro ni rápido (un psql por petición). Es para probar, no para servir.
"""

import http.server
import json
import re
import subprocess
import sys
import tomllib
import urllib.parse
from pathlib import Path

AQUI = Path(__file__).resolve().parent
PUBLICO = (AQUI / '..' / '..' / 'public').resolve()
NETLIFY = (AQUI / '..' / '..' / 'netlify.toml').resolve()
PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8802
IDENT = re.compile(r'^[a-z_][a-z0-9_]*$')


def psql(sql):
    r = subprocess.run(
        ['docker', 'exec', '-i', 'fdc-prueba', 'psql', '-U', 'postgres', '-X', '-q', '-At',
         '-v', 'ON_ERROR_STOP=1'],
        input=sql.encode('utf-8'), capture_output=True)
    return r.returncode, r.stdout.decode('utf-8'), r.stderr.decode('utf-8')


def literal(v):
    return "'" + str(v).replace("'", "''") + "'"


def reescrituras():
    """Las reglas de netlify.toml con status 200 y comodín final."""
    try:
        cfg = tomllib.loads(NETLIFY.read_text(encoding='utf-8'))
    except Exception:
        return []
    out = []
    for r in cfg.get('redirects', []):
        if r.get('status') == 200 and r['from'].endswith('/*'):
            out.append((r['from'][:-1], r['to']))
    return out


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(PUBLICO), **k)

    def log_message(self, fmt, *args):
        sys.stderr.write('· ' + (fmt % args) + '\n')

    # ------------------------------------------------------------ utilidades
    def responder(self, codigo, cuerpo, extra=None):
        datos = cuerpo.encode('utf-8') if isinstance(cuerpo, str) else cuerpo
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(datos)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(datos)

    def error_api(self, codigo, mensaje):
        self.responder(codigo, json.dumps({'message': mensaje, 'code': 'PRUEBA', 'details': None, 'hint': None}))

    def preambulo(self):
        ip = self.headers.get('X-Prueba-IP') or self.client_address[0]
        cab = json.dumps({'x-forwarded-for': ip, 'user-agent': self.headers.get('User-Agent', '')})
        return f"set role anon;\nset request.headers = {literal(cab)};\n"

    # ------------------------------------------------------------------ GET
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path.startswith('/rest/v1/'):
            return self.leer_tabla(url)
        if url.path == '/assets/js/config.js':
            texto = (PUBLICO / 'assets/js/config.js').read_text(encoding='utf-8')
            texto = re.sub(r"export const SUPABASE_URL\s*=.*",
                           f"export const SUPABASE_URL = 'http://localhost:{PUERTO}';", texto)
            datos = texto.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)
            return
        # Reescrituras de Netlify
        destino = None
        for prefijo, a in reescrituras():
            if url.path.startswith(prefijo) and url.path != prefijo.rstrip('/') and not (PUBLICO / url.path.lstrip('/')).is_file():
                destino = a
                break
        if destino:
            self.path = destino
        return super().do_GET()

    def end_headers(self):
        if not self.path.startswith('/rest/'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def leer_tabla(self, url):
        tabla = url.path[len('/rest/v1/'):]
        if not IDENT.match(tabla):
            return self.error_api(404, 'tabla no válida')
        q = urllib.parse.parse_qsl(url.query, keep_blank_values=True)
        cols, where, orden, limite, desde = '*', [], [], None, None
        for k, v in q:
            if k == 'select':
                partes = [c.strip() for c in v.split(',') if c.strip()]
                if partes != ['*'] and not all(IDENT.match(c) for c in partes):
                    return self.error_api(400, 'select no soportado por el servidor de prueba: ' + v)
                cols = ', '.join(partes)
            elif k == 'order':
                for o in v.split(','):
                    p = o.split('.')
                    if not IDENT.match(p[0]):
                        return self.error_api(400, 'order no válido')
                    s = p[0]
                    if 'desc' in p[1:]: s += ' desc'
                    if 'nullsfirst' in p[1:]: s += ' nulls first'
                    if 'nullslast' in p[1:]: s += ' nulls last'
                    orden.append(s)
            elif k == 'limit':
                limite = int(v)
            elif k == 'offset':
                desde = int(v)
            else:
                if not IDENT.match(k):
                    return self.error_api(400, 'filtro no válido')
                op, _, val = v.partition('.')
                ops = {'eq': '=', 'neq': '<>', 'gt': '>', 'gte': '>=', 'lt': '<', 'lte': '<='}
                if op in ops:
                    where.append(f'{k} {ops[op]} {literal(val)}')
                elif op == 'is':
                    if val not in ('null', 'true', 'false'):
                        return self.error_api(400, 'is no válido')
                    where.append(f'{k} is {val}')
                elif op == 'in':
                    valores = [x.strip().strip('"') for x in val.strip('()').split(',') if x.strip()]
                    where.append(f'{k} in ({", ".join(literal(x) for x in valores)})' if valores else 'false')
                else:
                    return self.error_api(400, f'operador {op} no soportado por el servidor de prueba')
        w = (' where ' + ' and '.join(where)) if where else ''
        sql = (self.preambulo()
               + f'select coalesce(json_agg(t), \'[]\') from (select {cols} from public.{tabla}{w}'
               + (' order by ' + ', '.join(orden) if orden else '')
               + (f' limit {limite}' if limite is not None else '')
               + (f' offset {desde}' if desde is not None else '')
               + ') t;\n'
               + f'select count(*) from public.{tabla}{w};\n')
        codigo, salida, err = psql(sql)
        if codigo != 0:
            return self.error_api(400, err.strip().splitlines()[0] if err.strip() else 'error')
        filas_txt, total = salida.strip().rsplit('\n', 1)
        filas = json.loads(filas_txt)
        extra = {}
        if 'count=exact' in (self.headers.get('Prefer') or ''):
            fin = (desde or 0) + len(filas) - 1
            extra['Content-Range'] = f'{desde or 0}-{fin}/{total}' if filas else f'*/{total}'
        if 'vnd.pgrst.object' in (self.headers.get('Accept') or ''):
            if len(filas) != 1:
                return self.error_api(406, 'JSON object requested, multiple (or no) rows returned')
            return self.responder(200, json.dumps(filas[0]), extra)
        self.responder(200, json.dumps(filas), extra)

    # ----------------------------------------------------------------- POST
    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        if not url.path.startswith('/rest/v1/rpc/'):
            return self.error_api(404, 'solo /rest/v1/rpc/ en el servidor de prueba')
        fn = url.path[len('/rest/v1/rpc/'):]
        if not IDENT.match(fn):
            return self.error_api(404, 'función no válida')
        largo = int(self.headers.get('Content-Length') or 0)
        try:
            cuerpo = json.loads(self.rfile.read(largo) or b'{}')
        except json.JSONDecodeError:
            return self.error_api(400, 'JSON no válido')

        codigo, salida, err = psql(
            "select pg_get_function_arguments(p.oid), p.proretset from pg_proc p "
            f"where p.proname = {literal(fn)} and p.pronamespace = 'public'::regnamespace limit 1;")
        if codigo != 0 or not salida.strip():
            return self.error_api(404, f'Could not find the function public.{fn}')
        firma, conjunto = salida.strip().rsplit('|', 1)
        tipos = {}
        for arg in [a.strip() for a in firma.split(', ') if a.strip()]:
            m = re.match(r'^(?:IN\s+)?(\w+)\s+(.+?)(?:\s+DEFAULT\s+.*)?$', arg)
            if m:
                tipos[m.group(1)] = m.group(2)

        args = []
        for k, v in cuerpo.items():
            if k not in tipos:
                return self.error_api(404, f'La función {fn} no tiene el argumento {k}')
            if v is None:
                args.append(f'{k} => null::{tipos[k]}')
            elif isinstance(v, (list, dict)):
                if tipos[k].endswith('[]'):
                    args.append(f"{k} => array(select jsonb_array_elements_text({literal(json.dumps(v))}::jsonb))::{tipos[k]}")
                else:
                    args.append(f'{k} => {literal(json.dumps(v))}::{tipos[k]}')
            else:
                val = json.dumps(v) if isinstance(v, bool) else str(v)
                args.append(f'{k} => {literal(val)}::{tipos[k]}')
        llamada = f'public.{fn}({", ".join(args)})'
        if conjunto.strip() == 't':
            sql = f'select coalesce(json_agg(t), \'[]\') from {llamada} t;'
        else:
            sql = f'select to_jsonb({llamada});'
        codigo, salida, err = psql(self.preambulo() + sql + '\n')
        if codigo != 0:
            linea = next((l for l in err.splitlines() if l.startswith('ERROR:')), err.strip())
            return self.error_api(400, linea.replace('ERROR:', '').strip())
        self.responder(200, salida.strip() or 'null')

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()


if __name__ == '__main__':
    print(f'Servidor de prueba en http://localhost:{PUERTO}  (sitio: {PUBLICO})')
    http.server.ThreadingHTTPServer(('127.0.0.1', PUERTO), Manejador).serve_forever()
