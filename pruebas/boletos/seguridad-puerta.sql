-- Ataques a la puerta (sql/17-puerta.sql), como los haría alguien de fuera o
-- un coordinador curioso. Correr después de preparar.sh:
--   docker exec -i fdc-prueba psql -U postgres -X < pruebas/boletos/seguridad-puerta.sql
-- Cada renglón dice entre corchetes lo que DEBE pasar. Los ERROR son esperados
-- solo donde el renglón anterior lo anuncia.
\set QUIET on
\pset format unaligned
\pset tuples_only on

update public.actividades set acceso='boleto', cupo=20, lugares_max=4 where titulo in ('Taller de microscopía','Charla empalmada');
select id as act  from public.actividades where titulo='Taller de microscopía' \gset
select id as ajena from public.actividades where titulo='Borrador ajeno' \gset
select slug from public.actividades where titulo='Taller de microscopía' \gset
select id as ens from public.lugares_municipios where estado='Baja California' and municipio='Ensenada' \gset
delete from public.intentos;
set role anon;
set request.headers = '{"cf-connecting-ip":"1.1.1.1"}';
select public.solicitar_boleto(:'slug','Víctima Uno','1980-01-01','Mujer',:ens,null,1,'cartel',true)->>'token' as tok \gset
reset role;
insert into public.puertas (actividad_id, etiqueta) values (:'act','Eva') returning token as k, codigo as cod \gset
insert into public.puertas (actividad_id, etiqueta, vence) values (:'act','Vieja', now() - interval '1 minute') returning token as kvieja, codigo as codvieja \gset

\echo ==== 1 · SIN CLAVE, CLAVE FALSA, CLAVE DE OTRA ACTIVIDAD
set role anon;
select '1a lista sin clave [sin_permiso]: '          || (public.lista_puerta(:'act', null)->>'error');
select '1b lista con clave inventada [sin_permiso]: ' || (public.lista_puerta(:'act', repeat('a',64))->>'error');
select '1c clave buena en otra actividad [sin_permiso]: ' || (public.lista_puerta(:'ajena', :'k')->>'error');
select '1d marcar sin clave [sin_permiso]: '          || (public.marcar_entrada(:'act', :'tok')->>'error');
select '1e +1 sin clave [sin_permiso]: '              || (public.entrada_sin_boleto(:'act', 50)->>'error');
select '1f ajustar sin clave [sin_permiso]: '         || (public.ajustar_entrada(:'act', gen_random_uuid(), 1)->>'error');
select '1g anular sin clave [sin_permiso]: '          || (public.anular_entrada(:'act', gen_random_uuid())->>'error');
select '1h buscar sin clave [sin_permiso]: '          || (public.buscar_en_puerta(:'act', 'vic')->>'error');
select '1i clave vencida [sin_permiso]: '             || (public.lista_puerta(:'act', :'kvieja')->>'error');
select '1j código vencido [clave_vencida]: '          || (public.entrar_puerta(:'codvieja')->>'error');

\echo ==== 2 · TEXTO MALICIOSO (los parámetros son datos, nunca SQL)
select '2a inyección en el código [codigo]: ' || (public.entrar_puerta($$' or 1=1; drop table boletos; --$$)->>'error');
select '2b inyección en la búsqueda [0 resultados]: ' || jsonb_array_length(public.buscar_en_puerta(:'act', $$%' or ''='$$, :'k')->'boletos');
select '2c comodín «%» no lista a todos [0]: ' || jsonb_array_length(public.buscar_en_puerta(:'act', '%%%', :'k')->'boletos');
select '2d código gigante [codigo]: ' || (public.entrar_puerta(repeat('A', 100000))->>'error');
reset role;
select '2e la tabla sigue ahí [1]: ' || count(*) from public.boletos where token = :'tok';

\echo ==== 3 · LEER O ESCRIBIR TABLAS DIRECTO, SIN FUNCIONES
set role anon;
select '3a anon lee puertas [ERROR]:';  select count(*) from public.puertas;
select '3b anon lee boletos [ERROR]:';  select count(*) from public.boletos;
select '3c anon lee intentos [ERROR]:'; select count(*) from public.intentos;
select '3d anon crea una puerta [ERROR]:';
insert into public.puertas (actividad_id) values (:'act');
select '3e anon borra intentos [ERROR]:'; delete from public.intentos;
select '3f anon llama la función interna del código [ERROR]:'; select public.codigo_puerta_nuevo();
reset role;

\echo ==== 4 · UN COORDINADOR CONTRA ACTIVIDADES AJENAS
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select '4a crea una puerta para actividad ajena [ERROR]:';
insert into public.puertas (actividad_id, etiqueta) values (:'ajena', 'colado');
select '4b ve puertas ajenas [0]: ' || count(*) from public.puertas where actividad_id = :'ajena';
insert into public.puertas (actividad_id, etiqueta, token, codigo) values (:'act', 'elige', repeat('b',64), 'AAAAAAAA')
  returning '4c no puede elegir clave ni código [f f]: ' || (token = repeat('b',64)) || ' ' || (codigo = 'AAAAAAAA');
select id as mia from public.puertas where etiqueta = 'elige' \gset
update public.puertas set actividad_id = :'ajena' where id = :'mia';
select '4d no puede mudar su puerta a otra actividad [su actividad]: ' || (actividad_id = :'act') from public.puertas where id = :'mia';
reset role;
reset request.jwt.claim.sub;

\echo ==== 5 · LO QUE VE QUIEN TIENE LA CLAVE
set role anon;
select '5a campos de cada boleto en la lista [sin token, fecha, género ni lugar]: '
       || string_agg(k, ',' order by k)
  from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(public.lista_puerta(:'act', :'k')->'boletos') e) x;
select '5b la clave no cancela boletos (pide el token) [error]: ' || coalesce(public.cancelar_boleto(:'k')->>'error', 'ok?');
reset role;

\echo ==== 6 · FUERZA BRUTA DEL CÓDIGO
delete from public.intentos;
set role anon;
set request.headers = '{"cf-connecting-ip":"6.6.6.6"}';
select '6a once intentos [10 codigo y luego demasiados]: ' || string_agg(public.entrar_puerta('ZZZZZZZZ')->>'error', ',') from generate_series(1,11);
select '6b ni con el bueno [demasiados]: ' || (public.entrar_puerta(:'cod')->>'error');
reset role;
select '6c filas que dejó [10]: ' || count(*) from public.intentos where tipo = 'puerta';
