-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · COMPROBACIÓN
--
--  Ejecútalo DESPUÉS de 01, 02, 03, 04, 06 y 07.
--  Devuelve una sola tabla: revisa que la columna «resultado» diga BIEN en
--  todos los renglones. Si algo dice REVISAR, ahí está el problema.
--
--  No crea nada ni cambia nada: se puede correr cuando sea.
-- =============================================================================

with
tablas as (
  select count(*)::int as n from information_schema.tables
   where table_schema = 'public'
     and table_name in ('perfiles','ediciones','actividades','reportes',
                        'seguimiento','ejes','tipos','sedes')
),
tablas_idas as (
  select count(*)::int as n from information_schema.tables
   where table_schema = 'public' and table_name in ('dias','ajustes')
),
rls as (
  select count(*)::int as n from pg_tables
   where schemaname = 'public' and rowsecurity = true
     and tablename in ('perfiles','ediciones','actividades','reportes',
                       'seguimiento','ejes','tipos','sedes')
),
politicas as (
  select count(*)::int as n from pg_policies where schemaname = 'public'
),
vista as (
  select count(*)::int as n from pg_views
   where schemaname = 'public' and viewname = 'vista_actividades'
),
vista_segura as (
  select coalesce(
    (select 1 from pg_class c
      where c.relname = 'vista_actividades'
        and c.reloptions::text ilike '%security_invoker=true%'), 0)::int as n
),
disparadores as (
  select count(*)::int as n from pg_trigger
   where not tgisinternal
     and tgname in ('al_crear_usuario','perfiles_proteger_rol',
                    'actividades_proteger_estado','actividades_actualizado',
                    'seguimiento_actualizado','actividades_slug')
),
funciones as (
  select count(*)::int as n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('es_administrador','edicion_activa','avance_esperado',
                       'hoy_ensenada','crear_perfil','proteger_rol',
                       'proteger_estado','slugificar','asignar_slug')
),
funciones_idas as (
  select count(*)::int as n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname in ('es_coordinacion','ajuste_int')
),
edicion as (
  select count(*)::int as n,
         coalesce(max(anio)::text, '—') as anio,
         coalesce(max(fecha_inicio)::text, '?') || ' a ' ||
         coalesce(max(fecha_fin)::text, '?') as ventana
    from public.ediciones where activa
),
cat as (
  select (select count(*) from public.ejes)  as ejes,
         (select count(*) from public.tipos) as tipos,
         (select count(*) from public.sedes) as sedes
),
columnas as (
  select count(*)::int as n from information_schema.columns
   where table_schema = 'public' and table_name = 'actividades'
     and column_name in ('edicion_id','titulo','slug','resumen','publica',
                         'fecha','hora_inicio','hora_fin','requerimientos')
),
columnas_idas as (
  select count(*)::int as n from information_schema.columns
   where table_schema = 'public' and table_name = 'actividades'
     and column_name in ('actividad','dia','estado','hora')
),
roles as (
  select count(*)::int as n from public.perfiles where rol = 'administrador'
),
roles_validos as (
  select coalesce(bool_and(rol in ('coordinador','administrador')), true) as ok,
         coalesce(string_agg(distinct rol, ', '), 'sin cuentas') as valor
    from public.perfiles
)
select * from (
  select 1 as orden, 'Tablas creadas' as revisión,
         tablas.n || ' de 8' as valor,
         case when tablas.n = 8 then 'BIEN'
              else 'REVISAR · falta ejecutar 01-esquema.sql o 07-nucleo.sql' end as resultado
    from tablas
  union all
  select 2, 'Tablas retiradas en 07', tablas_idas.n || ' de 2 siguen ahí',
         case when tablas_idas.n = 0 then 'BIEN'
              else 'REVISAR · «dias» o «ajustes» siguen existiendo' end from tablas_idas
  union all
  select 3, 'Reglas por fila activas', rls.n || ' de 8',
         case when rls.n = 8 then 'BIEN'
              else 'REVISAR · falta ejecutar 03-rls.sql o 07-nucleo.sql' end from rls
  union all
  select 4, 'Políticas de acceso', politicas.n || ' políticas',
         case when politicas.n >= 18 then 'BIEN'
              else 'REVISAR · falta ejecutar 03-rls.sql' end from politicas
  union all
  select 5, 'Vista del semáforo', case when vista.n = 1 then 'existe' else 'no existe' end,
         case when vista.n = 1 then 'BIEN'
              else 'REVISAR · falta ejecutar 07-nucleo.sql' end from vista
  union all
  select 6, 'Vista respeta las reglas por fila',
         case when vista_segura.n = 1 then 'security_invoker activo' else 'SIN security_invoker' end,
         case when vista_segura.n = 1 then 'BIEN'
              else 'REVISAR · la vista entregaría TODAS las actividades a cualquiera' end
    from vista_segura
  union all
  select 7, 'Disparadores', disparadores.n || ' de 6',
         case when disparadores.n = 6 then 'BIEN'
              else 'REVISAR · falta alguno; sin «al_crear_usuario» nadie puede registrarse' end
    from disparadores
  union all
  select 8, 'Funciones del sistema', funciones.n || ' de 9',
         case when funciones.n = 9 then 'BIEN' else 'REVISAR · falta algún archivo' end
    from funciones
  union all
  select 9, 'Funciones retiradas', funciones_idas.n || ' de 2 siguen ahí',
         case when funciones_idas.n = 0 then 'BIEN'
              else 'REVISAR · «es_coordinacion» o «ajuste_int» apuntan a cosas que ya no existen' end
    from funciones_idas
  union all
  select 10, 'Edición activa', edicion.anio || ' · ' || edicion.ventana,
         case when edicion.n = 1 then 'BIEN'
              else 'REVISAR · debe haber exactamente una edición activa' end from edicion
  union all
  select 11, 'Columnas de actividades', columnas.n || ' de 9',
         case when columnas.n = 9 then 'BIEN' else 'REVISAR · falta alguna' end from columnas
  union all
  select 12, 'Columnas retiradas', columnas_idas.n || ' de 4 siguen ahí',
         case when columnas_idas.n = 0 then 'BIEN'
              else 'REVISAR · quedó alguna columna vieja' end from columnas_idas
  union all
  select 13, 'Catálogos cargados',
         cat.ejes || ' ejes, ' || cat.tipos || ' tipos, ' || cat.sedes || ' sedes',
         case when cat.ejes >= 4 and cat.tipos >= 14 and cat.sedes >= 14
              then 'BIEN' else 'REVISAR · falta ejecutar 04-catalogos.sql' end from cat
  union all
  select 14, 'Roles válidos', roles_validos.valor,
         case when roles_validos.ok then 'BIEN'
              else 'REVISAR · falta ejecutar 06-cambios.sql' end from roles_validos
  union all
  select 15, 'Cuentas de administración', roles.n || ' cuenta(s)',
         case when roles.n >= 1 then 'BIEN'
              else 'PENDIENTE · regístrate en el sitio y ejecuta 05-coordinador.local.sql' end
    from roles
  union all
  select 16, 'Avance esperado hoy', public.avance_esperado() || '%',
         'informativo · sube solo con el calendario de la edición'
) t order by orden;
