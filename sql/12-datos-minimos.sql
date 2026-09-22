-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 12 · DATOS MÍNIMOS DEL PÚBLICO
--
--  Ejecuta este archivo COMPLETO sobre la base ya migrada con 11-boletos.sql.
--  Después, ejecuta sql/12b-lugares.local.sql (el catálogo de municipios y
--  colonias; ver la nota de la sección 2). Se pueden volver a ejecutar.
--
--  Por qué existe (21 de septiembre de 2026)
--  La asesoría legal del festival pidió aplicar la minimización de datos de la
--  ley de protección de datos de Baja California: el público ya no deja correo
--  ni ocupación. Pide su boleto con
--
--      nombre · fecha de nacimiento · género · municipio y colonia
--
--  Lo que cambia, en orden:
--    1. «normalizar()», para comparar nombres y lugares sin acentos.
--    2. Catálogo de lugares: municipios del país y colonias de Baja
--       California, de SEPOMEX. Solo se consulta por función.
--    3. Los datos de la persona pasan al boleto. «asistentes» desaparece, y con
--       ella el correo: sin correo no hay nada que distinga a dos personas, así
--       que no tiene sentido una tabla de personas.
--    4. La identidad de una persona es su nombre y su fecha de nacimiento
--       («clave_persona»). Con ella se evita el boleto doble, se aplican el tope
--       por persona y los empalmes, y se recupera un boleto perdido.
--    5. Las funciones se rehacen con los datos nuevos.
--
--  SE BORRA el correo de quien ya haya pedido boleto: esa es la instrucción.
--  Los boletos existentes se conservan, pero sin fecha de nacimiento no se
--  pueden recuperar en línea (en la entrada se buscan por nombre).
-- =============================================================================


-- =============================================================================
--  1 · NORMALIZAR
--  Minúsculas, sin acentos ni espacios dobles. «José  Pérez» = «jose perez».
--  Sin la extensión unaccent: translate() cubre el español y no depende de
--  qué extensiones tenga el proyecto.
-- =============================================================================
create or replace function public.normalizar(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           translate(lower(btrim(coalesce(p, ''))),
                     'áéíóúüñàèìòùâêîôûäëïöç',
                     'aeiouunaeiouaeiouaeioc'),
           '\s+', ' ', 'g');
$$;

revoke all on function public.normalizar(text) from public, anon, authenticated;
grant execute on function public.normalizar(text) to anon, authenticated;


-- =============================================================================
--  2 · CATÁLOGO DE LUGARES
--
--  Fuente: Catálogo Nacional de Códigos Postales de Correos de México.
--  Su nota de uso prohíbe distribuirlo a terceros, así que:
--    · las tablas no se abren a nadie: solo se consultan por las dos funciones
--      de búsqueda, que devuelven ocho coincidencias a la vez;
--    · los datos NO van en este archivo ni en el repositorio: los genera
--      herramientas/lugares/generar_sql.py en sql/12b-lugares.local.sql, que
--      está en .gitignore.
--
--  En el boleto se guarda el TEXTO del municipio y la colonia, no el id: el
--  catálogo se puede recargar con una versión nueva y los ids cambiarían.
-- =============================================================================
create table if not exists public.lugares_municipios (
  id        integer primary key,
  estado    text not null,
  municipio text not null,
  busqueda  text not null,
  constraint lugares_municipios_unico unique (estado, municipio)
);

create table if not exists public.lugares_colonias (
  id           integer primary key,
  municipio_id integer not null references public.lugares_municipios(id) on delete cascade,
  colonia      text not null,
  tipo         text not null default '',
  busqueda     text not null,
  constraint lugares_colonias_unica unique (municipio_id, colonia)
);

create index if not exists lugares_colonias_municipio on public.lugares_colonias (municipio_id);

alter table public.lugares_municipios enable row level security;
alter table public.lugares_colonias   enable row level security;
revoke all on public.lugares_municipios from anon, authenticated;
revoke all on public.lugares_colonias   from anon, authenticated;


-- -----------------------------------------------------------------------------
--  Búsqueda para el autocompletado. Mínimo dos letras, máximo ocho
--  resultados. Primero lo que EMPIEZA con lo escrito, luego lo que lo
--  contiene; Baja California antes que el resto del país.
-- -----------------------------------------------------------------------------
create or replace function public.buscar_municipios(p_texto text)
returns table (id integer, estado text, municipio text, con_colonias boolean)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select public.normalizar(p_texto) as t)
  select m.id, m.estado, m.municipio,
         exists (select 1 from public.lugares_colonias c where c.municipio_id = m.id) as con_colonias
    from public.lugares_municipios m, q
   where length(q.t) >= 2
     and m.busqueda like '%' || q.t || '%'
   order by (m.busqueda like q.t || '%') desc,
            (m.estado = 'Baja California') desc,
            length(m.municipio), m.municipio
   limit 8;
$$;

create or replace function public.buscar_colonias(p_municipio integer, p_texto text)
returns table (id integer, colonia text, tipo text)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select public.normalizar(p_texto) as t)
  select c.id, c.colonia, c.tipo
    from public.lugares_colonias c, q
   where c.municipio_id = p_municipio
     and length(q.t) >= 2
     and c.busqueda like '%' || q.t || '%'
   order by (c.busqueda like q.t || '%') desc, length(c.colonia), c.colonia
   limit 8;
$$;

revoke all on function public.buscar_municipios(text)          from public, anon, authenticated;
revoke all on function public.buscar_colonias(integer, text)   from public, anon, authenticated;
grant execute on function public.buscar_municipios(text)        to anon, authenticated;
grant execute on function public.buscar_colonias(integer, text) to anon, authenticated;


-- =============================================================================
--  3 · LAS FUNCIONES QUE CAMBIAN DE FORMA SE BORRAN ANTES
--  «create or replace» no admite cambiar argumentos ni columnas de salida.
-- =============================================================================
drop function if exists public.solicitar_boleto(text, text, text, text, text, text, integer, text, boolean, boolean);
drop function if exists public._emitir_boleto(uuid, text, text, text, text, text, integer, text, boolean, boolean);
drop function if exists public.emitir_boleto_panel(uuid, text, text, integer, boolean, boolean);
drop function if exists public.boletos_de_actividad(uuid);
drop function if exists public._agrupar_asistentes(uuid, text);


-- =============================================================================
--  4 · LOS DATOS DE LA PERSONA, EN EL BOLETO
-- =============================================================================
alter table public.boletos add column if not exists fecha_nacimiento date;
alter table public.boletos add column if not exists genero           text;
alter table public.boletos add column if not exists estado_origen    text;
alter table public.boletos add column if not exists municipio        text;
alter table public.boletos add column if not exists colonia          text;
alter table public.boletos add column if not exists clave_persona    text;

comment on column public.boletos.clave_persona is
  'md5 del nombre normalizado y la fecha de nacimiento. Identifica a la persona sin correo: evita boletos dobles y permite recuperarlos.';
comment on column public.boletos.estado_origen is
  'Estado de donde viene la persona (del catálogo de lugares). «estado» ya es el del boleto.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'boletos_nacimiento_valido') then
    alter table public.boletos add constraint boletos_nacimiento_valido
      check (fecha_nacimiento is null or fecha_nacimiento between date '1900-01-01' and current_date);
  end if;
end $$;

-- Un boleto vigente por persona y actividad. Los cancelados no cuentan, para
-- que pueda volver a pedirlo. Sin fecha de nacimiento (boletos de grupo o del
-- panel) no hay clave y no aplica.
create unique index if not exists boletos_persona_unica
  on public.boletos (actividad_id, clave_persona)
  where clave_persona is not null and estado <> 'cancelado';

create index if not exists boletos_clave_persona
  on public.boletos (clave_persona) where clave_persona is not null;


-- -----------------------------------------------------------------------------
--  Adiós a «asistentes» y al correo.
-- -----------------------------------------------------------------------------
alter table public.boletos drop constraint if exists boletos_una_por_persona;
alter table public.boletos drop column if exists asistente_id;
drop table if exists public.asistentes;


-- -----------------------------------------------------------------------------
--  El catálogo del formulario queda solo con el género. Edad y ocupación ya no
--  se piden: la edad se calcula de la fecha de nacimiento.
-- -----------------------------------------------------------------------------
alter table public.opciones_asistencia drop constraint if exists opciones_asistencia_campo_check;
delete from public.opciones_asistencia where campo <> 'genero';
alter table public.opciones_asistencia
  add constraint opciones_asistencia_campo_check check (campo in ('genero'));

insert into public.opciones_asistencia (campo, valor, orden) values
  ('genero', 'Mujer', 1),
  ('genero', 'Hombre', 2),
  ('genero', 'Otro', 3),
  ('genero', 'Prefiero no decir', 4)
on conflict (campo, valor) do nothing;


-- -----------------------------------------------------------------------------
--  Los intentos distinguen para qué fueron: pedir boleto o recuperarlo tienen
--  límites distintos.
-- -----------------------------------------------------------------------------
alter table public.intentos add column if not exists tipo text not null default 'boleto';


-- =============================================================================
--  5 · FUNCIONES
-- =============================================================================

create or replace function public.clave_persona(p_nombre text, p_nacimiento date)
returns text
language sql
immutable
as $$
  select case when p_nacimiento is null or length(public.normalizar(p_nombre)) < 2 then null
              else md5(public.normalizar(p_nombre) || '|' || p_nacimiento::text) end;
$$;

revoke all on function public.clave_persona(text, date) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
--  EMISIÓN (interna). La usan el formulario público y el panel.
--
--  p_panel = true relaja lo que solo tiene sentido para el público: ventana,
--  tope de lugares por boleto, datos obligatorios, empalmes y tope por
--  persona. El cupo se respeta SIEMPRE.
-- -----------------------------------------------------------------------------
create or replace function public._emitir_boleto(
  p_actividad  uuid,
  p_nombre     text,
  p_nacimiento date,
  p_genero     text,
  p_municipio  integer,
  p_colonia    integer,
  p_lugares    integer,
  p_origen     text,
  p_espera     boolean,
  p_panel      boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre   text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_lugares  integer := coalesce(p_lugares, 1);
  v_origen   text := coalesce(p_origen, 'otro');
  v_clave    text;
  a          public.actividades%rowtype;
  f          public.aforos%rowtype;
  v_ed       public.ediciones%rowtype;
  m          public.lugares_municipios%rowtype;
  v_colonia  text;
  b          public.boletos%rowtype;
  v_ini      timestamptz;
  v_fin      timestamptz;
  v_choque   text;
  v_activos  integer;
  v_estado   text;
begin
  -- ---- 1. La actividad, bajo candado ----------------------------------------
  select * into f from public.aforos where actividad_id = p_actividad for update;
  if not found then
    insert into public.aforos (actividad_id)
    select id from public.actividades where id = p_actividad
    on conflict (actividad_id) do nothing;
    select * into f from public.aforos where actividad_id = p_actividad for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'no_existe');
    end if;
  end if;

  select * into a from public.actividades where id = p_actividad;

  if not p_panel and (not a.publica or a.archivada) then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if a.acceso = 'libre' then
    return jsonb_build_object('ok', false, 'error', 'sin_boleto');
  end if;

  if not p_panel then
    if now() < public.boletos_apertura(a.boletos_desde, a.publicada_en) then
      return jsonb_build_object('ok', false, 'error', 'aun_no',
        'desde', public.boletos_apertura(a.boletos_desde, a.publicada_en));
    end if;
    if now() >= public.boletos_cierre(a.boletos_hasta, a.fecha, a.hora_inicio) then
      return jsonb_build_object('ok', false, 'error', 'cerrado');
    end if;
  end if;

  -- ---- 2. El formulario -----------------------------------------------------
  if v_origen not in ('cartel', 'programa', 'ficha', 'portada', 'redes',
                      'puerta', 'grupo', 'panel', 'otro') then
    v_origen := 'otro';
  end if;

  if length(v_nombre) < 2 or length(v_nombre) > 120 then
    return jsonb_build_object('ok', false, 'error', 'nombre');
  end if;

  if p_nacimiento is not null
     and (p_nacimiento < date '1900-01-01' or p_nacimiento > current_date) then
    return jsonb_build_object('ok', false, 'error', 'nacimiento');
  end if;

  if p_genero is not null and not exists (
       select 1 from public.opciones_asistencia
        where campo = 'genero' and valor = p_genero and activa) then
    return jsonb_build_object('ok', false, 'error', 'genero');
  end if;

  -- El lugar: el municipio del catálogo, y la colonia solo si es de ese municipio.
  if p_municipio is not null then
    select * into m from public.lugares_municipios where id = p_municipio;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'municipio');
    end if;
    if p_colonia is not null then
      select colonia into v_colonia
        from public.lugares_colonias
       where id = p_colonia and municipio_id = p_municipio;
      if v_colonia is null then
        return jsonb_build_object('ok', false, 'error', 'colonia');
      end if;
    end if;
  end if;

  if not p_panel then
    if p_nacimiento is null then
      return jsonb_build_object('ok', false, 'error', 'nacimiento');
    end if;
    if p_genero is null then
      return jsonb_build_object('ok', false, 'error', 'genero');
    end if;
    if p_municipio is null then
      return jsonb_build_object('ok', false, 'error', 'municipio');
    end if;
    if v_lugares < 1 or v_lugares > a.lugares_max then
      return jsonb_build_object('ok', false, 'error', 'lugares', 'maximo', a.lugares_max);
    end if;
  elsif v_lugares < 1 or v_lugares > 1000 then
    return jsonb_build_object('ok', false, 'error', 'lugares', 'maximo', 1000);
  end if;

  v_clave := public.clave_persona(v_nombre, p_nacimiento);

  -- ---- 3. ¿Ya tiene boleto? -------------------------------------------------
  --  No se devuelve el boleto existente: para eso está recuperar_boletos(),
  --  que tiene su propio límite de intentos.
  if v_clave is not null then
    select * into b from public.boletos
     where actividad_id = p_actividad and clave_persona = v_clave and estado <> 'cancelado'
     limit 1;
    if found then
      return jsonb_build_object('ok', false, 'error', 'duplicado', 'estado', b.estado);
    end if;
  end if;

  -- ---- 4. Límites contra el acaparamiento ----------------------------------
  if not p_panel and v_clave is not null then
    select * into v_ed from public.ediciones where id = a.edicion_id;

    select count(*) into v_activos
      from public.boletos x
      join public.actividades y on y.id = x.actividad_id
     where x.clave_persona = v_clave
       and x.estado in ('activo', 'espera')
       and y.edicion_id = a.edicion_id;

    if v_activos >= coalesce(v_ed.boletos_por_persona, 8) then
      return jsonb_build_object('ok', false, 'error', 'tope',
        'maximo', coalesce(v_ed.boletos_por_persona, 8));
    end if;

    if a.fecha is not null and a.hora_inicio is not null then
      v_ini := public.inicio_actividad(a.fecha, a.hora_inicio);
      v_fin := public.fin_actividad(a.fecha, a.hora_inicio, a.hora_fin);

      select y.titulo into v_choque
        from public.boletos x
        join public.actividades y on y.id = x.actividad_id
       where x.clave_persona = v_clave
         and x.estado = 'activo'
         and x.actividad_id <> p_actividad
         and y.fecha = a.fecha
         and y.hora_inicio is not null
         and public.inicio_actividad(y.fecha, y.hora_inicio) < v_fin
         and public.fin_actividad(y.fecha, y.hora_inicio, y.hora_fin) > v_ini
       limit 1;

      if v_choque is not null then
        return jsonb_build_object('ok', false, 'error', 'empalme', 'con', v_choque);
      end if;
    end if;
  end if;

  -- ---- 5. ¿Cabe? ------------------------------------------------------------
  if a.acceso = 'boleto' and f.emitidos + v_lugares > a.cupo then
    if not p_espera then
      return jsonb_build_object('ok', false, 'error', 'agotado',
        'disponibles', greatest(a.cupo - f.emitidos, 0));
    end if;
    v_estado := 'espera';
  else
    v_estado := 'activo';
  end if;

  -- ---- 6. El boleto ---------------------------------------------------------
  insert into public.boletos (actividad_id, nombre, codigo, lugares, estado, origen, emitido_por,
                              fecha_nacimiento, genero, estado_origen, municipio, colonia, clave_persona)
  values (p_actividad, v_nombre, public.codigo_nuevo(), v_lugares, v_estado, v_origen,
          case when p_panel then auth.uid() end,
          p_nacimiento, p_genero, m.estado, m.municipio, v_colonia, v_clave)
  returning * into b;

  update public.aforos
     set emitidos    = emitidos  + case when v_estado = 'activo' then v_lugares else 0 end,
         en_espera   = en_espera + case when v_estado = 'espera' then v_lugares else 0 end,
         actualizado = now()
   where actividad_id = p_actividad;

  return jsonb_build_object(
    'ok',        true,
    'estado',    b.estado,
    'codigo',    b.codigo,
    'token',     b.token,
    'lugares',   b.lugares,
    'nombre',    b.nombre,
    'actividad', public.actividad_para_boleto(p_actividad)
  );
end;
$$;

revoke all on function public._emitir_boleto(uuid, text, date, text, integer, integer, integer, text, boolean, boolean)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
--  solicitar_boleto · lo que llama el formulario público
-- -----------------------------------------------------------------------------
create or replace function public.solicitar_boleto(
  p_slug       text,
  p_nombre     text,
  p_nacimiento date,
  p_genero     text,
  p_municipio  integer,
  p_colonia    integer default null,
  p_lugares    integer default 1,
  p_origen     text    default 'otro',
  p_consiento  boolean default false,
  p_espera     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip  text := public.ip_peticion();
  v_id  uuid;
begin
  -- El intento se anota ANTES de validar, para que cuenten también los que
  -- fallan. Por eso esta función nunca lanza excepciones.
  if v_ip is not null then
    if (select count(*) from public.intentos
         where ip = v_ip and tipo = 'boleto' and creado > now() - interval '10 minutes') >= 40 then
      return jsonb_build_object('ok', false, 'error', 'demasiados');
    end if;
    insert into public.intentos (ip, tipo) values (v_ip, 'boleto');
    if random() < 0.02 then
      delete from public.intentos where creado < now() - interval '1 day';
    end if;
  end if;

  if not coalesce(p_consiento, false) then
    return jsonb_build_object('ok', false, 'error', 'consentimiento');
  end if;

  select id into v_id
    from public.actividades
   where slug = p_slug
     and edicion_id = public.edicion_activa();

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;

  return public._emitir_boleto(v_id, p_nombre, p_nacimiento, p_genero, p_municipio,
                               p_colonia, p_lugares, p_origen, coalesce(p_espera, false), false);
end;
$$;

revoke all on function public.solicitar_boleto(text, text, date, text, integer, integer, integer, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.solicitar_boleto(text, text, date, text, integer, integer, integer, text, boolean, boolean)
  to anon, authenticated;


-- -----------------------------------------------------------------------------
--  recuperar_boletos · «perdí mi boleto»
--
--  Con el nombre y la fecha de nacimiento devuelve los boletos vigentes de la
--  edición, con su token: la persona vuelve a tener su boleto completo.
--
--  Límite propio y estricto: 10 intentos en 10 minutos por dirección. Sin él,
--  alguien podría probar fechas al azar para un nombre conocido.
--  Decisión aceptada el 21 de septiembre de 2026: para un festival gratuito,
--  nombre y fecha de nacimiento bastan como verificación.
-- -----------------------------------------------------------------------------
create or replace function public.recuperar_boletos(p_nombre text, p_nacimiento date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip    text := public.ip_peticion();
  v_clave text := public.clave_persona(p_nombre, p_nacimiento);
begin
  if v_ip is not null then
    if (select count(*) from public.intentos
         where ip = v_ip and tipo = 'recuperar' and creado > now() - interval '10 minutes') >= 10 then
      return jsonb_build_object('ok', false, 'error', 'demasiados');
    end if;
    insert into public.intentos (ip, tipo) values (v_ip, 'recuperar');
  end if;

  if v_clave is null then
    return jsonb_build_object('ok', false, 'error', 'datos');
  end if;

  return jsonb_build_object('ok', true, 'boletos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'token',      b.token,
             'codigo',     b.codigo,
             'estado',     b.estado,
             'lugares',    b.lugares,
             'nombre',     b.nombre,
             'creado',     b.creado,
             'asistio_en', b.asistio_en,
             'actividad',  public.actividad_para_boleto(b.actividad_id))
           order by a.fecha nulls last, a.hora_inicio nulls last)
      from public.boletos b
      join public.actividades a on a.id = b.actividad_id
     where b.clave_persona = v_clave
       and b.estado <> 'cancelado'
       and a.edicion_id = public.edicion_activa()
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.recuperar_boletos(text, date) from public, anon, authenticated;
grant execute on function public.recuperar_boletos(text, date) to anon, authenticated;


-- -----------------------------------------------------------------------------
--  PUERTA · búsqueda para quien perdió su boleto: por código o por nombre.
-- -----------------------------------------------------------------------------
create or replace function public.buscar_en_puerta(p_actividad uuid, p_texto text, p_clave text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t text := btrim(coalesce(p_texto, ''));
begin
  if public.es_personal(p_actividad, p_clave) is null then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  if length(v_t) < 3 then
    return jsonb_build_object('ok', true, 'boletos', '[]'::jsonb);
  end if;

  return jsonb_build_object('ok', true, 'boletos', coalesce((
    select jsonb_agg(r) from (
      select b.id, b.codigo, b.nombre, b.lugares, b.estado, b.asistio_en, b.asistieron
        from public.boletos b
       where b.actividad_id = p_actividad
         and b.estado <> 'cancelado'
         and (   b.codigo = upper(replace(replace(replace(v_t, '-', ''), ' ', ''), '·', ''))
              or public.normalizar(b.nombre) like '%' || public.normalizar(v_t) || '%')
       order by b.nombre
       limit 20
    ) r
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.buscar_en_puerta(uuid, text, text) from public, anon, authenticated;
grant execute on function public.buscar_en_puerta(uuid, text, text) to anon, authenticated;


-- -----------------------------------------------------------------------------
--  PANEL · la lista. Sin datos personales más allá del nombre.
-- -----------------------------------------------------------------------------
create or replace function public.boletos_de_actividad(p_actividad uuid)
returns table (
  id uuid, codigo text, nombre text, lugares smallint,
  estado text, origen text, creado timestamptz, cancelado_en timestamptz,
  asistio_en timestamptz, asistieron smallint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_editar_actividad(p_actividad::text) then
    raise exception 'No tienes permiso para ver los boletos de esta actividad.'
      using errcode = '42501';
  end if;

  return query
    select b.id, b.codigo, b.nombre, b.lugares,
           b.estado, b.origen, b.creado, b.cancelado_en,
           b.asistio_en, b.asistieron
      from public.boletos b
     where b.actividad_id = p_actividad
     order by b.creado;
end;
$$;

revoke all on function public.boletos_de_actividad(uuid) from public, anon, authenticated;
grant execute on function public.boletos_de_actividad(uuid) to authenticated;


-- -----------------------------------------------------------------------------
--  PANEL · el perfil del público, solo en conjunto.
--  La edad se calcula al día de la actividad (o a hoy, si no tiene fecha).
-- -----------------------------------------------------------------------------
create or replace function public._agrupar_boletos(p_actividad uuid, p_campo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(valor, n), '{}'::jsonb) from (
    select valor, count(*) as n from (
      select case p_campo
               when 'edad' then
                 case
                   when e.x is null then 'Sin dato'
                   when e.x < 13 then '0 a 12 años'
                   when e.x < 18 then '13 a 17 años'
                   when e.x < 30 then '18 a 29 años'
                   when e.x < 60 then '30 a 59 años'
                   else '60 años o más'
                 end
               when 'genero'    then coalesce(b.genero, 'Sin dato')
               when 'municipio' then coalesce(
                                       case when b.estado_origen = 'Baja California' then b.municipio
                                            else b.municipio || ' (' || b.estado_origen || ')' end,
                                       'Sin dato')
               when 'colonia'   then coalesce(b.colonia || ' · ' || b.municipio, 'Sin dato')
             end as valor
        from public.boletos b
        join public.actividades a on a.id = b.actividad_id
        cross join lateral (
          select extract(year from age(coalesce(a.fecha, current_date), b.fecha_nacimiento))::int as x
        ) e
       where b.actividad_id = p_actividad
         and b.estado <> 'cancelado'
         and b.origen not in ('puerta')
    ) t
    group by valor
  ) g;
$$;

revoke all on function public._agrupar_boletos(uuid, text) from public, anon, authenticated;

create or replace function public.resumen_boletos(p_actividad uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_editar_actividad(p_actividad::text) then
    raise exception 'No tienes permiso para ver los boletos de esta actividad.'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'aforo', (select to_jsonb(x) - 'actividad_id' from public.aforos x where x.actividad_id = p_actividad),

    'por_origen', coalesce((
      select jsonb_object_agg(origen, lugares) from (
        select origen, sum(lugares) as lugares
          from public.boletos
         where actividad_id = p_actividad and estado = 'activo'
         group by origen) t), '{}'::jsonb),

    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'lugares', lugares) order by dia) from (
        select (creado at time zone 'America/Tijuana')::date as dia, sum(lugares) as lugares
          from public.boletos
         where actividad_id = p_actividad and estado <> 'cancelado' and origen <> 'puerta'
         group by 1) t), '[]'::jsonb),

    -- Cuenta BOLETOS (quien lo pidió), no lugares: los datos no son de los
    -- acompañantes.
    'edad',      public._agrupar_boletos(p_actividad, 'edad'),
    'genero',    public._agrupar_boletos(p_actividad, 'genero'),
    'municipio', public._agrupar_boletos(p_actividad, 'municipio'),
    'colonia',   public._agrupar_boletos(p_actividad, 'colonia'),

    'cancelados', (select count(*) from public.boletos
                    where actividad_id = p_actividad and estado = 'cancelado')
  );
end;
$$;

revoke all on function public.resumen_boletos(uuid) from public, anon, authenticated;
grant execute on function public.resumen_boletos(uuid) to authenticated;


-- -----------------------------------------------------------------------------
--  PANEL · emitir a mano o para un grupo. Solo el nombre (de la persona o de
--  quien acompaña al grupo) y los lugares.
-- -----------------------------------------------------------------------------
create or replace function public.emitir_boleto_panel(
  p_actividad uuid,
  p_nombre    text,
  p_lugares   integer default 1,
  p_grupo     boolean default false,
  p_espera    boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_editar_actividad(p_actividad::text) then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  return public._emitir_boleto(p_actividad, p_nombre, null, null, null, null,
                               p_lugares,
                               case when p_grupo then 'grupo' else 'panel' end,
                               coalesce(p_espera, false), true);
end;
$$;

revoke all on function public.emitir_boleto_panel(uuid, text, integer, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.emitir_boleto_panel(uuid, text, integer, boolean, boolean)
  to authenticated;


-- =============================================================================
--  COMPROBACIONES · todas deben decir BIEN
-- =============================================================================
select * from (
  select 1 as orden, 'Ya no existe la tabla de personas con correo' as revisión,
         case when to_regclass('public.asistentes') is null then 'borrada' else 'SIGUE AHÍ' end as valor,
         case when to_regclass('public.asistentes') is null then 'BIEN' else 'REVISAR' end as resultado
  union all
  select 2, 'Ninguna columna «correo» en boletos',
         coalesce((select string_agg(column_name, ', ') from information_schema.columns
                    where table_schema = 'public' and table_name = 'boletos'
                      and column_name in ('correo', 'asistente_id', 'ocupacion')), 'ninguna'),
         case when not exists (select 1 from information_schema.columns
                                where table_schema = 'public' and table_name = 'boletos'
                                  and column_name in ('correo', 'asistente_id', 'ocupacion'))
              then 'BIEN' else 'REVISAR' end
  union all
  select 3, 'anon no lee boletos ni lugares directo',
         coalesce((select string_agg(distinct table_name, ', ') from information_schema.role_table_grants
                    where grantee = 'anon' and table_schema = 'public'
                      and table_name in ('boletos', 'lugares_municipios', 'lugares_colonias')), 'ninguna'),
         case when not exists (select 1 from information_schema.role_table_grants
                                where grantee = 'anon' and table_schema = 'public'
                                  and table_name in ('boletos', 'lugares_municipios', 'lugares_colonias'))
              then 'BIEN' else 'REVISAR: FUGA' end
  union all
  select 4, 'Funciones internas cerradas',
         coalesce((select string_agg(p.proname, ', ')
                     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public'
                      and p.proname in ('_emitir_boleto', '_agrupar_boletos', 'clave_persona')
                      and (has_function_privilege('anon', p.oid, 'execute')
                           or has_function_privilege('authenticated', p.oid, 'execute'))), 'ninguna expuesta'),
         case when not exists (select 1
                     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public'
                      and p.proname in ('_emitir_boleto', '_agrupar_boletos', 'clave_persona')
                      and (has_function_privilege('anon', p.oid, 'execute')
                           or has_function_privilege('authenticated', p.oid, 'execute')))
              then 'BIEN' else 'REVISAR: FUGA' end
  union all
  select 5, 'Opciones del formulario: solo género',
         (select string_agg(valor, ', ' order by orden) from public.opciones_asistencia),
         case when not exists (select 1 from public.opciones_asistencia where campo <> 'genero')
              then 'BIEN' else 'REVISAR' end
  union all
  select 6, 'Catálogo de lugares cargado',
         (select count(*) from public.lugares_municipios)::text || ' municipios · '
           || (select count(*) from public.lugares_colonias)::text || ' colonias',
         case when (select count(*) from public.lugares_colonias) > 0
              then 'BIEN' else 'FALTA: ejecutar sql/12b-lugares.local.sql' end
) t order by orden;
