-- Prueba funcional de los boletos (modelo de datos mínimos, sql/12). Correr
-- después de preparar.sh:
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
select id as ens from public.lugares_municipios where estado='Baja California' and municipio='Ensenada' \gset
select id as tij from public.lugares_municipios where estado='Baja California' and municipio='Tijuana' \gset
select id as gdl from public.lugares_municipios where municipio='Guadalajara' \gset
select id as col from public.lugares_colonias where municipio_id=:ens order by colonia limit 1 \gset
select id as col_tij from public.lugares_colonias where municipio_id=:tij order by colonia limit 1 \gset

\echo ---- CATÁLOGO DE LUGARES
set role anon;
select '0a municipios «ensen»: ' || string_agg(municipio || ', ' || estado || ' (' || con_colonias || ')', ' | ') from public.buscar_municipios('ensen');
select '0b sin acentos «queretaro»: ' || string_agg(municipio || ', ' || estado, ' | ') from (select * from public.buscar_municipios('queretaro') limit 2) t;
select '0c colonias «chapul» en Ensenada: ' || string_agg(colonia, ' | ') from public.buscar_colonias(:ens, 'chapul');
select '0d una letra no busca: ' || count(*) from public.buscar_municipios('e');
select '0e otro país: ' || string_agg(municipio, ' | ') from public.buscar_municipios('otro pa');

\echo ---- PÚBLICO SIN CUENTA
set request.headers = '{"x-forwarded-for":"10.0.0.1, 1.2.3.4"}';
select '1 programa: ' || string_agg(titulo||' acceso='||acceso||' disp='||coalesce(disponibles::text,'-')||' estado='||coalesce(estado_boletos,'-'), ' | ') from public.vista_programa;
select '3 sin consentimiento: ' || public.solicitar_boleto(:'slug','Ana López','1990-05-10','Mujer',:ens,null,1,'cartel',false)::text;
select '4 sin fecha: '         || public.solicitar_boleto(:'slug','Ana López',null,'Mujer',:ens,null,1,'cartel',true)::text;
select '4b fecha futura: '     || public.solicitar_boleto(:'slug','Ana López','2099-01-01','Mujer',:ens,null,1,'cartel',true)::text;
select '4c género raro: '      || public.solicitar_boleto(:'slug','Ana López','1990-05-10','Marciano',:ens,null,1,'cartel',true)::text;
select '4d sin municipio: '    || public.solicitar_boleto(:'slug','Ana López','1990-05-10','Mujer',null,null,1,'cartel',true)::text;
select '4e municipio falso: '  || public.solicitar_boleto(:'slug','Ana López','1990-05-10','Mujer',999999,null,1,'cartel',true)::text;
select '4f colonia de otro municipio: ' || public.solicitar_boleto(:'slug','Ana López','1990-05-10','Mujer',:ens,:col_tij,1,'cartel',true)::text;
select '5 cinco lugares: '     || public.solicitar_boleto(:'slug','Ana López','1990-05-10','Mujer',:ens,null,5,'cartel',true)::text;
select public.solicitar_boleto(:'slug','  Ana   López ','1990-05-10','Mujer',:ens,:col,3,'cartel',true) as r \gset
\echo 6 emitido: :r
select :'r'::jsonb->>'token' as tok \gset
select '7 duplicado (mismo nombre con acentos y mayúsculas distintos): ' || public.solicitar_boleto(:'slug','ANA LOPEZ','1990-05-10','Hombre',:tij,null,1,'cartel',true)::text;
select '7b misma persona, otra fecha = otra persona: ' || (public.solicitar_boleto(:'slug','Ana López','1991-05-10','Mujer',:ens,null,1,'cartel',true)->>'estado');
select '8 empalme: ' || public.solicitar_boleto('charla-empalmada','Ana López','1990-05-10','Mujer',:ens,null,1,'programa',true)::text;
select '9 registro sin tope, de fuera: ' || (public.solicitar_boleto('charla-empalmada','Beto','1980-01-01','Hombre',:gdl,null,1,'hackeo',true)->>'estado');
select '10 no existe: ' || public.solicitar_boleto('nada','Beto','1980-01-01','Hombre',:gdl,null,1,'x',true)::text;
select '11 borrador no publicado: ' || public.solicitar_boleto('borrador-ajeno','Beto','1980-01-01','Hombre',:gdl,null,1,'x',true)::text;
select '12 llena: ' || (public.solicitar_boleto(:'slug','Caro','2001-02-03','Otro',:tij,null,3,'redes',true)->>'estado');
select '13 agotado: ' || public.solicitar_boleto(:'slug','Dani','2012-07-08','Prefiero no decir',:ens,null,4,'redes',true)::text;
select '14 espera: ' || (public.solicitar_boleto(:'slug','Dani','2012-07-08','Prefiero no decir',:ens,null,4,'redes',true,true)->>'estado');
select '15 ver: ' || public.ver_boleto(:'tok')::text;
select '16 programa: ' || disponibles || ' ' || estado_boletos from public.vista_programa where slug=:'slug';

\echo ---- RECUPERAR
select '17 recuperar Ana: ' || jsonb_array_length(public.recuperar_boletos('ana lópez','1990-05-10')->'boletos') || ' boleto(s), token igual: ' || (public.recuperar_boletos('Ana Lopez','1990-05-10')->'boletos'->0->>'token' = :'tok')::text;
select '18 fecha equivocada: ' || public.recuperar_boletos('Ana López','1990-05-11')::text;
select '18b datos incompletos: ' || public.recuperar_boletos('A', null)::text;
select '19 cancelar: ' || public.cancelar_boleto(:'tok')::text;
select '20 recuperar ya no lo trae: ' || public.recuperar_boletos('Ana López','1990-05-10')::text;
select public.solicitar_boleto(:'slug','Ana López','1990-05-10','Mujer',:ens,null,2,'cartel',true) as r2 \gset
select :'r2'::jsonb->>'token' as tok2 \gset
select '21 re-pide tras cancelar: ' || (:'r2'::jsonb->>'estado') || ', token nuevo: ' || (:'tok2' <> :'tok')::text;

\echo 22 lecturas prohibidas (deben fallar las tres):
select count(*) from public.boletos;
select count(*) from public.lugares_colonias;
select public._emitir_boleto(null,null,null,null,null,null,1,null,false,true);
reset role;
select '25 actualizado intacto: ' || (actualizado = :'antes')::text from public.actividades where id=:'act';
select '26 boleto guardado: ' || nombre || ' / ' || fecha_nacimiento || ' / ' || genero || ' / ' || municipio || ' / ' || coalesce(colonia,'-') from public.boletos where token=:'tok';
select '27 sin tabla de personas ni correo: ' || (to_regclass('public.asistentes') is null)::text || ' / ' ||
       (not exists (select 1 from information_schema.columns where table_name='boletos' and column_name='correo'))::text;
select '28 aforo: ' || emitidos || ' emitidos / ' || en_espera || ' espera' from public.aforos where actividad_id=:'act';

\echo ---- COORDINADOR AJENO
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select '30 ajeno emite: ' || public.emitir_boleto_panel(:'act','X')::text;
select '31 ajeno ve boletos directo: ' || count(*) from public.boletos;
select '29 ajeno lista (debe fallar): ' || count(*) from public.boletos_de_actividad(:'act');

\echo ---- COORDINADOR DUEÑO
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select '33 lista: ' || string_agg(codigo||' '||nombre||' '||estado, ' | ') from public.boletos_de_actividad(:'act');
select '34 resumen: ' || public.resumen_boletos(:'act')::text;
select '35 grupo excede: ' || public.emitir_boleto_panel(:'act','Prof. Ruiz, Esc. Benito Juárez',30,true)::text;
select '35b grupo cabe (espera): ' || (public.emitir_boleto_panel(:'act','Prof. Ruiz, Esc. Benito Juárez',30,true,true)->>'estado');
insert into public.puertas (actividad_id, etiqueta) values (:'act','Voluntaria Eva') returning token as clave \gset

\echo ---- VOLUNTARIA SIN CUENTA
reset request.jwt.claim.sub;
set role anon;
select '39 lista de puerta: ' || jsonb_array_length(public.lista_puerta(:'act', :'clave')->'boletos') || ' boletos';
select '40 marcar por token: ' || (public.marcar_entrada(:'act', :'tok2', :'clave', 1)->>'resultado');
select '44 buscar por nombre: ' || public.buscar_en_puerta(:'act', 'lopez', :'clave')::text;
select '44b buscar por código con punto: ' || jsonb_array_length(public.buscar_en_puerta(:'act', substr(:'r2'::jsonb->>'codigo',1,3) || '·' || substr(:'r2'::jsonb->>'codigo',4), :'clave')->'boletos');
reset role;

\echo ---- LÍMITES POR IP
set role anon;
set request.headers = '{"cf-connecting-ip":"9.9.9.9"}';
select '55 pedir: ' || string_agg(coalesce(r->>'error', r->>'estado'), ',') from (
  select public.solicitar_boleto('nada','X','1990-01-01','Mujer',1,null,1,'x',true) as r from generate_series(1,42)) t;
set request.headers = '{"cf-connecting-ip":"8.8.8.8"}';
select '56 recuperar: ' || string_agg(coalesce(r->>'error', 'ok'), ',') from (
  select public.recuperar_boletos('Nadie', ('1990-01-' || lpad(g::text,2,'0'))::date) as r from generate_series(1,12) g) t;
reset role;
