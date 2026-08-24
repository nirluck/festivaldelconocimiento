-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 08 · CUPO
--
--  Ejecuta este archivo COMPLETO sobre la base ya migrada con 07-nucleo.sql.
--  Se puede volver a ejecutar sin romper nada.
--
--  Qué hace, y nada más que esto:
--    Agrega la columna «cupo» a «actividades». Estaba en el modelo documentado
--    (sección 4 del plan) pero se había reservado para la fase F. Se adelanta
--    porque es dato que el coordinador captura al describir su actividad; su
--    FUNCIÓN —contar inscritos— sigue siendo de la fase F.
--
--  SEGURIDAD DE LOS DATOS
--    Es una operación puramente ADITIVA: «add column if not exists» de una
--    columna que admite nulos. PostgreSQL no reescribe ni toca las filas que
--    ya existen; solo aparece una columna nueva, vacía. No hay forma de que se
--    pierda nada. La comprobación del final cuenta las filas para que se vea.
-- =============================================================================

-- Se guarda el conteo de antes en una tabla temporal, para compararlo al final.
-- Es de la sesión: desaparece sola al cerrar el editor.
create temporary table if not exists _cupo_antes as
  select count(*)::int as filas from public.actividades;


-- -----------------------------------------------------------------------------
--  LA COLUMNA
--
--  Entera y con nulos permitidos: una actividad puede no tener cupo definido
--  todavía, y eso es distinto de un cupo de cero. El check impide un cupo
--  negativo, que no significaría nada.
-- -----------------------------------------------------------------------------
alter table public.actividades add column if not exists cupo integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'actividades_cupo_no_negativo') then
    alter table public.actividades
      add constraint actividades_cupo_no_negativo check (cupo is null or cupo >= 0);
  end if;
end $$;

comment on column public.actividades.cupo is
  'Lugares que ofrece la actividad. Nulo = sin definir. Contar inscritos es de la fase F.';


-- =============================================================================
--  LA VISTA
--
--  «vista_actividades» se reconstruye para que «cupo» viaje al tablero y a la
--  exportación junto a los demás campos. Hay que borrarla y recrearla, no
--  reemplazarla: «create or replace view» no admite insertar una columna en
--  medio del select.
--
--  Es la misma vista de 07-nucleo.sql con una sola línea nueva —«a.cupo»— en
--  el bloque «base». El resto es idéntico, palabra por palabra.
-- =============================================================================
drop view if exists public.vista_actividades;

create view public.vista_actividades as
with
umbrales as (
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
    a.fecha, a.hora_inicio, a.hora_fin, a.cupo,
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

alter view public.vista_actividades set (security_invoker = true);
grant select on public.vista_actividades to authenticated;


-- =============================================================================
--  COMPROBACIÓN
--  El renglón «filas sin cambio» es la prueba de que no se perdió nada:
--  el conteo de antes y el de después tienen que coincidir.
-- =============================================================================
select * from (
  select 1 as orden, 'Columna cupo' as revisión,
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='actividades'
                              and column_name='cupo') then 'existe' else 'ausente' end as valor,
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='actividades'
                              and column_name='cupo') then 'BIEN' else 'REVISAR' end as resultado
  union all
  select 2, 'Restricción de no negativo',
         case when exists (select 1 from pg_constraint
                            where conname='actividades_cupo_no_negativo') then 'activa' else 'ausente' end,
         case when exists (select 1 from pg_constraint
                            where conname='actividades_cupo_no_negativo') then 'BIEN' else 'REVISAR' end
  union all
  select 3, 'cupo viaja en la vista',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='vista_actividades'
                              and column_name='cupo') then 'sí' else 'no' end,
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='vista_actividades'
                              and column_name='cupo') then 'BIEN' else 'REVISAR' end
  union all
  select 4, 'Filas sin cambio',
         (select filas from _cupo_antes) || ' antes · ' ||
         (select count(*) from public.actividades) || ' después',
         case when (select filas from _cupo_antes) = (select count(*) from public.actividades)
              then 'BIEN · no se perdió ninguna' else 'REVISAR · cambió el número de filas' end
) t order by orden;

drop table if exists _cupo_antes;
