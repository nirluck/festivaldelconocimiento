-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 01 · ESQUEMA
--  Pégalo completo en Supabase ▸ SQL Editor ▸ New query ▸ Run.
--  Ejecuta los archivos en orden: 01, 02, 03, 04.
--  Se puede volver a ejecutar sin romper nada.
-- =============================================================================

-- gen_random_uuid()
create extension if not exists pgcrypto;


-- =============================================================================
--  AJUSTES  ·  sustituye a las "options" de WordPress
-- =============================================================================
create table if not exists public.ajustes (
  clave  text primary key,
  valor  text not null
);

comment on table public.ajustes is
  'Configuración editable sin tocar código: fechas del calendario y umbrales del semáforo.';

insert into public.ajustes (clave, valor) values
  -- Ventana de organización: de aquí sale el "avance esperado" de hoy.
  ('cal_inicio',  '2026-08-13'),   -- arranca la organización
  ('cal_lista',   '2026-09-17'),   -- todo debe estar confirmado al 100%
  -- Fechas del festival
  ('fest_inicio', '2026-10-17'),
  ('fest_fin',    '2026-10-24'),
  -- Días de silencio que disparan cada color
  ('dias_ambar',  '14'),
  ('dias_rojo',   '25')
on conflict (clave) do nothing;


-- =============================================================================
--  PERFILES  ·  una fila por usuario de Supabase Auth
-- =============================================================================
create table if not exists public.perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  correo    text not null,
  nombre    text not null default '',
  telefono  text not null default '',
  rol       text not null default 'responsable'
            check (rol in ('responsable', 'coordinacion')),
  creado    timestamptz not null default now()
);

comment on column public.perfiles.rol is
  'responsable: solo ve lo suyo. coordinacion: lo ve todo. Se asciende con 03-rls.sql.';


-- Al crear una cuenta se crea su perfil. Los datos vienen del formulario de
-- registro, que los manda en el metadata del alta.
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, correo, nombre, telefono)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'telefono', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();


-- =============================================================================
--  CATÁLOGOS  ·  antes estaban dentro de archivos PHP
-- =============================================================================
create table if not exists public.ejes (
  nombre  text primary key,
  color   text not null default '#0E7C86',
  orden   smallint not null default 0
);

create table if not exists public.tipos (
  nombre  text primary key,
  orden   smallint not null default 0
);

create table if not exists public.sedes (
  nombre  text primary key,
  orden   smallint not null default 0,
  activa  boolean not null default true
);

create table if not exists public.dias (
  etiqueta text primary key,
  orden    smallint not null default 0
);


-- =============================================================================
--  ACTIVIDADES  ·  el expediente: una fila por actividad
-- =============================================================================
create table if not exists public.actividades (
  id              uuid primary key default gen_random_uuid(),
  responsable_id  uuid not null references public.perfiles(id) on delete cascade,
  actividad       text not null,
  eje             text not null default '',
  tipo            text not null default '',
  sede            text not null default '',
  dia             text not null default '',
  descripcion     text not null default '',
  estado          text not null default 'propuesta'
                  check (estado in ('propuesta', 'aprobada', 'rechazada')),
  archivada       boolean not null default false,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);

create index if not exists actividades_responsable on public.actividades (responsable_id);
create index if not exists actividades_estado      on public.actividades (estado) where not archivada;


-- =============================================================================
--  REPORTES  ·  historial de avances. Un renglón por envío: nada se sobreescribe.
--  (En el plugin de WordPress cada reporte pisaba al anterior y se perdía.)
-- =============================================================================
create table if not exists public.reportes (
  id            uuid primary key default gen_random_uuid(),
  actividad_id  uuid not null references public.actividades(id) on delete cascade,
  avance        smallint not null default 0 check (avance between 0 and 100),
  avances       text not null default '',
  necesidades   text not null default '',
  problematica  text not null default '',
  siguiente     text not null default '',
  alerta        text not null default 'No, va caminando',
  creado        timestamptz not null default now()
);

create index if not exists reportes_actividad on public.reportes (actividad_id, creado desc);


-- =============================================================================
--  SEGUIMIENTO  ·  lo llena la coordinación, no el responsable
-- =============================================================================
create table if not exists public.seguimiento (
  actividad_id  uuid primary key references public.actividades(id) on delete cascade,
  contactado    text not null default 'Todavía no',
  fecha         date,
  medio         text not null default '',
  respuesta     text not null default '',
  proximo       date,
  notas         text not null default '',
  actualizado   timestamptz not null default now()
);


-- =============================================================================
--  Mantener "actualizado" al día sin depender del cliente
-- =============================================================================
create or replace function public.marcar_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado := now();
  return new;
end;
$$;

drop trigger if exists actividades_actualizado on public.actividades;
create trigger actividades_actualizado
  before update on public.actividades
  for each row execute function public.marcar_actualizado();

drop trigger if exists seguimiento_actualizado on public.seguimiento;
create trigger seguimiento_actualizado
  before update on public.seguimiento
  for each row execute function public.marcar_actualizado();
