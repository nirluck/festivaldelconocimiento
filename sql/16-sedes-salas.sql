-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 16 · SEDES Y SALAS
--
--  La sede deja de ser una lista de nombres y pasa a administrarse desde un
--  panel (/panel/sedes/). Decisiones del 30 de septiembre de 2026:
--
--    · Las sedes grandes tienen salas o zonas (CEART: Foro Experimental, Aula
--      Magna; Riviera: Salón Casino, Salón Rojo…). Cada actividad puede decir
--      en cuál es, y eso se ve en el programa: «CEART · Aula Magna».
--    · Lo PÚBLICO de una sede: nombre, nombre corto, dirección, indicaciones
--      para llegar y enlace de mapa. De una sala: su nombre.
--    · Lo INTERNO: capacidades (de la sede y de cada sala), notas y el
--      contacto del recinto. La capacidad NO es el cupo de boletos, que trae
--      sobrecupo: se queda como referencia para la administración.
--    · El mapa es un enlace «Cómo llegar», no un mapa incrustado: la página no
--      carga nada de Google y el aviso de privacidad no cambia.
--    · Las salas las da de alta solo la administración.
--
--  Lo que ya está publicado no cambia: «actividades.sede» sigue siendo el
--  nombre de la sede, las vistas solo GANAN columnas al final, y una actividad
--  sin sala se ve exactamente igual que antes.
--
--  Se puede ejecutar más de una vez.
--
--  OJO · 11-boletos.sql, 14-acceso-escolar.sql y 15-sedes-abiertas.sql
--  vuelven a crear vistas, funciones o permisos de abajo con su definición
--  anterior (15 volvería a publicar la capacidad). Si se vuelve a correr
--  alguno, hay que correr 16 después.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1 · SEDES: los datos públicos nuevos
-- -----------------------------------------------------------------------------
alter table public.sedes add column if not exists nombre_corto text;
alter table public.sedes add column if not exists referencias  text;
alter table public.sedes add column if not exists mapa_url     text;

comment on column public.sedes.nombre_corto is
  'Cómo se nombra en las tarjetas del programa («CEART»). Vacío: el nombre completo.';
comment on column public.sedes.referencias is
  'Indicaciones públicas para llegar: «entrada por calle Tal», «junto al estacionamiento».';
comment on column public.sedes.mapa_url is
  'Enlace de Google Maps. Vacío: el sitio arma una búsqueda con el nombre y la dirección.';
comment on column public.sedes.capacidad is
  'Capacidad física de la sede, si no se divide en salas. INTERNA: no se publica. No es el cupo de boletos.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sedes_mapa_https') then
    alter table public.sedes add constraint sedes_mapa_https
      check (mapa_url is null or mapa_url = '' or mapa_url ~ '^https://[^\s]+$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sedes_largos') then
    alter table public.sedes add constraint sedes_largos
      check (char_length(coalesce(nombre_corto, '')) <= 40
         and char_length(coalesce(referencias, '')) <= 300
         and char_length(coalesce(mapa_url, ''))    <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sedes_capacidad_positiva') then
    alter table public.sedes add constraint sedes_capacidad_positiva
      check (capacidad is null or capacidad > 0);
  end if;
end $$;

-- El público lee solo lo publicable. La capacidad deja de verse sin cuenta.
revoke select on public.sedes from anon;
grant select (nombre, nombre_corto, orden, activa, direccion, referencias, mapa_url)
  on public.sedes to anon;


-- -----------------------------------------------------------------------------
--  2 · SEDES: lo interno
--
--  En tabla aparte porque la base no puede esconder columnas según el rol:
--  la administración y los coordinadores son el mismo rol de Postgres
--  («authenticated»). Una tabla entera sí se puede cerrar con sus reglas.
--
--  El contacto son datos personales de terceros: solo la administración.
-- -----------------------------------------------------------------------------
create table if not exists public.sedes_internas (
  sede              text primary key
                    references public.sedes(nombre) on update cascade on delete cascade,
  contacto_nombre   text,
  contacto_telefono text,
  contacto_correo   text,
  notas             text,
  actualizado       timestamptz not null default now(),
  constraint sedes_internas_largos check (
        char_length(coalesce(contacto_nombre, ''))   <= 120
    and char_length(coalesce(contacto_telefono, '')) <= 40
    and char_length(coalesce(contacto_correo, ''))   <= 160
    and char_length(coalesce(notas, ''))             <= 2000)
);

drop trigger if exists sedes_internas_actualizado on public.sedes_internas;
create trigger sedes_internas_actualizado
  before update on public.sedes_internas
  for each row execute function public.marcar_actualizado();

alter table public.sedes_internas enable row level security;

drop policy if exists sedes_internas_admin on public.sedes_internas;
create policy sedes_internas_admin on public.sedes_internas
  for all to authenticated
  using (public.es_administrador()) with check (public.es_administrador());

revoke all on public.sedes_internas from anon;
grant select, insert, update, delete on public.sedes_internas to authenticated;


-- -----------------------------------------------------------------------------
--  3 · SALAS
--
--  «capacidad» y «notas» son internas, pero los coordinadores las leen: les
--  sirve saber cuánta gente cabe o si hay proyector. El público, solo el
--  nombre.
-- -----------------------------------------------------------------------------
create table if not exists public.salas (
  id         uuid primary key default gen_random_uuid(),
  sede       text not null references public.sedes(nombre) on update cascade on delete cascade,
  nombre     text not null,
  capacidad  integer,
  notas      text,
  orden      smallint not null default 0,
  activa     boolean not null default true,
  creada_en  timestamptz not null default now(),
  constraint salas_nombre_valido  check (char_length(btrim(nombre)) between 2 and 80),
  constraint salas_capacidad      check (capacidad is null or capacidad > 0),
  constraint salas_notas_largas   check (char_length(coalesce(notas, '')) <= 1000)
);

-- «Aula Magna» y «aula magna» son la misma sala.
create unique index if not exists salas_nombre_unico
  on public.salas (sede, public.normalizar(nombre));

alter table public.salas enable row level security;

drop policy if exists salas_leer on public.salas;
create policy salas_leer on public.salas
  for select to anon, authenticated using (true);

drop policy if exists salas_escribir on public.salas;
create policy salas_escribir on public.salas
  for all to authenticated
  using (public.es_administrador()) with check (public.es_administrador());

revoke all on public.salas from anon;
grant select (id, sede, nombre, orden, activa) on public.salas to anon;
grant select, insert, update, delete on public.salas to authenticated;


-- -----------------------------------------------------------------------------
--  4 · LA SALA DE CADA ACTIVIDAD
--
--  Opcional. Una regla impide guardar una sala de otra sede. Si la actividad
--  cambia de sede y se queda con la sala vieja, la sala se borra sola: ya no
--  aplica, y rechazar el cambio de sede por eso sería confuso.
-- -----------------------------------------------------------------------------
alter table public.actividades add column if not exists sala_id uuid
  references public.salas(id) on delete set null;

grant select (sala_id) on public.actividades to anon;

create or replace function public.validar_sala()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sala_id is null then
    return new;
  end if;
  if exists (select 1 from public.salas where id = new.sala_id and sede = new.sede) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.sala_id is not distinct from old.sala_id then
    new.sala_id := null;
    return new;
  end if;
  raise exception 'Esa sala no pertenece a la sede elegida.';
end;
$$;

drop trigger if exists actividades_validar_sala on public.actividades;
create trigger actividades_validar_sala
  before insert or update of sede, sala_id on public.actividades
  for each row execute function public.validar_sala();


-- -----------------------------------------------------------------------------
--  5 · RENOMBRAR, BORRAR Y NO DUPLICAR
--
--  «actividades.sede» es texto, sin llave foránea: así lo publicado no se
--  tocó. Para que renombrar una sede no deje actividades apuntando al nombre
--  viejo, un disparador las arrastra en el mismo paso, venga el cambio del
--  panel o del editor SQL. Las salas y lo interno ya lo hacen por su llave
--  («on update cascade»).
--
--  Nombre del disparador: los de las llaves foráneas se llaman
--  «RI_ConstraintTrigger_…» y Postgres los dispara por orden alfabético; con
--  minúscula, este va después, cuando las salas ya cambiaron de sede. Si
--  fuera antes, validar_sala() vería salas de «otra» sede y las soltaría.
-- -----------------------------------------------------------------------------
create or replace function public.sede_tras_renombrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nombre is distinct from old.nombre then
    update public.actividades set sede = new.nombre where sede = old.nombre;
  end if;
  return null;
end;
$$;

revoke all on function public.sede_tras_renombrar() from public, anon, authenticated;

drop trigger if exists sedes_tras_renombrar on public.sedes;
create trigger sedes_tras_renombrar
  after update of nombre on public.sedes
  for each row execute function public.sede_tras_renombrar();


-- Ni «ceart» junto a «CEART», ni borrar una sede que todavía se usa.
create or replace function public.sede_cuidar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n   integer;
  v_otra text;
begin
  if tg_op = 'DELETE' then
    select count(*) into v_n from public.actividades where sede = old.nombre;
    if v_n > 0 then
      raise exception 'La sede «%» tiene % actividad(es). Fusiónala con otra en vez de borrarla.', old.nombre, v_n;
    end if;
    return old;
  end if;

  -- Un insert con el mismo nombre exacto lo resuelve «on conflict»: los
  -- catálogos (04, 14, sedes-nuevas) se pueden volver a correr.
  select s.nombre into v_otra
    from public.sedes s
   where public.normalizar(s.nombre) = public.normalizar(new.nombre)
     and s.nombre <> new.nombre
     and (tg_op = 'INSERT' or s.nombre <> old.nombre)
   limit 1;
  if v_otra is not null then
    raise exception 'Ya existe la sede «%». Usa esa, o fusiónalas.', v_otra;
  end if;
  return new;
end;
$$;

revoke all on function public.sede_cuidar() from public, anon, authenticated;

drop trigger if exists sedes_cuidar on public.sedes;
create trigger sedes_cuidar
  before insert or update of nombre or delete on public.sedes
  for each row execute function public.sede_cuidar();


-- -----------------------------------------------------------------------------
--  6 · FUSIONAR dos sedes
--
--  Para las duplicadas que se cuelan al darlas de alta desde el formulario.
--  Todo pasa al destino: actividades, salas (las del mismo nombre se juntan)
--  y los datos que al destino le falten. Después se borra el origen.
-- -----------------------------------------------------------------------------
create or replace function public.fusionar_sedes(p_origen text, p_destino text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_igual uuid;
  v_acts  integer;
  v_salas integer := 0;
begin
  if not public.es_administrador() then
    raise exception 'Solo la administración puede fusionar sedes.';
  end if;
  if p_origen is null or p_destino is null or p_origen = p_destino then
    raise exception 'Elige dos sedes distintas.';
  end if;
  if not exists (select 1 from public.sedes where nombre = p_origen)
     or not exists (select 1 from public.sedes where nombre = p_destino) then
    raise exception 'Alguna de las dos sedes ya no existe. Recarga la página.';
  end if;

  -- Se cuentan antes: unas pasan de sede junto con su sala, dentro del ciclo.
  select count(*) into v_acts from public.actividades where sede = p_origen;

  for r in select * from public.salas where sede = p_origen loop
    select id into v_igual from public.salas
     where sede = p_destino and public.normalizar(nombre) = public.normalizar(r.nombre);
    if v_igual is not null then
      update public.actividades set sede = p_destino, sala_id = v_igual where sala_id = r.id;
      update public.salas set capacidad = coalesce(capacidad, r.capacidad),
                              notas     = coalesce(nullif(notas, ''), r.notas)
       where id = v_igual;
      delete from public.salas where id = r.id;
    else
      update public.salas set sede = p_destino where id = r.id;
    end if;
    v_salas := v_salas + 1;
  end loop;

  update public.actividades set sede = p_destino where sede = p_origen;

  update public.sedes d
     set nombre_corto = coalesce(nullif(d.nombre_corto, ''), o.nombre_corto),
         direccion    = coalesce(nullif(d.direccion, ''),    o.direccion),
         referencias  = coalesce(nullif(d.referencias, ''),  o.referencias),
         mapa_url     = coalesce(nullif(d.mapa_url, ''),     o.mapa_url),
         capacidad    = coalesce(d.capacidad, o.capacidad)
    from public.sedes o
   where d.nombre = p_destino and o.nombre = p_origen;

  if not exists (select 1 from public.sedes_internas where sede = p_destino) then
    update public.sedes_internas set sede = p_destino where sede = p_origen;
  end if;

  delete from public.sedes where nombre = p_origen;

  return jsonb_build_object('actividades', v_acts, 'salas', v_salas);
end;
$$;

revoke all on function public.fusionar_sedes(text, text) from public, anon, authenticated;
grant execute on function public.fusionar_sedes(text, text) to authenticated;


-- -----------------------------------------------------------------------------
--  7 · VISTAS Y FUNCIONES QUE DICEN DÓNDE
--
--  vista_programa: las columnas de 14 tal cual, y cuatro nuevas AL FINAL
--  («create or replace» solo admite añadir al final).
-- -----------------------------------------------------------------------------
create or replace view public.vista_programa as
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
  a.publicada_en,
  a.acceso,
  a.lugares_max,
  case when a.acceso = 'boleto'
       then greatest(a.cupo - coalesce(f.emitidos, 0), 0)
  end              as disponibles,
  public.boletos_apertura(a.boletos_desde, a.publicada_en)        as boletos_desde,
  public.boletos_cierre(a.boletos_hasta, a.fecha, a.hora_inicio)  as boletos_hasta,
  case
    when a.acceso in ('libre', 'escolar') then null
    when now() < public.boletos_apertura(a.boletos_desde, a.publicada_en) then 'pronto'
    when now() >= public.boletos_cierre(a.boletos_hasta, a.fecha, a.hora_inicio) then 'cerrado'
    when a.acceso = 'registro' then 'abierto'
    when a.cupo - coalesce(f.emitidos, 0) <= 0 then 'agotado'
    when a.cupo - coalesce(f.emitidos, 0) <= greatest(3, ceil(a.cupo * 0.1)) then 'pocos'
    else 'abierto'
  end              as estado_boletos,
  -- ← 16
  sa.nombre        as sala,
  nullif(s.nombre_corto, '') as sede_corta,
  nullif(s.referencias, '')  as sede_referencias,
  nullif(s.mapa_url, '')     as sede_mapa
from public.actividades a
left join public.ejes   e  on e.nombre = a.eje
left join public.sedes  s  on s.nombre = a.sede
left join public.salas  sa on sa.id = a.sala_id
left join public.aforos f  on f.actividad_id = a.id
where a.publica
  and not a.archivada;

alter view public.vista_programa set (security_invoker = true);


-- vista_aforo: «capacidad_sala» ahora es la de la sala si la hay; si no, la
-- de la sede, como antes. Y el nombre de la sala, al final.
create or replace view public.vista_aforo as
select
  a.id, a.edicion_id, a.titulo, a.slug, a.eje, a.sede, a.fecha, a.hora_inicio,
  a.publica, a.archivada, a.acceso, a.cupo, a.lugares_max,
  coalesce(sa.capacidad, s.capacidad)           as capacidad_sala,   -- ← 16
  coalesce(f.emitidos, 0)                       as emitidos,
  coalesce(f.en_espera, 0)                      as en_espera,
  coalesce(f.asistieron, 0)                     as asistieron,
  case when a.acceso = 'boleto' and a.cupo > 0
       then round(100.0 * coalesce(f.emitidos, 0) / a.cupo)::int
  end                                           as ocupacion_pct,
  public.boletos_apertura(a.boletos_desde, a.publicada_en)       as boletos_desde,
  public.boletos_cierre(a.boletos_hasta, a.fecha, a.hora_inicio) as boletos_hasta,
  f.actualizado                                 as aforo_actualizado,
  sa.nombre                                     as sala              -- ← 16
from public.actividades a
left join public.sedes  s  on s.nombre = a.sede
left join public.salas  sa on sa.id = a.sala_id
left join public.aforos f  on f.actividad_id = a.id
where a.acceso in ('registro', 'boleto');

alter view public.vista_aforo set (security_invoker = true);


-- Lo que el boleto, la puerta y «Mis boletos» saben de la actividad.
create or replace function public.actividad_para_boleto(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',               a.id,
    'titulo',           a.titulo,
    'slug',             a.slug,
    'fecha',            a.fecha,
    'hora_inicio',      a.hora_inicio,
    'hora_fin',         a.hora_fin,
    'sede',             a.sede,
    'sede_direccion',   s.direccion,
    'sala',             sa.nombre,
    'sede_referencias', nullif(s.referencias, ''),
    'sede_mapa',        nullif(s.mapa_url, ''),
    'eje',              a.eje,
    'eje_color',        e.color,
    'poster',           a.poster,
    'acceso',           a.acceso
  )
  from public.actividades a
  left join public.sedes s  on s.nombre = a.sede
  left join public.salas sa on sa.id = a.sala_id
  left join public.ejes  e  on e.nombre = a.eje
  where a.id = p_id;
$$;

revoke all on function public.actividad_para_boleto(uuid) from public, anon, authenticated;


-- La puerta: el tope físico es el de la sala; si no hay sala, el de la sede;
-- si tampoco, el cupo. Fuera de esa línea, idéntica a 11-boletos.sql.
create or replace function public.lista_puerta(p_actividad uuid, p_clave text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.actividades%rowtype;
  f public.aforos%rowtype;
  v_capacidad integer;
begin
  if public.es_personal(p_actividad, p_clave) is null then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;

  select * into a from public.actividades where id = p_actividad;
  select * into f from public.aforos where actividad_id = p_actividad;
  select coalesce((select capacidad from public.salas where id = a.sala_id),   -- ← 16
                  (select capacidad from public.sedes where nombre = a.sede))
    into v_capacidad;

  return jsonb_build_object(
    'ok',        true,
    'generada',  now(),
    'actividad', public.actividad_para_boleto(p_actividad),
    'cupo',      a.cupo,
    -- El tope físico de la sala. Si la sede no lo tiene, el cupo.
    'capacidad', coalesce(v_capacidad, a.cupo),
    'capacidad_es_sala', v_capacidad is not null,
    'aforo',     jsonb_build_object('emitidos', f.emitidos, 'en_espera', f.en_espera,
                                    'asistieron', f.asistieron),
    'boletos',   coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',         b.id,
               'codigo',     b.codigo,
               'huella',     encode(sha256(convert_to(b.token, 'UTF8')), 'hex'),
               'nombre',     b.nombre,
               'lugares',    b.lugares,
               'estado',     b.estado,
               'origen',     b.origen,
               'creado',     b.creado,
               'asistio_en', b.asistio_en,
               'asistieron', b.asistieron)
             order by b.creado)
        from public.boletos b
       where b.actividad_id = p_actividad
         and b.estado <> 'cancelado'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.lista_puerta(uuid, text) from public, anon, authenticated;
grant execute on function public.lista_puerta(uuid, text) to anon, authenticated;


-- -----------------------------------------------------------------------------
--  8 · LAS SALAS QUE YA SE CONOCEN
--  Solo si la sede existe con ese nombre exacto. Capacidades vacías: las pone
--  la administración en el panel.
-- -----------------------------------------------------------------------------
insert into public.salas (sede, nombre, orden)
select v.sede, v.nombre, v.orden
  from (values
    ('Centro Estatal de las Artes de Ensenada (CEART)', 'Foro Experimental',   1),
    ('Centro Estatal de las Artes de Ensenada (CEART)', 'Aula Magna',          2),
    ('Centro Social, Cívico y Cultural Riviera',        'Salón Casino',        1),
    ('Centro Social, Cívico y Cultural Riviera',        'Salón Rojo',          2),
    ('Centro Social, Cívico y Cultural Riviera',        'Patio Bugambilias',   3),
    ('Centro Social, Cívico y Cultural Riviera',        'Jardines del Riviera', 4)
  ) as v(sede, nombre, orden)
 where exists (select 1 from public.sedes s where s.nombre = v.sede)
on conflict do nothing;


-- =============================================================================
--  COMPROBACIÓN
--    · Las cinco piezas en «sí».
--    · Después, las sedes con sus salas y lo que les falta, para completarlo
--      en /panel/sedes/.
-- =============================================================================
select 'Tabla de salas'            as que, case when to_regclass('public.salas') is not null then 'sí' else 'NO' end as listo
union all
select 'Lo interno de las sedes',        case when to_regclass('public.sedes_internas') is not null then 'sí' else 'NO' end
union all
select 'Sala en cada actividad',         case when exists (select 1 from information_schema.columns
                                              where table_name = 'actividades' and column_name = 'sala_id') then 'sí' else 'NO' end
union all
select 'Renombrar arrastra actividades', case when exists (select 1 from pg_trigger where tgname = 'sedes_tras_renombrar') then 'sí' else 'NO' end
union all
select 'Fusionar sedes',                 case when exists (select 1 from pg_proc where proname = 'fusionar_sedes') then 'sí' else 'NO' end;

select s.nombre as sede,
       (select count(*) from public.salas sa where sa.sede = s.nombre) as salas,
       (select count(*) from public.actividades a where a.sede = s.nombre) as actividades,
       case when coalesce(s.direccion, '') = '' then 'falta dirección' else '' end as pendiente
  from public.sedes s
 order by s.orden, s.nombre;
