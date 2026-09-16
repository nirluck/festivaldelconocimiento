-- Prueba funcional de los boletos. Correr después de preparar.sh:
--   docker exec -i fdc-prueba psql -U postgres -X < pruebas/boletos/funcional.sql
-- Los ERROR que aparecen son negativas esperadas (lecturas prohibidas y
-- accesos ajenos); cualquier otro ERROR es un defecto.
\set QUIET on
\pset format unaligned
\pset tuples_only on
-- Preparación (como dueño de la base)
update public.actividades set acceso='boleto', cupo=10, lugares_max=4 where titulo='Taller de microscopía';
update public.actividades set acceso='registro' where titulo='Charla empalmada';
select actualizado as antes from public.actividades where titulo='Taller de microscopía' \gset
select id as act from public.actividades where titulo='Taller de microscopía' \gset
select id as act2 from public.actividades where titulo='Charla empalmada' \gset
select slug from public.actividades where titulo='Taller de microscopía' \gset

\echo ---- PÚBLICO SIN CUENTA
set role anon;
set request.headers = '{"x-forwarded-for":"10.0.0.1, 1.2.3.4"}';
select '1 programa: ' || string_agg(titulo||' acceso='||acceso||' disp='||coalesce(disponibles::text,'-')||' estado='||coalesce(estado_boletos,'-'), ' | ') from public.vista_programa;
select '3 sin consentimiento: ' || public.solicitar_boleto(:'slug','Ana López','ana@x.mx','18 a 29 años','Estudiante',null,1,'cartel',false)::text;
select '4 edad inválida: '   || public.solicitar_boleto(:'slug','Ana López','ana@x.mx','viejita','Estudiante',null,1,'cartel',true)::text;
select '5 cinco lugares: '   || public.solicitar_boleto(:'slug','Ana López','ana@x.mx','18 a 29 años','Estudiante',null,5,'cartel',true)::text;
select public.solicitar_boleto(:'slug','  Ana   López ',' ANA@X.MX ','18 a 29 años','Estudiante','Ensenada',3,'cartel',true) as r \gset
\echo 6 emitido: :r
select :'r'::jsonb->>'token' as tok \gset
select '7 duplicado (otro nombre): ' || public.solicitar_boleto(:'slug','Impostor','ana@x.mx','13 a 17 años','Hogar','Tijuana',1,'cartel',true)::text;
select '8 empalme: ' || public.solicitar_boleto('charla-empalmada','Ana','ana@x.mx','18 a 29 años','Estudiante',null,1,'programa',true)::text;
select '8b empalme inverso (Beto en charla, pide taller): ' || (public.solicitar_boleto('charla-empalmada','Beto','beto@x.mx','30 a 59 años','Docente',null,1,'x',true)->>'estado') || ' → ' || (public.solicitar_boleto(:'slug','Beto','beto@x.mx','30 a 59 años','Docente',null,1,'x',true)::text);
select '9 registro sin tope, origen raro: ' || (public.solicitar_boleto('charla-empalmada','Beto','beto@x.mx','30 a 59 años','Docente',null,1,'hackeo',true)->>'estado');
select '10 no existe: ' || public.solicitar_boleto('nada','Beto','beto@x.mx','30 a 59 años','Docente',null,1,'x',true)::text;
select '11 borrador no publicado: ' || public.solicitar_boleto('borrador-ajeno','Beto','beto@x.mx','30 a 59 años','Docente',null,1,'x',true)::text;
select '12 llena con 4: ' || (public.solicitar_boleto(:'slug','Caro','caro@x.mx','13 a 17 años','Estudiante',null,4,'redes',true)->>'estado');
select '13 agotado: ' || public.solicitar_boleto(:'slug','Dani','dani@x.mx','13 a 17 años','Estudiante',null,4,'redes',true)::text;
select '14 espera: ' || (public.solicitar_boleto(:'slug','Dani','dani@x.mx','13 a 17 años','Estudiante',null,4,'redes',true,true)->>'estado');
select '15 ver: ' || public.ver_boleto(:'tok')::text;
select '16 programa: ' || disponibles || ' ' || estado_boletos from public.vista_programa where slug=:'slug';
select '17 cancelar: ' || public.cancelar_boleto(:'tok')::text;
select '18 cancelar otra vez: ' || public.cancelar_boleto(:'tok')::text;
select '19 tras cancelar: ' || disponibles || ' ' || estado_boletos from public.vista_programa where slug=:'slug';
select public.solicitar_boleto(:'slug','Ana López','ana@x.mx','18 a 29 años','Estudiante',null,2,'cartel',true) as r2 \gset
select :'r2'::jsonb->>'token' as tok2 \gset
select '20 re-solicita tras cancelar: ' || (:'r2'::jsonb->>'estado') || ' token nuevo=' || (:'tok2' <> :'tok')::text;
select '21 token viejo: ' || public.ver_boleto(:'tok')::text;
select '23 aforos visibles para anon: ' || count(*) from public.aforos;
select '24 lista sin clave: ' || public.lista_puerta(:'act')::text;
\echo 22 lecturas prohibidas (deben fallar las cuatro):
select count(*) from public.boletos;
select count(*) from public.asistentes;
select requerimientos from public.actividades;
select public._emitir_boleto(null,null,null,null,null,null,1,null,false,true);
reset role;
select '25 actualizado intacto: ' || (actualizado = :'antes')::text from public.actividades where id=:'act';
select '26 persona sin sobrescribir: ' || nombre || ' / ' || correo || ' / ' || edad_rango || ' / ' || procedencia from public.asistentes where correo='ana@x.mx';
select '27 boletos de Ana: ' || string_agg(nombre || ' ' || estado || ' ' || origen || ' x' || lugares, ' | ') from public.boletos where asistente_id=(select id from public.asistentes where correo='ana@x.mx');
select '28 aforo: ' || emitidos || ' emitidos / ' || en_espera || ' espera' from public.aforos where actividad_id=:'act';

\echo ---- COORDINADOR AJENO
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select '30 ajeno emite: ' || public.emitir_boleto_panel(:'act','X','x@x.mx')::text;
select '31 ajeno ve boletos directo: ' || count(*) from public.boletos;
select '32 ajeno en tablero: ' || string_agg(titulo, ', ') from public.vista_aforo;
insert into public.puertas (actividad_id) values (:'act');
select '29 ajeno lista (debe fallar): ' || count(*) from public.boletos_de_actividad(:'act');

\echo ---- COORDINADOR DUEÑO
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select '33 lista: ' || string_agg(nombre||' '||coalesce(correo,'')||' '||estado, ' | ') from public.boletos_de_actividad(:'act');
select '34 resumen: ' || public.resumen_boletos(:'act')::text;
select '35 grupo excede: ' || public.emitir_boleto_panel(:'act','Prof. Ruiz','ruiz@esc.mx',30,true)::text;
insert into public.puertas (actividad_id, etiqueta) values (:'act','Voluntaria Eva') returning token as clave, vence \gset
\echo 36 puerta creada, vence :vence
update public.puertas set token='x' where actividad_id=:'act';
select '37 token intacto: ' || (token = :'clave') from public.puertas where actividad_id=:'act';

\echo ---- VOLUNTARIA SIN CUENTA
reset request.jwt.claim.sub;
set role anon;
select '38 clave: ' || public.puerta_por_clave(:'clave')::text;
select '39 lista: ' || jsonb_array_length(public.lista_puerta(:'act', :'clave')->'boletos') || ' boletos, capacidad ' || (public.lista_puerta(:'act', :'clave')->>'capacidad');
select '39b sin correo ni token en la lista: ' || ((public.lista_puerta(:'act', :'clave')->'boletos')::text !~ '@' and position(:'tok2' in public.lista_puerta(:'act', :'clave')::text) = 0);
select '40 marcar por token, 1 de 2: ' || public.marcar_entrada(:'act', :'tok2', :'clave', 1)::text;
select '41 otra vez: ' || public.marcar_entrada(:'act', :'tok2', :'clave')::text;
select '43 clave falsa: ' || public.marcar_entrada(:'act', :'tok2', repeat('a',64))::text;
select '44 buscar: ' || public.buscar_en_puerta(:'act', 'dani', :'clave')::text;
select '44b buscar por correo: ' || public.buscar_en_puerta(:'act', 'ANA@x.mx', :'clave')::text;
select '45 sin boleto +2: ' || public.entrada_sin_boleto(:'act', 2, :'clave')::text;
select '46 otra actividad: ' || (public.marcar_entrada(:'act2', :'tok2', :'clave')->>'error');
reset role;
select codigo as cod_espera from public.boletos where nombre='Dani' \gset
set role anon;
select '47 espera en puerta (código en minúsculas): ' || (public.marcar_entrada(:'act', lower(:'cod_espera'), :'clave')->>'error');
select '48 admitir desde puerta: ' || (public.marcar_entrada(:'act', :'cod_espera', :'clave', null, null, true)->>'aforo');
reset role;
select '49 marcado con puerta: ' || coalesce(marcado_por::text,'null') || ' ' || (puerta_id is not null) from public.boletos where token=:'tok2';
update public.puertas set activa=false;
set role anon;
select '50 clave revocada: ' || public.puerta_por_clave(:'clave')::text || ' ' || (public.marcar_entrada(:'act', 'ZZZZZZ', :'clave')->>'error');
reset role;

\echo ---- ADMINISTRACIÓN
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select '51 admin ve boletos: ' || count(*) from public.boletos;
select '52 cancela en bloque: ' || public.cancelar_boletos_panel(array(select id from public.boletos where nombre in ('Caro','Ana López')))::text;
select '53 recontar: ' || public.recontar_aforo(:'act')::text;
select '54 tablero: ' || string_agg(titulo||' '||emitidos||'/'||coalesce(cupo::text,'-')||' '||coalesce(ocupacion_pct::text,'-')||'%', ' | ') from public.vista_aforo;
reset role;
reset request.jwt.claim.sub;

\echo ---- LÍMITE POR IP
set role anon;
set request.headers = '{"cf-connecting-ip":"9.9.9.9"}';
select '55 intentos: ' || string_agg(coalesce(r->>'error', r->>'estado'), ',') from (
  select public.solicitar_boleto('nada','X','x@x.mx','a','b',null,1,'x',true) as r from generate_series(1,42)) t;
reset role;
