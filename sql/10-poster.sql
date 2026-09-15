-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 10 · PÓSTER DE LA ACTIVIDAD
--
--  Lo que hace este archivo, en orden:
--
--    1. «actividades» gana «poster»: la ruta del archivo en Storage.
--    2. El bucket «actividades» en Supabase Storage, público en lectura.
--    3. Una función que responde «¿esta persona puede tocar los archivos de
--       esta actividad?», para no repetir la regla en cuatro políticas.
--    4. Las políticas de Storage: sube, reemplaza y borra solo el coordinador
--       dueño o la administración, y solo dentro de la carpeta de SU actividad.
--    5. El programa público puede leer la columna.
--    6. «vista_programa» se reconstruye con el póster.
--
--  Se puede volver a ejecutar: todo es «if not exists», «on conflict»,
--  «or replace» o «drop … create».
--
--  ---------------------------------------------------------------------------
--  POR QUÉ UNA COLUMNA Y NO LA TABLA «actividad_imagenes» DEL PLAN
--
--  La prueba del plan para modelar: «¿puede haber más de uno? Si sí, es
--  tabla». Póster hay UNO por actividad. La galería, cuando llegue, sí serán
--  muchas imágenes y seguirá siendo tabla, pero ya sin su bandera «portada»:
--  la imagen destacada es esta columna, y tener las dos sería tener dos
--  verdades sobre cuál es la imagen de la actividad.
--
--  POR QUÉ SE GUARDA LA RUTA Y NO LA URL
--  «8f3c…/poster-lx2k9.webp» y no «https://pnbnw….supabase.co/storage/…».
--  La URL completa lleva el identificador del proyecto de Supabase dentro: si
--  algún día se migra de proyecto, todas las URLs guardadas apuntarían a un
--  servidor que ya no existe. La ruta sigue valiendo; la URL la arma el sitio
--  (assets/js/archivos.js).
--
--  CÓMO SE NOMBRAN LOS ARCHIVOS
--    <id de la actividad>/poster-<sello>.webp        la grande, 1600 px
--    <id de la actividad>/poster-<sello>-mini.webp   la miniatura, 640 px
--  El navegador genera las dos antes de subir (modulos/poster.js): el plan
--  gratuito de Supabase no redimensiona imágenes, y un póster exportado de
--  Canva pesa entre 5 y 15 MB. Cuarenta de esos en la cartelera, por datos
--  móviles, no se cargarían nunca.
--
--  El sello cambia en cada subida. Así cada archivo es inmutable y se puede
--  guardar en caché un año sin que un póster corregido siga mostrando la
--  versión vieja.
-- =============================================================================


-- =============================================================================
--  1 · LA COLUMNA
-- =============================================================================
alter table public.actividades add column if not exists poster text;

comment on column public.actividades.poster is
  'Ruta del póster en el bucket «actividades» de Storage, p. ej. «<id>/poster-lx2k9.webp». La miniatura es la misma ruta con «-mini» antes de la extensión. Nulo = sin póster.';


-- -----------------------------------------------------------------------------
--  El póster tiene que vivir en la carpeta de SU actividad.
--
--  Las políticas de Storage ya impiden SUBIR a una carpeta ajena, pero la
--  columna es texto libre: sin esto, un coordinador podría escribir la ruta
--  del póster de otra actividad en la suya y mostrarlo como propio. La
--  restricción lo corta en la base, venga de donde venga el update.
--
--  Agregarla revisa las filas existentes; todas tienen «poster» en nulo porque
--  la columna acaba de nacer, así que no hay nada que pueda fallar.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'actividades_poster_en_su_carpeta') then
    alter table public.actividades
      add constraint actividades_poster_en_su_carpeta
      check (poster is null or poster like id::text || '/%');
  end if;
end $$;


-- =============================================================================
--  2 · EL BUCKET
--
--  Se llama «actividades» y no «posters» porque la galería de la fase C vivirá
--  en el mismo lugar, en la misma carpeta por actividad.
--
--  Público en lectura: el programa es público y cualquier persona tiene que
--  poder ver el póster sin cuenta. «public = true» sirve los archivos por la
--  dirección /object/public/…, que no pasa por las reglas por fila; por eso no
--  hace falta una política de lectura para «anon».
--
--  Límites, como segunda barrera detrás del navegador:
--    · 5 MB por archivo. Lo que genera el sitio ronda los 300 KB; esto solo
--      detiene a quien intente subir por fuera de la página.
--    · Solo WebP y JPEG, que es lo único que produce el sitio. El JPEG es el
--      respaldo para navegadores que no saben codificar WebP.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('actividades', 'actividades', true, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- =============================================================================
--  3 · ¿PUEDE TOCAR LOS ARCHIVOS DE ESTA ACTIVIDAD?
--
--  Recibe el nombre de la carpeta —el primer tramo de la ruta— como TEXTO y lo
--  compara contra «id::text». Si recibiera uuid, una ruta mal formada
--  («hola/poster.webp») haría fallar el cast dentro de la política con un
--  error de sintaxis de uuid, en vez de simplemente negar el permiso.
--
--  SECURITY DEFINER por la misma razón que es_administrador() (trampa 3 del
--  plan): la política de Storage no debe depender de qué filas de
--  «actividades» deje ver RLS a quien pregunta. La regla se dice aquí,
--  completa y una sola vez.
-- =============================================================================
create or replace function public.puede_editar_actividad(carpeta text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.actividades a
     where a.id::text = carpeta
       and (a.responsable_id = auth.uid() or public.es_administrador())
  );
$$;

revoke all on function public.puede_editar_actividad(text) from public;
grant execute on function public.puede_editar_actividad(text) to authenticated;


-- =============================================================================
--  4 · POLÍTICAS DE STORAGE
--
--  «storage.foldername(name)» parte la ruta en carpetas: para
--  «8f3c…/poster-lx2k9.webp» devuelve {8f3c…}. El primer tramo es la actividad.
--
--  Las cuatro operaciones llevan política, y no solo la de subir:
--    · select  supabase-js la necesita para BORRAR: el borrado de Storage
--              busca la fila antes de eliminarla, y sin permiso de lectura no
--              la encuentra y dice que no había nada que borrar. No abre nada
--              al público: los archivos públicos se sirven por otro camino.
--    · insert  subir un póster nuevo.
--    · update  no se usa hoy —cada subida tiene nombre nuevo—, pero sin ella
--              un «upsert» fallaría de forma confusa el día que alguien lo use.
--    · delete  quitar el póster, o limpiar el anterior al reemplazarlo.
--
--  Los nombres llevan el prefijo del bucket: las políticas de storage.objects
--  son de todo Storage, no de un bucket, y el día que haya otro bucket no
--  deben chocar.
-- =============================================================================
drop policy if exists actividades_archivos_ver on storage.objects;
create policy actividades_archivos_ver on storage.objects
  for select to authenticated
  using ( bucket_id = 'actividades'
          and public.puede_editar_actividad((storage.foldername(name))[1]) );

drop policy if exists actividades_archivos_subir on storage.objects;
create policy actividades_archivos_subir on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'actividades'
               and public.puede_editar_actividad((storage.foldername(name))[1]) );

drop policy if exists actividades_archivos_cambiar on storage.objects;
create policy actividades_archivos_cambiar on storage.objects
  for update to authenticated
  using      ( bucket_id = 'actividades'
               and public.puede_editar_actividad((storage.foldername(name))[1]) )
  with check ( bucket_id = 'actividades'
               and public.puede_editar_actividad((storage.foldername(name))[1]) );

drop policy if exists actividades_archivos_borrar on storage.objects;
create policy actividades_archivos_borrar on storage.objects
  for delete to authenticated
  using ( bucket_id = 'actividades'
          and public.puede_editar_actividad((storage.foldername(name))[1]) );


-- =============================================================================
--  5 · EL PROGRAMA PÚBLICO PUEDE LEER LA COLUMNA
--
--  Se suma a la lista de columnas que 09-programa.sql abrió para «anon». Un
--  grant por columna se agrega, no reemplaza: las que ya estaban siguen.
-- =============================================================================
grant select (poster) on public.actividades to anon;


-- =============================================================================
--  6 · LA VISTA DEL PROGRAMA, CON PÓSTER
--
--  Borrar y volver a crear, no «create or replace»: la columna nueva va junto a
--  las descriptivas y no al final, y «or replace» solo admite columnas nuevas
--  al final. Nada depende de esta vista, así que borrarla no arrastra nada.
--
--  «vista_actividades» —la del tablero— NO se toca a propósito. Es un bloque de
--  ciento y pico líneas con todo el semáforo, y reconstruirla para añadir una
--  columna es el riesgo que describen las trampas 6 y 8. El panel lee el póster
--  directo de «actividades», que es dato de su propio módulo.
-- =============================================================================
drop view if exists public.vista_programa;

create view public.vista_programa as
select
  a.id,
  a.edicion_id,
  a.slug,
  a.titulo,
  a.resumen,
  a.descripcion,
  a.poster,
  a.eje,
  e.color          as eje_color,
  a.tipo,
  a.sede,
  s.direccion      as sede_direccion,
  a.fecha,
  a.hora_inicio,
  a.hora_fin,
  a.cupo,
  a.publicada_en
from public.actividades a
left join public.ejes  e on e.nombre = a.eje
left join public.sedes s on s.nombre = a.sede
where a.publica
  and not a.archivada;

-- Sin esto la vista ignora las reglas por fila (trampa 2 del plan).
alter view public.vista_programa set (security_invoker = true);

grant select on public.vista_programa to anon, authenticated;

comment on view public.vista_programa is
  'Programa público. Única lectura del sitio sin sesión: solo columnas publicables de las actividades con publica = true y archivada = false.';


-- =============================================================================
--  COMPROBACIÓN
--
--  Las siete líneas deben decir BIEN. La 6 vuelve a vigilar lo mismo que
--  09-programa.sql: abrir «poster» a «anon» no debe haber abierto de paso los
--  requerimientos.
-- =============================================================================
select 1 as orden,
       'Columna poster' as revisión,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='actividades'
                            and column_name='poster') then 'existe' else 'ausente' end as valor,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='actividades'
                            and column_name='poster') then 'BIEN' else 'REVISAR' end as resultado

union all
select 2, 'El póster vive en su carpeta',
       case when exists (select 1 from pg_constraint
                          where conname='actividades_poster_en_su_carpeta')
            then 'restricción activa' else 'ausente' end,
       case when exists (select 1 from pg_constraint
                          where conname='actividades_poster_en_su_carpeta')
            then 'BIEN' else 'REVISAR' end

union all
select 3, 'Bucket «actividades» público',
       coalesce((select case when public then 'público' else 'PRIVADO' end
                   from storage.buckets where id='actividades'), 'no existe'),
       case when exists (select 1 from storage.buckets where id='actividades' and public)
            then 'BIEN' else 'REVISAR' end

union all
select 4, 'Políticas de Storage',
       (select count(*) from pg_policies
         where schemaname='storage' and tablename='objects'
           and policyname like 'actividades_archivos_%')::text || ' de 4',
       case when (select count(*) from pg_policies
                   where schemaname='storage' and tablename='objects'
                     and policyname like 'actividades_archivos_%') = 4
            then 'BIEN' else 'REVISAR' end

union all
select 5, 'anon lee poster',
       case when exists (select 1 from information_schema.column_privileges
                          where grantee='anon' and table_schema='public'
                            and table_name='actividades' and column_name='poster')
            then 'sí' else 'no' end,
       case when exists (select 1 from information_schema.column_privileges
                          where grantee='anon' and table_schema='public'
                            and table_name='actividades' and column_name='poster')
            then 'BIEN' else 'REVISAR' end

union all
select 6, 'anon sigue sin leer requerimientos ni responsable',
       coalesce((select string_agg(column_name, ', ')
                   from information_schema.column_privileges
                  where grantee='anon' and table_schema='public'
                    and table_name='actividades'
                    and column_name in ('requerimientos','responsable_id')),
                'ninguna — correcto'),
       case when not exists (select 1 from information_schema.column_privileges
                              where grantee='anon' and table_schema='public'
                                and table_name='actividades'
                                and column_name in ('requerimientos','responsable_id'))
            then 'BIEN' else 'REVISAR: FUGA' end

union all
select 7, 'La vista trae el póster y respeta las reglas',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='vista_programa'
                            and column_name='poster')
            then 'poster en la vista' else 'SIN poster' end,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='vista_programa'
                            and column_name='poster')
             and exists (select 1 from pg_class c
                          join pg_namespace n on n.oid=c.relnamespace
                         where n.nspname='public' and c.relname='vista_programa'
                           and c.reloptions::text like '%security_invoker=true%')
            then 'BIEN' else 'REVISAR' end

order by orden;
