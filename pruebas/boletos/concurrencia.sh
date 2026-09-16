#!/bin/bash
# Prueba de concurrencia de la emisión de boletos. Requiere haber corrido
# preparar.sh. Debe terminar con las tres líneas en BIEN.
export MSYS_NO_PATHCONV=1   # Git Bash en Windows reescribe /tmp/... si no
set -e
q() { docker exec -i fdc-prueba psql -U postgres -q -X -At "$@"; }

q <<'SQL'
delete from public.actividades where titulo like 'Concurrencia%';
insert into public.actividades (responsable_id, titulo, sede, fecha, hora_inicio, cupo, publica, acceso, lugares_max)
values ('11111111-1111-1111-1111-111111111111','Concurrencia uno','', current_date+6,'09:00',10,true,'boleto',1),
       ('11111111-1111-1111-1111-111111111111','Concurrencia varios','', current_date+7,'09:00',10,true,'boleto',4);
SQL

cat <<'SQL' | docker exec -i fdc-prueba sh -c 'cat > /tmp/uno.sql'
\set n random(1, 1000000000)
set role anon;
select public.solicitar_boleto('concurrencia-uno', 'Persona ' || :n, 'p' || :n || '@x.mx', '18 a 29 años', 'Estudiante', null, 1, 'cartel', true);
SQL
cat <<'SQL' | docker exec -i fdc-prueba sh -c 'cat > /tmp/varios.sql'
\set n random(1, 1000000000)
\set l random(1, 4)
set role anon;
select public.solicitar_boleto('concurrencia-varios', 'Persona ' || :n, 'q' || :n || '@x.mx', '18 a 29 años', 'Estudiante', null, :l, 'cartel', true);
SQL

echo "· 50 personas a la vez por 10 lugares"
docker exec fdc-prueba pgbench -U postgres -n -c 50 -j 50 -t 1 -f /tmp/uno.sql postgres 2>&1 | grep -E "processed|failed"
echo "· 450 solicitudes de 1 a 4 lugares por 10 lugares"
docker exec fdc-prueba pgbench -U postgres -n -c 150 -j 150 -t 3 -f /tmp/varios.sql postgres 2>&1 | grep -E "processed|failed"

echo "· 10 cancelaciones mientras llegan 120 solicitudes"
q -c "select token from public.boletos b join public.actividades a on a.id=b.actividad_id where a.slug='concurrencia-uno' and b.estado='activo'" \
  | docker exec -i fdc-prueba sh -c 'i=0; while read t; do i=$((i+1)); printf "set role anon;\nselect public.cancelar_boleto('"'"'%s'"'"');\n" "$t" > /tmp/c$i.sql; done'
docker exec fdc-prueba sh -c 'for f in /tmp/c*.sql; do psql -U postgres -q -X -f $f >/dev/null & done; pgbench -U postgres -n -c 60 -j 60 -t 2 -f /tmp/uno.sql postgres 2>&1 | grep -E "processed|failed"; wait; rm -f /tmp/c*.sql'

q <<'SQL'
select a.titulo || ': ' || f.emitidos || ' contados, '
       || coalesce(sum(b.lugares) filter (where b.estado='activo'), 0) || ' reales, cupo ' || a.cupo
       || case when f.emitidos = coalesce(sum(b.lugares) filter (where b.estado='activo'), 0)
                and f.emitidos = a.cupo then '  → BIEN' else '  → REVISAR' end
  from public.actividades a
  join public.aforos f on f.actividad_id = a.id
  left join public.boletos b on b.actividad_id = a.id
 where a.titulo like 'Concurrencia%'
 group by a.titulo, a.cupo, f.emitidos
 order by a.titulo;
select 'Cancelados y reemplazados: ' || count(*) || case when count(*) = 10 then '  → BIEN' else '  → REVISAR' end
  from public.boletos b join public.actividades a on a.id=b.actividad_id
 where a.slug='concurrencia-uno' and b.estado='cancelado';
SQL
