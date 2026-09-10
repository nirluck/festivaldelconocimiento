-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 09 · PROGRAMA PÚBLICO
--
--  Lo que hace este archivo, en orden:
--
--    1. «sedes» gana dirección y capacidad, que el modelo documentado ya pedía
--       y nunca se crearon. La cartelera necesita decir dónde queda cada sede.
--    2. «actividades» gana «publicada_en»: cuándo entró al programa. La llena
--       un disparador y NO se puede escribir a mano, así que no se puede
--       falsear. Sirve para marcar novedades en la cartelera.
--    3. Un índice para el orden del programa.
--    4. LECTURA SIN CUENTA de las actividades publicadas. Hasta hoy la única
--       política de «actividades» era «to authenticated»: el programa público
--       habría salido vacío para cualquiera que no tuviera sesión.
--    5. «vista_programa», la única forma en que el sitio público lee el
--       programa.
--
--  Se puede volver a ejecutar: todo es «if not exists», «or replace» o
--  «drop … create».
--
--  ---------------------------------------------------------------------------
--  CÓMO SE PROTEGE LO QUE NO DEBE SALIR
--
--  RLS filtra FILAS, no COLUMNAS (trampa 4 del plan). Abrir las actividades
--  publicadas a «anon» con una política sola dejaría que cualquiera pidiera
--
--      GET /rest/v1/actividades?select=requerimientos
--
--  y se llevara los requerimientos internos de cada actividad —«necesito
--  proyector, tres mesas y apoyo de personal»— además del responsable_id.
--
--  El mecanismo que sí filtra columnas son los permisos POR COLUMNA de
--  PostgreSQL. Aquí se usan los dos: la política decide QUÉ FILAS y el permiso
--  por columna decide QUÉ CAMPOS. Así la vista puede quedarse con
--  «security_invoker = true», como manda la convención del proyecto, sin que
--  eso abra la tabla entera.
--
--  Nota sobre «authenticated»: un coordinador con sesión sí puede leer todas
--  las columnas de las actividades publicadas, porque 03-rls.sql le dio
--  «grant select» a la tabla completa. Se acepta a propósito: el registro es
--  por invitación, los coordinadores son parte del equipo, y ahí no hay datos
--  personales de terceros. Lo que se cierra es el acceso anónimo.
-- =============================================================================


-- =============================================================================
--  1 · SEDES: DÓNDE QUEDA
--
--  El modelo de la sección 4 del plan dice «sedes: nombre · direccion ·
--  capacidad · orden · activa», pero 01-esquema.sql solo creó tres de las
--  cinco. Se reponen ahora, vacías: la administración las llena cuando quiera
--  y la cartelera las muestra en cuanto existan.
-- =============================================================================
alter table public.sedes add column if not exists direccion text;
alter table public.sedes add column if not exists capacidad integer;

comment on column public.sedes.direccion is
  'Dónde queda, como se lo dirías a alguien que no conoce Ensenada. Sale en la página de la actividad. Vacío = no se muestra nada.';
comment on column public.sedes.capacidad is
  'Cuánta gente cabe. Referencia interna para asignar actividades; no se publica.';


-- =============================================================================
--  2 · «publicada_en» · CUÁNDO ENTRÓ AL PROGRAMA
--
--  Columna derivada: la escribe el disparador y nadie más. Si se dejara libre,
--  cualquiera podría poner una fecha falsa y el «Nuevo» de la cartelera
--  mentiría. Al apagar «publica» se borra, de modo que volver a publicar
--  cuenta como novedad otra vez —que es lo que pasó de verdad—.
-- =============================================================================
alter table public.actividades add column if not exists publicada_en timestamptz;

comment on column public.actividades.publicada_en is
  'Cuándo entró al programa público. La pone el disparador «sellar_publicacion»: no se escribe a mano.';


create or replace function public.sellar_publicacion()
returns trigger
language plpgsql
as $$
begin
  if new.publica then
    -- Pasó de borrador a publicada: ahora. Ya estaba publicada: se conserva
    -- el sello original, venga lo que venga en el update.
    --
    -- Se pregunta por TG_OP y no por «old is null»: en un disparador de INSERT
    -- OLD no está asignado, y aunque la comparación funcione, decirlo por su
    -- nombre no deja lugar a dudas de qué caso es cuál.
    if tg_op = 'INSERT' or not old.publica then
      new.publicada_en := now();
    else
      new.publicada_en := old.publicada_en;
    end if;
  else
    new.publicada_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists actividades_sellar_publicacion on public.actividades;
create trigger actividades_sellar_publicacion
  before insert or update on public.actividades
  for each row execute function public.sellar_publicacion();


-- -----------------------------------------------------------------------------
--  Rellenar lo que ya estaba publicado antes de que existiera la columna.
--
--  Con los disparadores propios levantados, por dos razones distintas:
--
--    · «marcar_actualizado» pondría actualizado = now() en todas las filas
--      tocadas, y el semáforo lee ese dato: la migración falsearía el historial
--      justo antes de calcular el color (trampa 7 del plan).
--    · «proteger_estado» exige ser administrador, y el editor SQL no actúa como
--      ningún usuario: rechazaría el update de su propia migración (trampa 1).
--
--  «disable trigger user» levanta solo los nuestros; los internos de las llaves
--  foráneas siguen en pie.
-- -----------------------------------------------------------------------------
alter table public.actividades disable trigger user;

update public.actividades
   set publicada_en = coalesce(actualizado, creado)
 where publica
   and publicada_en is null;

alter table public.actividades enable trigger user;


-- =============================================================================
--  3 · ÍNDICE DEL PROGRAMA
--
--  Parcial a propósito: la cartelera solo pide filas publicadas y sin archivar,
--  siempre ordenadas por fecha y hora. El índice es pequeño y cubre la consulta
--  completa.
-- =============================================================================
create index if not exists actividades_programa
  on public.actividades (edicion_id, fecha, hora_inicio)
  where publica and not archivada;


-- =============================================================================
--  4 · LECTURA SIN CUENTA
--
--  La política suma a la que ya existe —las políticas permisivas se combinan
--  con OR—, así que un coordinador sigue viendo sus borradores por
--  «actividades_ver» y además el programa por esta.
--
--  Va «to anon, authenticated» y no solo «to anon»: sin «authenticated», un
--  coordinador que abriera /programa/ vería únicamente sus propias actividades
--  y creería que el programa está casi vacío.
-- =============================================================================
drop policy if exists actividades_ver_publicas on public.actividades;
create policy actividades_ver_publicas on public.actividades
  for select to anon, authenticated
  using ( publica and not archivada );


-- -----------------------------------------------------------------------------
--  Permisos POR COLUMNA para «anon». Esto es lo que impide que el programa
--  público arrastre los requerimientos internos y el dueño de la actividad.
--
--  El «revoke» de arriba es por si alguna vez se dio el permiso a la tabla
--  entera: un permiso de tabla le ganaría a esta lista. Si nunca se dio, no
--  hace nada.
--
--  «publica» y «archivada» entran en la lista aunque no se publiquen: la vista
--  las nombra en su WHERE, y PostgreSQL exige permiso de lectura sobre toda
--  columna que aparezca en la consulta, no solo en el SELECT.
--
--  NO están, y es el punto de todo esto:
--    requerimientos · responsable_id · creado · actualizado
-- -----------------------------------------------------------------------------
revoke select on public.actividades from anon;

grant select (
  id, edicion_id, titulo, slug, resumen, descripcion,
  eje, tipo, sede,
  fecha, hora_inicio, hora_fin, cupo,
  publica, archivada, publicada_en
) on public.actividades to anon;


-- =============================================================================
--  5 · LA VISTA DEL PROGRAMA
--
--  Es la única puerta por la que el sitio público lee el programa. Trae
--  resueltos el color del eje y la dirección de la sede para que la cartelera
--  no tenga que hacer tres consultas y cruzarlas en el navegador.
--
--  «left join» en los dos catálogos: si alguien borra un eje o renombra una
--  sede, la actividad sigue apareciendo en el programa sin color o sin
--  dirección, en vez de desaparecer de la cartelera sin explicación.
--
--  El WHERE repite la condición de la política. No es redundante: para
--  «authenticated» la política «actividades_ver» ya dejó pasar sus borradores,
--  y sin este filtro un coordinador vería su actividad sin publicar dentro del
--  programa público.
-- =============================================================================
drop view if exists public.vista_programa;

create view public.vista_programa as
select
  a.id,
  a.edicion_id,
  a.slug,
  a.titulo,
  a.resumen,
  a.descripcion,
  a.eje,
  e.color          as eje_color,
  a.tipo,
  a.sede,
  s.direccion      as sede_direccion,
  a.fecha,
  a.hora_inicio,
  a.hora_fin,
  a.cupo,
  a.publicada_en
from public.actividades a
left join public.ejes  e on e.nombre = a.eje
left join public.sedes s on s.nombre = a.sede
where a.publica
  and not a.archivada;

-- Sin esto la vista ignora las reglas por fila y entrega todo a cualquiera
-- (trampa 2 del plan). Con esto, quien la consulta solo ve lo que su política
-- le permite: para «anon», lo publicado y nada más.
alter view public.vista_programa set (security_invoker = true);

grant select on public.vista_programa to anon, authenticated;

comment on view public.vista_programa is
  'Programa público. Única lectura del sitio sin sesión: solo columnas publicables de las actividades con publica = true y archivada = false.';


-- =============================================================================
--  COMPROBACIÓN
--
--  Las seis líneas deben decir BIEN. La cuarta es la importante: si
--  «requerimientos» apareciera entre los permisos de «anon», el programa
--  público estaría filtrando datos internos.
-- =============================================================================
select 1 as orden,
       'Columnas nuevas de sedes' as revisión,
       (select count(*) from information_schema.columns
         where table_schema='public' and table_name='sedes'
           and column_name in ('direccion','capacidad'))::text || ' de 2' as valor,
       case when (select count(*) from information_schema.columns
                   where table_schema='public' and table_name='sedes'
                     and column_name in ('direccion','capacidad')) = 2
            then 'BIEN' else 'REVISAR' end as resultado

union all
select 2, 'publicada_en existe',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='actividades'
                            and column_name='publicada_en') then 'sí' else 'no' end,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='actividades'
                            and column_name='publicada_en') then 'BIEN' else 'REVISAR' end

union all
select 3, 'Disparador del sello',
       case when exists (select 1 from pg_trigger
                          where tgname='actividades_sellar_publicacion'
                            and not tgisinternal) then 'activo' else 'ausente' end,
       case when exists (select 1 from pg_trigger
                          where tgname='actividades_sellar_publicacion'
                            and not tgisinternal) then 'BIEN' else 'REVISAR' end

union all
-- Lo que «anon» NO debe poder leer. Si esto dice REVISAR, hay una fuga.
select 4, 'anon no lee requerimientos ni responsable',
       coalesce((select string_agg(column_name, ', ')
                   from information_schema.column_privileges
                  where grantee='anon' and table_schema='public'
                    and table_name='actividades'
                    and column_name in ('requerimientos','responsable_id')),
                'ninguna — correcto'),
       case when not exists (select 1 from information_schema.column_privileges
                              where grantee='anon' and table_schema='public'
                                and table_name='actividades'
                                and column_name in ('requerimientos','responsable_id'))
            then 'BIEN' else 'REVISAR: FUGA' end

union all
select 5, 'La vista respeta las reglas por fila',
       case when exists (select 1 from pg_class c
                          join pg_namespace n on n.oid=c.relnamespace
                         where n.nspname='public' and c.relname='vista_programa'
                           and c.reloptions::text like '%security_invoker=true%')
            then 'security_invoker = true' else 'SIN security_invoker' end,
       case when exists (select 1 from pg_class c
                          join pg_namespace n on n.oid=c.relnamespace
                         where n.nspname='public' and c.relname='vista_programa'
                           and c.reloptions::text like '%security_invoker=true%')
            then 'BIEN' else 'REVISAR' end

union all
select 6, 'Actividades ya en el programa',
       (select count(*)::text from public.actividades where publica and not archivada),
       'informativo'

order by orden;
