-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 15 · SEDES ABIERTAS
--
--  Hasta ahora solo la administración podía añadir sedes (política
--  «sedes_escribir»), y los coordinadores la pedían una y otra vez. Decisión
--  del 30 de septiembre de 2026:
--
--    1. Quien registra o edita una actividad puede dar de alta una sede que no
--       esté en la lista, con nombre y dirección. Queda en el catálogo para
--       todos.
--    2. Sale «Otra sede», que no decía nada; la sustituye la función de arriba.
--
--  No se abre la tabla: escribir en «sedes» sigue siendo de la administración.
--  Lo único que se abre es «alta_sede», que valida, evita duplicados y deja
--  constancia de quién creó la sede.
--
--  Se puede ejecutar más de una vez.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1 · De dónde salió cada sede
--
--  Nulas en las que ya estaban: las cargó la administración desde aquí.
--  «creada_por» no se publica: el público lee solo las columnas de abajo.
-- -----------------------------------------------------------------------------
alter table public.sedes add column if not exists creada_por uuid
  references public.perfiles(id) on delete set null;
alter table public.sedes add column if not exists creada_en timestamptz;

comment on column public.sedes.creada_por is
  'Quién dio de alta la sede desde el formulario (alta_sede). Nulo: la cargó la administración.';

revoke select on public.sedes from anon;
grant select (nombre, orden, activa, direccion, capacidad) on public.sedes to anon;


-- -----------------------------------------------------------------------------
--  2 · alta_sede(nombre, dirección) → el nombre con que quedó en el catálogo
--
--  Si ya hay una sede que se llama igual sin contar mayúsculas, acentos ni
--  espacios de más, devuelve esa en vez de crear otra: «ceart» no duplica a
--  «CEART». Si estaba desactivada, la reactiva (alguien la está usando), y si
--  no tenía dirección, se queda con la que viene.
--
--  Las sedes nuevas van al final de la lista normal, antes de «Escuelas» y
--  «Por definir» (orden 90 en adelante).
-- -----------------------------------------------------------------------------
create or replace function public.alta_sede(p_nombre text, p_direccion text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')),    '\s+', ' ', 'g');
  v_dir    text := regexp_replace(btrim(coalesce(p_direccion, '')), '\s+', ' ', 'g');
  v_existe text;
begin
  if auth.uid() is null then
    raise exception 'Necesitas entrar con tu cuenta para dar de alta una sede.';
  end if;
  if char_length(v_nombre) < 3 or char_length(v_nombre) > 120 then
    raise exception 'El nombre de la sede tiene que tener entre 3 y 120 caracteres.';
  end if;
  if char_length(v_dir) < 5 or char_length(v_dir) > 200 then
    raise exception 'La dirección de la sede tiene que tener entre 5 y 200 caracteres.';
  end if;

  -- Dos personas dando de alta la misma sede a la vez: la segunda espera y
  -- encuentra la de la primera.
  perform pg_advisory_xact_lock(hashtext('alta_sede:' || public.normalizar(v_nombre)));

  select nombre into v_existe
    from public.sedes
   where public.normalizar(nombre) = public.normalizar(v_nombre)
   order by activa desc, orden
   limit 1;

  if v_existe is not null then
    update public.sedes
       set activa    = true,
           direccion = coalesce(nullif(btrim(direccion), ''), v_dir)
     where nombre = v_existe;
    return v_existe;
  end if;

  insert into public.sedes (nombre, orden, activa, direccion, creada_por, creada_en)
  values (v_nombre,
          (select coalesce(max(orden), 0) + 1 from public.sedes where orden < 90),
          true, v_dir, auth.uid(), now());
  return v_nombre;
end;
$$;

revoke all on function public.alta_sede(text, text) from public, anon, authenticated;
grant execute on function public.alta_sede(text, text) to authenticated;


-- -----------------------------------------------------------------------------
--  3 · Fuera «Otra sede»
--
--  «actividades.sede» es texto sin llave foránea: las actividades que la
--  tengan la conservan. El formulario la sigue mostrando en esas actividades
--  para no borrarla sin querer, pero ya no se ofrece. La comprobación de abajo
--  dice cuáles son, para cambiarlas por su sede real.
-- -----------------------------------------------------------------------------
delete from public.sedes where nombre = 'Otra sede';


-- =============================================================================
--  COMPROBACIÓN
--    · «alta_sede lista» y «Otra sede fuera del catálogo» en «sí».
--    · Después, las actividades que todavía dicen «Otra sede», si hay.
-- =============================================================================
select 'alta_sede lista' as que,
       case when exists (select 1 from pg_proc where proname = 'alta_sede') then 'sí' else 'NO' end as listo
union all
select 'Otra sede fuera del catálogo',
       case when not exists (select 1 from public.sedes where nombre = 'Otra sede') then 'sí' else 'NO' end
union all
select 'Actividad con «Otra sede»: ' || titulo, 'cambiar su sede'
  from public.actividades
 where sede = 'Otra sede';
