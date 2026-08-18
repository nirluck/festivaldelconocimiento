-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · COMPROBACIÓN
--
--  Ejecútalo DESPUÉS de 01, 02, 03 y 04.
--  Devuelve una sola tabla: revisa que la columna «resultado» diga BIEN en
--  todos los renglones. Si algo dice REVISAR, ahí está el problema.
-- =============================================================================

with
tablas as (
  select count(*)::int as n from information_schema.tables
   where table_schema = 'public'
     and table_name in ('perfiles','actividades','reportes','seguimiento',
                        'ajustes','ejes','tipos','sedes','dias')
),
rls as (
  select count(*)::int as n from pg_tables
   where schemaname = 'public' and rowsecurity = true
     and tablename in ('perfiles','actividades','reportes','seguimiento',
                       'ajustes','ejes','tipos','sedes','dias')
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
disparador as (
  select count(*)::int as n from pg_trigger
   where tgname = 'al_crear_usuario' and not tgisinternal
),
funciones as (
  select count(*)::int as n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('es_coordinacion','avance_esperado','hoy_ensenada',
                       'ajuste_int','crear_perfil','proteger_rol','proteger_estado')
),
cat as (
  select (select count(*) from public.ejes)    as ejes,
         (select count(*) from public.tipos)   as tipos,
         (select count(*) from public.sedes)   as sedes,
         (select count(*) from public.dias)    as dias,
         (select count(*) from public.ajustes) as ajustes
),
coord as (
  select count(*)::int as n from public.perfiles where rol = 'coordinacion'
)
select * from (
  select 1 as orden, 'Tablas creadas' as revisión,
         tablas.n || ' de 9' as valor,
         case when tablas.n = 9 then 'BIEN' else 'REVISAR · falta ejecutar 01-esquema.sql' end as resultado
    from tablas
  union all
  select 2, 'Reglas por fila activas', rls.n || ' de 9',
         case when rls.n = 9 then 'BIEN' else 'REVISAR · falta ejecutar 03-rls.sql' end from rls
  union all
  select 3, 'Políticas de acceso', politicas.n || ' políticas',
         case when politicas.n >= 18 then 'BIEN' else 'REVISAR · falta ejecutar 03-rls.sql' end from politicas
  union all
  select 4, 'Vista del semáforo', case when vista.n = 1 then 'existe' else 'no existe' end,
         case when vista.n = 1 then 'BIEN' else 'REVISAR · falta ejecutar 02-semaforo.sql' end from vista
  union all
  select 5, 'Vista respeta las reglas por fila',
         case when vista_segura.n = 1 then 'security_invoker activo' else 'SIN security_invoker' end,
         case when vista_segura.n = 1 then 'BIEN'
              else 'REVISAR · la vista entregaría TODAS las actividades a cualquiera' end
    from vista_segura
  union all
  select 6, 'Perfil automático al registrarse',
         case when disparador.n >= 1 then 'activo' else 'ausente' end,
         case when disparador.n >= 1 then 'BIEN'
              else 'REVISAR · nadie podrá registrarse' end from disparador
  union all
  select 7, 'Funciones del sistema', funciones.n || ' de 7',
         case when funciones.n = 7 then 'BIEN' else 'REVISAR · falta algún archivo' end from funciones
  union all
  select 8, 'Catálogos cargados',
         cat.ejes || ' ejes, ' || cat.tipos || ' tipos, ' || cat.sedes || ' sedes, ' ||
         cat.dias || ' días, ' || cat.ajustes || ' ajustes',
         case when cat.ejes >= 4 and cat.tipos >= 14 and cat.dias >= 10 and cat.ajustes >= 6
              then 'BIEN' else 'REVISAR · falta ejecutar 04-catalogos.sql' end from cat
  union all
  select 9, 'Avance esperado hoy', public.avance_esperado() || '%',
         'informativo · sube solo con el calendario'
  union all
  select 10, 'Cuentas de coordinación', coord.n || ' cuenta(s)',
         case when coord.n >= 1 then 'BIEN'
              else 'PENDIENTE · regístrate en el sitio y ejecuta el update del final de 03-rls.sql' end
    from coord
) t order by orden;
