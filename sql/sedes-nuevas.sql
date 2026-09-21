-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · SEDES NUEVAS
--
--  No es una migración: añade recintos al catálogo de sedes. Se puede volver
--  a ejecutar sin duplicar nada, así que cada sede nueva se suma aquí.
--
--  Historial:
--    · 13 y 14  Teatro Universitario Benito Juárez, Parque Ejido El Porvenir
--    · 15       CICESE
--
--  Las sedes son datos, no código: aparecen solas en el selector de
--  /registro y en el módulo Resumen del panel, sin tocar el frontend.
--
--  Escribir sedes exige ser administrador (política «sedes_escribir»), pero
--  el editor SQL de Supabase no actúa como ningún usuario y por eso pasa por
--  encima de las reglas por fila. Aquí eso es lo que queremos.
-- =============================================================================

insert into public.sedes (nombre, orden, activa) values
  ('Teatro Universitario Benito Juárez', 13, true),
  ('Parque Ejido El Porvenir',           14, true),
  ('Centro de Investigación Científica y de Educación Superior de Ensenada (CICESE)', 15, true)
on conflict (nombre) do update
  set orden  = excluded.orden,
      activa = excluded.activa;


-- =============================================================================
--  COMPROBACIÓN
--  Deben aparecer 17 sedes, con las de este archivo en los lugares 13 a 15.
--  «activa» tiene que ser true: el formulario solo ofrece las activas.
-- =============================================================================
select orden,
       nombre,
       activa,
       case
         when nombre in ('Teatro Universitario Benito Juárez',
                         'Parque Ejido El Porvenir',
                         'Centro de Investigación Científica y de Educación Superior de Ensenada (CICESE)')
           then case when activa then 'NUEVA · BIEN' else 'NUEVA · REVISAR: inactiva' end
         else ''
       end as nota
  from public.sedes
 order by orden;
