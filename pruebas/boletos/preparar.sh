#!/bin/bash
# Reconstruye desde cero una base de prueba DESECHABLE en Docker:
# simulación de Supabase + sql/01..11 + datos de ejemplo.
# Aplica 11-boletos.sql y 12-datos-minimos.sql dos veces cada uno, para
# comprobar que se pueden re-ejecutar.
# Al terminar: docker rm -f fdc-prueba
AQUI="$(cd "$(dirname "$0")" && pwd)"; SQL="$AQUI/../../sql"
if ! docker info >/dev/null 2>&1; then
  echo "Docker no está corriendo: abre Docker Desktop y vuelve a intentarlo."; exit 1
fi
docker rm -f fdc-prueba >/dev/null 2>&1
docker run -d --name fdc-prueba -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:16-alpine -c max_connections=200 >/dev/null
until docker exec fdc-prueba pg_isready -U postgres -q 2>/dev/null; do sleep 1; done; sleep 1
run() { docker exec -i fdc-prueba psql -U postgres -v ON_ERROR_STOP=1 -q -X --single-transaction; }
run < "$AQUI/supabase-simulado.sql" || exit 1
for f in 01-esquema 02-semaforo 03-rls 04-catalogos 06-cambios 07-nucleo 08-cupo 09-programa 10-poster; do
  run < "$SQL/$f.sql" > /dev/null 2>&1 || { echo "FALLÓ $f"; exit 1; }
done
run <<'SQLX'
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','coord@x.mx'),('22222222-2222-2222-2222-222222222222','admin@x.mx'),('33333333-3333-3333-3333-333333333333','otro@x.mx');
alter table public.perfiles disable trigger user;
update public.perfiles set rol='administrador' where id='22222222-2222-2222-2222-222222222222';
alter table public.perfiles enable trigger user;
insert into public.actividades (responsable_id, titulo, sede, fecha, hora_inicio, hora_fin, cupo, publica, requerimientos)
values ('11111111-1111-1111-1111-111111111111','Taller de microscopía','', current_date+5,'10:00','12:00',10,true,'secreto'),
       ('11111111-1111-1111-1111-111111111111','Charla empalmada','', current_date+5,'11:00',null,50,true,''),
       ('33333333-3333-3333-3333-333333333333','Borrador ajeno','', current_date+5,'16:00',null,20,false,'');
SQLX
run < "$SQL/11-boletos.sql" > /dev/null 2>&1 || { echo "FALLÓ 11"; exit 1; }
run < "$SQL/11-boletos.sql" > /dev/null 2>&1 || { echo "FALLÓ 11 (2a vez)"; exit 1; }
# 12: datos mínimos. Dos veces, para comprobar que se puede re-ejecutar, y en
# medio el catálogo de lugares, que se genera aparte y no está en el repositorio
# (ver herramientas/lugares/generar_sql.py).
run < "$SQL/12-datos-minimos.sql" > /dev/null 2>&1 || { echo "FALLÓ 12"; run < "$SQL/12-datos-minimos.sql" 2>&1 | grep -m3 ERROR; exit 1; }
if [ -f "$SQL/12b-lugares.local.sql" ]; then
  docker exec -i fdc-prueba psql -U postgres -v ON_ERROR_STOP=1 -q -X < "$SQL/12b-lugares.local.sql" > /dev/null || { echo "FALLÓ 12b"; exit 1; }
else
  echo "AVISO: falta sql/12b-lugares.local.sql; las pruebas de lugar van a fallar"
fi
run < "$SQL/12-datos-minimos.sql" > "$AQUI/.ultima-salida.txt" 2>&1 || { echo "FALLÓ 12 (2a vez)"; tail "$AQUI/.ultima-salida.txt"; exit 1; }
tail -12 "$AQUI/.ultima-salida.txt"
