-- Datos de ejemplo para probar las pantallas de boletos con el servidor de
-- prueba. Solo para la base desechable. Correr después de preparar.sh:
--   docker exec -i fdc-prueba psql -U postgres -q < pruebas/boletos/datos-ui.sql
--
-- Una actividad por cada estado que la cartelera y el formulario deben saber
-- pintar.

delete from public.actividades where titulo like '[UI]%' or requerimientos = 'datos-ui';

insert into public.actividades
  (responsable_id, titulo, resumen, descripcion, eje, tipo, sede, fecha, hora_inicio, hora_fin,
   cupo, publica, acceso, lugares_max, requerimientos)
values
  ('11111111-1111-1111-1111-111111111111', 'Taller de microscopía para curiosos',
   'Mira el mundo diminuto con microscopios de verdad y llévate tus fotos.',
   'Un taller práctico para toda la familia.' || chr(10) || chr(10) || 'Trae tu teléfono: tomaremos fotos a través del ocular.',
   'Ciencia', 'Taller', 'Centro de Nanociencias y Nanotecnología, UNAM',
   '2026-10-18', '10:00', '12:00', 24, true, 'boleto', 4, 'datos-ui'),

  ('11111111-1111-1111-1111-111111111111', 'Planetario móvil',
   'Un viaje por el cielo de Ensenada dentro de una cúpula inflable.', '',
   'Ciencia', 'Laboratorio abierto', 'Caracol Museo de Ciencias',
   '2026-10-18', '11:00', '11:45', 6, true, 'boleto', 2, 'datos-ui'),

  ('11111111-1111-1111-1111-111111111111', 'Robots que dibujan',
   'Programa un robot para que haga arte.', '',
   'Tecnología', 'Taller', 'Instituto Tecnológico de Ensenada · TecNM',
   '2026-10-19', '16:00', '18:00', 18, true, 'boleto', 4, 'datos-ui'),

  ('11111111-1111-1111-1111-111111111111', 'Charla: el océano que no vemos',
   'Qué vive a mil metros de profundidad frente a nuestra costa.', '',
   'Ciencia', 'Charla de divulgación', 'Centro Estatal de las Artes de Ensenada (CEART)',
   '2026-10-19', '18:00', null, null, true, 'registro', 4, 'datos-ui'),

  ('11111111-1111-1111-1111-111111111111', 'Concierto de clausura',
   'Música en vivo para cerrar el festival.', '',
   'Arte', 'Concierto', 'Ventana al Mar',
   '2026-10-24', '19:00', '21:00', null, true, 'libre', 4, 'datos-ui'),

  ('11111111-1111-1111-1111-111111111111', 'Observación nocturna con telescopios',
   'Saturno y la Luna desde el CNyN.', '',
   'Ciencia', 'Laboratorio abierto', 'Centro de Nanociencias y Nanotecnología, UNAM',
   '2026-10-20', '20:00', '22:00', 30, true, 'boleto', 4, 'datos-ui');

-- La observación abre sus boletos dentro de dos días.
update public.actividades set boletos_desde = now() + interval '2 days'
 where titulo = 'Observación nocturna con telescopios';

-- Llenar el planetario (agotado, con uno en espera) y dejar pocos en robots.
-- Datos mínimos (sql/12): nombre, fecha de nacimiento, género y municipio.
select public.solicitar_boleto('planetario-movil', 'Persona ' || g, ('1990-01-0' || g)::date,
                               'Mujer', (select id from public.lugares_municipios where municipio = 'Ensenada' and estado = 'Baja California'),
                               null, 2, 'cartel', true)
  from generate_series(1, 3) g;
select public.solicitar_boleto('planetario-movil', 'En espera', '1985-06-15',
                               'Hombre', (select id from public.lugares_municipios where municipio = 'Tijuana' and estado = 'Baja California'),
                               null, 2, 'redes', true, true);
select public.solicitar_boleto('robots-que-dibujan', 'Persona ' || g, ('2010-03-0' || g)::date,
                               'Prefiero no decir', (select id from public.lugares_municipios where municipio = 'Tijuana' and estado = 'Baja California'),
                               null, 4, 'programa', true)
  from generate_series(1, 4) g;

select titulo, acceso, disponibles, estado_boletos from public.vista_programa order by fecha, hora_inicio;
