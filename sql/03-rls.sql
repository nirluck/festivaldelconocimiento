-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 03 · REGLAS DE ACCESO POR FILA
--
--  Esto es lo que sustituye al rol de WordPress. La seguridad NO depende de que
--  la interfaz esconda botones: Postgres filtra las filas antes de entregarlas.
--  Un responsable no puede ver el expediente de otro ni aunque manipule la
--  petición desde la consola del navegador.
-- =============================================================================


-- =============================================================================
--  CANDADO · este archivo describe el esquema anterior a 06 y a 07
--
--  Volver a ejecutarlo sobre una base ya migrada no fallaría solo por «dias» y
--  «ajustes», que 07 elimina. Haría algo peor: reinstalar es_coordinacion(),
--  las políticas del rol viejo y un proteger_estado() que lee la columna
--  «estado», eliminada en 07. El esquema retrocedería en silencio y el error
--  aparecería mucho después, lejos de su causa.
--
--  En una base nueva «ediciones» todavía no existe, así que este candado no
--  estorba al orden documentado: 01, 02, 03, 04, 06, 07.
-- =============================================================================
do $$
begin
  if to_regclass('public.ediciones') is not null then
    raise exception
      'Esta base ya pasó por 07-nucleo.sql. Volver a ejecutar 03-rls.sql la haría retroceder: aplica 06 y 07, que ya traen las reglas de acceso al día.';
  end if;
end $$;


-- -----------------------------------------------------------------------------
--  ¿Quien pregunta es de coordinación?
--
--  Va como SECURITY DEFINER a propósito: si consultara "perfiles" con las
--  reglas del usuario, la política de perfiles volvería a llamar a esta función
--  y entraría en recursión infinita. Al ser definer, la consulta interna salta
--  RLS y corta el ciclo.
-- -----------------------------------------------------------------------------
create or replace function public.es_coordinacion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
     where id = auth.uid() and rol = 'coordinacion'
  );
$$;


-- -----------------------------------------------------------------------------
--  Nadie se asciende a sí mismo.
--  RLS filtra filas, no columnas, así que sin esto un responsable podría
--  actualizar su propio perfil poniéndose rol = 'coordinacion'.
-- -----------------------------------------------------------------------------
create or replace function public.proteger_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rol is distinct from old.rol and not public.es_coordinacion() then
    raise exception 'Solo la coordinación puede cambiar el rol de una cuenta.';
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_proteger_rol on public.perfiles;
create trigger perfiles_proteger_rol
  before update on public.perfiles
  for each row execute function public.proteger_rol();


-- -----------------------------------------------------------------------------
--  El estado de una actividad (propuesta / aprobada / rechazada) lo decide
--  la coordinación, no quien la propuso.
-- -----------------------------------------------------------------------------
create or replace function public.proteger_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_coordinacion() then
    if new.estado is distinct from old.estado then
      raise exception 'Solo la coordinación puede cambiar el estado de una actividad.';
    end if;
    if new.archivada is distinct from old.archivada then
      raise exception 'Solo la coordinación puede archivar una actividad.';
    end if;
    -- Tampoco se puede regalar la actividad a otra cuenta
    new.responsable_id := old.responsable_id;
  end if;
  return new;
end;
$$;

drop trigger if exists actividades_proteger_estado on public.actividades;
create trigger actividades_proteger_estado
  before update on public.actividades
  for each row execute function public.proteger_estado();


-- =============================================================================
--  ACTIVAR RLS
-- =============================================================================
alter table public.perfiles     enable row level security;
alter table public.actividades  enable row level security;
alter table public.reportes     enable row level security;
alter table public.seguimiento  enable row level security;
alter table public.ajustes      enable row level security;
alter table public.ejes         enable row level security;
alter table public.tipos        enable row level security;
alter table public.sedes        enable row level security;
alter table public.dias         enable row level security;


-- =============================================================================
--  PERFILES
-- =============================================================================
drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles
  for select to authenticated
  using ( id = auth.uid() or public.es_coordinacion() );

drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles
  for update to authenticated
  using ( id = auth.uid() or public.es_coordinacion() )
  with check ( id = auth.uid() or public.es_coordinacion() );


-- =============================================================================
--  ACTIVIDADES
-- =============================================================================
drop policy if exists actividades_ver on public.actividades;
create policy actividades_ver on public.actividades
  for select to authenticated
  using ( responsable_id = auth.uid() or public.es_coordinacion() );

-- Solo puedes dar de alta actividades a tu propio nombre.
drop policy if exists actividades_crear on public.actividades;
create policy actividades_crear on public.actividades
  for insert to authenticated
  with check ( responsable_id = auth.uid() );

drop policy if exists actividades_editar on public.actividades;
create policy actividades_editar on public.actividades
  for update to authenticated
  using ( responsable_id = auth.uid() or public.es_coordinacion() )
  with check ( responsable_id = auth.uid() or public.es_coordinacion() );

-- Borrar es cosa de coordinación. El responsable no borra: se archiva.
drop policy if exists actividades_borrar on public.actividades;
create policy actividades_borrar on public.actividades
  for delete to authenticated
  using ( public.es_coordinacion() );


-- =============================================================================
--  REPORTES  ·  historial de solo agregar
--  No hay política de UPDATE ni de DELETE, y eso es deliberado: el historial
--  no se reescribe. Para corregir algo se manda un reporte nuevo.
-- =============================================================================
drop policy if exists reportes_ver on public.reportes;
create policy reportes_ver on public.reportes
  for select to authenticated
  using (
    public.es_coordinacion()
    or exists (
      select 1 from public.actividades a
       where a.id = actividad_id and a.responsable_id = auth.uid()
    )
  );

drop policy if exists reportes_crear on public.reportes;
create policy reportes_crear on public.reportes
  for insert to authenticated
  with check (
    public.es_coordinacion()
    or exists (
      select 1 from public.actividades a
       where a.id = actividad_id and a.responsable_id = auth.uid()
    )
  );


-- =============================================================================
--  SEGUIMIENTO  ·  privado de la coordinación.
--  El responsable no lo ve ni sabe que existe.
-- =============================================================================
drop policy if exists seguimiento_todo on public.seguimiento;
create policy seguimiento_todo on public.seguimiento
  for all to authenticated
  using ( public.es_coordinacion() )
  with check ( public.es_coordinacion() );


-- =============================================================================
--  CATÁLOGOS Y AJUSTES
--  Lectura para cualquiera, incluso sin cuenta: el formulario de registro
--  necesita llenar sus listas antes de que la persona se registre.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['ejes','tipos','sedes','dias','ajustes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_leer', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_leer', t);

    execute format('drop policy if exists %I on public.%I', t || '_escribir', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.es_coordinacion()) with check (public.es_coordinacion())',
      t || '_escribir', t);
  end loop;
end $$;


-- =============================================================================
--  PERMISOS DE TABLA
-- =============================================================================
grant usage on schema public to anon, authenticated;
grant select on public.ejes, public.tipos, public.sedes, public.dias, public.ajustes
  to anon, authenticated;
grant select, insert, update, delete
  on public.perfiles, public.actividades, public.reportes, public.seguimiento,
     public.ejes, public.tipos, public.sedes, public.dias, public.ajustes
  to authenticated;
grant select on public.vista_actividades to authenticated;


-- =============================================================================
--  ASCENDER A LA COORDINACIÓN
--
--  Da de alta la cuenta primero (desde el sitio, o en Supabase ▸ Authentication
--  ▸ Users ▸ Add user marcando «Auto Confirm User») y luego ejecuta esto con su
--  correo.
--
--  OJO con el disparador: «proteger_rol» rechaza los cambios de rol que no
--  vengan de una cuenta de coordinación. Como al principio no existe ninguna, y
--  el editor SQL no actúa como ningún usuario, el candado se bloquearía a sí
--  mismo. Por eso se levanta durante la operación y se vuelve a poner.
-- =============================================================================

-- alter table public.perfiles disable trigger perfiles_proteger_rol;
--
-- insert into public.perfiles (id, correo, nombre, rol)
-- select u.id, u.email,
--        coalesce(nullif(u.raw_user_meta_data ->> 'nombre', ''), 'Coordinación'),
--        'coordinacion'
--   from auth.users u
--  where u.email = lower('tu-correo@ejemplo.mx')
-- on conflict (id) do update set rol = 'coordinacion';
--
-- alter table public.perfiles enable trigger perfiles_proteger_rol;
