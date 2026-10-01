-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · TIPO «CARRERA 5K» → «CARRERA 4K»
--
--  La carrera del festival (Nano Carrera) es de 4 km. El catálogo traía
--  «Carrera 5K» desde la versión de WordPress.
--
--  «actividades.tipo» guarda el NOMBRE del tipo como texto, sin llave foránea:
--  renombrar el catálogo no arrastra las actividades. Por eso van las dos cosas
--  juntas, en una transacción.
--
--  Ningún disparador lo estorba: «proteger_estado» solo vigila «archivada» y
--  «publica». «marcar_actualizado» sellará la fecha de cambio, como cualquier
--  edición.
-- =============================================================================
begin;

-- Si 04-catalogos.sql ya se volvió a correr con el nombre nuevo, existen los
-- dos renglones: basta con quitar el viejo.
insert into public.tipos (nombre, orden)
select 'Carrera 4K', orden from public.tipos where nombre = 'Carrera 5K'
on conflict (nombre) do nothing;

update public.actividades
   set tipo = 'Carrera 4K'
 where tipo = 'Carrera 5K';

delete from public.tipos where nombre = 'Carrera 5K';

commit;


-- =============================================================================
--  COMPROBACIÓN · debe salir «Carrera 4K» en el catálogo y en la Nano Carrera,
--  y ningún renglón con 5K.
-- =============================================================================
select 'catálogo' as donde, nombre as valor from public.tipos where nombre ilike 'carrera%'
union all
select 'actividad: ' || titulo, tipo from public.actividades where tipo ilike 'carrera%';
