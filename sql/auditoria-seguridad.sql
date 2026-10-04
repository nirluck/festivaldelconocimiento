-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · AUDITORÍA DE SEGURIDAD
--
--  No crea, no cambia y no borra nada: solo mira. Se puede correr cuando sea,
--  y conviene hacerlo después de cada SQL nuevo y antes del festival.
--
--  Devuelve una tabla: todo debe decir BIEN. Si algo dice REVISAR, la columna
--  «valor» dice qué. Escrita el 3 de octubre de 2026, con la puerta (17).
--
--  Qué protege a la base, en una línea: nadie sin cuenta toca una tabla
--  directo; solo llama funciones, y cada función revisa por dentro quién es
--  (cuenta, o clave de puerta de ESA actividad) antes de hacer nada.
-- =============================================================================

with
-- Funciones nuestras (no de extensiones) en el esquema público.
f as (
  select p.oid, p.proname, p.prosecdef, p.proconfig, p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
una_actividad as (select id from public.actividades limit 1)

select 1 as orden, 'Todas las tablas tienen reglas por fila (RLS)' as revision,
       coalesce((select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'todas') as valor,
       case when exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity)
            then 'REVISAR' else 'BIEN' end as resultado

union all
select 2, 'Ninguna regla deja ESCRIBIR a quien no tiene cuenta',
       coalesce((select string_agg(tablename || ' (' || cmd || ')', ', ') from pg_policies
                  where schemaname = 'public' and cmd <> 'SELECT'
                    and (roles::text like '%anon%' or roles::text like '%public%')), 'ninguna'),
       case when exists (select 1 from pg_policies where schemaname = 'public' and cmd <> 'SELECT'
                           and (roles::text like '%anon%' or roles::text like '%public%'))
            then 'REVISAR' else 'BIEN' end

union all
select 3, 'Sin cuenta no se leen boletos, puertas, intentos, lugares ni voluntariado',
       coalesce((select string_agg(t, ', ') from unnest(array['boletos','puertas','intentos',
                  'lugares_municipios','lugares_colonias','sedes_internas',
                  'voluntarios','inscripciones','puestos']) t
                  where to_regclass('public.' || t) is not null
                    and has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete')), 'ninguna'),
       case when exists (select 1 from unnest(array['boletos','puertas','intentos',
                  'lugares_municipios','lugares_colonias','sedes_internas',
                  'voluntarios','inscripciones','puestos']) t
                  where to_regclass('public.' || t) is not null
                    and has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete'))
            then 'REVISAR' else 'BIEN' end

union all
-- Una función SECURITY DEFINER corre con todos los permisos. Sin search_path
-- fijo, alguien podría colarle una tabla o función con el mismo nombre.
select 4, 'Funciones con privilegios: search_path fijo',
       coalesce((select string_agg(proname, ', ') from f
                  where prosecdef and not coalesce(array_to_string(proconfig, ',') like '%search_path=%', false)), 'todas'),
       case when exists (select 1 from f where prosecdef
                           and not coalesce(array_to_string(proconfig, ',') like '%search_path=%', false))
            then 'REVISAR' else 'BIEN' end

union all
-- SQL armado con texto (EXECUTE) es la puerta clásica a la inyección.
select 5, 'Funciones abiertas al público sin SQL armado con texto',
       coalesce((select string_agg(proname, ', ') from f
                  where prosecdef and has_function_privilege('anon', oid, 'execute')
                    and prosrc ~* '\mexecute\s'), 'ninguna'),
       case when exists (select 1 from f where prosecdef and has_function_privilege('anon', oid, 'execute')
                           and prosrc ~* '\mexecute\s')
            then 'REVISAR' else 'BIEN' end

union all
select 6, 'Funciones internas cerradas al público',
       coalesce((select string_agg(distinct proname, ', ') from f
                  where proname in ('es_personal', 'codigo_puerta_nuevo', 'codigo_nuevo', 'token_nuevo',
                                    '_emitir_boleto', '_cancelar_boleto', '_agrupar_boletos',
                                    'puerta_por_clave', 'ip_peticion', 'actividad_para_boleto', 'clave_persona',
                                    '_inscribir', '_voluntario', '_turno_json', '_choque_voluntario',
                                    '_revisar_voluntario', '_puesto_editable', '_dia_puesto',
                                    'voluntarios_de_actividad', 'asignar_voluntario', 'quitar_voluntario',
                                    'mover_voluntario', 'marcar_asistencia', 'eliminar_puesto', 'ocupacion_puestos')
                    and has_function_privilege('anon', oid, 'execute')), 'cerradas'),
       case when exists (select 1 from f
                  where proname in ('es_personal', 'codigo_puerta_nuevo', 'codigo_nuevo', 'token_nuevo',
                                    '_emitir_boleto', '_cancelar_boleto', '_agrupar_boletos',
                                    'puerta_por_clave', 'ip_peticion', 'actividad_para_boleto', 'clave_persona',
                                    '_inscribir', '_voluntario', '_turno_json', '_choque_voluntario',
                                    '_revisar_voluntario', '_puesto_editable', '_dia_puesto',
                                    'voluntarios_de_actividad', 'asignar_voluntario', 'quitar_voluntario',
                                    'mover_voluntario', 'marcar_asistencia', 'eliminar_puesto', 'ocupacion_puestos')
                    and has_function_privilege('anon', oid, 'execute'))
            then 'REVISAR' else 'BIEN' end

union all
-- Prueba en vivo, de solo lectura: una clave inventada no abre ninguna lista.
select 7, 'Una clave inventada no abre la lista de la puerta',
       coalesce(public.lista_puerta((select id from una_actividad), md5(random()::text) || md5(random()::text))->>'error', 'ABRIÓ'),
       case when (select id from una_actividad) is null then 'BIEN'
            when public.lista_puerta((select id from una_actividad), md5(random()::text) || md5(random()::text))->>'error' = 'sin_permiso'
            then 'BIEN' else 'REVISAR' end

union all
select 8, 'Deshacer en la puerta ya no busca asistente_id',
       case when (select prosrc from f where proname = 'anular_entrada') like '%asistente_id%' then 'falta correr 17' else 'corregido' end,
       case when (select prosrc from f where proname = 'anular_entrada') like '%asistente_id%' then 'REVISAR' else 'BIEN' end

union all
select 9, 'Ningún código de puerta sin vencimiento',
       coalesce((select string_agg(codigo || ' (' || coalesce(nullif(etiqueta, ''), 'sin nombre') || ')', ', ')
                   from public.puertas where activa and vence is null), 'ninguno'),
       case when exists (select 1 from public.puertas where activa and vence is null) then 'REVISAR' else 'BIEN' end

union all
-- Informativo: cuántos códigos abren hoy alguna lista de nombres.
select 10, 'Códigos de puerta vigentes ahora (informativo)',
       (select count(*) from public.puertas where activa and (vence is null or vence > now()))::text,
       'BIEN'

union all
-- Muchos intentos fallidos = alguien probando códigos o boletos.
select 11, 'Intentos fallidos de código de puerta, últimas 24 h',
       (select count(*) || ' desde ' || count(distinct ip) || ' direcciones' from public.intentos
         where tipo = 'puerta' and creado > now() - interval '1 day'),
       case when (select count(*) from public.intentos where tipo = 'puerta'
                   and creado > now() - interval '1 day') > 200 then 'REVISAR' else 'BIEN' end

order by orden;
