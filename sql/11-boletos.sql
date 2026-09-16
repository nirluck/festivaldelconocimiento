-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 11 · BOLETOS Y ASISTENCIA (fase F1)
--
--  Ejecuta este archivo COMPLETO sobre la base ya migrada con 10-poster.sql.
--  Se puede volver a ejecutar sin romper nada ni perder boletos.
--
--  Lo que hace, en orden:
--
--    1. Dos funciones pequeñas: el token secreto y el código de puerta.
--    2. «actividades» gana el modo de acceso y la ventana de boletos;
--       «ediciones» gana el tope de boletos por persona.
--    3. El catálogo de opciones del formulario (edad, ocupación, procedencia).
--    4. Las tablas del módulo: aforos, asistentes, puertas, boletos, intentos.
--    5. Las reglas de acceso de cada una.
--    6. Las funciones que emiten, muestran y cancelan boletos (público).
--    7. Las funciones de la puerta (personal y voluntarios con clave).
--    8. Las funciones del panel (coordinador y administración).
--    9. «vista_programa» con disponibilidad, y «vista_aforo» para el panel.
--   10. Comprobaciones.
--
--  El razonamiento completo está en PLAN.md, fase F.
--
--  ---------------------------------------------------------------------------
--  DOS COSAS DE SUPABASE QUE ESTE ARCHIVO TOMA EN CUENTA
--
--  · Supabase da, por omisión, TODOS los permisos sobre cada tabla y función
--    nueva de «public» a «anon» y «authenticated». Un «revoke … from public»
--    no los quita: hay que nombrarlos. Por eso cada tabla y cada función de
--    aquí lleva su «revoke» explícito antes de su «grant».
--
--  · Las funciones públicas NO lanzan excepciones para decir «no»: devuelven
--    {ok: false, error: '<código>'}. Una excepción desharía la transacción
--    completa, incluido el registro del intento, y el límite por IP dejaría de
--    contar justo los intentos fallidos. El sitio traduce los códigos con
--    explicar(), como el resto de los errores.
--
--  ---------------------------------------------------------------------------
--  POR QUÉ NINGÚN DISPARADOR DE «actividades» SE LEVANTA ESTA VEZ
--
--  Las migraciones 07 y 09 levantaban los disparadores porque hacían UPDATE
--  sobre las actividades (trampas 1 y 7 del plan). Esta no: agrega columnas
--  con valor constante, lo que PostgreSQL resuelve sin reescribir ni tocar las
--  filas. «actualizado» no cambia y el semáforo no se entera.
-- =============================================================================


-- =============================================================================
--  1 · TOKEN Y CÓDIGO
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Token secreto: 64 caracteres hexadecimales, 244 bits al azar.
--  Se arma con dos gen_random_uuid(), que usa el generador criptográfico de
--  PostgreSQL y no depende de la extensión pgcrypto ni de su esquema.
-- -----------------------------------------------------------------------------
create or replace function public.token_nuevo()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
$$;

revoke all on function public.token_nuevo() from public, anon, authenticated;


-- =============================================================================
--  2 · COLUMNAS NUEVAS
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Modo de acceso
--    libre     sin boleto ni registro: «Entrada libre»
--    registro  confirma asistencia, sin tope: mide intención
--    boleto    con cupo: controla el aforo
--
--  «cupo» ya existe (08-cupo.sql). Por decisión del equipo trae el sobrecupo
--  incluido: el sistema emite exactamente ese número.
-- -----------------------------------------------------------------------------
alter table public.actividades add column if not exists acceso        text not null default 'libre';
alter table public.actividades add column if not exists boletos_desde timestamptz;
alter table public.actividades add column if not exists boletos_hasta timestamptz;
alter table public.actividades add column if not exists lugares_max   smallint not null default 4;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'actividades_acceso_valido') then
    alter table public.actividades
      add constraint actividades_acceso_valido
      check (acceso in ('libre', 'registro', 'boleto'));
  end if;

  -- Un boleto sin cupo no significa nada: no habría con qué contar.
  if not exists (select 1 from pg_constraint where conname = 'actividades_boleto_con_cupo') then
    alter table public.actividades
      add constraint actividades_boleto_con_cupo
      check (acceso <> 'boleto' or coalesce(cupo, 0) > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'actividades_lugares_max_valido') then
    alter table public.actividades
      add constraint actividades_lugares_max_valido
      check (lugares_max between 1 and 10);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'actividades_ventana_boletos') then
    alter table public.actividades
      add constraint actividades_ventana_boletos
      check (boletos_desde is null or boletos_hasta is null or boletos_hasta > boletos_desde);
  end if;
end $$;

comment on column public.actividades.acceso is
  'libre = entrada libre · registro = confirma asistencia sin tope · boleto = con cupo.';
comment on column public.actividades.boletos_desde is
  'Cuándo se abren los boletos. Nulo = desde que se publica.';
comment on column public.actividades.boletos_hasta is
  'Cuándo se cierran. Nulo = a la hora de inicio de la actividad.';
comment on column public.actividades.lugares_max is
  'Cuántos lugares puede pedir una persona en un solo boleto (ella y sus acompañantes).';


alter table public.ediciones add column if not exists boletos_por_persona smallint not null default 8;

comment on column public.ediciones.boletos_por_persona is
  'Cuántos boletos activos puede tener un mismo correo en la edición. Frena el acaparamiento.';


-- -----------------------------------------------------------------------------
--  Ventana de boletos. Funciones y no columnas calculadas porque dependen de
--  la hora actual. Las usan la vista y las funciones de emisión, así que la
--  regla se dice una sola vez.
--
--  «timestamp at time zone 'America/Tijuana'» interpreta la fecha y hora de la
--  actividad como hora de Ensenada, con su horario de verano, y la convierte
--  en un instante real.
-- -----------------------------------------------------------------------------
create or replace function public.inicio_actividad(p_fecha date, p_hora time)
returns timestamptz
language sql
immutable
as $$
  select case when p_fecha is null then null
              else (p_fecha + coalesce(p_hora, time '00:00')) at time zone 'America/Tijuana'
         end;
$$;

-- Cuándo termina. Sin hora de término se supone una hora, que es lo que dura
-- una charla (la misma suposición del programa). OJO: no se puede escribir
-- «coalesce(inicio_actividad(fecha, hora_fin), …)», porque inicio_actividad
-- con hora nula devuelve la medianoche, no nulo, y la actividad «terminaría»
-- antes de empezar. Así se escapaba el empalme en la primera prueba.
create or replace function public.fin_actividad(p_fecha date, p_ini time, p_fin time)
returns timestamptz
language sql
immutable
as $$
  select case
           when p_fecha is null or p_ini is null then null
           when p_fin is null or p_fin <= p_ini
             then public.inicio_actividad(p_fecha, p_ini) + interval '1 hour'
           else public.inicio_actividad(p_fecha, p_fin)
         end;
$$;

create or replace function public.boletos_apertura(p_desde timestamptz, p_publicada timestamptz)
returns timestamptz
language sql
immutable
as $$
  select coalesce(p_desde, p_publicada);
$$;

create or replace function public.boletos_cierre(p_hasta timestamptz, p_fecha date, p_hora time)
returns timestamptz
language sql
immutable
as $$
  select coalesce(p_hasta, public.inicio_actividad(p_fecha, p_hora));
$$;

revoke all on function public.inicio_actividad(date, time)                      from public, anon, authenticated;
revoke all on function public.fin_actividad(date, time, time)                    from public, anon, authenticated;
revoke all on function public.boletos_apertura(timestamptz, timestamptz)        from public, anon, authenticated;
revoke all on function public.boletos_cierre(timestamptz, date, time)           from public, anon, authenticated;
-- La vista del programa las llama con los permisos de quien consulta.
grant execute on function public.inicio_actividad(date, time)                   to anon, authenticated;
grant execute on function public.boletos_apertura(timestamptz, timestamptz)     to anon, authenticated;
grant execute on function public.boletos_cierre(timestamptz, date, time)        to anon, authenticated;


-- =============================================================================
--  3 · OPCIONES DEL FORMULARIO
--
--  Los catálogos son datos, no código (sección 3 del plan). Una sola tabla
--  para los tres campos: son listas cortas que se leen juntas.
--
--  Las opciones sembradas son la PROPUESTA del 16 de septiembre y están por
--  confirmar. Cambiarlas es editar filas, no migrar. «valor» es lo que se
--  guarda en «asistentes»; si se renombra una opción ya usada, conviene
--  desactivarla y crear otra, para que los reportes no mezclen significados.
-- =============================================================================
create table if not exists public.opciones_asistencia (
  campo   text     not null check (campo in ('edad', 'ocupacion', 'procedencia')),
  valor   text     not null,
  orden   smallint not null default 0,
  activa  boolean  not null default true,
  primary key (campo, valor)
);

--  Edad: es la de QUIEN PIDE el boleto. No hay «0 a 12»: niñas y niños van
--  como acompañantes de una persona adulta y no llenan el formulario (así lo
--  dice el aviso de privacidad, sección 9).
insert into public.opciones_asistencia (campo, valor, orden) values
  ('edad', '13 a 17 años',  2),
  ('edad', '18 a 29 años',  3),
  ('edad', '30 a 59 años',  4),
  ('edad', '60 años o más', 5),

  ('ocupacion', 'Estudiante',               1),
  ('ocupacion', 'Docente',                  2),
  ('ocupacion', 'Investigación o academia', 3),
  ('ocupacion', 'Otro empleo',              4),
  ('ocupacion', 'Hogar',                    5),
  ('ocupacion', 'Jubilada o jubilado',      6),
  ('ocupacion', 'Otra',                     7),

  ('procedencia', 'Ensenada',                    1),
  ('procedencia', 'Tijuana',                     2),
  ('procedencia', 'Mexicali',                    3),
  ('procedencia', 'Tecate',                      4),
  ('procedencia', 'Playas de Rosarito',          5),
  ('procedencia', 'San Quintín',                 6),
  ('procedencia', 'San Felipe',                  7),
  ('procedencia', 'Otro estado de México',       8),
  ('procedencia', 'Otro país',                   9)
on conflict (campo, valor) do nothing;

alter table public.opciones_asistencia enable row level security;

drop policy if exists opciones_asistencia_leer on public.opciones_asistencia;
create policy opciones_asistencia_leer on public.opciones_asistencia
  for select to anon, authenticated
  using (true);

drop policy if exists opciones_asistencia_escribir on public.opciones_asistencia;
create policy opciones_asistencia_escribir on public.opciones_asistencia
  for all to authenticated
  using ( public.es_administrador() )
  with check ( public.es_administrador() );

revoke all on public.opciones_asistencia from anon, authenticated;
grant select on public.opciones_asistencia to anon;
grant select, insert, update, delete on public.opciones_asistencia to authenticated;


-- =============================================================================
--  4 · TABLAS
-- =============================================================================

-- -----------------------------------------------------------------------------
--  AFOROS · los contadores de cada actividad
--
--  Tabla aparte y no columnas en «actividades»: cada boleto actualizaría la
--  actividad, «marcar_actualizado» pondría la hora, y el semáforo creería que
--  el coordinador trabajó (trampa 7).
--
--  Además su fila es EL CANDADO de la emisión: «select … for update» sobre
--  ella hace que las peticiones de una misma actividad pasen de una en una,
--  sin detener a las de otras actividades.
--
--  Los tres cuentan LUGARES, no boletos: un boleto de 3 lugares suma 3.
-- -----------------------------------------------------------------------------
create table if not exists public.aforos (
  actividad_id uuid primary key references public.actividades(id) on delete cascade,
  emitidos     integer     not null default 0 check (emitidos   >= 0),
  en_espera    integer     not null default 0 check (en_espera  >= 0),
  asistieron   integer     not null default 0 check (asistieron >= 0),
  actualizado  timestamptz not null default now()
);

comment on table public.aforos is
  'Contadores por actividad, en lugares. Los escriben solo las funciones de boletos, bajo candado.';

-- Toda actividad tiene su fila, las de antes y las que vengan.
insert into public.aforos (actividad_id)
select id from public.actividades
on conflict (actividad_id) do nothing;

create or replace function public.crear_aforo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.aforos (actividad_id) values (new.id)
  on conflict (actividad_id) do nothing;
  return new;
end;
$$;

revoke all on function public.crear_aforo() from public, anon, authenticated;

drop trigger if exists actividades_crear_aforo on public.actividades;
create trigger actividades_crear_aforo
  after insert on public.actividades
  for each row execute function public.crear_aforo();


-- -----------------------------------------------------------------------------
--  ASISTENTES · la persona, una sola vez
--
--  El correo se guarda en minúsculas y sin espacios: es la llave para cruzar
--  con voluntarios y ponentes (sección 4 del plan).
--
--  Los datos demográficos admiten nulo porque un boleto de grupo o uno emitido
--  desde el panel no los pide; el formulario público sí los exige.
--
--  «token» es personal y servirá para «todos mis boletos» cuando exista el
--  correo. Ninguna función lo devuelve hoy.
-- -----------------------------------------------------------------------------
create table if not exists public.asistentes (
  id                uuid primary key default gen_random_uuid(),
  nombre            text        not null,
  correo            text        not null,
  telefono          text,
  edad_rango        text,
  ocupacion         text,
  procedencia       text,
  consentimiento_en timestamptz not null,
  token             text        not null default public.token_nuevo(),
  creado            timestamptz not null default now(),
  constraint asistentes_correo_unico  unique (correo),
  constraint asistentes_token_unico   unique (token),
  constraint asistentes_correo_normal check (correo = lower(btrim(correo))),
  constraint asistentes_correo_valido check (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(correo) <= 254),
  constraint asistentes_nombre_valido check (length(btrim(nombre)) between 2 and 120)
);

comment on table public.asistentes is
  'Público del festival. Una fila por correo, acumula entre ediciones. Datos personales: ver sección 8 del plan.';


-- -----------------------------------------------------------------------------
--  PUERTAS · claves para que un voluntario sin cuenta registre entradas
--
--  Una clave abre la puerta de UNA actividad. Se revoca apagando «activa» y
--  caduca sola en «vence»: por omisión, a las 6 de la mañana del día
--  siguiente a la actividad.
-- -----------------------------------------------------------------------------
create table if not exists public.puertas (
  id           uuid primary key default gen_random_uuid(),
  actividad_id uuid        not null references public.actividades(id) on delete cascade,
  token        text        not null,
  etiqueta     text        not null default '',
  activa       boolean     not null default true,
  vence        timestamptz,
  creado       timestamptz not null default now(),
  creado_por   uuid references public.perfiles(id) on delete set null,
  constraint puertas_token_unico unique (token)
);

create index if not exists puertas_actividad on public.puertas (actividad_id);

-- Sin valor por omisión a propósito: quien inserta aquí es un coordinador, y
-- un DEFAULT se evalúa con SUS permisos, que no alcanzan token_nuevo(). La
-- clave la pone el disparador de abajo, que corre como dueño. (El «alter» es
-- para bases donde una versión previa de este archivo sí dejó el DEFAULT.)
alter table public.puertas alter column token drop default;

create or replace function public.preparar_puerta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- La clave la genera siempre la base: nunca la elige quien la crea.
    new.token      := public.token_nuevo();
    new.creado_por := auth.uid();
    if new.vence is null then
      select public.inicio_actividad(a.fecha + 1, time '06:00')
        into new.vence
        from public.actividades a
       where a.id = new.actividad_id;
    end if;
  else
    -- La clave y la actividad no se cambian: para eso se crea otra puerta.
    new.token        := old.token;
    new.actividad_id := old.actividad_id;
    new.creado_por   := old.creado_por;
  end if;
  return new;
end;
$$;

revoke all on function public.preparar_puerta() from public, anon, authenticated;

drop trigger if exists puertas_preparar on public.puertas;
create trigger puertas_preparar
  before insert or update on public.puertas
  for each row execute function public.preparar_puerta();


-- -----------------------------------------------------------------------------
--  BOLETOS · la participación de una persona en una actividad
--
--  «nombre» se guarda en el boleto además de en la persona: es el que se
--  escribió EN ESTA solicitud. Si alguien usó antes el correo de otra persona,
--  la puerta ve el nombre de quien pidió este boleto, no el de aquella.
--
--  «asistente_id» es nulo en las entradas sin boleto, y queda en nulo si la
--  persona pide que se borren sus datos: el conteo sobrevive, anónimo.
--
--  estado
--    activo     tiene lugar
--    espera     en lista de espera (sus lugares no cuentan en «emitidos»)
--    cancelado  liberó su lugar
-- -----------------------------------------------------------------------------
create table if not exists public.boletos (
  id            uuid primary key default gen_random_uuid(),
  actividad_id  uuid        not null references public.actividades(id) on delete cascade,
  asistente_id  uuid        references public.asistentes(id) on delete set null,
  nombre        text,
  codigo        text        not null,
  token         text        not null default public.token_nuevo(),
  lugares       smallint    not null default 1,
  estado        text        not null default 'activo',
  origen        text        not null default 'otro',
  creado        timestamptz not null default now(),
  cancelado_en  timestamptz,
  asistio_en    timestamptz,
  asistieron    smallint,
  marcado_por   uuid references public.perfiles(id) on delete set null,
  puerta_id     uuid references public.puertas(id)  on delete set null,
  emitido_por   uuid references public.perfiles(id) on delete set null,
  constraint boletos_codigo_unico   unique (codigo),
  constraint boletos_token_unico    unique (token),
  constraint boletos_una_por_persona unique (actividad_id, asistente_id),
  constraint boletos_lugares_valido check (lugares between 1 and 1000),
  constraint boletos_estado_valido  check (estado in ('activo', 'espera', 'cancelado')),
  constraint boletos_origen_valido  check (origen in ('cartel', 'programa', 'ficha', 'portada',
                                                     'redes', 'puerta', 'grupo', 'panel', 'otro')),
  constraint boletos_asistieron_valido check (asistieron is null or asistieron between 0 and lugares)
);

create index if not exists boletos_actividad on public.boletos (actividad_id, estado);
create index if not exists boletos_asistente on public.boletos (asistente_id) where asistente_id is not null;

comment on column public.boletos.codigo is
  'Seis caracteres sin letras confundibles, para dictarlo en la puerta. No es secreto.';
comment on column public.boletos.token is
  'Secreto. Va en el QR y en la liga del boleto: quien lo tiene, entra y puede cancelar.';


-- -----------------------------------------------------------------------------
--  Código de puerta: 6 caracteres de un alfabeto sin 0/O, 1/I/L.
--  31⁶ ≈ 887 millones de combinaciones. Los primeros seis bytes de un uuid v4
--  son todos aleatorios (la marca de versión está en el séptimo).
-- -----------------------------------------------------------------------------
create or replace function public.codigo_nuevo()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  b bytea;
  c text;
begin
  loop
    b := uuid_send(gen_random_uuid());
    c := '';
    for i in 0..5 loop
      c := c || substr(alfabeto, 1 + get_byte(b, i) % 31, 1);
    end loop;
    exit when not exists (select 1 from public.boletos where codigo = c);
  end loop;
  return c;
end;
$$;

revoke all on function public.codigo_nuevo() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
--  INTENTOS · para el límite por dirección IP
--  Nadie la lee más que la función de emisión. Se purga sola.
-- -----------------------------------------------------------------------------
create table if not exists public.intentos (
  id     bigint generated always as identity primary key,
  ip     text        not null,
  creado timestamptz not null default now()
);

create index if not exists intentos_ip     on public.intentos (ip, creado);
create index if not exists intentos_creado on public.intentos (creado);


-- =============================================================================
--  5 · REGLAS DE ACCESO
--
--  Nadie sin cuenta lee ni escribe asistentes, boletos, puertas ni intentos:
--  todo pasa por las funciones de las secciones 6 a 8.
-- =============================================================================
alter table public.aforos     enable row level security;
alter table public.asistentes enable row level security;
alter table public.puertas    enable row level security;
alter table public.boletos    enable row level security;
alter table public.intentos   enable row level security;

revoke all on public.aforos     from anon, authenticated;
revoke all on public.asistentes from anon, authenticated;
revoke all on public.puertas    from anon, authenticated;
revoke all on public.boletos    from anon, authenticated;
revoke all on public.intentos   from anon, authenticated;


-- AFOROS: son conteos, no datos personales. Sin cuenta, solo de lo publicado.
drop policy if exists aforos_ver_publicas on public.aforos;
create policy aforos_ver_publicas on public.aforos
  for select to anon
  using ( exists (select 1 from public.actividades a
                   where a.id = actividad_id and a.publica and not a.archivada) );

drop policy if exists aforos_ver on public.aforos;
create policy aforos_ver on public.aforos
  for select to authenticated
  using (true);

grant select on public.aforos to anon, authenticated;


-- ASISTENTES: solo la administración, directo. El coordinador ve nombre y
-- correo de SUS boletos a través de boletos_de_actividad(), y la demografía
-- solo en agregado.
drop policy if exists asistentes_admin on public.asistentes;
create policy asistentes_admin on public.asistentes
  for all to authenticated
  using ( public.es_administrador() )
  with check ( public.es_administrador() );

grant select, update, delete on public.asistentes to authenticated;


-- BOLETOS: lectura directa solo la administración. Las escrituras, siempre por
-- función, porque cada una debe mover los contadores bajo candado.
drop policy if exists boletos_admin_ver on public.boletos;
create policy boletos_admin_ver on public.boletos
  for select to authenticated
  using ( public.es_administrador() );

grant select on public.boletos to authenticated;


-- PUERTAS: las administra el coordinador dueño o la administración.
drop policy if exists puertas_gestionar on public.puertas;
create policy puertas_gestionar on public.puertas
  for all to authenticated
  using ( public.puede_editar_actividad(actividad_id::text) )
  with check ( public.puede_editar_actividad(actividad_id::text) );

grant select, insert, update, delete on public.puertas to authenticated;


-- INTENTOS: nadie. RLS activo y sin políticas.


-- Las columnas nuevas de «actividades» que el programa público necesita.
-- Un grant por columna se suma a los de 09 y 10; no los reemplaza.
grant select (acceso, boletos_desde, boletos_hasta, lugares_max) on public.actividades to anon;

-- De paso se retira a «anon» la escritura sobre «actividades» que Supabase
-- concede por omisión. Las reglas por fila ya la bloqueaban (no hay política
-- de escritura para «anon»), pero TRUNCATE no pasa por esas reglas, y nadie
-- sin sesión escribe actividades: el registro crea la cuenta primero.
revoke insert, update, delete, truncate, references, trigger on public.actividades from anon;


-- =============================================================================
--  6 · FUNCIONES PÚBLICAS
-- =============================================================================

-- -----------------------------------------------------------------------------
--  IP de quien hace la petición, según las cabeceras que PostgREST expone.
--  Nulo fuera de la API (por ejemplo, en el editor SQL).
-- -----------------------------------------------------------------------------
create or replace function public.ip_peticion()
returns text
language plpgsql
stable
as $$
declare
  h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if h is null then
    return null;
  end if;
  return nullif(btrim(coalesce(
    h->>'cf-connecting-ip',
    h->>'x-real-ip',
    split_part(h->>'x-forwarded-for', ',', 1)
  )), '');
end;
$$;

revoke all on function public.ip_peticion() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
--  Lo que una pantalla necesita saber de la actividad de un boleto.
-- -----------------------------------------------------------------------------
create or replace function public.actividad_para_boleto(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',             a.id,
    'titulo',         a.titulo,
    'slug',           a.slug,
    'fecha',          a.fecha,
    'hora_inicio',    a.hora_inicio,
    'hora_fin',       a.hora_fin,
    'sede',           a.sede,
    'sede_direccion', s.direccion,
    'eje',            a.eje,
    'eje_color',      e.color,
    'poster',         a.poster,
    'acceso',         a.acceso
  )
  from public.actividades a
  left join public.sedes s on s.nombre = a.sede
  left join public.ejes  e on e.nombre = a.eje
  where a.id = p_id;
$$;

revoke all on function public.actividad_para_boleto(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
--  EMISIÓN · el corazón del módulo. La usan el formulario público y el panel.
--
--  p_panel = true relaja lo que solo tiene sentido para el público: ventana de
--  boletos, tope de lugares por boleto, empalmes, tope por persona y datos
--  demográficos. El cupo se respeta SIEMPRE.
--
--  Interna: no se expone. Las envolturas de abajo deciden quién la llama.
-- -----------------------------------------------------------------------------
create or replace function public._emitir_boleto(
  p_actividad   uuid,
  p_nombre      text,
  p_correo      text,
  p_edad        text,
  p_ocupacion   text,
  p_procedencia text,
  p_lugares     integer,
  p_origen      text,
  p_espera      boolean,
  p_panel       boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre   text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_correo   text := lower(btrim(coalesce(p_correo, '')));
  v_lugares  integer := coalesce(p_lugares, 1);
  v_origen   text := coalesce(p_origen, 'otro');
  a          public.actividades%rowtype;
  f          public.aforos%rowtype;
  v_ed       public.ediciones%rowtype;
  v_asis     uuid;
  b          public.boletos%rowtype;
  v_ini      timestamptz;
  v_fin      timestamptz;
  v_choque   text;
  v_activos  integer;
  v_estado   text;
begin
  -- ---- 1. La actividad, bajo candado ----------------------------------------
  --  Primero el candado de su aforo: desde aquí, las demás peticiones para esta
  --  misma actividad esperan su turno. Todo lo que sigue se decide con los
  --  contadores ya fijos.
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
  if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_correo) > 254 then
    return jsonb_build_object('ok', false, 'error', 'correo');
  end if;

  if not p_panel then
    if not exists (select 1 from public.opciones_asistencia
                    where campo = 'edad' and valor = p_edad and activa) then
      return jsonb_build_object('ok', false, 'error', 'edad');
    end if;
    if not exists (select 1 from public.opciones_asistencia
                    where campo = 'ocupacion' and valor = p_ocupacion and activa) then
      return jsonb_build_object('ok', false, 'error', 'ocupacion');
    end if;
    if v_lugares < 1 or v_lugares > a.lugares_max then
      return jsonb_build_object('ok', false, 'error', 'lugares', 'maximo', a.lugares_max);
    end if;
  elsif v_lugares < 1 or v_lugares > 1000 then
    return jsonb_build_object('ok', false, 'error', 'lugares', 'maximo', 1000);
  end if;

  -- La procedencia es opcional: lo que no esté en el catálogo se descarta.
  if p_procedencia is not null and not exists (
       select 1 from public.opciones_asistencia
        where campo = 'procedencia' and valor = p_procedencia and activa) then
    p_procedencia := null;
  end if;

  -- ---- 3. La persona --------------------------------------------------------
  --  Si el correo ya existe NO se sobrescribe nada: quien escribe un correo
  --  ajeno no puede cambiarle el nombre ni los datos a otra persona.
  insert into public.asistentes (nombre, correo, edad_rango, ocupacion, procedencia, consentimiento_en)
  values (v_nombre, v_correo, p_edad, p_ocupacion, p_procedencia, now())
  on conflict (correo) do nothing
  returning id into v_asis;

  if v_asis is null then
    select id into v_asis from public.asistentes where correo = v_correo;
  end if;

  -- ---- 4. ¿Ya tiene boleto? -------------------------------------------------
  --  No se devuelve el boleto existente: cualquiera que escribiera el correo de
  --  otra persona se lo llevaría.
  select * into b from public.boletos
   where actividad_id = p_actividad and asistente_id = v_asis;

  if found and b.estado <> 'cancelado' then
    return jsonb_build_object('ok', false, 'error', 'duplicado', 'estado', b.estado);
  end if;

  -- ---- 5. Límites contra el acaparamiento ----------------------------------
  if not p_panel then
    select * into v_ed from public.ediciones where id = a.edicion_id;

    select count(*) into v_activos
      from public.boletos x
      join public.actividades y on y.id = x.actividad_id
     where x.asistente_id = v_asis
       and x.estado in ('activo', 'espera')
       and y.edicion_id = a.edicion_id;

    if v_activos >= coalesce(v_ed.boletos_por_persona, 8) then
      return jsonb_build_object('ok', false, 'error', 'tope',
        'maximo', coalesce(v_ed.boletos_por_persona, 8));
    end if;

    -- Empalmes: sin hora de término se supone una hora, como en el programa.
    if a.fecha is not null and a.hora_inicio is not null then
      v_ini := public.inicio_actividad(a.fecha, a.hora_inicio);
      v_fin := public.fin_actividad(a.fecha, a.hora_inicio, a.hora_fin);

      select y.titulo into v_choque
        from public.boletos x
        join public.actividades y on y.id = x.actividad_id
       where x.asistente_id = v_asis
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

  -- ---- 6. ¿Cabe? ------------------------------------------------------------
  if a.acceso = 'boleto' and f.emitidos + v_lugares > a.cupo then
    if not p_espera then
      return jsonb_build_object('ok', false, 'error', 'agotado',
        'disponibles', greatest(a.cupo - f.emitidos, 0));
    end if;
    v_estado := 'espera';
  else
    v_estado := 'activo';
  end if;

  -- ---- 7. El boleto ---------------------------------------------------------
  --  Si la persona había cancelado, se reactiva la misma fila con código y
  --  token nuevos: la liga vieja, que quizá compartió, ya no sirve.
  if b.id is not null then
    update public.boletos
       set nombre = v_nombre, codigo = public.codigo_nuevo(), token = public.token_nuevo(),
           lugares = v_lugares, estado = v_estado, origen = v_origen,
           creado = now(), cancelado_en = null, asistio_en = null, asistieron = null,
           marcado_por = null, puerta_id = null,
           emitido_por = case when p_panel then auth.uid() end
     where id = b.id
     returning * into b;
  else
    insert into public.boletos (actividad_id, asistente_id, nombre, codigo, lugares,
                                estado, origen, emitido_por)
    values (p_actividad, v_asis, v_nombre, public.codigo_nuevo(), v_lugares,
            v_estado, v_origen, case when p_panel then auth.uid() end)
    returning * into b;
  end if;

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

revoke all on function public._emitir_boleto(uuid, text, text, text, text, text, integer, text, boolean, boolean)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
--  solicitar_boleto · lo que llama el formulario público
--
--  p_espera: la primera vez se manda en false. Si la respuesta es «agotado»,
--  la pantalla ofrece la lista de espera y, si la persona acepta, repite la
--  petición con true.
-- -----------------------------------------------------------------------------
create or replace function public.solicitar_boleto(
  p_slug        text,
  p_nombre      text,
  p_correo      text,
  p_edad        text,
  p_ocupacion   text,
  p_procedencia text    default null,
  p_lugares     integer default 1,
  p_origen      text    default 'otro',
  p_consiento   boolean default false,
  p_espera      boolean default false
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
  -- El intento se anota ANTES de cualquier validación, para que cuenten
  -- también los que fallan. Por eso esta función nunca lanza excepciones.
  if v_ip is not null then
    if (select count(*) from public.intentos
         where ip = v_ip and creado > now() - interval '10 minutes') >= 40 then
      return jsonb_build_object('ok', false, 'error', 'demasiados');
    end if;
    insert into public.intentos (ip) values (v_ip);
    -- Limpieza ocasional, para que la tabla no crezca sin fin.
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

  return public._emitir_boleto(v_id, p_nombre, p_correo, p_edad, p_ocupacion,
                               p_procedencia, p_lugares, p_origen,
                               coalesce(p_espera, false), false);
end;
$$;

revoke all on function public.solicitar_boleto(text, text, text, text, text, text, integer, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.solicitar_boleto(text, text, text, text, text, text, integer, text, boolean, boolean)
  to anon, authenticated;


-- -----------------------------------------------------------------------------
--  ver_boleto · la pantalla /boleto/#<token>
--  Solo lo que la pantalla muestra. Ni el correo ni la persona.
-- -----------------------------------------------------------------------------
create or replace function public.ver_boleto(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b        public.boletos%rowtype;
  v_turno  integer;
begin
  if p_token is null or length(p_token) <> 64 then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;

  select * into b from public.boletos where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;

  -- Lugar en la lista de espera: cuántos lugares esperan desde antes.
  if b.estado = 'espera' then
    select coalesce(sum(lugares), 0) + 1 into v_turno
      from public.boletos
     where actividad_id = b.actividad_id and estado = 'espera' and creado < b.creado;
  end if;

  return jsonb_build_object(
    'ok',         true,
    'codigo',     b.codigo,
    'estado',     b.estado,
    'lugares',    b.lugares,
    'nombre',     b.nombre,
    'creado',     b.creado,
    'asistio_en', b.asistio_en,
    'turno',      v_turno,
    'actividad',  public.actividad_para_boleto(b.actividad_id)
  );
end;
$$;

revoke all on function public.ver_boleto(text) from public, anon, authenticated;
grant execute on function public.ver_boleto(text) to anon, authenticated;


-- -----------------------------------------------------------------------------
--  Cancelación interna: libera los lugares bajo el mismo candado que la
--  emisión. Una entrada ya registrada no se cancela: esa persona ya vino.
-- -----------------------------------------------------------------------------
create or replace function public._cancelar_boleto(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_act uuid;
  b     public.boletos%rowtype;
begin
  select actividad_id into v_act from public.boletos where id = p_id;
  if v_act is null then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;

  -- Siempre el aforo primero y luego el boleto: el mismo orden que la
  -- emisión, para que dos operaciones nunca se esperen en cruz.
  perform 1 from public.aforos where actividad_id = v_act for update;
  select * into b from public.boletos where id = p_id for update;

  if b.estado = 'cancelado' then
    return jsonb_build_object('ok', true, 'estado', 'cancelado');
  end if;
  if b.asistio_en is not null then
    return jsonb_build_object('ok', false, 'error', 'ya_entro');
  end if;

  update public.boletos
     set estado = 'cancelado', cancelado_en = now()
   where id = p_id;

  update public.aforos
     set emitidos    = greatest(emitidos  - case when b.estado = 'activo' then b.lugares else 0 end, 0),
         en_espera   = greatest(en_espera - case when b.estado = 'espera' then b.lugares else 0 end, 0),
         actualizado = now()
   where actividad_id = v_act;

  -- Con la fase H, aquí se promueve al primero de la lista de espera y se le
  -- avisa. Sin correo no habría cómo decírselo.
  return jsonb_build_object('ok', true, 'estado', 'cancelado');
end;
$$;

revoke all on function public._cancelar_boleto(uuid) from public, anon, authenticated;


create or replace function public.cancelar_boleto(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_token is null or length(p_token) <> 64 then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  select id into v_id from public.boletos where token = p_token;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  return public._cancelar_boleto(v_id);
end;
$$;

revoke all on function public.cancelar_boleto(text) from public, anon, authenticated;
grant execute on function public.cancelar_boleto(text) to anon, authenticated;


-- =============================================================================
--  7 · LA PUERTA
--
--  «Personal» es el coordinador dueño, la administración, o quien traiga una
--  clave de puerta vigente de ESA actividad. Las funciones se conceden a
--  «anon» porque los voluntarios no tienen cuenta; la comprobación está
--  adentro.
-- =============================================================================
create or replace function public.es_personal(p_actividad uuid, p_clave text)
returns uuid                      -- id de la puerta usada; el uuid nulo si es por cuenta
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_puerta uuid;
begin
  if auth.uid() is not null and public.puede_editar_actividad(p_actividad::text) then
    return '00000000-0000-0000-0000-000000000000'::uuid;
  end if;
  if p_clave is null or length(p_clave) <> 64 then
    return null;
  end if;
  select id into v_puerta
    from public.puertas
   where actividad_id = p_actividad
     and token = p_clave
     and activa
     and (vence is null or vence > now());
  return v_puerta;
end;
$$;

revoke all on function public.es_personal(uuid, text) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
--  Con qué clave entra un voluntario: de la clave sale la actividad.
--  Así la liga /puerta/#<clave> no necesita llevar también el id.
-- -----------------------------------------------------------------------------
create or replace function public.puerta_por_clave(p_clave text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.puertas%rowtype;
begin
  if p_clave is null or length(p_clave) <> 64 then
    return jsonb_build_object('ok', false, 'error', 'clave');
  end if;
  select * into p from public.puertas where token = p_clave;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'clave');
  end if;
  if not p.activa or (p.vence is not null and p.vence <= now()) then
    return jsonb_build_object('ok', false, 'error', 'clave_vencida');
  end if;
  return jsonb_build_object('ok', true, 'actividad_id', p.actividad_id, 'etiqueta', p.etiqueta);
end;
$$;

revoke all on function public.puerta_por_clave(text) from public, anon, authenticated;
grant execute on function public.puerta_por_clave(text) to anon, authenticated;


-- -----------------------------------------------------------------------------
--  lista_puerta · todo lo que la puerta necesita para trabajar sin red
--
--  El token NO viaja: viaja su huella SHA-256. El teléfono calcula la huella
--  del QR que escanea y la busca en su copia. Así, un teléfono de puerta
--  perdido no sirve para cancelar ni para ver los boletos de nadie.
--  Tampoco viaja el correo: la búsqueda por correo es solo con red.
-- -----------------------------------------------------------------------------
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
  select capacidad into v_capacidad from public.sedes where nombre = a.sede;

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
--  marcar_entrada
--
--  p_ref       el token del QR (64 caracteres) o el código dictado (6)
--  p_asistieron cuántos de los lugares entraron. Nulo = todos
--  p_cuando    para las marcas hechas sin red: la hora real de la entrada.
--              Al sincronizar gana la PRIMERA marca.
--  p_admitir   para dejar pasar a alguien de la lista de espera: su boleto
--              pasa a activo y ocupa lugar.
--
--  Respuestas: adelante · ya_entro · otra_actividad · cancelado · espera ·
--              no_existe · sin_permiso
-- -----------------------------------------------------------------------------
create or replace function public.marcar_entrada(
  p_actividad  uuid,
  p_ref        text,
  p_clave      text        default null,
  p_asistieron integer     default null,
  p_cuando     timestamptz default null,
  p_admitir    boolean     default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_puerta uuid := public.es_personal(p_actividad, p_clave);
  v_ref    text := btrim(coalesce(p_ref, ''));
  v_cuando timestamptz := least(coalesce(p_cuando, now()), now());
  v_cuantos integer;
  b        public.boletos%rowtype;
begin
  if v_puerta is null then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;

  perform 1 from public.aforos where actividad_id = p_actividad for update;

  if length(v_ref) = 64 then
    select * into b from public.boletos where token = v_ref for update;
  else
    -- El código se acepta con o sin guion y en minúsculas.
    select * into b from public.boletos
     where codigo = upper(replace(replace(v_ref, '-', ''), ' ', ''))
     for update;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;

  if b.actividad_id <> p_actividad then
    return jsonb_build_object('ok', false, 'error', 'otra_actividad',
      'actividad', public.actividad_para_boleto(b.actividad_id));
  end if;

  if b.estado = 'cancelado' then
    return jsonb_build_object('ok', false, 'error', 'cancelado', 'codigo', b.codigo);
  end if;

  if b.estado = 'espera' and not coalesce(p_admitir, false) then
    return jsonb_build_object('ok', false, 'error', 'espera', 'codigo', b.codigo,
      'nombre', b.nombre, 'lugares', b.lugares);
  end if;

  if b.asistio_en is not null then
    -- Sincronización sin red: si esta marca es anterior, se queda la anterior.
    if v_cuando < b.asistio_en and p_cuando is not null then
      update public.boletos set asistio_en = v_cuando where id = b.id;
    end if;
    return jsonb_build_object('ok', false, 'error', 'ya_entro', 'codigo', b.codigo,
      'nombre', b.nombre, 'lugares', b.lugares, 'asistieron', b.asistieron,
      'asistio_en', least(b.asistio_en, v_cuando));
  end if;

  v_cuantos := greatest(0, least(coalesce(p_asistieron, b.lugares), b.lugares));

  update public.boletos
     set asistio_en  = v_cuando,
         asistieron  = v_cuantos,
         estado      = 'activo',
         marcado_por = auth.uid(),
         puerta_id   = nullif(v_puerta, '00000000-0000-0000-0000-000000000000'::uuid)
   where id = b.id;

  update public.aforos
     set asistieron  = asistieron + v_cuantos,
         emitidos    = emitidos  + case when b.estado = 'espera' then b.lugares else 0 end,
         en_espera   = greatest(en_espera - case when b.estado = 'espera' then b.lugares else 0 end, 0),
         actualizado = now()
   where actividad_id = p_actividad;

  return jsonb_build_object('ok', true, 'resultado', 'adelante', 'codigo', b.codigo,
    'nombre', b.nombre, 'lugares', b.lugares, 'asistieron', v_cuantos,
    'aforo', (select to_jsonb(x) - 'actividad_id' - 'actualizado'
                from public.aforos x where x.actividad_id = p_actividad));
end;
$$;

revoke all on function public.marcar_entrada(uuid, text, text, integer, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.marcar_entrada(uuid, text, text, integer, timestamptz, boolean)
  to anon, authenticated;


-- -----------------------------------------------------------------------------
--  anular_entrada · para corregir una marca equivocada
-- -----------------------------------------------------------------------------
create or replace function public.anular_entrada(p_actividad uuid, p_boleto uuid, p_clave text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.boletos%rowtype;
begin
  if public.es_personal(p_actividad, p_clave) is null then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;

  perform 1 from public.aforos where actividad_id = p_actividad for update;
  select * into b from public.boletos
   where id = p_boleto and actividad_id = p_actividad for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if b.asistio_en is null then
    return jsonb_build_object('ok', true);
  end if;

  -- Una entrada sin boleto no tiene a qué volver: se cancela entera.
  if b.origen = 'puerta' and b.asistente_id is null then
    update public.boletos
       set estado = 'cancelado', cancelado_en = now()
     where id = b.id;
    update public.aforos
       set asistieron = greatest(asistieron - coalesce(b.asistieron, 0), 0),
           emitidos   = greatest(emitidos - b.lugares, 0),
           actualizado = now()
     where actividad_id = p_actividad;
  else
    update public.boletos
       set asistio_en = null, asistieron = null, marcado_por = null, puerta_id = null
     where id = b.id;
    update public.aforos
       set asistieron = greatest(asistieron - coalesce(b.asistieron, 0), 0),
           actualizado = now()
     where actividad_id = p_actividad;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.anular_entrada(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.anular_entrada(uuid, uuid, text) to anon, authenticated;


-- -----------------------------------------------------------------------------
--  entrada_sin_boleto · el «+1» de la puerta
--  Cuenta a quien llega sin boleto y cabe. Sin datos personales.
-- -----------------------------------------------------------------------------
create or replace function public.entrada_sin_boleto(
  p_actividad uuid,
  p_cuantos   integer default 1,
  p_clave     text    default null,
  p_cuando    timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_puerta  uuid := public.es_personal(p_actividad, p_clave);
  v_cuantos integer := coalesce(p_cuantos, 1);
  v_cuando  timestamptz := least(coalesce(p_cuando, now()), now());
  v_id      uuid;
begin
  if v_puerta is null then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  if v_cuantos < 1 or v_cuantos > 100 then
    return jsonb_build_object('ok', false, 'error', 'lugares', 'maximo', 100);
  end if;

  perform 1 from public.aforos where actividad_id = p_actividad for update;

  insert into public.boletos (actividad_id, codigo, lugares, estado, origen,
                              creado, asistio_en, asistieron, marcado_por, puerta_id)
  values (p_actividad, public.codigo_nuevo(), v_cuantos, 'activo', 'puerta',
          v_cuando, v_cuando, v_cuantos, auth.uid(),
          nullif(v_puerta, '00000000-0000-0000-0000-000000000000'::uuid))
  returning id into v_id;

  update public.aforos
     set emitidos    = emitidos   + v_cuantos,
         asistieron  = asistieron + v_cuantos,
         actualizado = now()
   where actividad_id = p_actividad;

  return jsonb_build_object('ok', true, 'id', v_id,
    'aforo', (select to_jsonb(x) - 'actividad_id' - 'actualizado'
                from public.aforos x where x.actividad_id = p_actividad));
end;
$$;

revoke all on function public.entrada_sin_boleto(uuid, integer, text, timestamptz) from public, anon, authenticated;
grant execute on function public.entrada_sin_boleto(uuid, integer, text, timestamptz) to anon, authenticated;


-- -----------------------------------------------------------------------------
--  buscar_en_puerta · para quien perdió su boleto. Solo con red.
--  El correo se muestra enmascarado: basta para que la persona lo reconozca.
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
      select b.id, b.codigo, b.nombre, b.lugares, b.estado, b.asistio_en, b.asistieron,
             case when s.correo is null then null
                  else left(s.correo, 1) || '•••' || substr(s.correo, strpos(s.correo, '@'))
             end as correo
        from public.boletos b
        left join public.asistentes s on s.id = b.asistente_id
       where b.actividad_id = p_actividad
         and b.estado <> 'cancelado'
         and (   b.codigo = upper(replace(replace(v_t, '-', ''), ' ', ''))
              or b.nombre ilike '%' || v_t || '%'
              or s.correo = lower(v_t))
       order by b.nombre
       limit 20
    ) r
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.buscar_en_puerta(uuid, text, text) from public, anon, authenticated;
grant execute on function public.buscar_en_puerta(uuid, text, text) to anon, authenticated;


-- =============================================================================
--  8 · EL PANEL
--
--  Coordinador dueño o administración. Todas empiezan preguntando
--  puede_editar_actividad(), la misma regla que los archivos del póster.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  boletos_de_actividad · la lista del módulo Boletos
--  Nombre y correo sí: el coordinador los necesita. Demografía no: esa va en
--  agregado, en resumen_boletos().
-- -----------------------------------------------------------------------------
create or replace function public.boletos_de_actividad(p_actividad uuid)
returns table (
  id uuid, codigo text, nombre text, correo text, lugares smallint,
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
    select b.id, b.codigo, b.nombre, s.correo, b.lugares,
           b.estado, b.origen, b.creado, b.cancelado_en,
           b.asistio_en, b.asistieron
      from public.boletos b
      left join public.asistentes s on s.id = b.asistente_id
     where b.actividad_id = p_actividad
     order by b.creado;
end;
$$;

revoke all on function public.boletos_de_actividad(uuid) from public, anon, authenticated;
grant execute on function public.boletos_de_actividad(uuid) to authenticated;


-- -----------------------------------------------------------------------------
--  resumen_boletos · los agregados del módulo
-- -----------------------------------------------------------------------------
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

    -- Cuenta PERSONAS que pidieron boleto, no lugares: los datos son de quien
    -- lo pidió, no de sus acompañantes.
    'edad',        public._agrupar_asistentes(p_actividad, 'edad'),
    'ocupacion',   public._agrupar_asistentes(p_actividad, 'ocupacion'),
    'procedencia', public._agrupar_asistentes(p_actividad, 'procedencia'),

    'cancelados', (select count(*) from public.boletos
                    where actividad_id = p_actividad and estado = 'cancelado')
  );
end;
$$;

create or replace function public._agrupar_asistentes(p_actividad uuid, p_campo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(valor, n), '{}'::jsonb) from (
    select coalesce(case p_campo
                      when 'edad'        then s.edad_rango
                      when 'ocupacion'   then s.ocupacion
                      when 'procedencia' then s.procedencia
                    end, 'Sin dato') as valor,
           count(*) as n
      from public.boletos b
      join public.asistentes s on s.id = b.asistente_id
     where b.actividad_id = p_actividad
       and b.estado <> 'cancelado'
     group by 1) t;
$$;

revoke all on function public._agrupar_asistentes(uuid, text) from public, anon, authenticated;
revoke all on function public.resumen_boletos(uuid) from public, anon, authenticated;
grant execute on function public.resumen_boletos(uuid) to authenticated;


-- -----------------------------------------------------------------------------
--  emitir_boleto_panel · un boleto a mano, o uno de grupo
--
--  Sin ventana, sin tope por boleto ni por persona, sin empalmes y sin
--  demografía. El cupo, igual que siempre. El consentimiento lo recaba quien
--  emite: por eso solo lo puede hacer alguien con cuenta.
-- -----------------------------------------------------------------------------
create or replace function public.emitir_boleto_panel(
  p_actividad uuid,
  p_nombre    text,
  p_correo    text,
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
  return public._emitir_boleto(p_actividad, p_nombre, p_correo, null, null, null,
                               p_lugares,
                               case when p_grupo then 'grupo' else 'panel' end,
                               coalesce(p_espera, false), true);
end;
$$;

revoke all on function public.emitir_boleto_panel(uuid, text, text, integer, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.emitir_boleto_panel(uuid, text, text, integer, boolean, boolean)
  to authenticated;


-- -----------------------------------------------------------------------------
--  cancelar_boletos_panel · uno o varios (cancelación en bloque)
--  Devuelve cuántos se cancelaron y cuáles no, con su motivo.
-- -----------------------------------------------------------------------------
create or replace function public.cancelar_boletos_panel(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_act   uuid;
  v_res   jsonb;
  v_bien  integer := 0;
  v_mal   jsonb := '[]'::jsonb;
begin
  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    select actividad_id into v_act from public.boletos where id = v_id;
    if v_act is null or not public.puede_editar_actividad(v_act::text) then
      v_mal := v_mal || jsonb_build_object('id', v_id, 'error', 'sin_permiso');
      continue;
    end if;
    v_res := public._cancelar_boleto(v_id);
    if (v_res->>'ok')::boolean then
      v_bien := v_bien + 1;
    else
      v_mal := v_mal || jsonb_build_object('id', v_id, 'error', v_res->>'error');
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'cancelados', v_bien, 'fallidos', v_mal);
end;
$$;

revoke all on function public.cancelar_boletos_panel(uuid[]) from public, anon, authenticated;
grant execute on function public.cancelar_boletos_panel(uuid[]) to authenticated;


-- -----------------------------------------------------------------------------
--  admitir_de_espera · pasa un boleto de la lista de espera a activo, si cabe
-- -----------------------------------------------------------------------------
create or replace function public.admitir_de_espera(p_boleto uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_act uuid;
  a     public.actividades%rowtype;
  f     public.aforos%rowtype;
  b     public.boletos%rowtype;
begin
  select actividad_id into v_act from public.boletos where id = p_boleto;
  if v_act is null or not public.puede_editar_actividad(v_act::text) then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;

  select * into f from public.aforos where actividad_id = v_act for update;
  select * into b from public.boletos where id = p_boleto for update;
  select * into a from public.actividades where id = v_act;

  if b.estado <> 'espera' then
    return jsonb_build_object('ok', false, 'error', 'no_en_espera');
  end if;
  if a.acceso = 'boleto' and f.emitidos + b.lugares > a.cupo then
    return jsonb_build_object('ok', false, 'error', 'agotado',
      'disponibles', greatest(a.cupo - f.emitidos, 0));
  end if;

  update public.boletos set estado = 'activo' where id = p_boleto;
  update public.aforos
     set emitidos    = emitidos + b.lugares,
         en_espera   = greatest(en_espera - b.lugares, 0),
         actualizado = now()
   where actividad_id = v_act;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admitir_de_espera(uuid) from public, anon, authenticated;
grant execute on function public.admitir_de_espera(uuid) to authenticated;


-- -----------------------------------------------------------------------------
--  recontar_aforo · red de seguridad
--  Recalcula los contadores desde los boletos. No debería hacer falta nunca;
--  si alguna vez el tablero y la lista no cuadran, esto lo arregla.
-- -----------------------------------------------------------------------------
create or replace function public.recontar_aforo(p_actividad uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_editar_actividad(p_actividad::text) then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;

  perform 1 from public.aforos where actividad_id = p_actividad for update;

  update public.aforos f
     set emitidos   = coalesce((select sum(lugares) from public.boletos
                                 where actividad_id = p_actividad and estado = 'activo'), 0),
         en_espera  = coalesce((select sum(lugares) from public.boletos
                                 where actividad_id = p_actividad and estado = 'espera'), 0),
         asistieron = coalesce((select sum(asistieron) from public.boletos
                                 where actividad_id = p_actividad and asistio_en is not null
                                   and estado <> 'cancelado'), 0),
         actualizado = now()
   where f.actividad_id = p_actividad;

  return jsonb_build_object('ok', true,
    'aforo', (select to_jsonb(x) - 'actividad_id' from public.aforos x where x.actividad_id = p_actividad));
end;
$$;

revoke all on function public.recontar_aforo(uuid) from public, anon, authenticated;
grant execute on function public.recontar_aforo(uuid) to authenticated;


-- =============================================================================
--  9 · VISTAS
-- =============================================================================

-- -----------------------------------------------------------------------------
--  vista_programa, con disponibilidad
--
--  Borrar y recrear: las columnas nuevas no van al final.
--
--  «cupo» se QUEDA por ahora porque la cartelera en producción lo lee. Con el
--  sobrecupo incluido ya no es la capacidad de la sala, así que en F2 la
--  cartelera pasa a «disponibles» y entonces se retira de aquí y del grant.
--
--  estado_boletos
--    null      entrada libre
--    pronto    todavía no abren
--    abierto   hay lugar (o es confirmación sin tope)
--    pocos     quedan 3 o menos, o menos del 10 %
--    agotado   sin lugares: se ofrece la lista de espera
--    cerrado   ya pasó la hora de cierre
-- -----------------------------------------------------------------------------
drop view if exists public.vista_programa;

create view public.vista_programa as
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
    when a.acceso = 'libre' then null
    when now() < public.boletos_apertura(a.boletos_desde, a.publicada_en) then 'pronto'
    when now() >= public.boletos_cierre(a.boletos_hasta, a.fecha, a.hora_inicio) then 'cerrado'
    when a.acceso = 'registro' then 'abierto'
    when a.cupo - coalesce(f.emitidos, 0) <= 0 then 'agotado'
    when a.cupo - coalesce(f.emitidos, 0) <= greatest(3, ceil(a.cupo * 0.1)) then 'pocos'
    else 'abierto'
  end              as estado_boletos
from public.actividades a
left join public.ejes   e on e.nombre = a.eje
left join public.sedes  s on s.nombre = a.sede
left join public.aforos f on f.actividad_id = a.id
where a.publica
  and not a.archivada;

-- Sin esto la vista ignora las reglas por fila (trampa 2 del plan).
alter view public.vista_programa set (security_invoker = true);

grant select on public.vista_programa to anon, authenticated;

comment on view public.vista_programa is
  'Programa público con disponibilidad de boletos. Única lectura del sitio sin sesión: solo columnas publicables de lo publicado.';


-- -----------------------------------------------------------------------------
--  vista_aforo · el tablero de boletos del panel
--  Con security_invoker, cada quien ve las filas que su política le permite:
--  el coordinador, las suyas y las publicadas; la administración, todas.
-- -----------------------------------------------------------------------------
drop view if exists public.vista_aforo;

create view public.vista_aforo as
select
  a.id, a.edicion_id, a.titulo, a.slug, a.eje, a.sede, a.fecha, a.hora_inicio,
  a.publica, a.archivada, a.acceso, a.cupo, a.lugares_max,
  s.capacidad                                   as capacidad_sala,
  coalesce(f.emitidos, 0)                       as emitidos,
  coalesce(f.en_espera, 0)                      as en_espera,
  coalesce(f.asistieron, 0)                     as asistieron,
  case when a.acceso = 'boleto' and a.cupo > 0
       then round(100.0 * coalesce(f.emitidos, 0) / a.cupo)::int
  end                                           as ocupacion_pct,
  public.boletos_apertura(a.boletos_desde, a.publicada_en)       as boletos_desde,
  public.boletos_cierre(a.boletos_hasta, a.fecha, a.hora_inicio) as boletos_hasta,
  f.actualizado                                 as aforo_actualizado
from public.actividades a
left join public.sedes  s on s.nombre = a.sede
left join public.aforos f on f.actividad_id = a.id
where a.acceso <> 'libre';

alter view public.vista_aforo set (security_invoker = true);

revoke all on public.vista_aforo from anon, authenticated;
grant select on public.vista_aforo to authenticated;


-- =============================================================================
--  10 · COMPROBACIONES
--
--  Todas deben decir BIEN. Las 5 y 6 son las importantes: si alguna dice
--  FUGA, alguien sin cuenta puede leer datos de personas.
-- =============================================================================
select * from (
  select 1 as orden, 'Columnas nuevas de actividades' as revisión,
         (select count(*) from information_schema.columns
           where table_schema='public' and table_name='actividades'
             and column_name in ('acceso','boletos_desde','boletos_hasta','lugares_max'))::text
           || ' de 4' as valor,
         case when (select count(*) from information_schema.columns
                     where table_schema='public' and table_name='actividades'
                       and column_name in ('acceso','boletos_desde','boletos_hasta','lugares_max')) = 4
              then 'BIEN' else 'REVISAR' end as resultado

  union all
  select 2, 'Tablas del módulo',
         (select count(*) from information_schema.tables
           where table_schema='public'
             and table_name in ('aforos','asistentes','boletos','puertas','intentos','opciones_asistencia'))::text
           || ' de 6',
         case when (select count(*) from information_schema.tables
                     where table_schema='public'
                       and table_name in ('aforos','asistentes','boletos','puertas','intentos','opciones_asistencia')) = 6
              then 'BIEN' else 'REVISAR' end

  union all
  select 3, 'RLS activo en las seis',
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname='public' and c.relrowsecurity
             and c.relname in ('aforos','asistentes','boletos','puertas','intentos','opciones_asistencia'))::text
           || ' de 6',
         case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname='public' and c.relrowsecurity
                       and c.relname in ('aforos','asistentes','boletos','puertas','intentos','opciones_asistencia')) = 6
              then 'BIEN' else 'REVISAR' end

  union all
  select 4, 'Toda actividad tiene su aforo',
         (select count(*) from public.actividades a
           where not exists (select 1 from public.aforos f where f.actividad_id = a.id))::text
           || ' sin aforo',
         case when not exists (select 1 from public.actividades a
                                where not exists (select 1 from public.aforos f where f.actividad_id = a.id))
              then 'BIEN' else 'REVISAR' end

  union all
  select 5, 'anon no lee personas ni boletos',
         coalesce((select string_agg(distinct table_name, ', ')
                     from information_schema.role_table_grants
                    where grantee='anon' and table_schema='public'
                      and table_name in ('asistentes','boletos','puertas','intentos')),
                  'ninguna — correcto'),
         case when not exists (select 1 from information_schema.role_table_grants
                                where grantee='anon' and table_schema='public'
                                  and table_name in ('asistentes','boletos','puertas','intentos'))
              then 'BIEN' else 'REVISAR: FUGA' end

  union all
  select 6, 'anon sigue sin leer requerimientos ni responsable',
         coalesce((select string_agg(column_name, ', ')
                     from information_schema.column_privileges
                    where grantee='anon' and table_schema='public'
                      and table_name='actividades'
                      and privilege_type = 'SELECT'
                      and column_name in ('requerimientos','responsable_id')),
                  'ninguna — correcto'),
         case when not exists (select 1 from information_schema.column_privileges
                                where grantee='anon' and table_schema='public'
                                  and table_name='actividades'
                                  and privilege_type = 'SELECT'
                                  and column_name in ('requerimientos','responsable_id'))
              then 'BIEN' else 'REVISAR: FUGA' end

  union all
  select 7, 'Funciones internas cerradas',
         coalesce((select string_agg(p.proname, ', ')
                     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public'
                      and p.proname in ('_emitir_boleto','_cancelar_boleto','_agrupar_asistentes',
                                        'es_personal','token_nuevo','codigo_nuevo')
                      and (has_function_privilege('anon', p.oid, 'execute')
                           or has_function_privilege('authenticated', p.oid, 'execute'))),
                  'ninguna expuesta'),
         case when not exists (select 1
                     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public'
                      and p.proname in ('_emitir_boleto','_cancelar_boleto','_agrupar_asistentes',
                                        'es_personal','token_nuevo','codigo_nuevo')
                      and (has_function_privilege('anon', p.oid, 'execute')
                           or has_function_privilege('authenticated', p.oid, 'execute')))
              then 'BIEN' else 'REVISAR: FUGA' end

  union all
  select 8, 'Las vistas respetan las reglas',
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname='public' and c.relname in ('vista_programa','vista_aforo')
             and c.reloptions::text like '%security_invoker=true%')::text || ' de 2',
         case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname='public' and c.relname in ('vista_programa','vista_aforo')
                       and c.reloptions::text like '%security_invoker=true%') = 2
              then 'BIEN' else 'REVISAR' end

  union all
  select 9, 'Contadores cuadran con los boletos',
         (select count(*) from public.aforos f
           where f.emitidos <> coalesce((select sum(lugares) from public.boletos b
                                          where b.actividad_id = f.actividad_id and b.estado = 'activo'), 0)
              or f.en_espera <> coalesce((select sum(lugares) from public.boletos b
                                          where b.actividad_id = f.actividad_id and b.estado = 'espera'), 0)
         )::text || ' descuadradas',
         case when not exists (select 1 from public.aforos f
           where f.emitidos <> coalesce((select sum(lugares) from public.boletos b
                                          where b.actividad_id = f.actividad_id and b.estado = 'activo'), 0)
              or f.en_espera <> coalesce((select sum(lugares) from public.boletos b
                                          where b.actividad_id = f.actividad_id and b.estado = 'espera'), 0))
              then 'BIEN' else 'REVISAR: usar recontar_aforo()' end
) t
order by orden;
