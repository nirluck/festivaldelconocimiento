-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 02 · SEMÁFORO
--
--  Traducción fiel de includes/semaforo.php del plugin de WordPress.
--  Mismos umbrales, mismo orden de evaluación, mismos mensajes.
--
--  La diferencia: allá la lógica estaba escrita DOS veces (PHP para el cálculo
--  real y JavaScript para la vista previa), con el riesgo de desincronizarse
--  que el propio código advertía. Aquí se escribe una sola vez y todos
--  —tablero, formulario, exportación— leen de la misma vista.
-- =============================================================================

-- Zona horaria del festival. Ensenada sí observa horario de verano.
create or replace function public.hoy_ensenada()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Tijuana')::date;
$$;


-- -----------------------------------------------------------------------------
--  Cuánto avance debería llevar hoy CUALQUIER actividad.
--  Rampa lineal del arranque de la organización a la fecha en que todo debe
--  estar confirmado.
-- -----------------------------------------------------------------------------
create or replace function public.avance_esperado()
returns int
language sql
stable
as $$
  with c as (
    select
      (select valor::date from public.ajustes where clave = 'cal_inicio') as ini,
      (select valor::date from public.ajustes where clave = 'cal_lista')  as fin
  )
  select case
    when c.ini is null or c.fin is null or c.fin <= c.ini then 0
    else greatest(0, least(100,
      round( (public.hoy_ensenada() - c.ini)::numeric / (c.fin - c.ini)::numeric * 100 )::int
    ))
  end
  from c;
$$;


-- -----------------------------------------------------------------------------
--  Umbral configurable, con respaldo por si falta el ajuste.
-- -----------------------------------------------------------------------------
create or replace function public.ajuste_int(p_clave text, p_defecto int)
returns int
language sql
stable
as $$
  select coalesce(
    (select nullif(valor, '')::int from public.ajustes where clave = p_clave),
    p_defecto
  );
$$;


-- =============================================================================
--  VISTA MAESTRA
--  Cada actividad con su último reporte, su seguimiento y su semáforo ya
--  calculado. Es lo único que necesitan leer el tablero y la exportación.
-- =============================================================================
create or replace view public.vista_actividades as
with
umbrales as (
  select
    public.avance_esperado()             as esperado,
    public.ajuste_int('dias_ambar', 14)  as dias_ambar,
    public.ajuste_int('dias_rojo',  25)  as dias_rojo
),
base as (
  select
    a.id,
    a.responsable_id,
    a.actividad,
    a.eje,
    a.tipo,
    a.sede,
    a.dia,
    a.descripcion,
    a.estado,
    a.archivada,
    a.creado,
    a.actualizado,

    p.nombre    as responsable,
    p.correo    as correo,
    p.telefono  as telefono,

    coalesce(r.avance, 0)                      as avance,
    coalesce(r.avances, '')                    as avances,
    coalesce(r.necesidades, '')                as necesidades,
    coalesce(r.problematica, '')               as problematica,
    coalesce(r.siguiente, '')                  as siguiente,
    coalesce(r.alerta, '')                     as alerta,
    r.creado                                   as ultimo_reporte,
    coalesce(n.total, 0)                       as envios,

    -- Días de silencio: desde el último reporte; si nunca ha reportado,
    -- desde que se dio de alta la actividad.
    greatest(0, public.hoy_ensenada()
      - coalesce((r.creado at time zone 'America/Tijuana')::date,
                 (a.creado at time zone 'America/Tijuana')::date)) as dias_sin,

    s.contactado,
    s.fecha        as seg_fecha,
    s.medio        as seg_medio,
    s.respuesta    as seg_respuesta,
    s.proximo      as seg_proximo,
    s.notas        as seg_notas
  from public.actividades a
  join public.perfiles p on p.id = a.responsable_id
  left join lateral (
    select * from public.reportes
     where actividad_id = a.id
     order by creado desc
     limit 1
  ) r on true
  left join lateral (
    select count(*)::int as total from public.reportes where actividad_id = a.id
  ) n on true
  left join public.seguimiento s on s.actividad_id = a.id
),
calculado as (
  select
    b.*,
    u.esperado,
    b.avance - u.esperado as brecha,
    u.dias_ambar,
    u.dias_rojo
  from base b cross join umbrales u
)
select
  c.*,

  -- ---------------------------------------------------------------------------
  --  El color. Cascada: la PRIMERA condición que se cumple decide.
  --  Lo declarado por el responsable solo puede empeorar el color, nunca
  --  mejorarlo, porque se evalúa después del 100%.
  -- ---------------------------------------------------------------------------
  case
    when c.avance >= 100                                    then 'verde'
    -- rojo
    when c.alerta ilike '%puede no salir%'                  then 'rojo'
    when c.dias_sin > c.dias_rojo                           then 'rojo'
    when c.brecha <= -30                                    then 'rojo'
    when c.problematica <> '' and c.brecha <= -15           then 'rojo'
    when c.esperado >= 90 and c.avance < 70                 then 'rojo'
    -- ámbar
    when c.alerta ilike '%apoyo%'                           then 'ambar'
    when c.dias_sin > c.dias_ambar                          then 'ambar'
    -- Gracia de arranque: no se castiga el atraso mientras lo esperado
    -- no haya pasado del 20%.
    when c.esperado >= 20 and c.brecha <= -10               then 'ambar'
    when c.problematica <> ''                               then 'ambar'
    else 'verde'
  end as color,

  case
    when c.avance >= 100                                    then 'Lista'
    when c.alerta ilike '%puede no salir%'                  then 'En riesgo'
    when c.dias_sin > c.dias_rojo                           then 'En riesgo'
    when c.brecha <= -30                                    then 'En riesgo'
    when c.problematica <> '' and c.brecha <= -15           then 'En riesgo'
    when c.esperado >= 90 and c.avance < 70                 then 'En riesgo'
    when c.alerta ilike '%apoyo%'                           then 'Requiere atención'
    when c.dias_sin > c.dias_ambar                          then 'Requiere atención'
    when c.esperado >= 20 and c.brecha <= -10               then 'Requiere atención'
    when c.problematica <> ''                               then 'Requiere atención'
    else 'En tiempo'
  end as etiqueta,

  case
    when c.avance >= 100
      then 'Actividad terminada al 100%.'
    when c.alerta ilike '%puede no salir%'
      then 'El responsable la marcó en riesgo de no realizarse.'
    when c.dias_sin > c.dias_rojo
      then 'Lleva ' || c.dias_sin || ' días sin reportar. No sabemos cómo va.'
    when c.brecha <= -30
      then 'Va en ' || c.avance || '% y a estas alturas debería ir en ' || c.esperado || '%.'
    when c.problematica <> '' and c.brecha <= -15
      then 'Tiene una problemática sin resolver y va atrasada.'
    when c.esperado >= 90 and c.avance < 70
      then 'Falta muy poco para el festival y sigue en ' || c.avance || '%.'
    when c.alerta ilike '%apoyo%'
      then 'El responsable pidió apoyo para sacarla adelante.'
    when c.dias_sin > c.dias_ambar
      then 'Lleva ' || c.dias_sin || ' días sin actualizar su reporte.'
    when c.esperado >= 20 and c.brecha <= -10
      then 'Va en ' || c.avance || '% y lo esperado hoy es ' || c.esperado || '%.'
    when c.problematica <> ''
      then 'Reportó una problemática que sigue abierta.'
    else 'Al corriente: ' || c.avance || '% contra ' || c.esperado || '% esperado.'
  end as motivo,

  -- Para ordenar por urgencia sin repetir el CASE en el cliente
  case
    when c.avance >= 100 then 3
    when c.alerta ilike '%puede no salir%'
      or c.dias_sin > c.dias_rojo
      or c.brecha <= -30
      or (c.problematica <> '' and c.brecha <= -15)
      or (c.esperado >= 90 and c.avance < 70)                then 0
    when c.alerta ilike '%apoyo%'
      or c.dias_sin > c.dias_ambar
      or (c.esperado >= 20 and c.brecha <= -10)
      or c.problematica <> ''                                then 1
    else 2
  end as urgencia
from calculado c;

comment on view public.vista_actividades is
  'Actividades con último reporte, seguimiento y semáforo calculado. Ordena por urgencia asc.';


-- =============================================================================
--  IMPORTANTE · SEGURIDAD DE LA VISTA
--
--  Por omisión una vista de Postgres se ejecuta con los permisos de quien la
--  creó, así que IGNORARÍA las reglas por fila de las tablas y entregaría todas
--  las actividades a cualquiera que la consultara.
--
--  security_invoker la hace correr con los permisos de quien pregunta, de modo
--  que las políticas de 03-rls.sql sí se aplican: un responsable solo ve lo
--  suyo aunque consulte la vista directamente.
-- =============================================================================
alter view public.vista_actividades set (security_invoker = true);
