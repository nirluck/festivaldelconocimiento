#!/bin/bash
# Pruebas de sql/19-voluntariado.sql sobre una base DESECHABLE en Docker.
#
# Reutiliza la base de boletos (simulación de Supabase + sql/01..18 + datos de
# ejemplo), aplica 19-voluntariado.sql dos veces para comprobar que se puede
# re-ejecutar, enseña su comprobación, corre reglas.sql y una prueba de
# concurrencia: veinte personas a la vez por la última vacante.
#
# Al terminar: docker rm -f fdc-prueba
AQUI="$(cd "$(dirname "$0")" && pwd)"; SQL="$AQUI/../../sql"
export MSYS_NO_PATHCONV=1   # trampa 22: Git Bash reescribe las rutas con «/»
bash "$AQUI/../boletos/preparar.sh" > /dev/null || { echo "Falló la base de boletos"; exit 1; }
run() { docker exec -i fdc-prueba psql -U postgres -v ON_ERROR_STOP=1 -q -X --single-transaction; }
run < "$SQL/19-voluntariado.sql" > /dev/null || { echo "FALLÓ 19"; exit 1; }
run < "$SQL/19-voluntariado.sql" || { echo "FALLÓ 19 (2a vez)"; exit 1; }
docker exec -i fdc-prueba psql -U postgres -X < "$AQUI/reglas.sql" || exit 1

# ---- concurrencia: un puesto de 1 vacante, 20 inscripciones simultáneas ----
docker exec -i fdc-prueba psql -U postgres -q -X -t <<'SQLX' > /dev/null
insert into public.puestos (actividad_id, titulo, hora_inicio, hora_fin, vacantes)
select id, 'Última vacante', '16:00', '17:00', 1 from public.actividades where titulo = 'Taller de microscopía';
SQLX
PUESTO=$(docker exec -i fdc-prueba psql -U postgres -q -X -t -A -c "select id from public.puestos where titulo = 'Última vacante'")
for n in $(seq 1 20); do
  docker exec fdc-prueba psql -U postgres -q -X -t -A -c "set role anon; select public.inscribirse_voluntariado('$PUESTO', 'Persona $n', 'p$n@correo.mx', '646000$(printf %04d $n)', null, 'Escuela', 'Carrera', null, 'Responsable', null, true, true)->>'ok'" &
done > /dev/null
wait
OCUP=$(docker exec -i fdc-prueba psql -U postgres -q -X -t -A -c "select count(*) from public.inscripciones where puesto_id = '$PUESTO' and estado = 'inscrito'")
if [ "$OCUP" = "1" ]; then
  echo "CONCURRENCIA: 20 a la vez por 1 vacante → exactamente 1 inscrita. BIEN"
else
  echo "FALLA CONCURRENCIA: quedaron $OCUP inscritas en un puesto de 1 vacante"; exit 1
fi
