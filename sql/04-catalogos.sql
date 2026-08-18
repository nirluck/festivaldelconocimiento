-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 04 · CATÁLOGOS
--
--  Los valores salen de festival-reportes.php, donde vivían dentro del código.
--  Aquí son datos: la coordinación los edita sin tocar nada ni volver a subir
--  un plugin.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  EJES  ·  los colores son los del logotipo del festival
-- -----------------------------------------------------------------------------
insert into public.ejes (nombre, color, orden) values
  ('Ciencia',      '#10ABC4', 1),
  ('Arte',         '#E91587', 2),
  ('Tecnología',   '#F5821F', 3),
  ('Humanidades',  '#99CA3C', 4)
on conflict (nombre) do update set color = excluded.color, orden = excluded.orden;


-- -----------------------------------------------------------------------------
--  TIPOS DE ACTIVIDAD
-- -----------------------------------------------------------------------------
insert into public.tipos (nombre, orden) values
  ('Charla de divulgación',        1),
  ('Taller',                       2),
  ('Concierto',                    3),
  ('Obra de teatro / artes vivas', 4),
  ('Danza',                        5),
  ('Exposición',                   6),
  ('Mesa de diálogo',              7),
  ('Presentación de libro',        8),
  ('Carrera 5K',                   9),
  ('Caminata del conocimiento',   10),
  ('Visita a escuela',            11),
  ('Intervención artística',      12),
  ('Laboratorio abierto',         13),
  ('Otro',                        14)
on conflict (nombre) do update set orden = excluded.orden;


-- -----------------------------------------------------------------------------
--  SEDES  ·  recintos que han albergado ediciones anteriores.
--  Se pueden añadir, quitar o desactivar sin tocar el sitio.
-- -----------------------------------------------------------------------------
insert into public.sedes (nombre, orden) values
  ('Centro Estatal de las Artes de Ensenada (CEART)',        1),
  ('Centro Social, Cívico y Cultural Riviera',               2),
  ('Centro de Nanociencias y Nanotecnología, UNAM',          3),
  ('UABC · Unidad Sauzal',                                   4),
  ('UABC · Unidad Valle Dorado',                             5),
  ('Instituto Tecnológico de Ensenada · TecNM',              6),
  ('Caracol Museo de Ciencias',                              7),
  ('CETYS Universidad',                                      8),
  ('CONALEP Ensenada',                                       9),
  ('Centro histórico',                                      10),
  ('Ventana al Mar',                                        11),
  ('Bodegas de Santo Tomás',                                12),
  ('Otra sede',                                             98),
  ('Por definir',                                           99)
on conflict (nombre) do update set orden = excluded.orden;


-- -----------------------------------------------------------------------------
--  DÍAS DEL FESTIVAL  ·  sábado 17 a sábado 24 de octubre de 2026
--
--  Si cambian las fechas en la tabla "ajustes", hay que regenerar esta lista.
--  Se deja como tabla y no como cálculo automático porque los nombres de los
--  días dependen del idioma del servidor, que no controlamos.
-- -----------------------------------------------------------------------------
delete from public.dias;
insert into public.dias (etiqueta, orden) values
  ('Sáb 17 oct',   1),
  ('Dom 18 oct',   2),
  ('Lun 19 oct',   3),
  ('Mar 20 oct',   4),
  ('Mié 21 oct',   5),
  ('Jue 22 oct',   6),
  ('Vie 23 oct',   7),
  ('Sáb 24 oct',   8),
  ('Varios días', 90),
  ('Por definir', 99);


-- =============================================================================
--  NOTA · lo que NO se vuelve catálogo
--
--  Las opciones de "alerta" ("No, va caminando" / "Sí, necesito apoyo" /
--  "Sí, puede no salir") se quedan fijas en el código a propósito: el semáforo
--  las reconoce por su texto ("%apoyo%", "%puede no salir%"). Si alguien las
--  editara desde un catálogo, el semáforo dejaría de detectarlas en silencio.
-- =============================================================================


-- =============================================================================
--  COMPROBACIÓN
--  Al terminar deberías ver 4 ejes, 14 tipos, 14 sedes, 10 días y 6 ajustes.
-- =============================================================================
select 'ejes' as tabla, count(*) from public.ejes
union all select 'tipos',   count(*) from public.tipos
union all select 'sedes',   count(*) from public.sedes
union all select 'dias',    count(*) from public.dias
union all select 'ajustes', count(*) from public.ajustes;
