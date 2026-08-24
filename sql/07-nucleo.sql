-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 07 · NÚCLEO
--
--  Ejecuta este archivo COMPLETO y de una sola vez sobre la base que ya existe.
--  Se puede volver a ejecutar sin romper nada.
--
--  Qué cambia:
--    1. Nace «ediciones». El festival es anual y todo cuelga del año.
--       Absorbe la tabla «ajustes»: ese calendario es de cada edición, no del
--       sistema.
--    2. «actividades» gana edicion_id, slug, resumen y publica.
--    3. «actividad» pasa a «titulo», «hora» a «hora_inicio», y «dia» —que era
--       texto de un catálogo— pasa a «fecha», que es una fecha de verdad.
--       Sin eso no se puede ordenar el programa.
--    4. Se eliminan la columna «estado» y las tablas «dias» y «ajustes».
--    5. El semáforo lee de la edición activa.
--
--  Después de aplicarlo, correr sql/00-verificar.sql.
-- =============================================================================


-- =============================================================================
--  0 · SE LEVANTAN LOS CANDADOS DE «actividades»
--
--  Dos razones, y ninguna es la obvia:
--
--  · «actividades_proteger_estado» exige ser administrador para tocar ciertos
--    campos, y el editor SQL de Supabase no actúa como ningún usuario.
--
--  · «actividades_actualizado» pondría «actualizado = now()» en TODAS las filas
--    al llenar la fecha. El semáforo lee ese dato: la migración falsearía el
--    historial de cada actividad justo antes de calcular el color.
--
--  «disable trigger user» levanta los disparadores propios y deja intactos los
--  internos de las llaves foráneas. Si algo fallara a media ejecución,
--  PostgreSQL revierte el archivo completo —estos ALTER incluidos— y los
--  candados quedan puestos.
--
--  «perfiles» no se toca en toda esta migración.
-- =============================================================================
alter table public.actividades disable trigger user;


-- =============================================================================
--  0 bis · SE BORRA LA VISTA ANTES QUE NADA
--
--  No es por orden estético: sin esto la migración se detiene a la mitad.
--  «vista_actividades» nombra a.dia, a.estado y ajuste_int(), y PostgreSQL
--  registra esas dependencias. Con la vista viva:
--
--    · alter table … drop column dia     → «other objects depend on it»
--    · alter table … drop column estado  → lo mismo
--    · drop function ajuste_int          → lo mismo
--
--  Los renombres sí pasarían —una vista sigue a la columna que cambia de
--  nombre— pero las tres eliminaciones no. Se borra aquí y se reconstruye
--  completa en la sección 12.
-- =============================================================================
drop view if exists public.vista_actividades;


-- =============================================================================
--  1 · EDICIONES
--
--  Una fila por año del festival. Guarda las dos ventanas de tiempo que antes
--  vivían sueltas en «ajustes»:
--    · fecha_inicio / fecha_fin  →  cuándo ocurre el festival
--    · cal_inicio / cal_lista    →  la rampa de organización de la que sale el
--                                   «avance esperado» de hoy
--  y los umbrales de silencio del semáforo, que también cambian de un año a
--  otro.
-- =============================================================================
create table if not exists public.ediciones (
  id            uuid primary key default gen_random_uuid(),
  anio          smallint not null,
  nombre        text not null default '',
  fecha_inicio  date not null,
  fecha_fin     date not null,
  cal_inicio    date not null,
  cal_lista     date not null,
  dias_ambar    smallint not null default 14,
  dias_rojo     smallint not null default 25,
  activa        boolean not null default false,
  creado        timestamptz not null default now(),
  constraint ediciones_anio_unico  unique (anio),
  constraint ediciones_fechas      check (fecha_fin >= fecha_inicio),
  constraint ediciones_calendario  check (cal_lista > cal_inicio)
);

comment on table public.ediciones is
  'Una fila por año del festival. Sustituye a la tabla «ajustes».';
comment on column public.ediciones.cal_lista is
  'Fecha en que toda actividad debería estar al 100%. De aquí sale avance_esperado().';

-- Solo puede haber una edición activa. Un índice parcial lo garantiza mejor
-- que un disparador: es la base la que no deja pasar la segunda.
create unique index if not exists ediciones_una_activa
  on public.ediciones (activa) where activa;


-- -----------------------------------------------------------------------------
--  La edición de 2026, sembrada con lo que hoy vive en «ajustes».
--
--  Se leen los valores reales en vez de escribirlos a mano: si alguien movió
--  una fecha desde el tablero, la edición hereda ESA fecha y no la que suponía
--  01-esquema.sql. Los literales son solo el respaldo para cuando «ajustes» ya
--  no exista, es decir, al volver a ejecutar este archivo.
-- -----------------------------------------------------------------------------
do $mig$
declare
  v_ini  date     := '2026-10-17';
  v_fin  date     := '2026-10-24';
  v_cini date     := '2026-08-13';
  v_clis date     := '2026-09-17';
  v_amb  smallint := 14;
  v_roj  smallint := 25;
  a_ini date; a_fin date; a_cini date; a_clis date; a_amb int; a_roj int;
begin
  if to_regclass('public.ajustes') is not null then
    execute $q$
      select
        (select nullif(valor,'')::date from public.ajustes where clave = 'fest_inicio'),
        (select nullif(valor,'')::date from public.ajustes where clave = 'fest_fin'),
        (select nullif(valor,'')::date from public.ajustes where clave = 'cal_inicio'),
        (select nullif(valor,'')::date from public.ajustes where clave = 'cal_lista'),
        (select nullif(valor,'')::int  from public.ajustes where clave = 'dias_ambar'),
        (select nullif(valor,'')::int  from public.ajustes where clave = 'dias_rojo')
    $q$ into a_ini, a_fin, a_cini, a_clis, a_amb, a_roj;

    v_ini  := coalesce(a_ini,  v_ini);
    v_fin  := coalesce(a_fin,  v_fin);
    v_cini := coalesce(a_cini, v_cini);
    v_clis := coalesce(a_clis, v_clis);
    v_amb  := coalesce(a_amb,  v_amb);
    v_roj  := coalesce(a_roj,  v_roj);
  end if;

  insert into public.ediciones
    (anio, nombre, fecha_inicio, fecha_fin, cal_inicio, cal_lista,
     dias_ambar, dias_rojo, activa)
  values
    (2026, 'Festival del Conocimiento 2026', v_ini, v_fin, v_cini, v_clis,
     v_amb, v_roj, true)
  on conflict (anio) do nothing;
end $mig$;


-- -----------------------------------------------------------------------------
--  Cuál es la edición activa. Va como función para poder usarla de DEFAULT:
--  así quien inserta una actividad no tiene que saber en qué año estamos.
--
--  SECURITY DEFINER por la misma razón que es_administrador(): que la respuesta
--  no dependa de las reglas por fila de quien pregunta.
-- -----------------------------------------------------------------------------
create or replace function public.edicion_activa()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.ediciones where activa limit 1;
$$;


-- =============================================================================
--  2 · REGLAS DE ACCESO DE «ediciones»
--
--  Lectura para cualquiera, incluso sin cuenta: el formulario de registro
--  necesita las fechas del festival para acotar el campo de fecha antes de que
--  la persona tenga sesión. Escritura, solo la administración.
-- =============================================================================
alter table public.ediciones enable row level security;

drop policy if exists ediciones_leer on public.ediciones;
create policy ediciones_leer on public.ediciones
  for select to anon, authenticated
  using (true);

drop policy if exists ediciones_escribir on public.ediciones;
create policy ediciones_escribir on public.ediciones
  for all to authenticated
  using ( public.es_administrador() )
  with check ( public.es_administrador() );

grant select on public.ediciones to anon, authenticated;
grant select, insert, update, delete on public.ediciones to authenticated;


-- =============================================================================
--  3 · COLUMNAS NUEVAS EN «actividades»
-- =============================================================================
alter table public.actividades add column if not exists edicion_id uuid;
alter table public.actividades add column if not exists slug       text not null default '';
alter table public.actividades add column if not exists resumen    text not null default '';
alter table public.actividades add column if not exists publica    boolean not null default false;
alter table public.actividades add column if not exists fecha      date;

comment on column public.actividades.resumen is
  'Una o dos frases para el programa público y las publicaciones. La descripción es el texto largo.';
comment on column public.actividades.publica is
  'Si entra al programa público. Lo enciende la administración: sustituye al retirado «estado».';
comment on column public.actividades.fecha is
  'Día en que ocurre, dentro de la ventana de la edición. Nula mientras esté por definir.';


-- =============================================================================
--  4 · RENOMBRES
--
--  «actividad» dentro de la tabla «actividades» obligaba a leer dos veces cada
--  consulta. «hora» se alinea con «hora_fin».
--  Condicionales para que volver a ejecutar el archivo no falle.
-- =============================================================================
do $mig$
begin
  if  exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'actividades'
                 and column_name = 'actividad')
  and not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'actividades'
                     and column_name = 'titulo') then
    alter table public.actividades rename column actividad to titulo;
  end if;

  if  exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'actividades'
                 and column_name = 'hora')
  and not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'actividades'
                     and column_name = 'hora_inicio') then
    alter table public.actividades rename column hora to hora_inicio;
  end if;
end $mig$;


-- =============================================================================
--  5 · CADA ACTIVIDAD A SU EDICIÓN
--
--  Lo que ya existe es de 2026: no hay ediciones anteriores en la base.
-- =============================================================================
update public.actividades
   set edicion_id = public.edicion_activa()
 where edicion_id is null;

alter table public.actividades alter column edicion_id set not null;
alter table public.actividades alter column edicion_id set default public.edicion_activa();

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'actividades_edicion_fk') then
    alter table public.actividades
      add constraint actividades_edicion_fk
      foreign key (edicion_id) references public.ediciones(id) on delete restrict;
  end if;
end $mig$;

create index if not exists actividades_edicion on public.actividades (edicion_id);


-- =============================================================================
--  6 · DE «dia» (texto) A «fecha» (date)
--
--  El catálogo de días tenía «orden» 1 a 8 para el sábado 17 al sábado 24, más
--  90 «Varios días» y 99 «Por definir». Se traduce por ese orden en vez de
--  interpretar el texto: «Sáb 17 oct» depende del idioma y de las
--  abreviaturas, el número no. Los dos últimos no son un día, así que quedan
--  en nulo, que es exactamente lo que significan.
-- =============================================================================
do $mig$
begin
  if to_regclass('public.dias') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'actividades'
                    and column_name = 'dia') then
    execute $q$
      update public.actividades a
         set fecha = e.fecha_inicio + (d.orden - 1)
        from public.dias d, public.ediciones e
       where e.id = a.edicion_id
         and d.etiqueta = a.dia
         and d.orden between 1 and (e.fecha_fin - e.fecha_inicio + 1)
         and a.fecha is null
    $q$;
  end if;
end $mig$;

alter table public.actividades drop column if exists dia;


-- =============================================================================
--  7 · SE ELIMINA «estado»
--
--  Quedó sin uso al retirar la aprobación en 06: el registro es por invitación
--  y nadie revalida lo que inscribe un coordinador. Quien marca qué entra al
--  programa público es ahora «publica». El índice que la usaba se va con ella.
-- =============================================================================
alter table public.actividades drop column if exists estado;


-- =============================================================================
--  8 · SLUG
--
--  La dirección pública de la actividad en la fase D: /programa/<slug>/.
--
--  Se genera solo, a partir del título, y una vez generado NO se vuelve a
--  tocar aunque cambie el título: si se regenerara, cada corrección de
--  redacción rompería una dirección ya compartida.
--
--  Único dentro de la edición, no en toda la base: un taller que se repita el
--  año que viene merece el mismo nombre.
-- =============================================================================
create or replace function public.slugificar(p_texto text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      translate(lower(coalesce(p_texto, '')),
                'áàäâãéèëêíìïîóòöôõúùüûñç',
                'aaaaaeeeeiiiiooooouuuunc'),
      '[^a-z0-9]+', '-', 'g'));
$$;


create or replace function public.asignar_slug()
returns trigger
language plpgsql
as $$
declare
  base   text;
  quedo  text;
  n      int := 1;
begin
  if coalesce(new.slug, '') = '' then
    base := public.slugificar(new.titulo);
  else
    -- Si alguien lo escribe a mano, se normaliza igual.
    base := public.slugificar(new.slug);
  end if;

  if base = '' then base := 'actividad'; end if;

  quedo := base;
  while exists (select 1 from public.actividades
                 where slug = quedo
                   and edicion_id = new.edicion_id
                   and id <> new.id) loop
    n := n + 1;
    quedo := base || '-' || n;
  end loop;

  new.slug := quedo;
  return new;
end;
$$;

drop trigger if exists actividades_slug on public.actividades;
create trigger actividades_slug
  before insert or update on public.actividades
  for each row execute function public.asignar_slug();


-- Rellenar los que ya existen. Poner la columna en nulo basta: el disparador
-- que acabamos de crear la llena antes de que PostgreSQL revise el NOT NULL.
update public.actividades set slug = null where coalesce(slug, '') = '';

create unique index if not exists actividades_slug_unico
  on public.actividades (edicion_id, slug);


-- =============================================================================
--  9 · «publica» LA ENCIENDE LA ADMINISTRACIÓN
--
--  El mismo disparador que ya impedía archivar una actividad ajena o
--  regalársela a otra cuenta. Conserva su nombre —«proteger_estado»— aunque la
--  columna «estado» ya no exista: renombrarlo obligaría a tocar 03 y 06 sin
--  ganar nada.
-- =============================================================================
create or replace function public.proteger_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_administrador() then
    if new.archivada is distinct from old.archivada then
      raise exception 'Solo la administración puede archivar una actividad.';
    end if;
    if new.publica is distinct from old.publica then
      raise exception 'Solo la administración decide qué entra al programa público.';
    end if;
    new.responsable_id := old.responsable_id;
  end if;
  return new;
end;
$$;


-- =============================================================================
--  10 · EL SEMÁFORO LEE DE LA EDICIÓN ACTIVA
--
--  Misma rampa lineal de siempre, otra fuente. «ajuste_int» se retira: los dos
--  umbrales que resolvía ahora son columnas de la edición.
-- =============================================================================
create or replace function public.avance_esperado()
returns int
language sql
stable
as $$
  select coalesce((
    select case
      when e.cal_lista <= e.cal_inicio then 0
      else greatest(0, least(100,
        round( (public.hoy_ensenada() - e.cal_inicio)::numeric
             / (e.cal_lista - e.cal_inicio)::numeric * 100 )::int
      ))
    end
    from public.ediciones e
   where e.activa
   limit 1
  ), 0);
$$;

drop function if exists public.ajuste_int(text, int);


-- =============================================================================
--  11 · SE VAN «dias» Y «ajustes»
--
--  Sus políticas y sus permisos se van con ellas.
-- =============================================================================
drop table if exists public.dias;
drop table if exists public.ajustes;


-- =============================================================================
--  12 · LA VISTA
--
--  Hubo que borrarla y volver a crearla, no reemplazarla: «create or replace
--  view» no admite insertar columnas en medio, y aquí cambian de nombre, de
--  tipo y de posición. El borrado ya ocurrió arriba, en 0 bis, porque además
--  bloqueaba las eliminaciones de columnas.
-- =============================================================================
create view public.vista_actividades as
with
umbrales as (
  -- Un select sin FROM siempre devuelve una fila: aunque no hubiera edición
  -- activa, la vista sigue entregando actividades en vez de quedarse vacía.
  select
    public.avance_esperado() as esperado,
    coalesce((select dias_ambar from public.ediciones where activa limit 1), 14) as dias_ambar,
    coalesce((select dias_rojo  from public.ediciones where activa limit 1), 25) as dias_rojo
),
base as (
  select
    a.id, a.edicion_id, a.responsable_id,
    a.titulo, a.slug, a.resumen,
    a.eje, a.tipo, a.sede,
    a.fecha, a.hora_inicio, a.hora_fin,
    a.descripcion, a.requerimientos,
    a.publica, a.archivada, a.creado, a.actualizado,

    ed.anio   as anio,
    ed.nombre as edicion,

    p.nombre   as responsable,
    p.correo   as correo,
    p.telefono as telefono,

    coalesce(r.avance, 0)        as avance,
    coalesce(r.avances, '')      as avances,
    coalesce(r.necesidades, '')  as necesidades,
    coalesce(r.problematica, '') as problematica,
    coalesce(r.siguiente, '')    as siguiente,
    coalesce(r.alerta, '')       as alerta,
    r.creado                     as ultimo_reporte,
    coalesce(n.total, 0)         as envios,

    -- Días de silencio: desde el último reporte; si nunca ha reportado, desde
    -- que se dio de alta la actividad.
    greatest(0, public.hoy_ensenada()
      - coalesce((r.creado at time zone 'America/Tijuana')::date,
                 (a.creado at time zone 'America/Tijuana')::date)) as dias_sin,

    s.contactado,
    s.fecha     as seg_fecha,
    s.medio     as seg_medio,
    s.respuesta as seg_respuesta,
    s.proximo   as seg_proximo,
    s.notas     as seg_notas
  from public.actividades a
  join public.perfiles p on p.id = a.responsable_id
  left join public.ediciones ed on ed.id = a.edicion_id
  left join lateral (
    select * from public.reportes
     where actividad_id = a.id order by creado desc limit 1
  ) r on true
  left join lateral (
    select count(*)::int as total from public.reportes where actividad_id = a.id
  ) n on true
  left join public.seguimiento s on s.actividad_id = a.id
),
calculado as (
  select b.*, u.esperado, b.avance - u.esperado as brecha,
         u.dias_ambar, u.dias_rojo
    from base b cross join umbrales u
)
select
  c.*,

  -- ---------------------------------------------------------------------------
  --  El color. Cascada: la PRIMERA condición que se cumple decide.
  --  Lo declarado por el coordinador solo puede empeorar el color, nunca
  --  mejorarlo, porque se evalúa después del 100%.
  -- ---------------------------------------------------------------------------
  case
    when c.avance >= 100                          then 'verde'
    when c.alerta ilike '%puede no salir%'        then 'rojo'
    when c.dias_sin > c.dias_rojo                 then 'rojo'
    when c.brecha <= -30                          then 'rojo'
    when c.problematica <> '' and c.brecha <= -15 then 'rojo'
    when c.esperado >= 90 and c.avance < 70       then 'rojo'
    when c.alerta ilike '%apoyo%'                 then 'ambar'
    when c.dias_sin > c.dias_ambar                then 'ambar'
    when c.esperado >= 20 and c.brecha <= -10     then 'ambar'
    when c.problematica <> ''                     then 'ambar'
    else 'verde'
  end as color,

  case
    when c.avance >= 100                          then 'Lista'
    when c.alerta ilike '%puede no salir%'        then 'En riesgo'
    when c.dias_sin > c.dias_rojo                 then 'En riesgo'
    when c.brecha <= -30                          then 'En riesgo'
    when c.problematica <> '' and c.brecha <= -15 then 'En riesgo'
    when c.esperado >= 90 and c.avance < 70       then 'En riesgo'
    when c.alerta ilike '%apoyo%'                 then 'Requiere atención'
    when c.dias_sin > c.dias_ambar                then 'Requiere atención'
    when c.esperado >= 20 and c.brecha <= -10     then 'Requiere atención'
    when c.problematica <> ''                     then 'Requiere atención'
    else 'En tiempo'
  end as etiqueta,

  case
    when c.avance >= 100 then 'Actividad terminada al 100%.'
    when c.alerta ilike '%puede no salir%'
      then 'El coordinador la marcó en riesgo de no realizarse.'
    when c.dias_sin > c.dias_rojo
      then 'Lleva ' || c.dias_sin || ' días sin reportar. No sabemos cómo va.'
    when c.brecha <= -30
      then 'Va en ' || c.avance || '% y a estas alturas debería ir en ' || c.esperado || '%.'
    when c.problematica <> '' and c.brecha <= -15
      then 'Tiene una problemática sin resolver y va atrasada.'
    when c.esperado >= 90 and c.avance < 70
      then 'Falta muy poco para el festival y sigue en ' || c.avance || '%.'
    when c.alerta ilike '%apoyo%'
      then 'El coordinador pidió apoyo para sacarla adelante.'
    when c.dias_sin > c.dias_ambar
      then 'Lleva ' || c.dias_sin || ' días sin actualizar su reporte.'
    when c.esperado >= 20 and c.brecha <= -10
      then 'Va en ' || c.avance || '% y lo esperado hoy es ' || c.esperado || '%.'
    when c.problematica <> '' then 'Reportó una problemática que sigue abierta.'
    else 'Al corriente: ' || c.avance || '% contra ' || c.esperado || '% esperado.'
  end as motivo,

  -- Para ordenar por urgencia sin repetir el CASE en el cliente
  case
    when c.avance >= 100 then 3
    when c.alerta ilike '%puede no salir%'
      or c.dias_sin > c.dias_rojo
      or c.brecha <= -30
      or (c.problematica <> '' and c.brecha <= -15)
      or (c.esperado >= 90 and c.avance < 70)     then 0
    when c.alerta ilike '%apoyo%'
      or c.dias_sin > c.dias_ambar
      or (c.esperado >= 20 and c.brecha <= -10)
      or c.problematica <> ''                     then 1
    else 2
  end as urgencia
from calculado c;

comment on view public.vista_actividades is
  'Actividades con último reporte, seguimiento y semáforo calculado. Ordena por urgencia asc.';

-- Sin esto la vista ignoraría las reglas por fila y entregaría TODAS las
-- actividades a cualquiera que la consultara.
alter view public.vista_actividades set (security_invoker = true);

grant select on public.vista_actividades to authenticated;


-- =============================================================================
--  13 · SE VUELVEN A PONER LOS CANDADOS
-- =============================================================================
alter table public.actividades enable trigger user;


-- =============================================================================
--  COMPROBACIÓN
--  Todos los renglones deberían decir BIEN. Los informativos no son errores.
-- =============================================================================
with
edicion as (
  select count(*)::int as n,
         coalesce(max(anio)::text, '—') as anio,
         coalesce(max(fecha_inicio)::text, '?') || ' a ' ||
         coalesce(max(fecha_fin)::text, '?') as ventana
    from public.ediciones where activa
),
nuevas as (
  select count(*)::int as n from information_schema.columns
   where table_schema = 'public' and table_name = 'actividades'
     and column_name in ('edicion_id','slug','resumen','publica','fecha',
                         'titulo','hora_inicio')
),
viejas as (
  select count(*)::int as n from information_schema.columns
   where table_schema = 'public' and table_name = 'actividades'
     and column_name in ('actividad','dia','estado','hora')
),
tablas_idas as (
  select count(*)::int as n from information_schema.tables
   where table_schema = 'public' and table_name in ('dias','ajustes')
),
slugs as (
  select count(*)::int as total,
         count(distinct (edicion_id::text || '/' || slug))::int as unicos,
         count(*) filter (where coalesce(slug,'') = '')::int as vacios
    from public.actividades
),
fechas as (
  select count(*) filter (where fecha is not null)::int as con,
         count(*)::int as total
    from public.actividades
),
vista as (
  select coalesce(
    (select 1 from pg_class c
      where c.relname = 'vista_actividades'
        and c.reloptions::text ilike '%security_invoker=true%'), 0)::int as n
),
funcion_ida as (
  select count(*)::int as n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'ajuste_int'
)
select * from (
  select 1 as orden, 'Edición activa' as revisión,
         edicion.anio || ' · ' || edicion.ventana as valor,
         case when edicion.n = 1 then 'BIEN'
              else 'REVISAR · debe haber exactamente una edición activa' end as resultado
    from edicion
  union all
  select 2, 'Columnas nuevas', nuevas.n || ' de 7',
         case when nuevas.n = 7 then 'BIEN' else 'REVISAR · falta alguna' end from nuevas
  union all
  select 3, 'Columnas retiradas', viejas.n || ' de 4 siguen ahí',
         case when viejas.n = 0 then 'BIEN' else 'REVISAR · quedó alguna vieja' end from viejas
  union all
  select 4, 'Tablas retiradas', tablas_idas.n || ' de 2 siguen ahí',
         case when tablas_idas.n = 0 then 'BIEN'
              else 'REVISAR · «dias» o «ajustes» siguen existiendo' end from tablas_idas
  union all
  select 5, 'Slugs', slugs.total || ' actividades, ' || slugs.unicos || ' slugs distintos',
         case when slugs.vacios = 0 and slugs.unicos = slugs.total then 'BIEN'
              else 'REVISAR · hay slugs vacíos o repetidos' end from slugs
  union all
  select 6, 'Fechas traducidas', fechas.con || ' de ' || fechas.total || ' con fecha',
         'informativo · las de «Varios días» y «Por definir» quedan sin fecha'
    from fechas
  union all
  select 7, 'Vista respeta las reglas por fila',
         case when vista.n = 1 then 'security_invoker activo' else 'SIN security_invoker' end,
         case when vista.n = 1 then 'BIEN'
              else 'REVISAR · la vista entregaría TODAS las actividades a cualquiera' end
    from vista
  union all
  select 8, 'ajuste_int() retirada', funcion_ida.n || ' definición(es)',
         case when funcion_ida.n = 0 then 'BIEN'
              else 'REVISAR · sigue apuntando a la tabla «ajustes», que ya no existe' end
    from funcion_ida
  union all
  select 9, 'Avance esperado hoy', public.avance_esperado() || '%',
         'informativo · sube solo con el calendario de la edición'
) t order by orden;
