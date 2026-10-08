-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 20 · ACTIVIDADES DE VARIOS DÍAS
--
--  Pedido del 8 de octubre de 2026: un coordinador no podía registrar un
--  taller del 12 al 15 de octubre. Dos cambios:
--
--    1. La fecha ya no tiene que caer dentro del festival. Eso lo exigían
--       solo los formularios (registro y panel); la base nunca lo pidió, así
--       que aquí no hay nada que soltar.
--    2. «fecha_fin», opcional. Vacía = la actividad es de un solo día (como
--       hasta hoy). Llena = es un rango, y el programa lo muestra así: «Del 12
--       al 15 de octubre». «fecha» sigue siendo el primer día: es por la que
--       se ordena, se agrupa en la cartelera y se cierran los boletos.
--
--  Lo que cambia por la fecha de término:
--    · vista_programa la trae, al final (create or replace solo añade al final).
--    · actividad_para_boleto (boleto, puerta, «Mis boletos») también.
--    · La clave de la puerta vence la mañana DESPUÉS DEL ÚLTIMO DÍA, no del
--      primero: si no, en un taller de cuatro días dejaría de servir el día 2.
--      Y si la fecha cambia después, las claves que tenían el vencimiento
--      automático se recorren con ella.
--
--  Se puede ejecutar más de una vez. Correr después de 19.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1 · LA COLUMNA
-- -----------------------------------------------------------------------------
alter table public.actividades add column if not exists fecha_fin date;

comment on column public.actividades.fecha_fin is
  'Último día, solo si la actividad dura varios días. Nula = un solo día (el de «fecha»).';

-- Un rango necesita su principio, y termina DESPUÉS de empezar: «del 12 al 12»
-- es un solo día y se guarda con fecha_fin vacía (los formularios lo hacen).
alter table public.actividades drop constraint if exists actividades_fecha_fin;
alter table public.actividades add constraint actividades_fecha_fin
  check (fecha_fin is null or (fecha is not null and fecha_fin > fecha));

-- El programa público la lee por vista_programa, que es security_invoker:
-- «anon» necesita permiso sobre la columna (un grant por columna se suma a
-- los de 09, 10, 11 y 16; no los reemplaza).
grant select (fecha_fin) on public.actividades to anon;


-- -----------------------------------------------------------------------------
--  2 · vista_programa · las columnas de 16 tal cual, y fecha_fin AL FINAL
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
  nullif(s.mapa_url, '')     as sede_mapa,
  -- ← 20
  a.fecha_fin
from public.actividades a
left join public.ejes   e  on e.nombre = a.eje
left join public.sedes  s  on s.nombre = a.sede
left join public.salas  sa on sa.id = a.sala_id
left join public.aforos f  on f.actividad_id = a.id
where a.publica
  and not a.archivada;

alter view public.vista_programa set (security_invoker = true);


-- -----------------------------------------------------------------------------
--  3 · Lo que el boleto, la puerta y «Mis boletos» saben de la actividad:
--      lo de 16, más fecha_fin.
-- -----------------------------------------------------------------------------
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
    'fecha_fin',        a.fecha_fin,
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


-- -----------------------------------------------------------------------------
--  4 · LA CLAVE DE LA PUERTA vence la mañana después del ÚLTIMO día
--
--  El disparador de 17 tal cual, salvo coalesce(a.fecha_fin, a.fecha).
-- -----------------------------------------------------------------------------
create or replace function public.vence_puerta(p_fecha date, p_fecha_fin date)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select public.inicio_actividad(coalesce(p_fecha_fin, p_fecha) + 1, time '06:00');
$$;

revoke all on function public.vence_puerta(date, date) from public, anon, authenticated;

create or replace function public.preparar_puerta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.token      := public.token_nuevo();
    new.codigo     := public.codigo_puerta_nuevo();
    new.creado_por := auth.uid();
    if new.vence is null then
      select public.vence_puerta(a.fecha, a.fecha_fin)
        into new.vence
        from public.actividades a
       where a.id = new.actividad_id;
    end if;
  else
    new.token        := old.token;
    new.actividad_id := old.actividad_id;
    new.creado_por   := old.creado_por;
    -- Las claves creadas antes de 17 reciben aquí su código.
    new.codigo       := coalesce(old.codigo, public.codigo_puerta_nuevo());
  end if;
  return new;
end;
$$;

revoke all on function public.preparar_puerta() from public, anon, authenticated;

-- Si la actividad cambia de fechas, las claves con el vencimiento AUTOMÁTICO
-- (el que calculó la base) se recorren con ella. Una clave con vencimiento
-- puesto a mano, o ya revocada (vence en el pasado), no se toca.
create or replace function public.recorrer_puertas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fecha is distinct from old.fecha or new.fecha_fin is distinct from old.fecha_fin then
    update public.puertas p
       set vence = public.vence_puerta(new.fecha, new.fecha_fin)
     where p.actividad_id = new.id
       and p.vence = public.vence_puerta(old.fecha, old.fecha_fin)
       and p.vence > now()
       and new.fecha is not null;
  end if;
  return null;
end;
$$;

revoke all on function public.recorrer_puertas() from public, anon, authenticated;

drop trigger if exists actividades_recorrer_puertas on public.actividades;
create trigger actividades_recorrer_puertas
  after update of fecha, fecha_fin on public.actividades
  for each row execute function public.recorrer_puertas();


-- -----------------------------------------------------------------------------
--  5 · VERIFICACIÓN
-- -----------------------------------------------------------------------------
select 1 as n, 'Columna fecha_fin' as revision,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'actividades'
                            and column_name = 'fecha_fin') then 'BIEN' else 'FALTA' end as resultado
union all
select 2, 'El programa público la trae',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'vista_programa'
                            and column_name = 'fecha_fin') then 'BIEN' else 'FALTA' end
union all
select 3, 'anon puede leerla (para la vista)',
       case when has_column_privilege('anon', 'public.actividades', 'fecha_fin', 'select')
            then 'BIEN' else 'FALTA' end
union all
select 4, 'Ninguna actividad con un rango al revés',
       case when not exists (select 1 from public.actividades where fecha_fin <= fecha)
            then 'BIEN' else 'REVISAR' end
union all
select 5, 'La puerta vence tras el último día',
       case when public.vence_puerta(date '2026-10-12', date '2026-10-15')
               = public.inicio_actividad(date '2026-10-16', time '06:00') then 'BIEN' else 'MAL' end
union all
select 6, 'Disparador que recorre las claves',
       case when exists (select 1 from pg_trigger where tgname = 'actividades_recorrer_puertas')
            then 'BIEN' else 'FALTA' end
order by n;
