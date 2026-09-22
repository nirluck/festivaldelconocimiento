"""
CATÁLOGO DE LUGARES · Festival del Conocimiento
===============================================

Genera sql/12b-lugares.local.sql a partir del Catálogo Nacional de Códigos
Postales de Correos de México (SEPOMEX):

  · todos los municipios del país (para «¿desde dónde nos visitas?»)
  · las colonias de Baja California (solo aquí se pide colonia)

    python herramientas/lugares/generar_sql.py ruta/a/CPdescarga.txt
    python herramientas/lugares/generar_sql.py ruta/a/CPdescargatxt.zip

Dónde conseguir el archivo: correosdemexico.gob.mx ▸ Servicios ▸ Código
Postal ▸ «Descarga» ▸ estado «Todos», formato «txt».

POR QUÉ LOS DATOS NO VAN AL REPOSITORIO
La nota de uso del catálogo prohíbe distribuirlo a terceros. El repositorio es
público, así que aquí solo vive este script; el SQL que genera termina en
.local.sql, que .gitignore excluye, y en la base las tablas no se abren a
nadie: se consultan por buscar_municipios() y buscar_colonias() (ver
sql/12-datos-minimos.sql).

Se puede volver a correr con una versión nueva del catálogo: el SQL borra y
vuelve a llenar las dos tablas. Los boletos guardan el TEXTO del lugar, no el
id, así que no se rompe nada.
"""

import sys
import zipfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI / '..' / '..' / 'sql' / '12b-lugares.local.sql'
ESTADO_COLONIAS = '02'          # Baja California
POR_BLOQUE = 500                # filas por INSERT


def leer(ruta):
    ruta = Path(ruta)
    if zipfile.is_zipfile(ruta):          # SEPOMEX lo entrega comprimido
        with zipfile.ZipFile(ruta) as z:
            crudo = z.read(z.namelist()[0])
    else:
        crudo = ruta.read_bytes()
    # SEPOMEX publica en Latin-1.
    try:
        texto = crudo.decode('utf-8')
    except UnicodeDecodeError:
        texto = crudo.decode('latin-1')
    filas = []
    for linea in texto.splitlines():
        partes = linea.split('|')
        # Las dos primeras líneas son la nota de uso y los encabezados.
        if len(partes) < 14 or partes[0] == 'd_codigo':
            continue
        filas.append(partes)
    return filas


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def bloques(valores):
    for i in range(0, len(valores), POR_BLOQUE):
        yield valores[i:i + POR_BLOQUE]


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    filas = leer(sys.argv[1])
    if not filas:
        sys.exit('No se encontraron filas: ¿es el archivo txt de SEPOMEX?')

    # --- municipios del país: Baja California primero, luego por estado ------
    municipios = sorted({(f[4], f[3], f[7]) for f in filas},
                        key=lambda m: (m[2] != ESTADO_COLONIAS, m[0], m[1]))
    ids = {}
    valores_m = []
    for i, (estado, municipio, _) in enumerate(municipios, start=1):
        ids[(estado, municipio)] = i
        valores_m.append(f'({i}, {lit(estado)}, {lit(municipio)})')
    # Para quien viene de fuera del país: un renglón más, sin colonias.
    extranjero = len(municipios) + 1
    valores_m.append(f"({extranjero}, 'Fuera de México', 'Otro país')")

    # --- colonias de Baja California -----------------------------------------
    colonias = {}
    for f in filas:
        if f[7] != ESTADO_COLONIAS:
            continue
        clave = (ids[(f[4], f[3])], f[1].strip())
        colonias.setdefault(clave, f[2].strip())   # tipo: Colonia, Fraccionamiento…
    valores_c = [f'({i}, {mid}, {lit(col)}, {lit(tipo)})'
                 for i, ((mid, col), tipo) in enumerate(sorted(colonias.items()), start=1)]

    sql = [
        '-- =============================================================================',
        '--  FESTIVAL DEL CONOCIMIENTO · 12b · CATÁLOGO DE LUGARES',
        '--  GENERADO por herramientas/lugares/generar_sql.py. No editar a mano.',
        '--  Fuente: Catálogo Nacional de Códigos Postales, Correos de México.',
        '--  NO SUBIR AL REPOSITORIO: la nota de uso del catálogo prohíbe distribuirlo.',
        f'--  {len(valores_m)} municipios · {len(valores_c)} colonias de Baja California',
        '-- =============================================================================',
        '',
        'begin;',
        'delete from public.lugares_colonias;',
        'delete from public.lugares_municipios;',
        '',
    ]
    for b in bloques(valores_m):
        sql.append('insert into public.lugares_municipios (id, estado, municipio, busqueda)')
        sql.append('select v.id, v.estado, v.municipio, public.normalizar(v.municipio || \' \' || v.estado)')
        sql.append('  from (values')
        sql.append(',\n'.join('    ' + v for v in b))
        sql.append('  ) v(id, estado, municipio);')
        sql.append('')
    for b in bloques(valores_c):
        sql.append('insert into public.lugares_colonias (id, municipio_id, colonia, tipo, busqueda)')
        sql.append('select v.id, v.municipio_id, v.colonia, v.tipo, public.normalizar(v.colonia)')
        sql.append('  from (values')
        sql.append(',\n'.join('    ' + v for v in b))
        sql.append('  ) v(id, municipio_id, colonia, tipo);')
        sql.append('')
    sql += [
        'commit;',
        '',
        "select (select count(*) from public.lugares_municipios) as municipios,",
        "       (select count(*) from public.lugares_colonias)   as colonias_bc;",
        '',
    ]
    SALIDA.write_text('\n'.join(sql), encoding='utf-8')
    print(f'Listo: {SALIDA.resolve()}')
    print(f'  {len(valores_m)} municipios · {len(valores_c)} colonias de Baja California')


if __name__ == '__main__':
    main()
