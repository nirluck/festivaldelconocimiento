"""
SERVIDOR DE PRUEBA · Festival del Conocimiento
==============================================

Sirve public/ como lo haría Netlify y responde /rest/v1/… y /auth/v1/… como
lo haría Supabase, pero contra la base DESECHABLE de Docker (contenedor
fdc-prueba). Así se prueban las pantallas de punta a punta sin escribir nada en
la base real.

    bash pruebas/boletos/preparar.sh
    docker exec -i fdc-prueba psql -U postgres -q < pruebas/boletos/datos-ui.sql
    python pruebas/boletos/servidor.py          → http://localhost:8802

Lo que imita, y nada más:
  · GET    /rest/v1/<tabla o vista>  select, filtros eq/neq/gt/gte/lt/lte/is/in,
                                     order, limit, offset, Prefer: count=exact
  · POST   /rest/v1/<tabla>          insert (objeto o lista)
  · PATCH  /rest/v1/<tabla>?filtros  update
  · DELETE /rest/v1/<tabla>?filtros  delete
  · POST   /rest/v1/rpc/<función>    argumentos por nombre, como PostgREST
  · POST   /auth/v1/token            entrar con el correo de cualquier cuenta de
                                     auth.users; la contraseña es «prueba»
  · GET    /auth/v1/user · POST /auth/v1/logout
  · Las reescrituras con status 200 de netlify.toml
  · config.js apunta la API a este mismo servidor

Cada consulta corre con «set role anon», o con «authenticated» y
request.jwt.claim.sub si trae un token de /auth/v1/token, y con las cabeceras
en request.headers, igual que en Supabase: las reglas por fila y los permisos
son los de verdad. Los tokens NO van firmados. La cabecera X-Prueba-IP
permite simular otra dirección.

No es seguro ni rápido (un psql por petición). Es para probar, no para servir.
"""

import base64
import http.server
import json
import re
import subprocess
import sys
import time
import tomllib
import urllib.parse
from pathlib import Path

AQUI = Path(__file__).resolve().parent
PUBLICO = (AQUI / '..' / '..' / 'public').resolve()
NETLIFY = (AQUI / '..' / '..' / 'netlify.toml').resolve()
PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8802
IDENT = re.compile(r'^[a-z_][a-z0-9_]*$')
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')


def psql(sql):
    r = subprocess.run(
        ['docker', 'exec', '-i', 'fdc-prueba', 'psql', '-U', 'postgres', '-X', '-q', '-At',
         '-v', 'ON_ERROR_STOP=1'],
        input=sql.encode('utf-8'), capture_output=True)
    return r.returncode, r.stdout.decode('utf-8'), r.stderr.decode('utf-8')


def mensaje_psql(err):
    linea = next((l for l in err.splitlines() if l.startswith('ERROR:')), err.strip() or 'error')
    return linea.replace('ERROR:', '').strip()


def literal(v):
    return "'" + str(v).replace("'", "''") + "'"


def b64(datos):
    return base64.urlsafe_b64encode(json.dumps(datos).encode()).decode().rstrip('=')


def reescrituras():
    """Las reglas de netlify.toml con status 200 y comodín final."""
    try:
        cfg = tomllib.loads(NETLIFY.read_text(encoding='utf-8'))
    except Exception:
        return []
    return [(r['from'][:-1], r['to']) for r in cfg.get('redirects', [])
            if r.get('status') == 200 and r['from'].endswith('/*')]


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(PUBLICO), **k)

    def log_message(self, fmt, *args):
        sys.stderr.write('· ' + (fmt % args) + '\n')

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

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

    def sin_cuerpo(self, codigo):
        self.send_response(codigo)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def leer_cuerpo(self):
        largo = int(self.headers.get('Content-Length') or 0)
        try:
            return json.loads(self.rfile.read(largo) or b'{}')
        except json.JSONDecodeError:
            return None

    def usuario(self):
        """El id del token, si la petición trae uno emitido por este servidor."""
        tok = (self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
        partes = tok.split('.')
        if len(partes) != 3 or partes[2] != 'prueba':
            return None
        try:
            carga = json.loads(base64.urlsafe_b64decode(partes[1] + '==='))
        except Exception:
            return None
        sub = str(carga.get('sub', ''))
        return sub if UUID.match(sub) else None

    def preambulo(self):
        ip = self.headers.get('X-Prueba-IP') or self.client_address[0]
        cab = json.dumps({'x-forwarded-for': ip, 'user-agent': self.headers.get('User-Agent', '')})
        sub = self.usuario()
        rol = 'authenticated' if sub else 'anon'
        return (f"set role {rol};\n"
                f"set request.jwt.claim.sub = {literal(sub or '')};\n"
                f"set request.headers = {literal(cab)};\n")

    # ------------------------------------------------------------------ auth
    def sesion(self, uid, correo):
        exp = int(time.time()) + 3600
        jwt = (b64({'alg': 'HS256', 'typ': 'JWT'}) + '.'
               + b64({'sub': uid, 'email': correo, 'role': 'authenticated',
                      'aud': 'authenticated', 'exp': exp}) + '.prueba')
        usuario = {'id': uid, 'aud': 'authenticated', 'role': 'authenticated', 'email': correo,
                   'app_metadata': {'provider': 'email'}, 'user_metadata': {},
                   'created_at': '2026-01-01T00:00:00Z'}
        return {'access_token': jwt, 'token_type': 'bearer', 'expires_in': 3600,
                'expires_at': exp, 'refresh_token': 'prueba-' + uid, 'user': usuario}

    def correo_de(self, uid):
        if not UUID.match(uid or ''):
            return ''
        _, salida, _ = psql(f"select email from auth.users where id = {literal(uid)};")
        return salida.strip()

    def auth(self, url, cuerpo):
        ruta = url.path
        if ruta == '/auth/v1/logout':
            return self.sin_cuerpo(204)
        if ruta == '/auth/v1/user':
            uid = self.usuario()
            if not uid:
                return self.responder(401, json.dumps({'msg': 'Sin sesión'}))
            return self.responder(200, json.dumps(self.sesion(uid, self.correo_de(uid))['user']))
        if ruta == '/auth/v1/token':
            q = dict(urllib.parse.parse_qsl(url.query))
            if q.get('grant_type') == 'refresh_token':
                uid = str(cuerpo.get('refresh_token') or '').removeprefix('prueba-')
                correo = self.correo_de(uid)
                if not correo:
                    return self.responder(400, json.dumps({'error': 'invalid_grant',
                                                           'error_description': 'Invalid Refresh Token'}))
                return self.responder(200, json.dumps(self.sesion(uid, correo)))
            correo = str(cuerpo.get('email') or '').lower()
            _, salida, _ = psql(f"select id from auth.users where lower(email) = {literal(correo)};")
            if not salida.strip() or cuerpo.get('password') != 'prueba':
                return self.responder(400, json.dumps({'error': 'invalid_grant', 'code': 'invalid_credentials',
                                                       'error_description': 'Invalid login credentials',
                                                       'msg': 'Invalid login credentials'}))
            return self.responder(200, json.dumps(self.sesion(salida.strip(), correo)))
        return self.error_api(404, 'auth no simulado: ' + ruta)

    # ----------------------------------------------------------- consultas
    def interpretar(self, url):
        """select, filtros, order, limit y offset. Devuelve un texto si hay error."""
        q = urllib.parse.parse_qsl(url.query, keep_blank_values=True)
        cols, where, orden, limite, desde = '*', [], [], None, None
        ops = {'eq': '=', 'neq': '<>', 'gt': '>', 'gte': '>=', 'lt': '<', 'lte': '<='}
        for k, v in q:
            if k == 'select':
                partes = [c.strip() for c in v.split(',') if c.strip()]
                if partes != ['*'] and not all(IDENT.match(c) for c in partes):
                    return 'select no soportado por el servidor de prueba: ' + v
                cols = ', '.join(partes)
            elif k == 'order':
                for o in v.split(','):
                    p = o.split('.')
                    if not IDENT.match(p[0]):
                        return 'order no válido'
                    s = p[0]
                    if 'desc' in p[1:]:
                        s += ' desc'
                    if 'nullsfirst' in p[1:]:
                        s += ' nulls first'
                    if 'nullslast' in p[1:]:
                        s += ' nulls last'
                    orden.append(s)
            elif k in ('columns', 'on_conflict'):
                continue
            elif k == 'limit':
                limite = int(v)
            elif k == 'offset':
                desde = int(v)
            else:
                if not IDENT.match(k):
                    return 'filtro no válido'
                op, _, val = v.partition('.')
                if op in ops:
                    where.append(f'{k} {ops[op]} {literal(val)}')
                elif op == 'is':
                    if val not in ('null', 'true', 'false'):
                        return 'is no válido'
                    where.append(f'{k} is {val}')
                elif op == 'in':
                    valores = [x.strip().strip('"') for x in val.strip('()').split(',') if x.strip()]
                    where.append(f'{k} in ({", ".join(literal(x) for x in valores)})' if valores else 'false')
                else:
                    return f'operador {op} no soportado por el servidor de prueba'
        return cols, where, orden, limite, desde

    def leer_tabla(self, url):
        tabla = url.path[len('/rest/v1/'):]
        if not IDENT.match(tabla):
            return self.error_api(404, 'tabla no válida')
        c = self.interpretar(url)
        if isinstance(c, str):
            return self.error_api(400, c)
        cols, where, orden, limite, desde = c
        w = (' where ' + ' and '.join(where)) if where else ''
        sql = (self.preambulo()
               + f"select coalesce(json_agg(t), '[]') from (select {cols} from public.{tabla}{w}"
               + (' order by ' + ', '.join(orden) if orden else '')
               + (f' limit {limite}' if limite is not None else '')
               + (f' offset {desde}' if desde is not None else '')
               + ') t;\n'
               + f'select count(*) from public.{tabla}{w};\n')
        codigo, salida, err = psql(sql)
        if codigo != 0:
            return self.error_api(400, mensaje_psql(err))
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

    def escribir(self, metodo, url, cuerpo):
        tabla = url.path[len('/rest/v1/'):]
        if not IDENT.match(tabla):
            return self.error_api(404, 'tabla no válida')
        c = self.interpretar(url)
        if isinstance(c, str):
            return self.error_api(400, c)
        cols, where, _, _, _ = c
        w = (' where ' + ' and '.join(where)) if where else ''
        cuerpo_sql = literal(json.dumps(cuerpo)) + '::jsonb'
        if metodo == 'POST':
            filas = cuerpo if isinstance(cuerpo, list) else [cuerpo]
            claves = sorted({k for f in filas for k in f})
            if not claves or not all(IDENT.match(k) for k in claves):
                return self.error_api(400, 'columna no válida')
            lista = ', '.join(claves)
            orden = (f"insert into public.{tabla} ({lista}) select {lista} from "
                     f"jsonb_populate_recordset(null::public.{tabla}, {literal(json.dumps(filas))}::jsonb) returning *")
        elif metodo == 'PATCH':
            claves = sorted(cuerpo)
            if not claves or not all(IDENT.match(k) for k in claves):
                return self.error_api(400, 'columna no válida')
            # Una subconsulta por columna: con «from … r» los filtros (id = …)
            # serían ambiguos entre la tabla y el registro.
            asignaciones = ', '.join(
                f'{k} = (select {k} from jsonb_populate_record(null::public.{tabla}, {cuerpo_sql}))'
                for k in claves)
            orden = f"update public.{tabla} set {asignaciones}{w} returning *"
        else:
            orden = f"delete from public.{tabla}{w} returning *"
        sql = (self.preambulo()
               + f"with t as ({orden}) select coalesce(json_agg(x), '[]') from (select {cols} from t) x;\n")
        codigo, salida, err = psql(sql)
        if codigo != 0:
            return self.error_api(400, mensaje_psql(err))
        if 'return=representation' in (self.headers.get('Prefer') or ''):
            filas = json.loads(salida.strip())
            if 'vnd.pgrst.object' in (self.headers.get('Accept') or ''):
                if len(filas) != 1:
                    return self.error_api(406, 'JSON object requested, multiple (or no) rows returned')
                return self.responder(200, json.dumps(filas[0]))
            return self.responder(201 if metodo == 'POST' else 200, json.dumps(filas))
        self.sin_cuerpo(201 if metodo == 'POST' else 204)

    def llamar(self, fn, cuerpo):
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
                return self.error_api(404, f'Could not find the function public.{fn} con el argumento {k}')
            t = tipos[k]
            if v is None:
                args.append(f'{k} => null::{t}')
            elif isinstance(v, list) and t.endswith('[]'):
                args.append(f"{k} => array(select jsonb_array_elements_text({literal(json.dumps(v))}::jsonb))::{t}")
            elif isinstance(v, (list, dict)):
                args.append(f'{k} => {literal(json.dumps(v))}::{t}')
            else:
                val = json.dumps(v) if isinstance(v, bool) else str(v)
                args.append(f'{k} => {literal(val)}::{t}')
        llamada = f'public.{fn}({", ".join(args)})'
        if conjunto.strip() == 't':
            sql = f"select coalesce(json_agg(t), '[]') from {llamada} t;"
        else:
            sql = f'select to_jsonb({llamada});'
        codigo, salida, err = psql(self.preambulo() + sql + '\n')
        if codigo != 0:
            return self.error_api(400, mensaje_psql(err))
        self.responder(200, salida.strip() or 'null')

    # ------------------------------------------------------------- métodos
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path.startswith('/rest/v1/'):
            return self.leer_tabla(url)
        if url.path.startswith('/auth/v1/'):
            return self.auth(url, {})
        if url.path == '/assets/js/config.js':
            texto = (PUBLICO / 'assets/js/config.js').read_text(encoding='utf-8')
            texto = re.sub(r"export const SUPABASE_URL\s*=.*",
                           f"export const SUPABASE_URL = 'http://localhost:{PUERTO}';", texto)
            datos = texto.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)
            return
        for prefijo, destino in reescrituras():
            if (url.path.startswith(prefijo) and url.path != prefijo.rstrip('/')
                    and not (PUBLICO / url.path.lstrip('/')).is_file()):
                self.path = destino
                break
        return super().do_GET()

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        cuerpo = self.leer_cuerpo()
        if cuerpo is None:
            return self.error_api(400, 'JSON no válido')
        if url.path.startswith('/auth/v1/'):
            return self.auth(url, cuerpo)
        if url.path.startswith('/rest/v1/rpc/'):
            fn = url.path[len('/rest/v1/rpc/'):]
            if not IDENT.match(fn):
                return self.error_api(404, 'función no válida')
            return self.llamar(fn, cuerpo)
        if url.path.startswith('/rest/v1/'):
            return self.escribir('POST', url, cuerpo)
        self.error_api(404, 'no encontrado')

    def do_PATCH(self):
        url = urllib.parse.urlsplit(self.path)
        cuerpo = self.leer_cuerpo()
        if cuerpo is None or not isinstance(cuerpo, dict):
            return self.error_api(400, 'JSON no válido')
        self.escribir('PATCH', url, cuerpo)

    def do_DELETE(self):
        self.escribir('DELETE', urllib.parse.urlsplit(self.path), {})

    def do_OPTIONS(self):
        self.sin_cuerpo(204)


if __name__ == '__main__':
    print(f'Servidor de prueba en http://localhost:{PUERTO}  (sitio: {PUBLICO})')
    http.server.ThreadingHTTPServer(('127.0.0.1', PUERTO), Manejador).serve_forever()
