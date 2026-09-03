-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · ASCENDER A ADMINISTRACIÓN
--
--  No es una migración: es una herramienta. Se ejecuta cuando haga falta dar
--  permisos de administración a una o varias cuentas, y se puede repetir sin
--  romper nada.
--
--  ANTES DE EJECUTARLO, cada persona necesita tener cuenta. Dos caminos:
--
--    a) Supabase ▸ Authentication ▸ Users ▸ «Add user»
--       Marca «Auto Confirm User» para que no espere el correo de
--       confirmación. Es el camino limpio para la administración, porque
--       /registro obliga además a dar de alta una actividad.
--
--    b) Que la persona se registre en el sitio por su cuenta.
--
--  En ambos casos el disparador «al_crear_usuario» le crea el perfil con rol
--  «coordinador». Este archivo lo sube a «administrador».
--
--  Aquí NO se escriben contraseñas: cada quien pone la suya al crear la cuenta
--  o la recupera desde /entrar.
-- =============================================================================


-- =============================================================================
--  1 · SE LEVANTA EL CANDADO
--
--  «proteger_rol» rechaza cualquier cambio de rol que no venga de una cuenta
--  de administración, y el editor SQL de Supabase no actúa como ningún usuario:
--  bloquearía esta misma operación. Se levanta y se repone al final. Si algo
--  fallara a media ejecución, PostgreSQL revierte el archivo completo —este
--  ALTER incluido— y el candado queda puesto.
-- =============================================================================
alter table public.perfiles disable trigger perfiles_proteger_rol;


-- =============================================================================
--  2 · LAS CUENTAS
--
--  Edita esta lista cuando quieras ascender a otras personas.
-- =============================================================================
do $$
declare
  v_correos text[] := array[
    'jperalta@ens.cnyn.unam.mx',
    'raquel.mora7791@gmail.com',
    'jfnunez@ens.cnyn.unam.mx'
  ];
  v_correo  text;
  v_uid     uuid;
  v_nombre  text;
begin
  foreach v_correo in array v_correos loop
    -- El correo se normaliza en minúsculas y sin espacios: es la convención
    -- del proyecto para cruzar personas entre tablas.
    v_correo := lower(trim(v_correo));

    select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'nombre', ''), '')
      into v_uid, v_nombre
      from auth.users u
     where lower(u.email) = v_correo;

    if v_uid is null then
      raise notice 'SIN CUENTA · % — créala primero en Authentication ▸ Users', v_correo;
      continue;
    end if;

    -- Normalmente el perfil ya existe (lo crea el disparador al registrarse).
    -- El insert cubre el caso raro de una cuenta creada antes de que
    -- existiera ese disparador.
    insert into public.perfiles (id, correo, nombre, rol)
    values (v_uid, v_correo, v_nombre, 'administrador')
    on conflict (id) do update
      set rol    = 'administrador',
          nombre = coalesce(nullif(public.perfiles.nombre, ''), excluded.nombre);

    raise notice 'Ascendida a administración · %', v_correo;
  end loop;
end $$;


-- =============================================================================
--  3 · SE VUELVE A PONER EL CANDADO
-- =============================================================================
alter table public.perfiles enable trigger perfiles_proteger_rol;


-- =============================================================================
--  COMPROBACIÓN
--
--  Los «notice» de arriba no siempre se ven en el editor de Supabase, así que
--  el resultado de verdad es esta tabla. Revisa la columna «resultado».
-- =============================================================================
with pedidas as (
  select lower(trim(c)) as correo
    from unnest(array[
      'jperalta@ens.cnyn.unam.mx',
      'raquel.mora7791@gmail.com',
      'jfnunez@ens.cnyn.unam.mx'
    ]) as c
)
select
  d.correo,
  coalesce(p.nombre, '—')                    as nombre,
  coalesce(p.rol, '—')                       as rol,
  (u.email_confirmed_at is not null)         as correo_confirmado,
  (i.id is not null)                         as puede_iniciar_sesion,
  case
    when u.id is null
      then 'REVISAR · no tiene cuenta. Créala en Authentication ▸ Users'
    when p.id is null
      then 'REVISAR · tiene cuenta pero no perfil'
    when p.rol <> 'administrador'
      then 'REVISAR · sigue como ' || p.rol
    when i.id is null
      then 'REVISAR · no podrá entrar: le falta la identidad de correo'
    when u.email_confirmed_at is null
      then 'REVISAR · el correo no está confirmado'
    else 'BIEN'
  end as resultado
from pedidas d
left join auth.users u      on lower(u.email) = d.correo
left join public.perfiles p on p.id = u.id
left join auth.identities i on i.user_id = u.id and i.provider = 'email'
order by d.correo;


-- =============================================================================
--  QUIÉN ADMINISTRA HOY  ·  por si conviene revisar la lista completa
-- =============================================================================
select correo, nombre, creado
  from public.perfiles
 where rol = 'administrador'
 order by correo;
