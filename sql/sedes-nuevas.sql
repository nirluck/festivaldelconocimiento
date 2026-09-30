-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · SEDES NUEVAS
--
--  No es una migración: añade recintos al catálogo de sedes. Se puede volver
--  a ejecutar sin duplicar nada, así que cada sede nueva se suma aquí.
--
--  Historial:
--    · 13 y 14  Teatro Universitario Benito Juárez, Parque Ejido El Porvenir
--    · 15       CICESE
--    · 16       Casa de la Cultura “Miguel De Anda Jacobsen”
--
--  Las sedes son datos, no código: aparecen solas en el selector de
--  /registro y en el módulo Resumen del panel, sin tocar el frontend.
--
--  Escribir sedes exige ser administrador (política «sedes_escribir»), pero
--  el editor SQL de Supabase no actúa como ningún usuario y por eso pasa por
--  encima de las reglas por fila. Aquí eso es lo que queremos.
-- =============================================================================

--  La DIRECCIÓN sí importa: es la que se imprime en el boleto y la que viaja
--  en el archivo de calendario, así que se guarda en una sola línea y con
--  ciudad y estado, para que una aplicación de mapas la encuentre. Las sedes
--  sin dirección van con «null» y el «coalesce» de abajo cuida que volver a
--  ejecutar este archivo nunca borre una dirección ya puesta.
insert into public.sedes (nombre, orden, activa, direccion) values
  ('Teatro Universitario Benito Juárez', 13, true, null),
  ('Parque Ejido El Porvenir',           14, true, null),
  ('Centro de Investigación Científica y de Educación Superior de Ensenada (CICESE)', 15, true, null),
  ('Casa de la Cultura “Miguel De Anda Jacobsen”', 16, true,
   'Blvd. Lázaro Cárdenas s/n esq. Av. Riviera, Zona Centro, Ensenada, B.C.')
on conflict (nombre) do update
  set orden     = excluded.orden,
      activa    = excluded.activa,
      direccion = coalesce(excluded.direccion, public.sedes.direccion);


-- =============================================================================
--  COMPROBACIÓN
--  Deben aparecer 18 sedes, con las de este archivo en los lugares 13 a 16.
--  «activa» tiene que ser true: el formulario solo ofrece las activas.
-- =============================================================================
select orden,
       nombre,
       activa,
       coalesce(direccion, '—') as direccion,
       case
         when nombre in ('Teatro Universitario Benito Juárez',
                         'Parque Ejido El Porvenir',
                         'Centro de Investigación Científica y de Educación Superior de Ensenada (CICESE)',
                         'Casa de la Cultura “Miguel De Anda Jacobsen”')
           then case when activa then 'NUEVA · BIEN' else 'NUEVA · REVISAR: inactiva' end
         else ''
       end as nota
  from public.sedes
 order by orden;
