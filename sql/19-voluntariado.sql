-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 19 · VOLUNTARIADO
--
--  Escrito el 4 de octubre de 2026. Se ejecuta COMPLETO, después de 18. Se
--  puede volver a ejecutar: todo es «if not exists», «or replace» o
--  «drop … create», y la semilla de instituciones no pisa lo editado.
--
--  Qué hace, en orden:
--    1. instituciones   catálogo de las invitadas, con «Otra» como respaldo
--    2. puestos         lo que cada actividad necesita: «4 personas para
--                       validar boletos en la puerta, de 18:00 a 21:30»
--    3. voluntarios     la persona, una sola vez, aunque tome varios turnos
--    4. inscripciones   la persona en un puesto: su turno
--    5. reglas de acceso
--    6. funciones públicas: directorio, inscribirse, ver y cancelar un turno
--    7. funciones del panel: lista, asignar a mano, quitar, mover, asistencia
--    8. comprobación
--
--  DECISIONES DEL EQUIPO (4 de octubre de 2026)
--    · La inscripción es INMEDIATA: el lugar se toma al inscribirse y la
--      vacante se llena sola. El coordinador puede quitar, mover o asignar.
--    · Solo mayores de 18. Se pide una casilla, no la edad.
--    · Datos: nombre, correo, teléfono (WhatsApp), institución (catálogo u
--      «Otra»), carrera, matrícula (opcional) y responsable de servicio social.
--    · Se registran asistencia y horas: las instituciones las piden para
--      acreditar el servicio social.
--    · Una persona puede tomar varios turnos, NUNCA dos que se empalmen.
--
--  POR QUÉ SE PIDE CORREO, SI EL PÚBLICO YA NO LO DEJA (12-datos-minimos)
--  El público pide un boleto y no hace falta volver a hablarle. A un
--  voluntario sí: el coordinador tiene que poder escribirle y llamarle, y la
--  institución acredita horas a una persona identificable. El correo es
--  además la identidad: con él se evita la doble inscripción y se cuidan los
--  empalmes. Cada dato tiene su uso escrito en el aviso de privacidad (sección
--  para voluntariado, PENDIENTE de aprobación de la asesoría legal).
--
--  SIN CORREO SALIENTE (fase H aplazada)
--  Como los boletos, el comprobante se entrega en pantalla y se guarda en el
--  teléfono («Mis turnos»). Cada turno tiene su propio token secreto; nunca
--  se devuelve un token a quien solo sabe un correo (ver «ya_inscrito»).
-- =============================================================================


-- =============================================================================
--  1 · INSTITUCIONES
--
--  Un catálogo y no texto libre: «UABC», «uabc ens» y «Universidad Autónoma
--  de BC» saldrían como tres instituciones en el reporte de horas. «clave» es
--  la que va en la liga de invitación: /voluntariado/?i=uabc
-- =============================================================================
create table if not exists public.instituciones (
  id         uuid primary key default gen_random_uuid(),
  clave      text not null unique,
  nombre     text not null,
  orden      smallint not null default 0,
  activa     boolean not null default true,
  creada_en  timestamptz not null default now(),
  constraint instituciones_clave  check (clave ~ '^[a-z0-9][a-z0-9-]{1,29}$'),
  constraint instituciones_nombre check (char_length(btrim(nombre)) between 2 and 160)
);

create unique index if not exists instituciones_nombre_unico
  on public.instituciones (public.normalizar(nombre));

-- Las educativas que ya aparecen en la pleca de la portada. Las demás
-- invitadas se agregan desde /panel/voluntariado/. «do nothing»: volver a
-- correr el archivo no pisa nombres corregidos a mano.
insert into public.instituciones (clave, nombre, orden) values
  ('uabc',   'Universidad Autónoma de Baja California (UABC)', 10),
  ('cetys',  'CETYS Universidad',                              20),
  ('ite',    'Instituto Tecnológico de Ensenada (TecNM)',      30),
  ('unam',   'UNAM · Centro de Nanociencias y Nanotecnología', 40),
  ('cicese', 'CICESE',                                         50)
on conflict (clave) do nothing;


-- =============================================================================
--  2 · PUESTOS
--
--  Una fila por puesto: «4 en la puerta validando boletos, 18:00–21:30» y
--  «2 en montaje, 15:00–17:00» son dos puestos de la misma actividad.
--
--  «fecha» nula = el día de la actividad, y lo sigue si la actividad cambia
--  de día. Se llena solo cuando el turno es OTRO día (montaje la víspera).
--  El horario es propio: suele empezar antes y terminar después que la
--  actividad. El lugar es el de la sede de la actividad; «punto_encuentro»
--  dice dónde dentro de ella («taquilla del teatro»).
--
--  «contacto_dia» lo ven solo las personas inscritas, en su comprobante.
--  «en_directorio» apagado = el puesto existe, se puede asignar a mano, pero
--  no se ofrece en /voluntariado/.
-- =============================================================================
create table if not exists public.puestos (
  id              uuid primary key default gen_random_uuid(),
  actividad_id    uuid not null references public.actividades(id) on delete cascade,
  categoria       text not null default 'apoyo',
  titulo          text not null,
  descripcion     text,
  fecha           date,
  hora_inicio     time not null,
  hora_fin        time not null,
  vacantes        smallint not null default 1,
  punto_encuentro text,
  requisitos      text,
  contacto_dia    text,
  en_directorio   boolean not null default true,
  orden           smallint not null default 0,
  creado          timestamptz not null default now(),
  creado_por      uuid references public.perfiles(id) on delete set null default auth.uid(),
  constraint puestos_categoria  check (categoria in ('acceso','montaje','atencion','apoyo','registro','difusion','otro')),
  constraint puestos_titulo     check (char_length(btrim(titulo)) between 3 and 90),
  constraint puestos_horario    check (hora_fin > hora_inicio),
  constraint puestos_vacantes   check (vacantes between 1 and 200),
  constraint puestos_textos     check (char_length(coalesce(descripcion, ''))     <= 1500
                                   and char_length(coalesce(punto_encuentro, '')) <= 200
                                   and char_length(coalesce(requisitos, ''))      <= 600
                                   and char_length(coalesce(contacto_dia, ''))    <= 300)
);

create index if not exists puestos_actividad on public.puestos (actividad_id, orden);

comment on table public.puestos is
  'Lo que una actividad necesita de voluntariado. Una fila por puesto, con su horario propio y sus vacantes.';
comment on column public.puestos.fecha is
  'Nula = el mismo día de la actividad (y lo sigue si cambia). Solo se llena si el turno es otro día.';


-- =============================================================================
--  3 · VOLUNTARIOS
--
--  La persona, una sola vez. El correo, en minúsculas y sin espacios, es su
--  identidad (sección 4 del plan: así se cruzan las tablas de personas).
--  Acumula entre ediciones: esa es la base de datos de voluntariado.
-- =============================================================================
create table if not exists public.voluntarios (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  correo               text not null,
  telefono             text not null,
  institucion_id       uuid references public.instituciones(id) on delete set null,
  institucion_otra     text,
  carrera              text,
  matricula            text,
  responsable          text not null,
  responsable_contacto text,
  mayor_edad           boolean not null,
  consentimiento_en    timestamptz not null default now(),
  creado               timestamptz not null default now(),
  constraint voluntarios_nombre      check (char_length(btrim(nombre)) between 3 and 120),
  constraint voluntarios_correo      check (correo = lower(btrim(correo)) and correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint voluntarios_telefono    check (char_length(regexp_replace(telefono, '\D', '', 'g')) between 10 and 15),
  constraint voluntarios_institucion check (institucion_id is not null or char_length(btrim(coalesce(institucion_otra, ''))) >= 2),
  constraint voluntarios_responsable check (char_length(btrim(responsable)) between 3 and 120),
  constraint voluntarios_mayor       check (mayor_edad),
  constraint voluntarios_textos      check (char_length(coalesce(institucion_otra, ''))     <= 160
                                       and char_length(coalesce(carrera, ''))              <= 120
                                       and char_length(coalesce(matricula, ''))            <= 40
                                       and char_length(coalesce(responsable_contacto, '')) <= 160)
);

create unique index if not exists voluntarios_correo_unico on public.voluntarios (correo);


-- =============================================================================
--  4 · INSCRIPCIONES · el turno de una persona en un puesto
--
--  «token» es secreto y propio del turno: con él se ve y se cancela el
--  comprobante. Lo pone la función que inscribe (trampa 19: un DEFAULT con
--  token_nuevo() fallaría para quien no puede ejecutarla).
--
--  Cancelar no borra: la fila queda en «cancelado» para el historial, y si la
--  persona vuelve al mismo puesto se reactiva (por eso el unique).
--
--  «horas» se llena al marcar «cumplió»: por omisión, lo que dura el puesto.
-- =============================================================================
create table if not exists public.inscripciones (
  id             uuid primary key default gen_random_uuid(),
  puesto_id      uuid not null references public.puestos(id) on delete cascade,
  voluntario_id  uuid not null references public.voluntarios(id) on delete cascade,
  estado         text not null default 'inscrito',
  origen         text not null default 'directorio',
  token          text not null unique,
  creado         timestamptz not null default now(),
  cancelado_en   timestamptz,
  cancelado_por  text,
  asistencia     text,
  horas          numeric(5,2),
  marcado_por    uuid references public.perfiles(id) on delete set null,
  marcado_en     timestamptz,
  nota           text,
  constraint inscripciones_unica      unique (puesto_id, voluntario_id),
  constraint inscripciones_estado     check (estado in ('inscrito','cancelado')),
  constraint inscripciones_origen     check (origen in ('directorio','panel')),
  constraint inscripciones_cancelador check (cancelado_por is null or cancelado_por in ('voluntario','coordinacion')),
  constraint inscripciones_asistencia check (asistencia is null or asistencia in ('cumplio','falto')),
  constraint inscripciones_horas      check (horas is null or (horas >= 0 and horas <= 24)),
  constraint inscripciones_nota       check (char_length(coalesce(nota, '')) <= 500)
);

create index if not exists inscripciones_puesto     on public.inscripciones (puesto_id) where estado = 'inscrito';
create index if not exists inscripciones_voluntario on public.inscripciones (voluntario_id) where estado = 'inscrito';


-- =============================================================================
--  5 · REGLAS DE ACCESO
--
--  Supabase concede TODO a anon y authenticated sobre cada tabla nueva
--  (trampa 18): se retira nombrando a los dos roles.
--
--  · instituciones  es catálogo: se lee sin cuenta (las activas). La edita la
--                   administración.
--  · puestos        sin cuenta, nada directo: el directorio es una función,
--                   porque necesita contar inscripciones y no debe mostrar
--                   «contacto_dia». Con cuenta: el dueño de la actividad o la
--                   administración, lo de sus actividades.
--  · voluntarios e inscripciones: directo, SOLO la administración. El
--                   coordinador ve a la gente de SUS puestos por función.
-- =============================================================================
alter table public.instituciones enable row level security;
alter table public.puestos       enable row level security;
alter table public.voluntarios   enable row level security;
alter table public.inscripciones enable row level security;

revoke all on public.instituciones from anon, authenticated;
revoke all on public.puestos       from anon, authenticated;
revoke all on public.voluntarios   from anon, authenticated;
revoke all on public.inscripciones from anon, authenticated;

-- INSTITUCIONES
drop policy if exists instituciones_leer on public.instituciones;
create policy instituciones_leer on public.instituciones
  for select to anon, authenticated
  using ( activa or public.es_administrador() );

drop policy if exists instituciones_admin on public.instituciones;
create policy instituciones_admin on public.instituciones
  for all to authenticated
  using ( public.es_administrador() )
  with check ( public.es_administrador() );

grant select on public.instituciones to anon, authenticated;
grant insert, update, delete on public.instituciones to authenticated;

-- PUESTOS · el borrado va por eliminar_puesto(), que se niega si hay gente.
drop policy if exists puestos_ver on public.puestos;
create policy puestos_ver on public.puestos
  for select to authenticated
  using ( public.puede_editar_actividad(actividad_id::text) );

drop policy if exists puestos_crear on public.puestos;
create policy puestos_crear on public.puestos
  for insert to authenticated
  with check ( public.puede_editar_actividad(actividad_id::text) );

drop policy if exists puestos_editar on public.puestos;
create policy puestos_editar on public.puestos
  for update to authenticated
  using      ( public.puede_editar_actividad(actividad_id::text) )
  with check ( public.puede_editar_actividad(actividad_id::text) );

grant select, insert, update on public.puestos to authenticated;

-- VOLUNTARIOS · la administración corrige datos o los borra (derecho de
-- cancelación); el alta, siempre por función.
drop policy if exists voluntarios_admin on public.voluntarios;
create policy voluntarios_admin on public.voluntarios
  for all to authenticated
  using ( public.es_administrador() )
  with check ( public.es_administrador() );

grant select, update, delete on public.voluntarios to authenticated;

-- INSCRIPCIONES · lectura directa solo la administración; los cambios, por
-- función, porque cada uno debe revisar cupo y empalmes bajo candado.
drop policy if exists inscripciones_admin on public.inscripciones;
create policy inscripciones_admin on public.inscripciones
  for select to authenticated
  using ( public.es_administrador() );

grant select on public.inscripciones to authenticated;


-- =============================================================================
--  6 · PIEZAS INTERNAS
--
--  Cerradas a todos: solo las llaman las funciones de abajo.
-- =============================================================================

-- La hora local de Ensenada, como timestamp sin zona: se compara con
-- «fecha + hora» de un puesto, que tampoco la lleva.
create or replace function public._ahora_ensenada()
returns timestamp
language sql
stable
as $$
  select (now() at time zone 'America/Tijuana');
$$;

-- El día real del turno: el del puesto, o el de su actividad.
create or replace function public._dia_puesto(p_puesto uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.fecha, a.fecha)
    from public.puestos p join public.actividades a on a.id = p.actividad_id
   where p.id = p_puesto;
$$;

-- Horas que dura un puesto: el valor por omisión de «horas» al marcar cumplió.
create or replace function public._duracion_puesto(p_inicio time, p_fin time)
returns numeric
language sql
immutable
as $$
  select round(extract(epoch from (p_fin - p_inicio)) / 3600.0, 2);
$$;

-- ¿Con qué turno de esta persona se empalmaría el puesto? Nulo si con
-- ninguno. «p_excluir» deja fuera una inscripción (al mover a alguien, la suya).
create or replace function public._choque_voluntario(p_voluntario uuid, p_puesto uuid, p_excluir uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with este as (
    select coalesce(p.fecha, a.fecha) as dia, p.hora_inicio, p.hora_fin
      from public.puestos p join public.actividades a on a.id = p.actividad_id
     where p.id = p_puesto
  )
  select jsonb_build_object(
           'puesto', p.titulo, 'actividad', a.titulo,
           'fecha', coalesce(p.fecha, a.fecha),
           'hora_inicio', to_char(p.hora_inicio, 'HH24:MI'),
           'hora_fin', to_char(p.hora_fin, 'HH24:MI'))
    from public.inscripciones i
    join public.puestos p     on p.id = i.puesto_id
    join public.actividades a on a.id = p.actividad_id
    cross join este e
   where i.voluntario_id = p_voluntario
     and i.estado = 'inscrito'
     and i.puesto_id <> p_puesto
     and (p_excluir is null or i.id <> p_excluir)
     and coalesce(p.fecha, a.fecha) = e.dia
     and p.hora_inicio < e.hora_fin
     and e.hora_inicio < p.hora_fin
   limit 1;
$$;

-- Revisa los datos de una persona. Nulo si están bien; si no, el campo que
-- falla, para que la pantalla lo señale.
create or replace function public._revisar_voluntario(
  p_nombre text, p_correo text, p_telefono text,
  p_institucion uuid, p_institucion_otra text, p_carrera text,
  p_responsable text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if char_length(btrim(coalesce(p_nombre, ''))) not between 3 and 120 then return 'nombre'; end if;
  if lower(btrim(coalesce(p_correo, ''))) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(p_correo) > 160 then return 'correo'; end if;
  if char_length(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')) not between 10 and 15 then return 'telefono'; end if;
  if p_institucion is null and char_length(btrim(coalesce(p_institucion_otra, ''))) < 2 then return 'institucion'; end if;
  if p_institucion is not null
     and not exists (select 1 from public.instituciones where id = p_institucion) then return 'institucion'; end if;
  if char_length(btrim(coalesce(p_carrera, ''))) not between 2 and 120 then return 'carrera'; end if;
  if char_length(btrim(coalesce(p_responsable, ''))) not between 3 and 120 then return 'responsable'; end if;
  return null;
end;
$$;

-- La persona con ese correo, o una nueva. Si ya existía, sus datos NO se
-- reemplazan con lo que alguien escriba ahora: sin correo verificado,
-- cualquiera podría cambiar el teléfono de otra persona sabiendo su correo.
-- Solo se llenan los huecos. Para corregir, la administración.
create or replace function public._voluntario(
  p_nombre text, p_correo text, p_telefono text,
  p_institucion uuid, p_institucion_otra text, p_carrera text, p_matricula text,
  p_responsable text, p_responsable_contacto text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correo text := lower(btrim(p_correo));
  v_id     uuid;
begin
  select id into v_id from public.voluntarios where correo = v_correo for update;
  if v_id is null then
    insert into public.voluntarios (nombre, correo, telefono, institucion_id, institucion_otra,
                                    carrera, matricula, responsable, responsable_contacto, mayor_edad)
    values (btrim(p_nombre), v_correo, btrim(p_telefono), p_institucion,
            case when p_institucion is null then nullif(btrim(p_institucion_otra), '') end,
            nullif(btrim(p_carrera), ''), nullif(btrim(p_matricula), ''),
            btrim(p_responsable), nullif(btrim(p_responsable_contacto), ''), true)
    returning id into v_id;
  else
    update public.voluntarios
       set carrera              = coalesce(carrera, nullif(btrim(p_carrera), '')),
           matricula            = coalesce(matricula, nullif(btrim(p_matricula), '')),
           responsable_contacto = coalesce(responsable_contacto, nullif(btrim(p_responsable_contacto), ''))
     where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Lo que muestra el comprobante de un turno. Incluye «contacto_dia», que el
-- directorio no enseña: solo lo ve quien está inscrito.
create or replace function public._turno_json(p_inscripcion uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'token',        i.token,
    'estado',       i.estado,
    'cancelado_por', i.cancelado_por,
    'asistencia',   i.asistencia,
    'horas',        i.horas,
    'nombre',       v.nombre,
    'puesto', jsonb_build_object(
      'id', p.id, 'titulo', p.titulo, 'categoria', p.categoria,
      'descripcion', p.descripcion, 'requisitos', p.requisitos,
      'punto_encuentro', p.punto_encuentro, 'contacto_dia', p.contacto_dia,
      'fecha', coalesce(p.fecha, a.fecha),
      'hora_inicio', to_char(p.hora_inicio, 'HH24:MI'),
      'hora_fin', to_char(p.hora_fin, 'HH24:MI'),
      'empezo', (coalesce(p.fecha, a.fecha) + p.hora_inicio) <= public._ahora_ensenada()),
    'actividad', jsonb_build_object(
      'titulo', a.titulo, 'slug', a.slug, 'eje', a.eje, 'eje_color', e.color,
      'sede', a.sede, 'sede_direccion', s.direccion, 'mapa_url', s.mapa_url,
      'sala', sa.nombre, 'poster', a.poster,
      'hora_inicio', to_char(a.hora_inicio, 'HH24:MI'),
      'hora_fin', to_char(a.hora_fin, 'HH24:MI')))
    from public.inscripciones i
    join public.voluntarios v on v.id = i.voluntario_id
    join public.puestos p     on p.id = i.puesto_id
    join public.actividades a on a.id = p.actividad_id
    left join public.ejes e   on e.nombre = a.eje
    left join public.sedes s  on s.nombre = a.sede
    left join public.salas sa on sa.id = a.sala_id
   where i.id = p_inscripcion;
$$;

-- Inscribe a una persona ya existente en un puesto, bajo candado.
--   · El candado del PUESTO hace que dos personas no tomen el último lugar.
--   · El candado de la PERSONA hace que no tome a la vez dos turnos que se
--     empalman en dos pestañas.
-- Nunca lanza: responde {ok:false, error} (trampa 21).
create or replace function public._inscribir(
  p_puesto uuid, p_voluntario uuid, p_origen text, p_sobrecupo boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p       public.puestos%rowtype;
  v_ocup    integer;
  v_choque  jsonb;
  v_previa  public.inscripciones%rowtype;
  v_id      uuid;
begin
  select * into v_p from public.puestos where id = p_puesto for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  perform 1 from public.voluntarios where id = p_voluntario for update;

  select * into v_previa from public.inscripciones
   where puesto_id = p_puesto and voluntario_id = p_voluntario;
  if v_previa.id is not null and v_previa.estado = 'inscrito' then
    -- Sin token a propósito: quien solo sabe un correo no debe obtener el
    -- comprobante (ni poder cancelarlo) de otra persona.
    return jsonb_build_object('ok', false, 'error', 'ya_inscrito');
  end if;
  -- Si la coordinación la retiró de este puesto, no vuelve sola desde el
  -- directorio: tendría que hablarlo. Desde el panel sí se puede reasignar.
  if v_previa.id is not null and v_previa.cancelado_por = 'coordinacion' and p_origen = 'directorio' then
    return jsonb_build_object('ok', false, 'error', 'retirado');
  end if;

  select count(*) into v_ocup from public.inscripciones
   where puesto_id = p_puesto and estado = 'inscrito';
  if v_ocup >= v_p.vacantes and not coalesce(p_sobrecupo, false) then
    return jsonb_build_object('ok', false, 'error', 'lleno');
  end if;

  v_choque := public._choque_voluntario(p_voluntario, p_puesto);
  if v_choque is not null then
    return jsonb_build_object('ok', false, 'error', 'empalme', 'choque', v_choque);
  end if;

  if v_previa.id is not null then
    -- Había cancelado este mismo puesto y vuelve: se reactiva con token nuevo
    -- (el viejo pudo quedar en otro teléfono).
    update public.inscripciones
       set estado = 'inscrito', origen = p_origen, token = public.token_nuevo(),
           creado = now(), cancelado_en = null, cancelado_por = null,
           asistencia = null, horas = null, marcado_por = null, marcado_en = null
     where id = v_previa.id
    returning id into v_id;
  else
    insert into public.inscripciones (puesto_id, voluntario_id, origen, token)
    values (p_puesto, p_voluntario, p_origen, public.token_nuevo())
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'turno', public._turno_json(v_id));
end;
$$;

revoke all on function public._ahora_ensenada()                       from public, anon, authenticated;
revoke all on function public._dia_puesto(uuid)                       from public, anon, authenticated;
revoke all on function public._duracion_puesto(time, time)            from public, anon, authenticated;
revoke all on function public._choque_voluntario(uuid, uuid, uuid)    from public, anon, authenticated;
revoke all on function public._revisar_voluntario(text, text, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public._voluntario(text, text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public._turno_json(uuid)                       from public, anon, authenticated;
revoke all on function public._inscribir(uuid, uuid, text, boolean)   from public, anon, authenticated;


-- =============================================================================
--  7 · FUNCIONES PÚBLICAS · sin cuenta
-- =============================================================================

-- -----------------------------------------------------------------------------
--  directorio_voluntariado · la bolsa de vacantes de /voluntariado/
--
--  Solo puestos visibles de actividades publicadas de la edición activa, y
--  solo turnos que no han terminado. Los llenos SÍ salen, marcados: que se vea
--  que el festival se mueve, y que la persona busque otro.
--  No incluye «contacto_dia» ni dato alguno de quién se inscribió: solo cuántos.
-- -----------------------------------------------------------------------------
drop function if exists public.directorio_voluntariado();
create or replace function public.directorio_voluntariado()
returns table (
  id uuid, categoria text, titulo text, descripcion text, requisitos text,
  punto_encuentro text, fecha date, hora_inicio text, hora_fin text,
  vacantes integer, ocupadas integer, abierto boolean,
  actividad_id uuid, actividad text, slug text, eje text, eje_color text, tipo text,
  sede text, sede_direccion text, sala text, poster text,
  actividad_inicio text, actividad_fin text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.categoria, p.titulo, p.descripcion, p.requisitos, p.punto_encuentro,
         coalesce(p.fecha, a.fecha),
         to_char(p.hora_inicio, 'HH24:MI'), to_char(p.hora_fin, 'HH24:MI'),
         p.vacantes::int,
         (select count(*) from public.inscripciones i
           where i.puesto_id = p.id and i.estado = 'inscrito')::int,
         (coalesce(p.fecha, a.fecha) + p.hora_inicio) > public._ahora_ensenada(),
         a.id, a.titulo, a.slug, a.eje, e.color, a.tipo,
         a.sede, s.direccion, sa.nombre, a.poster,
         to_char(a.hora_inicio, 'HH24:MI'), to_char(a.hora_fin, 'HH24:MI')
    from public.puestos p
    join public.actividades a on a.id = p.actividad_id
    left join public.ejes e   on e.nombre = a.eje
    left join public.sedes s  on s.nombre = a.sede
    left join public.salas sa on sa.id = a.sala_id
   where p.en_directorio
     and a.publica and not a.archivada
     and a.edicion_id = public.edicion_activa()
     and coalesce(p.fecha, a.fecha) is not null
     and (coalesce(p.fecha, a.fecha) + p.hora_fin) > public._ahora_ensenada()
   order by coalesce(p.fecha, a.fecha), p.hora_inicio, a.titulo, p.orden, p.titulo;
$$;

revoke all on function public.directorio_voluntariado() from public, anon, authenticated;
grant execute on function public.directorio_voluntariado() to anon, authenticated;


-- -----------------------------------------------------------------------------
--  inscribirse_voluntariado · tomar un turno desde el directorio
--
--  Errores que la pantalla traduce: demasiados · consentimiento · mayor_edad
--  · datos (con «campo») · no_existe · cerrado · ya_empezo · lleno
--  · ya_inscrito · empalme (con «choque»).
-- -----------------------------------------------------------------------------
create or replace function public.inscribirse_voluntariado(
  p_puesto               uuid,
  p_nombre               text,
  p_correo               text,
  p_telefono             text,
  p_institucion          uuid,
  p_institucion_otra     text,
  p_carrera              text,
  p_matricula            text,
  p_responsable          text,
  p_responsable_contacto text,
  p_mayor                boolean,
  p_consiento            boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip     text := public.ip_peticion();
  v_campo  text;
  v_ok     boolean;
  v_vol    uuid;
  v_res    jsonb;
begin
  -- El intento se anota ANTES de validar, para que cuenten los fallidos. Por
  -- eso esta función no lanza excepciones (trampa 21).
  if v_ip is not null then
    if (select count(*) from public.intentos
         where ip = v_ip and tipo = 'voluntario' and creado > now() - interval '10 minutes') >= 20 then
      return jsonb_build_object('ok', false, 'error', 'demasiados');
    end if;
    insert into public.intentos (ip, tipo) values (v_ip, 'voluntario');
  end if;

  if not coalesce(p_consiento, false) then
    return jsonb_build_object('ok', false, 'error', 'consentimiento');
  end if;
  if not coalesce(p_mayor, false) then
    return jsonb_build_object('ok', false, 'error', 'mayor_edad');
  end if;

  v_campo := public._revisar_voluntario(p_nombre, p_correo, p_telefono, p_institucion,
                                        p_institucion_otra, p_carrera, p_responsable);
  if v_campo is not null then
    return jsonb_build_object('ok', false, 'error', 'datos', 'campo', v_campo);
  end if;

  -- ¿El puesto se puede tomar desde el directorio?
  select (p.en_directorio and a.publica and not a.archivada
          and a.edicion_id = public.edicion_activa())
    into v_ok
    from public.puestos p join public.actividades a on a.id = p.actividad_id
   where p.id = p_puesto;
  if v_ok is null then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if not v_ok then
    return jsonb_build_object('ok', false, 'error', 'cerrado');
  end if;
  if (public._dia_puesto(p_puesto) + (select hora_inicio from public.puestos where id = p_puesto))
     <= public._ahora_ensenada() then
    return jsonb_build_object('ok', false, 'error', 'ya_empezo');
  end if;

  -- Subbloque: si algo inesperado truena (una restricción), se deshace solo
  -- lo de adentro y el intento ya anotado se conserva.
  begin
    v_vol := public._voluntario(p_nombre, p_correo, p_telefono, p_institucion, p_institucion_otra,
                                p_carrera, p_matricula, p_responsable, p_responsable_contacto);
    v_res := public._inscribir(p_puesto, v_vol, 'directorio', false);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'datos', 'campo', null);
  end;
  return v_res;
end;
$$;

revoke all on function public.inscribirse_voluntariado(uuid, text, text, text, uuid, text, text, text, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.inscribirse_voluntariado(uuid, text, text, text, uuid, text, text, text, text, text, boolean, boolean)
  to anon, authenticated;


-- -----------------------------------------------------------------------------
--  ver_turnos · el estado actual de los turnos guardados en el teléfono
--
--  Recibe varios tokens de una vez (los de «Mis turnos»). Un token que no
--  existe simplemente no vuelve. Tope de 30: nadie guarda más, y así no sirve
--  para probar tokens al por mayor.
-- -----------------------------------------------------------------------------
create or replace function public.ver_turnos(p_tokens text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_tokens is null or array_length(p_tokens, 1) is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public._turno_json(i.id) order by p.hora_inicio)
      from public.inscripciones i
      join public.puestos p on p.id = i.puesto_id
     where i.token = any (p_tokens[1:30])
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.ver_turnos(text[]) from public, anon, authenticated;
grant execute on function public.ver_turnos(text[]) to anon, authenticated;


-- -----------------------------------------------------------------------------
--  cancelar_turno · «ya no puedo ir»
--
--  Libera el lugar al instante. Ya empezado el turno no se cancela en línea:
--  a esas horas hay que avisarle a la persona de contacto.
-- -----------------------------------------------------------------------------
create or replace function public.cancelar_turno(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i public.inscripciones%rowtype;
begin
  select * into v_i from public.inscripciones where token = p_token for update;
  if v_i.id is null then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if v_i.estado = 'cancelado' then
    return jsonb_build_object('ok', true, 'turno', public._turno_json(v_i.id));
  end if;
  if (public._dia_puesto(v_i.puesto_id) + (select hora_inicio from public.puestos where id = v_i.puesto_id))
     <= public._ahora_ensenada() then
    return jsonb_build_object('ok', false, 'error', 'ya_empezo');
  end if;
  update public.inscripciones
     set estado = 'cancelado', cancelado_en = now(), cancelado_por = 'voluntario'
   where id = v_i.id;
  return jsonb_build_object('ok', true, 'turno', public._turno_json(v_i.id));
end;
$$;

revoke all on function public.cancelar_turno(text) from public, anon, authenticated;
grant execute on function public.cancelar_turno(text) to anon, authenticated;


-- =============================================================================
--  8 · FUNCIONES DEL PANEL · coordinador dueño o administración
--
--  Cada una vuelve a preguntar puede_editar_actividad(): la pantalla solo
--  pinta, la regla vive aquí.
-- =============================================================================

-- La actividad de un puesto, si quien pregunta la puede editar.
create or replace function public._puesto_editable(p_puesto uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.puestos p
                  where p.id = p_puesto
                    and public.puede_editar_actividad(p.actividad_id::text));
$$;
revoke all on function public._puesto_editable(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
--  voluntarios_de_actividad · la gente de todos los puestos de una actividad
--
--  Con todos sus datos de contacto: el coordinador los necesita para
--  coordinar. Incluye las canceladas, para el historial.
-- -----------------------------------------------------------------------------
create or replace function public.voluntarios_de_actividad(p_actividad uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_editar_actividad(p_actividad::text) then
    return jsonb_build_object('ok', false, 'error', 'permiso');
  end if;
  return jsonb_build_object('ok', true, 'inscripciones', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'puesto_id', i.puesto_id, 'estado', i.estado, 'origen', i.origen,
             'creado', i.creado, 'cancelado_en', i.cancelado_en, 'cancelado_por', i.cancelado_por,
             'asistencia', i.asistencia, 'horas', i.horas, 'nota', i.nota,
             'voluntario', jsonb_build_object(
               'id', v.id, 'nombre', v.nombre, 'correo', v.correo, 'telefono', v.telefono,
               'institucion', coalesce(ins.nombre, v.institucion_otra),
               'carrera', v.carrera, 'matricula', v.matricula,
               'responsable', v.responsable, 'responsable_contacto', v.responsable_contacto))
           order by i.estado, v.nombre)
      from public.inscripciones i
      join public.puestos p     on p.id = i.puesto_id
      join public.voluntarios v on v.id = i.voluntario_id
      left join public.instituciones ins on ins.id = v.institucion_id
     where p.actividad_id = p_actividad
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.voluntarios_de_actividad(uuid) from public, anon, authenticated;
grant execute on function public.voluntarios_de_actividad(uuid) to authenticated;


-- -----------------------------------------------------------------------------
--  asignar_voluntario · el coordinador da de alta a alguien a mano
--
--  Para quien se apuntó por WhatsApp o en persona. Si el correo ya existe, se
--  usa esa persona (sin pisar sus datos). Con «p_sobrecupo» se puede pasar de
--  las vacantes: la pantalla lo pregunta antes. Los empalmes NO se pueden
--  saltar: una persona no puede estar en dos lugares.
-- -----------------------------------------------------------------------------
create or replace function public.asignar_voluntario(
  p_puesto               uuid,
  p_nombre               text,
  p_correo               text,
  p_telefono             text,
  p_institucion          uuid,
  p_institucion_otra     text,
  p_carrera              text,
  p_matricula            text,
  p_responsable          text,
  p_responsable_contacto text,
  p_mayor                boolean,
  p_sobrecupo            boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo text;
  v_vol   uuid;
  v_res   jsonb;
begin
  if not public._puesto_editable(p_puesto) then
    return jsonb_build_object('ok', false, 'error', 'permiso');
  end if;
  if not coalesce(p_mayor, false) then
    return jsonb_build_object('ok', false, 'error', 'mayor_edad');
  end if;
  v_campo := public._revisar_voluntario(p_nombre, p_correo, p_telefono, p_institucion,
                                        p_institucion_otra, p_carrera, p_responsable);
  if v_campo is not null then
    return jsonb_build_object('ok', false, 'error', 'datos', 'campo', v_campo);
  end if;
  begin
    v_vol := public._voluntario(p_nombre, p_correo, p_telefono, p_institucion, p_institucion_otra,
                                p_carrera, p_matricula, p_responsable, p_responsable_contacto);
    v_res := public._inscribir(p_puesto, v_vol, 'panel', coalesce(p_sobrecupo, false));
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'datos', 'campo', null);
  end;
  return v_res;
end;
$$;

revoke all on function public.asignar_voluntario(uuid, text, text, text, uuid, text, text, text, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.asignar_voluntario(uuid, text, text, text, uuid, text, text, text, text, text, boolean, boolean)
  to authenticated;


-- -----------------------------------------------------------------------------
--  quitar_voluntario · liberar el lugar (queda en el historial como cancelado)
-- -----------------------------------------------------------------------------
create or replace function public.quitar_voluntario(p_inscripcion uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_puesto uuid;
begin
  select puesto_id into v_puesto from public.inscripciones where id = p_inscripcion for update;
  if v_puesto is null or not public._puesto_editable(v_puesto) then
    return jsonb_build_object('ok', false, 'error', 'permiso');
  end if;
  update public.inscripciones
     set estado = 'cancelado', cancelado_en = now(), cancelado_por = 'coordinacion'
   where id = p_inscripcion and estado = 'inscrito';
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.quitar_voluntario(uuid) from public, anon, authenticated;
grant execute on function public.quitar_voluntario(uuid) to authenticated;


-- -----------------------------------------------------------------------------
--  mover_voluntario · pasar a alguien a otro puesto
--
--  A un puesto que quien mueve también controle (de esta u otra de sus
--  actividades). Se revisan cupo y empalmes como si se inscribiera de nuevo,
--  sin contar el turno que deja.
-- -----------------------------------------------------------------------------
create or replace function public.mover_voluntario(p_inscripcion uuid, p_puesto uuid, p_sobrecupo boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i      public.inscripciones%rowtype;
  v_p      public.puestos%rowtype;
  v_ocup   integer;
  v_choque jsonb;
begin
  select * into v_i from public.inscripciones where id = p_inscripcion for update;
  if v_i.id is null or not public._puesto_editable(v_i.puesto_id) or not public._puesto_editable(p_puesto) then
    return jsonb_build_object('ok', false, 'error', 'permiso');
  end if;
  if v_i.estado <> 'inscrito' then
    return jsonb_build_object('ok', false, 'error', 'cancelada');
  end if;
  if v_i.puesto_id = p_puesto then
    return jsonb_build_object('ok', true);
  end if;

  select * into v_p from public.puestos where id = p_puesto for update;
  if exists (select 1 from public.inscripciones
              where puesto_id = p_puesto and voluntario_id = v_i.voluntario_id and estado = 'inscrito') then
    return jsonb_build_object('ok', false, 'error', 'ya_inscrito');
  end if;
  select count(*) into v_ocup from public.inscripciones where puesto_id = p_puesto and estado = 'inscrito';
  if v_ocup >= v_p.vacantes and not coalesce(p_sobrecupo, false) then
    return jsonb_build_object('ok', false, 'error', 'lleno');
  end if;
  v_choque := public._choque_voluntario(v_i.voluntario_id, p_puesto, v_i.id);
  if v_choque is not null then
    return jsonb_build_object('ok', false, 'error', 'empalme', 'choque', v_choque);
  end if;

  -- Si ya tenía una fila cancelada en el destino, el unique no dejaría
  -- mover: esa fila vieja se borra, la historia sigue en la que se mueve.
  delete from public.inscripciones
   where puesto_id = p_puesto and voluntario_id = v_i.voluntario_id and estado = 'cancelado';
  update public.inscripciones
     set puesto_id = p_puesto, asistencia = null, horas = null, marcado_por = null, marcado_en = null
   where id = v_i.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.mover_voluntario(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.mover_voluntario(uuid, uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
--  marcar_asistencia · «cumplió» o «no llegó», y cuántas horas
--
--  Al marcar «cumplió» sin horas, se ponen las que dura el puesto. Con
--  p_asistencia nula se borra la marca (por si se marcó a la persona
--  equivocada).
-- -----------------------------------------------------------------------------
create or replace function public.marcar_asistencia(p_inscripcion uuid, p_asistencia text,
                                                    p_horas numeric default null, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i public.inscripciones%rowtype;
  v_p public.puestos%rowtype;
begin
  select * into v_i from public.inscripciones where id = p_inscripcion for update;
  if v_i.id is null or not public._puesto_editable(v_i.puesto_id) then
    return jsonb_build_object('ok', false, 'error', 'permiso');
  end if;
  if v_i.estado <> 'inscrito' then
    return jsonb_build_object('ok', false, 'error', 'cancelada');
  end if;
  if p_asistencia is not null and p_asistencia not in ('cumplio', 'falto') then
    return jsonb_build_object('ok', false, 'error', 'datos', 'campo', 'asistencia');
  end if;
  if p_horas is not null and (p_horas < 0 or p_horas > 24) then
    return jsonb_build_object('ok', false, 'error', 'datos', 'campo', 'horas');
  end if;
  select * into v_p from public.puestos where id = v_i.puesto_id;

  update public.inscripciones
     set asistencia  = p_asistencia,
         horas       = case p_asistencia
                         when 'cumplio' then coalesce(p_horas, public._duracion_puesto(v_p.hora_inicio, v_p.hora_fin))
                         when 'falto'   then 0
                         else null end,
         nota        = coalesce(nullif(btrim(p_nota), ''), nota),
         marcado_por = case when p_asistencia is null then null else auth.uid() end,
         marcado_en  = case when p_asistencia is null then null else now() end
   where id = v_i.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.marcar_asistencia(uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.marcar_asistencia(uuid, text, numeric, text) to authenticated;


-- -----------------------------------------------------------------------------
--  eliminar_puesto · solo si nadie está inscrito
--
--  Con gente adentro se niega: borrar el puesto borraría también sus turnos y
--  sus horas, que una institución puede necesitar para acreditar el servicio
--  social. Primero se quita o se mueve a la gente; o se oculta el puesto.
-- -----------------------------------------------------------------------------
create or replace function public.eliminar_puesto(p_puesto uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public._puesto_editable(p_puesto) then
    return jsonb_build_object('ok', false, 'error', 'permiso');
  end if;
  select count(*) into v_n from public.inscripciones where puesto_id = p_puesto and estado = 'inscrito';
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'error', 'tiene_inscritos', 'cuantos', v_n);
  end if;
  delete from public.puestos where id = p_puesto;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.eliminar_puesto(uuid) from public, anon, authenticated;
grant execute on function public.eliminar_puesto(uuid) to authenticated;


-- -----------------------------------------------------------------------------
--  ocupacion_puestos · vacantes ocupadas de varios puestos de una vez
--
--  Para el panel: los puestos se leen directo (RLS), pero contar
--  inscripciones necesita esta función, porque el coordinador no lee esa
--  tabla.
-- -----------------------------------------------------------------------------
create or replace function public.ocupacion_puestos(p_puestos uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(p.id::text, (select count(*) from public.inscripciones i
                                           where i.puesto_id = p.id and i.estado = 'inscrito')), '{}'::jsonb)
    from public.puestos p
   where p.id = any (p_puestos)
     and public.puede_editar_actividad(p.actividad_id::text);
$$;

revoke all on function public.ocupacion_puestos(uuid[]) from public, anon, authenticated;
grant execute on function public.ocupacion_puestos(uuid[]) to authenticated;


-- =============================================================================
--  9 · COMPROBACIÓN · todas deben decir BIEN
-- =============================================================================
select 1 as orden, 'Tablas del voluntariado' as revision,
       (select count(*) from pg_tables where schemaname = 'public'
         and tablename in ('instituciones','puestos','voluntarios','inscripciones'))::text || ' de 4' as valor,
       case when (select count(*) from pg_tables where schemaname = 'public'
                   and tablename in ('instituciones','puestos','voluntarios','inscripciones')) = 4
            then 'BIEN' else 'REVISAR' end as resultado

union all
select 2, 'Con reglas por fila (RLS)',
       coalesce((select string_agg(relname, ', ') from pg_class
                  where relname in ('instituciones','puestos','voluntarios','inscripciones')
                    and relnamespace = 'public'::regnamespace and not relrowsecurity), 'las cuatro'),
       case when exists (select 1 from pg_class
                          where relname in ('instituciones','puestos','voluntarios','inscripciones')
                            and relnamespace = 'public'::regnamespace and not relrowsecurity)
            then 'REVISAR' else 'BIEN' end

union all
-- Lo importante: sin cuenta no se lee NADA de las personas ni de los puestos.
select 3, 'Sin cuenta no se leen voluntarios, inscripciones ni puestos',
       coalesce((select string_agg(t, ', ') from unnest(array['voluntarios','inscripciones','puestos']) t
                  where has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete')), 'ninguna'),
       case when exists (select 1 from unnest(array['voluntarios','inscripciones','puestos']) t
                          where has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete'))
            then 'REVISAR: FUGA' else 'BIEN' end

union all
select 4, 'Piezas internas cerradas al público',
       coalesce((select string_agg(distinct proname, ', ') from pg_proc
                  where pronamespace = 'public'::regnamespace
                    and proname in ('_inscribir','_voluntario','_turno_json','_choque_voluntario',
                                    '_revisar_voluntario','_puesto_editable','_dia_puesto')
                    and has_function_privilege('anon', oid, 'execute')), 'cerradas'),
       case when exists (select 1 from pg_proc
                          where pronamespace = 'public'::regnamespace
                            and proname in ('_inscribir','_voluntario','_turno_json','_choque_voluntario',
                                            '_revisar_voluntario','_puesto_editable','_dia_puesto')
                            and has_function_privilege('anon', oid, 'execute'))
            then 'REVISAR' else 'BIEN' end

union all
select 5, 'Las funciones del panel no se abren sin cuenta',
       coalesce((select string_agg(distinct proname, ', ') from pg_proc
                  where pronamespace = 'public'::regnamespace
                    and proname in ('voluntarios_de_actividad','asignar_voluntario','quitar_voluntario',
                                    'mover_voluntario','marcar_asistencia','eliminar_puesto','ocupacion_puestos')
                    and has_function_privilege('anon', oid, 'execute')), 'cerradas'),
       case when exists (select 1 from pg_proc
                          where pronamespace = 'public'::regnamespace
                            and proname in ('voluntarios_de_actividad','asignar_voluntario','quitar_voluntario',
                                            'mover_voluntario','marcar_asistencia','eliminar_puesto','ocupacion_puestos')
                            and has_function_privilege('anon', oid, 'execute'))
            then 'REVISAR' else 'BIEN' end

union all
select 6, 'Instituciones sembradas (informativo)',
       (select count(*)::text from public.instituciones), 'BIEN'

order by orden;
