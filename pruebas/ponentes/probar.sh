#!/bin/bash
# Pruebas de sql/13-ponentes.sql sobre una base DESECHABLE en Docker.
#
# Reutiliza la base de boletos (simulación de Supabase + sql/01..12 + datos de
# ejemplo), aplica 13-ponentes.sql dos veces para comprobar que se puede
# re-ejecutar, enseña su comprobación y corre reglas.sql.
#
# Al terminar: docker rm -f fdc-prueba
AQUI="$(cd "$(dirname "$0")" && pwd)"; SQL="$AQUI/../../sql"
bash "$AQUI/../boletos/preparar.sh" > /dev/null || { echo "Falló la base de boletos"; exit 1; }
run() { docker exec -i fdc-prueba psql -U postgres -v ON_ERROR_STOP=1 -q -X --single-transaction; }
run < "$SQL/13-ponentes.sql" > /dev/null || { echo "FALLÓ 13"; exit 1; }
run < "$SQL/13-ponentes.sql" || { echo "FALLÓ 13 (2a vez)"; exit 1; }
docker exec -i fdc-prueba psql -U postgres -X < "$AQUI/reglas.sql"
