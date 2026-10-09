-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 13 · PONENTES
--
--  Ejecuta este archivo COMPLETO sobre la base ya migrada con 12-datos-minimos.sql.
--  Se puede volver a ejecutar: todo es «if not exists», «on conflict»,
--  «or replace» o «drop … create».
--
--  Lo que hace, en orden:
--
--    1. «ponentes»: la persona. Nombre, semblanza, foto, institución y sitio.
--    2. «actividad_ponentes»: su participación en una actividad, con su papel
--       (Ponente, Moderadora, Banda invitada…) y su orden.
--    3. Quién puede editar a un ponente.
--    4. Reglas de acceso de las dos tablas.
--    5. El bucket «ponentes» de Storage para las fotos, con sus políticas.
--    6. «vista_programa_ponentes»: lo que el programa público puede mostrar.
--
--  Es la parte de ponentes de la fase C del plan. La galería
--  («actividad_imagenes») queda para después.
--
--  ---------------------------------------------------------------------------
--  POR QUÉ DOS TABLAS Y NO DOS COLUMNAS EN «actividades»
--
--  La foto y la semblanza son de la PERSONA, no de la actividad. Con columnas:
--    · una charla con dos ponentes, o un concierto con banda y director
--      invitado, no cabría;
--    · quien da una charla este año y un taller el siguiente tendría que
--      volver a escribir su semblanza y volver a subir su foto.
--  Es la sección 4 del plan: cada tipo de persona en su tabla, y la persona
--  separada de su participación.
--
--  POR QUÉ NO HAY CORREO
--  El plan lo proponía solo para no duplicar ponentes. Todo lo demás de esta
--  tabla es semipúblico —va al programa—, y el correo sería el único dato
--  privado: obligaría a esconder una columna al propio equipo. Además, desde
--  el 21 de septiembre la asesoría legal pide minimizar datos personales. Los
--  duplicados se evitan de otra forma: el panel busca entre los ponentes ya
--  registrados mientras se escribe el nombre. Si algún día hace falta, se
--  agrega con «add column if not exists».
--
--  CÓMO SE NOMBRAN LAS FOTOS
--    <id del ponente>/foto-<sello>.webp
--  Un solo archivo, de hasta 640 px por el lado largo, en su proporción
--  original: el recorte redondo lo hace la página. El sello cambia en cada
--  subida, igual que el póster, para que cada archivo sea inmutable.
-- =============================================================================


-- =============================================================================
--  0 · CANDADO
--  Este archivo usa «puede_editar_actividad()», que crea 10-poster.sql. Sin
--  ella, las políticas de abajo fallarían a la mitad con un error confuso.
-- =============================================================================
do $$
begin
  if to_regprocedure('public.puede_editar_actividad(text)') is null then
    raise exception 'Falta ejecutar sql/10-poster.sql antes que este archivo.';
  end if;
end $$;


-- =============================================================================
--  1 · LA PERSONA
--
--  «semblanza», «institucion» y «sitio» nunca son nulos: vacío quiere decir
--  «no lo dieron», y así la página no tiene que distinguir nulo de vacío.
--
--  «creado_por» lo llena la base (default auth.uid()) y nadie lo puede
--  escribir: ver los permisos por columna de la sección 4.
--
--  «sitio» solo admite direcciones http(s). No es manía: se pinta como enlace
--  en el programa público, y un «javascript:…» ahí sería código ajeno
--  ejecutándose en la página del festival.
-- =============================================================================
create table if not exists public.ponentes (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  semblanza    text not null default '',
  foto         text,
  institucion  text not null default '',
  sitio        text not null default '',
  creado_por   uuid default auth.uid() references public.perfiles(id) on delete set null,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now(),
  constraint ponentes_nombre_valido     check (length(btrim(nombre)) between 2 and 160),
  constraint ponentes_semblanza_larga   check (length(semblanza) <= 2000),
  constraint ponentes_institucion_larga check (length(institucion) <= 160),
  constraint ponentes_sitio_web         check (sitio = '' or sitio ~* '^https?://[^[:space:]]+$'),
  -- Igual que el póster: sin esto, alguien podría apuntar la foto de «su»
  -- ponente al archivo de otro.
  constraint ponentes_foto_en_su_carpeta check (foto is null or foto like id::text || '/%')
);

comment on table public.ponentes is
  'Quien imparte o presenta: la persona, no su participación. Se reutiliza entre actividades y ediciones. Semipública: su nombre, semblanza y foto van al programa.';
comment on column public.ponentes.foto is
  'Ruta de la foto en el bucket «ponentes», p. ej. «<id>/foto-lx2k9.webp». Nulo = sin foto.';

drop trigger if exists ponentes_actualizado on public.ponentes;
create trigger ponentes_actualizado
  before update on public.ponentes
  for each row execute function public.marcar_actualizado();


-- =============================================================================
--  2 · SU PARTICIPACIÓN
--
--  «papel» en texto libre, como pide el plan: Ponente, Tallerista,
--  Moderadora, Banda invitada, Director… Un catálogo se quedaría corto el
--  primer día.
--
--  Borrar una actividad borra sus participaciones, no a las personas: la
--  semblanza de alguien sirve para el año siguiente.
-- =============================================================================
create table if not exists public.actividad_ponentes (
  id            uuid primary key default gen_random_uuid(),
  actividad_id  uuid not null references public.actividades(id) on delete cascade,
  ponente_id    uuid not null references public.ponentes(id)    on delete cascade,
  papel         text not null default '',
  orden         integer not null default 0,
  creado        timestamptz not null default now(),
  constraint actividad_ponentes_unico       unique (actividad_id, ponente_id),
  constraint actividad_ponentes_papel_corto check (length(papel) <= 60)
);

-- «unique (actividad_id, ponente_id)» ya sirve para buscar por actividad; este
-- índice es para la otra dirección: «¿en qué actividades participa?».
create index if not exists actividad_ponentes_ponente
  on public.actividad_ponentes (ponente_id);


-- =============================================================================
--  3 · ¿PUEDE EDITAR A ESTE PONENTE?
--
--  Sí, si es:
--    · la administración;
--    · quien lo dio de alta;
--    · coordinador de alguna actividad en la que participa.
--  La tercera es a propósito: quien vuelve a invitar a alguien este año tiene
--  que poder actualizar su semblanza. Lo que cambie se ve en todas sus
--  actividades, y el panel lo advierte antes de guardar.
--
--  Recibe el id como TEXTO, igual que puede_editar_actividad(): la usan las
--  políticas de Storage con el primer tramo de la ruta, y una ruta mal formada
--  debe negar el permiso, no reventar con un error de uuid.
--
--  SECURITY DEFINER: tiene que ver TODAS las participaciones, no solo las que
--  RLS deja ver a quien pregunta (trampa 3 del plan).
-- =============================================================================
create or replace function public.puede_editar_ponente(carpeta text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_administrador()
      or exists (select 1 from public.ponentes p
                  where p.id::text = carpeta
                    and p.creado_por = auth.uid())
      or exists (select 1 from public.actividad_ponentes ap
                   join public.actividades a on a.id = ap.actividad_id
                  where ap.ponente_id::text = carpeta
                    and a.responsable_id = auth.uid());
$$;

-- Supabase concede toda función nueva a anon y authenticated (trampa 18).
revoke all on function public.puede_editar_ponente(text) from public, anon, authenticated;
grant execute on function public.puede_editar_ponente(text) to authenticated;


-- =============================================================================
--  4 · REGLAS DE ACCESO
--
--  PONENTES
--    · El equipo (cualquier cuenta) los ve todos: es lo que permite buscar a
--      alguien ya registrado en vez de darlo de alta dos veces. El plan los
--      llama semipúblicos por eso.
--    · Sin cuenta, solo los que participan en algo publicado.
--    · Cualquier cuenta da de alta; edita quien diga la sección 3; borra solo
--      la administración. Quitar a alguien de una actividad NO lo borra.
--
--  PARTICIPACIONES
--    · Sin cuenta, las de actividades publicadas.
--    · Las gestiona quien puede editar la actividad.
-- =============================================================================
alter table public.ponentes           enable row level security;
alter table public.actividad_ponentes enable row level security;

revoke all on public.ponentes           from anon, authenticated;
revoke all on public.actividad_ponentes from anon, authenticated;


-- ---- ponentes ---------------------------------------------------------------
drop policy if exists ponentes_ver_equipo on public.ponentes;
create policy ponentes_ver_equipo on public.ponentes
  for select to authenticated
  using ( true );

drop policy if exists ponentes_ver_publicos on public.ponentes;
create policy ponentes_ver_publicos on public.ponentes
  for select to anon
  using ( exists (select 1
                    from public.actividad_ponentes ap
                    join public.actividades a on a.id = ap.actividad_id
                   where ap.ponente_id = ponentes.id
                     and a.publica and not a.archivada) );

drop policy if exists ponentes_crear on public.ponentes;
create policy ponentes_crear on public.ponentes
  for insert to authenticated
  with check ( creado_por = auth.uid() );

drop policy if exists ponentes_editar on public.ponentes;
create policy ponentes_editar on public.ponentes
  for update to authenticated
  using      ( public.puede_editar_ponente(id::text) )
  with check ( public.puede_editar_ponente(id::text) );

drop policy if exists ponentes_borrar on public.ponentes;
create policy ponentes_borrar on public.ponentes
  for delete to authenticated
  using ( public.es_administrador() );

-- Permisos POR COLUMNA. Sin cuenta no se lee quién lo dio de alta ni cuándo.
-- Con cuenta no se escribe «creado_por»: si se pudiera, cualquiera se haría
-- dueño de un ponente ajeno. Al insertar lo llena su default.
grant select (id, nombre, semblanza, foto, institucion, sitio) on public.ponentes to anon;
grant select on public.ponentes to authenticated;
grant insert (nombre, semblanza, institucion, sitio)       on public.ponentes to authenticated;
grant update (nombre, semblanza, foto, institucion, sitio) on public.ponentes to authenticated;
grant delete on public.ponentes to authenticated;


-- ---- participaciones --------------------------------------------------------
drop policy if exists actividad_ponentes_ver_publicas on public.actividad_ponentes;
create policy actividad_ponentes_ver_publicas on public.actividad_ponentes
  for select to anon, authenticated
  using ( exists (select 1 from public.actividades a
                   where a.id = actividad_id
                     and a.publica and not a.archivada) );

drop policy if exists actividad_ponentes_gestionar on public.actividad_ponentes;
create policy actividad_ponentes_gestionar on public.actividad_ponentes
  for all to authenticated
  using      ( public.puede_editar_actividad(actividad_id::text) )
  with check ( public.puede_editar_actividad(actividad_id::text) );

-- Una participación no se mueve de actividad ni de persona: se cambia su
-- papel y su orden, o se quita y se agrega otra.
grant select (actividad_id, ponente_id, papel, orden) on public.actividad_ponentes to anon;
grant select, delete on public.actividad_ponentes to authenticated;
grant insert (actividad_id, ponente_id, papel, orden) on public.actividad_ponentes to authenticated;
grant update (papel, orden) on public.actividad_ponentes to authenticated;


-- =============================================================================
--  5 · FOTOS
--
--  Bucket propio y no una carpeta del de «actividades»: un ponente no
--  pertenece a una sola actividad, y las políticas de ese bucket deciden por
--  la carpeta de la actividad (ver la nota de la fase C en el plan).
--
--  Público en lectura, como el de pósters. 2 MB como segunda barrera: lo que
--  sube el sitio pesa entre 25 y 75 KB.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ponentes', 'ponentes', true, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Las cuatro, por las mismas razones que en 10-poster.sql: sin «select»,
-- supabase-js no puede borrar la foto anterior al reemplazarla.
drop policy if exists ponentes_archivos_ver on storage.objects;
create policy ponentes_archivos_ver on storage.objects
  for select to authenticated
  using ( bucket_id = 'ponentes'
          and public.puede_editar_ponente((storage.foldername(name))[1]) );

drop policy if exists ponentes_archivos_subir on storage.objects;
create policy ponentes_archivos_subir on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'ponentes'
               and public.puede_editar_ponente((storage.foldername(name))[1]) );

drop policy if exists ponentes_archivos_cambiar on storage.objects;
create policy ponentes_archivos_cambiar on storage.objects
  for update to authenticated
  using      ( bucket_id = 'ponentes'
               and public.puede_editar_ponente((storage.foldername(name))[1]) )
  with check ( bucket_id = 'ponentes'
               and public.puede_editar_ponente((storage.foldername(name))[1]) );

drop policy if exists ponentes_archivos_borrar on storage.objects;
create policy ponentes_archivos_borrar on storage.objects
  for delete to authenticated
  using ( bucket_id = 'ponentes'
          and public.puede_editar_ponente((storage.foldername(name))[1]) );


-- =============================================================================
--  6 · LO QUE VE EL PROGRAMA PÚBLICO
--
--  Vista aparte y no columnas nuevas en «vista_programa»: aquella es de una
--  fila por actividad y trae toda la lógica de boletos; reconstruirla por esto
--  es el riesgo de las trampas 6 y 8. La cartelera y la ficha piden los
--  ponentes con una segunda consulta, en paralelo con la primera: por eso la
--  vista trae «edicion_id» (cartelera) y «slug» (ficha), para no tener que
--  esperar el id de la actividad.
--
--  El WHERE repite la condición de la política por la misma razón que en
--  «vista_programa»: con cuenta, «actividad_ponentes_gestionar» deja pasar
--  las participaciones de los borradores propios.
-- =============================================================================
drop view if exists public.vista_programa_ponentes;

create view public.vista_programa_ponentes as
select
  ap.actividad_id,
  a.edicion_id,
  a.slug,
  ap.orden,
  ap.papel,
  p.id           as ponente_id,
  p.nombre,
  p.institucion,
  p.semblanza,
  p.foto,
  p.sitio
from public.actividad_ponentes ap
join public.ponentes    p on p.id = ap.ponente_id
join public.actividades a on a.id = ap.actividad_id
where a.publica
  and not a.archivada;

-- Sin esto la vista ignora las reglas por fila (trampa 2 del plan).
alter view public.vista_programa_ponentes set (security_invoker = true);

revoke all on public.vista_programa_ponentes from anon, authenticated;
grant select on public.vista_programa_ponentes to anon, authenticated;

comment on view public.vista_programa_ponentes is
  'Ponentes de lo publicado, para la cartelera y la ficha. Una fila por participación.';


-- =============================================================================
--  COMPROBACIÓN  ·  las nueve líneas deben decir BIEN
--
--  La 5 y la 6 vigilan fugas: sin cuenta no se lee quién dio de alta a un
--  ponente, y no se escribe nada. Filtran por tipo de permiso (trampa 18).
-- =============================================================================
select 1 as orden,
       'Tablas ponentes y actividad_ponentes' as revisión,
       (select count(*) from information_schema.tables
         where table_schema = 'public'
           and table_name in ('ponentes', 'actividad_ponentes'))::text || ' de 2' as valor,
       case when (select count(*) from information_schema.tables
                   where table_schema = 'public'
                     and table_name in ('ponentes', 'actividad_ponentes')) = 2
            then 'BIEN' else 'REVISAR' end as resultado

union all
select 2, 'Reglas por fila activas',
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname in ('ponentes', 'actividad_ponentes')
           and c.relrowsecurity)::text || ' de 2',
       case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname in ('ponentes', 'actividad_ponentes')
                     and c.relrowsecurity) = 2
            then 'BIEN' else 'REVISAR: TABLAS ABIERTAS' end

union all
select 3, 'Políticas de las tablas',
       (select count(*) from pg_policies
         where schemaname = 'public'
           and tablename in ('ponentes', 'actividad_ponentes'))::text || ' de 7',
       case when (select count(*) from pg_policies
                   where schemaname = 'public'
                     and tablename in ('ponentes', 'actividad_ponentes')) = 7
            then 'BIEN' else 'REVISAR' end

union all
select 4, 'Bucket «ponentes» y sus políticas',
       coalesce((select case when public then 'público' else 'PRIVADO' end
                   from storage.buckets where id = 'ponentes'), 'no existe')
       || ' · ' ||
       (select count(*) from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname like 'ponentes_archivos_%')::text || ' de 4 políticas',
       case when exists (select 1 from storage.buckets where id = 'ponentes' and public)
             and (select count(*) from pg_policies
                   where schemaname = 'storage' and tablename = 'objects'
                     and policyname like 'ponentes_archivos_%') = 4
            then 'BIEN' else 'REVISAR' end

union all
select 5, 'Sin cuenta no se lee creado_por ni fechas',
       coalesce((select string_agg(column_name, ', ')
                   from information_schema.column_privileges
                  where grantee = 'anon' and privilege_type = 'SELECT'
                    and table_schema = 'public' and table_name = 'ponentes'
                    and column_name in ('creado_por', 'creado', 'actualizado')),
                'ninguna — correcto'),
       case when not exists (select 1 from information_schema.column_privileges
                              where grantee = 'anon' and privilege_type = 'SELECT'
                                and table_schema = 'public' and table_name = 'ponentes'
                                and column_name in ('creado_por', 'creado', 'actualizado'))
            then 'BIEN' else 'REVISAR: FUGA' end

union all
select 6, 'Sin cuenta no se escribe',
       coalesce((select string_agg(distinct table_name || '.' || privilege_type, ', ')
                   from information_schema.column_privileges
                  where grantee = 'anon' and privilege_type <> 'SELECT'
                    and table_schema = 'public'
                    and table_name in ('ponentes', 'actividad_ponentes')),
                'nada — correcto'),
       case when not exists (select 1 from information_schema.column_privileges
                              where grantee = 'anon' and privilege_type <> 'SELECT'
                                and table_schema = 'public'
                                and table_name in ('ponentes', 'actividad_ponentes'))
            then 'BIEN' else 'REVISAR: FUGA' end

union all
select 7, 'Con cuenta no se escribe creado_por',
       case when exists (select 1 from information_schema.column_privileges
                          where grantee = 'authenticated'
                            and privilege_type in ('INSERT', 'UPDATE')
                            and table_schema = 'public' and table_name = 'ponentes'
                            and column_name = 'creado_por')
            then 'se puede' else 'no se puede — correcto' end,
       case when not exists (select 1 from information_schema.column_privileges
                              where grantee = 'authenticated'
                                and privilege_type in ('INSERT', 'UPDATE')
                                and table_schema = 'public' and table_name = 'ponentes'
                                and column_name = 'creado_por')
            then 'BIEN' else 'REVISAR' end

union all
select 8, 'Función de permiso cerrada a quien no tiene cuenta',
       case when has_function_privilege('anon', 'public.puede_editar_ponente(text)', 'execute')
            then 'anon la puede llamar' else 'solo con cuenta' end,
       case when not has_function_privilege('anon', 'public.puede_editar_ponente(text)', 'execute')
             and has_function_privilege('authenticated', 'public.puede_editar_ponente(text)', 'execute')
            then 'BIEN' else 'REVISAR' end

union all
select 9, 'La vista respeta las reglas por fila',
       case when exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                          where n.nspname = 'public' and c.relname = 'vista_programa_ponentes'
                            and c.reloptions::text like '%security_invoker=true%')
            then 'security_invoker' else 'SIN security_invoker' end,
       case when exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                          where n.nspname = 'public' and c.relname = 'vista_programa_ponentes'
                            and c.reloptions::text like '%security_invoker=true%')
            then 'BIEN' else 'REVISAR: FUGA' end

order by orden;
