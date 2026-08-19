-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 06 · CAMBIOS DE AGOSTO
--
--  Ejecuta este archivo COMPLETO y de una sola vez sobre la base que ya existe.
--  Se puede volver a ejecutar sin romper nada.
--
--  Qué cambia:
--    1. Los roles se renombran.  responsable → coordinador
--                                coordinacion → administrador
--    2. Las actividades ganan hora de inicio, hora de término y requerimientos.
--    3. Se retira la aprobación: al ser por invitación, nadie tiene que validar.
-- =============================================================================


-- =============================================================================
--  0 · SE LEVANTAN LOS CANDADOS
--
--  Los dos disparadores vigilan justo lo que esta migración va a cambiar, y
--  ambos exigen ser administrador. Como el editor SQL no actúa como ningún
--  usuario, rechazarían la propia migración. Se levantan al principio y se
--  vuelven a poner al final: así ningún orden interno puede fallar.
--
--  Si algo se rompiera a media ejecución, PostgreSQL revierte el archivo
--  completo —incluidos estos ALTER— y los candados quedan puestos.
-- =============================================================================
alter table public.perfiles    disable trigger perfiles_proteger_rol;
alter table public.actividades disable trigger actividades_proteger_estado;


-- =============================================================================
--  1 · ROLES
--
--  «Coordinador» es quien inscribe, organiza y reporta una actividad.
--  «Administrador» es quien da seguimiento a todas. Puede haber varios.
-- =============================================================================
alter table public.perfiles drop constraint if exists perfiles_rol_check;

update public.perfiles set rol = 'administrador' where rol = 'coordinacion';
update public.perfiles set rol = 'coordinador'   where rol = 'responsable';

alter table public.perfiles
  add constraint perfiles_rol_check check (rol in ('coordinador', 'administrador'));

alter table public.perfiles alter column rol set default 'coordinador';


-- ---------------------------------------------------------------------------
--  La función que decide quién manda cambia de nombre junto con el rol.
--  Sigue siendo SECURITY DEFINER: si consultara «perfiles» con las reglas del
--  usuario, la política de perfiles la volvería a llamar y entraría en
--  recursión infinita.
-- ---------------------------------------------------------------------------
create or replace function public.es_administrador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
     where id = auth.uid() and rol = 'administrador'
  );
$$;


-- =============================================================================
--  2 · CAMPOS NUEVOS EN LAS ACTIVIDADES
-- =============================================================================
alter table public.actividades add column if not exists hora           time;
alter table public.actividades add column if not exists hora_fin       time;
alter table public.actividades add column if not exists requerimientos text not null default '';

comment on column public.actividades.hora is
  'Hora de inicio. Hace falta para armar el programa público.';
comment on column public.actividades.requerimientos is
  'Qué necesita la actividad para realizarse: equipo, montaje, espacio.';


-- =============================================================================
--  3 · SE RETIRA LA APROBACIÓN
--
--  El registro es por invitación, así que nadie tiene que revalidar lo que
--  inscribe un coordinador. La columna NO se borra —serviría si algún día se
--  quiere marcar qué entra al programa público— pero deja de usarse en la
--  interfaz y todo queda aprobado por omisión.
-- =============================================================================
alter table public.actividades alter column estado set default 'aprobada';
update public.actividades set estado = 'aprobada' where estado = 'propuesta';


-- El disparador ya no cuida el estado, pero sigue cuidando que nadie archive
-- una actividad ajena ni se la pase a otra cuenta.
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
    new.responsable_id := old.responsable_id;
  end if;
  return new;
end;
$$;


create or replace function public.proteger_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rol is distinct from old.rol and not public.es_administrador() then
    raise exception 'Solo la administración puede cambiar el rol de una cuenta.';
  end if;
  return new;
end;
$$;


-- =============================================================================
--  4 · POLÍTICAS
--  Se rehacen para que apunten a es_administrador() en vez de es_coordinacion().
-- =============================================================================
drop policy if exists perfiles_ver        on public.perfiles;
drop policy if exists perfiles_editar     on public.perfiles;
drop policy if exists actividades_ver     on public.actividades;
drop policy if exists actividades_crear   on public.actividades;
drop policy if exists actividades_editar  on public.actividades;
drop policy if exists actividades_borrar  on public.actividades;
drop policy if exists reportes_ver        on public.reportes;
drop policy if exists reportes_crear      on public.reportes;
drop policy if exists seguimiento_todo    on public.seguimiento;

create policy perfiles_ver on public.perfiles
  for select to authenticated
  using ( id = auth.uid() or public.es_administrador() );

create policy perfiles_editar on public.perfiles
  for update to authenticated
  using ( id = auth.uid() or public.es_administrador() )
  with check ( id = auth.uid() or public.es_administrador() );

create policy actividades_ver on public.actividades
  for select to authenticated
  using ( responsable_id = auth.uid() or public.es_administrador() );

create policy actividades_crear on public.actividades
  for insert to authenticated
  with check ( responsable_id = auth.uid() );

create policy actividades_editar on public.actividades
  for update to authenticated
  using ( responsable_id = auth.uid() or public.es_administrador() )
  with check ( responsable_id = auth.uid() or public.es_administrador() );

create policy actividades_borrar on public.actividades
  for delete to authenticated
  using ( public.es_administrador() );

-- El historial sigue siendo de solo agregar: no hay política de modificación
-- ni de borrado, y eso es deliberado.
create policy reportes_ver on public.reportes
  for select to authenticated
  using (
    public.es_administrador()
    or exists (select 1 from public.actividades a
                where a.id = actividad_id and a.responsable_id = auth.uid())
  );

create policy reportes_crear on public.reportes
  for insert to authenticated
  with check (
    public.es_administrador()
    or exists (select 1 from public.actividades a
                where a.id = actividad_id and a.responsable_id = auth.uid())
  );

create policy seguimiento_todo on public.seguimiento
  for all to authenticated
  using ( public.es_administrador() )
  with check ( public.es_administrador() );

-- Catálogos y ajustes: lectura para cualquiera, escritura solo administración.
do $$
declare t text;
begin
  foreach t in array array['ejes','tipos','sedes','dias','ajustes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_escribir', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.es_administrador()) with check (public.es_administrador())',
      t || '_escribir', t);
  end loop;
end $$;


-- =============================================================================
--  5 · LA VISTA
--  Se rehace para incluir los campos nuevos. Hay que borrarla y volver a
--  crearla: «create or replace view» no admite insertar columnas en medio.
-- =============================================================================
drop view if exists public.vista_actividades;

create view public.vista_actividades as
with
umbrales as (
  select
    public.avance_esperado()             as esperado,
    public.ajuste_int('dias_ambar', 14)  as dias_ambar,
    public.ajuste_int('dias_rojo',  25)  as dias_rojo
),
base as (
  select
    a.id, a.responsable_id, a.actividad, a.eje, a.tipo, a.sede, a.dia,
    a.hora, a.hora_fin, a.descripcion, a.requerimientos,
    a.estado, a.archivada, a.creado, a.actualizado,

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

-- Sin esto la vista ignoraría las reglas por fila y entregaría TODAS las
-- actividades a cualquiera que la consultara.
alter view public.vista_actividades set (security_invoker = true);

grant select on public.vista_actividades to authenticated;


-- =============================================================================
--  6 · SE RETIRA LA FUNCIÓN VIEJA
--  Ya no queda ninguna política que la use.
-- =============================================================================
drop function if exists public.es_coordinacion();


-- =============================================================================
--  7 · SE VUELVEN A PONER LOS CANDADOS
-- =============================================================================
alter table public.perfiles    enable trigger perfiles_proteger_rol;
alter table public.actividades enable trigger actividades_proteger_estado;


-- =============================================================================
--  COMPROBACIÓN
-- =============================================================================
select 'roles' as revisión,
       string_agg(distinct rol, ', ') as valor,
       case when bool_and(rol in ('coordinador','administrador'))
            then 'BIEN' else 'REVISAR' end as resultado
  from public.perfiles
union all
select 'campos nuevos',
       string_agg(column_name, ', ' order by column_name),
       case when count(*) = 3 then 'BIEN' else 'REVISAR' end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'actividades'
   and column_name in ('hora', 'hora_fin', 'requerimientos')
union all
select 'administradores',
       count(*)::text || ' cuenta(s)',
       case when count(*) >= 1 then 'BIEN' else 'REVISAR · no hay quien administre' end
  from public.perfiles where rol = 'administrador';
