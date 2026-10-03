-- Prueba de la puerta (sql/17-puerta.sql). Correr después de preparar.sh y de
-- aplicar 13 a 17:
--   docker exec -i fdc-prueba psql -U postgres -X < pruebas/boletos/puerta.sql
-- Cada renglón dice lo que se espera entre corchetes.
\set QUIET on
\pset format unaligned
\pset tuples_only on

update public.actividades set acceso='boleto', cupo=20, lugares_max=4 where titulo='Taller de microscopía';
update public.actividades set acceso='boleto', cupo=20, lugares_max=4 where titulo='Charla empalmada';
select id as act  from public.actividades where titulo='Taller de microscopía' \gset
select id as act2 from public.actividades where titulo='Charla empalmada' \gset
select slug  from public.actividades where titulo='Taller de microscopía' \gset
select slug as slug2 from public.actividades where titulo='Charla empalmada' \gset
select id as ens from public.lugares_municipios where estado='Baja California' and municipio='Ensenada' \gset
delete from public.intentos;

-- Tres boletos: una familia de 3 y una persona en el taller; otra en la charla.
set role anon;
set request.headers = '{"cf-connecting-ip":"5.5.5.5"}';
select public.solicitar_boleto(:'slug','Familia Puerta','1980-01-01','Mujer',:ens,null,3,'cartel',true)->>'token' as t1 \gset
select public.solicitar_boleto(:'slug','Sola Puerta','1991-02-02','Hombre',:ens,null,1,'cartel',true)->>'token' as t2 \gset
select public.solicitar_boleto(:'slug2','Charla Puerta','1992-03-03','Otro',:ens,null,1,'cartel',true)->>'token' as t3 \gset
reset role;
select id as b1 from public.boletos where token = :'t1' \gset

-- El coordinador crea dos claves desde el panel.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.puertas (actividad_id, etiqueta) values (:'act', 'Eva') returning codigo as cod1 \gset
insert into public.puertas (actividad_id, etiqueta) values (:'act2', 'Eva') returning codigo as cod2 \gset
select '1 el coordinador ve el código [8 caracteres]: ' || length(codigo) from public.puertas where codigo = :'cod1';
update public.puertas set codigo = 'AAAAAAAA' where codigo = :'cod1';
select '2 nadie cambia el código [1]: ' || count(*) from public.puertas where codigo = :'cod1';
reset role;
reset request.jwt.claim.sub;

\echo ---- ENTRAR
set role anon;
set request.headers = '{"cf-connecting-ip":"6.6.6.6"}';
select '3 código con guion y minúsculas [ok]: '
       || (public.entrar_puerta(lower(substr(:'cod1',1,4) || '-' || substr(:'cod1',5)))->>'ok');
select public.entrar_puerta(:'cod1')->>'clave' as k1 \gset
select public.entrar_puerta(:'cod2')->>'clave' as k2 \gset
select '4 la clave es la larga [64]: ' || length(:'k1');
select '5 diez fallos [codigo x10]: ' || string_agg(public.entrar_puerta('ZZZZ-ZZZZ')->>'error', ',') from generate_series(1,10);
select '6 el undécimo, aunque sea bueno [demasiados]: ' || (public.entrar_puerta(:'cod1')->>'error');
set request.headers = '{"cf-connecting-ip":"7.7.7.7"}';
select '7 otra dirección [true]: ' || (public.entrar_puerta(:'cod1')->>'ok');
select '8 anon no lee puertas [ERROR esperado]:';
select count(*) from public.puertas;
reset role;

\echo ---- MARCAR, AJUSTAR, DESHACER
set role anon;
select '9 familia [adelante 3]: ' || (r->>'resultado') || ' ' || (r->>'asistieron')
  from (select public.marcar_entrada(:'act', :'t1', :'k1', null, now() - interval '2 minutes') r) x;
select '10 otra vez [ya_entro]: ' || (public.marcar_entrada(:'act', :'t1', :'k1')->>'error');
select '11 entraron 2 [ok 2]: ' || (r->>'ok') || ' ' || (r->>'asistieron')
  from (select public.ajustar_entrada(:'act', :'b1', 2, :'k1') r) x;
select '12 entraron 5 de 3 [lugares, máximo 3]: ' || (r->>'error') || ' ' || (r->>'maximo')
  from (select public.ajustar_entrada(:'act', :'b1', 5, :'k1') r) x;
select '13 adentro [2]: ' || (public.lista_puerta(:'act', :'k1')->'aforo'->>'asistieron');
select '14 deshacer [true]: ' || (public.anular_entrada(:'act', :'b1', :'k1')->>'ok');
select '15 adentro tras deshacer [0]: ' || (public.lista_puerta(:'act', :'k1')->'aforo'->>'asistieron');
select '16 ajustar sin entrada [sin_entrada]: ' || (public.ajustar_entrada(:'act', :'b1', 1, :'k1')->>'error');
select '17 vuelve a entrar [adelante]: ' || (public.marcar_entrada(:'act', :'t1', :'k1')->>'resultado');

\echo ---- SIN BOLETO
select (public.lista_puerta(:'act', :'k1')->'aforo'->>'emitidos')::int as emit0 \gset
select public.entrada_sin_boleto(:'act', 1, :'k1')->>'id' as sb \gset
select '18 +1 que eran 3 [ok 3]: ' || (r->>'ok') || ' ' || (r->>'lugares')
  from (select public.ajustar_entrada(:'act', :'sb', 3, :'k1') r) x;
select '19 emitidos subió 3 [3]: ' || ((public.lista_puerta(:'act', :'k1')->'aforo'->>'emitidos')::int - :emit0);
select '20 deshacer el +1 [true]: ' || (public.anular_entrada(:'act', :'sb', :'k1')->>'ok');
select '21 emitidos como antes [0]: ' || ((public.lista_puerta(:'act', :'k1')->'aforo'->>'emitidos')::int - :emit0);
select '22 y ya no está en la lista [0]: ' || count(*)
  from jsonb_array_elements(public.lista_puerta(:'act', :'k1')->'boletos') e where e->>'id' = :'sb';

\echo ---- RUTEO ENTRE ACTIVIDADES
select '23 boleto de la charla con la clave del taller [otra_actividad, id de la charla]: '
       || (r->>'error') || ' ' || ((r->'actividad'->>'id') = :'act2')
  from (select public.marcar_entrada(:'act', :'t3', :'k1') r) x;
select '24 con la clave de la charla [adelante]: ' || (public.marcar_entrada(:'act2', :'t3', :'k2')->>'resultado');
select '25 clave del taller no abre la charla [sin_permiso]: ' || (public.lista_puerta(:'act2', :'k1')->>'error');

\echo ---- SIN RED
select '26 marca hecha sin red, con hora de antes [adelante]: '
       || (public.marcar_entrada(:'act', :'t2', :'k1', null, now() - interval '20 minutes')->>'resultado');
select '27 la misma marca llega otra vez al sincronizar [ya_entro]: '
       || (public.marcar_entrada(:'act', :'t2', :'k1', null, now() - interval '20 minutes')->>'error');
reset role;
select '28 se queda la hora de la primera [20 min]: '
       || round(extract(epoch from now() - asistio_en) / 60) || ' min' from public.boletos where token = :'t2';

\echo ---- REVOCAR
update public.puertas set activa = false where codigo = :'cod1';
set role anon;
select '29 código revocado [clave_vencida]: ' || (public.entrar_puerta(:'cod1')->>'error');
select '30 la clave guardada deja de servir [sin_permiso]: ' || (public.lista_puerta(:'act', :'k1')->>'error');
reset role;

\echo ---- CONTADORES CUADRAN
select '31 aforo = suma de boletos [t t]: ' || (f.asistieron = coalesce(s.a, 0)) || ' ' || (f.emitidos = coalesce(s.e, 0))
  from public.aforos f
  left join (select actividad_id, sum(asistieron) filter (where asistio_en is not null) a,
                    sum(lugares) filter (where estado = 'activo') e
               from public.boletos group by actividad_id) s on s.actividad_id = f.actividad_id
 where f.actividad_id = :'act';

\echo ---- ELIMINAR (sql/18)
select count(*) as antes from public.boletos where actividad_id = :'act' \gset
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select '32 el coordinador no elimina [sin_permiso]: ' || (public.eliminar_boletos_panel(array[:'b1']::uuid[])->>'error');
reset role;
set role anon;
select '33 sin cuenta [ERROR]:';
select public.eliminar_boletos_panel(array[:'b1']::uuid[]);
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select '34 la administración elimina dos, uno que ya entró y el +1 cancelado [2]: '
       || (public.eliminar_boletos_panel(array[:'b1', :'sb', gen_random_uuid()]::uuid[])->>'eliminados');
reset role;
reset request.jwt.claim.sub;
select '35 quedan [antes - 2]: ' || (count(*) = :antes - 2) from public.boletos where actividad_id = :'act';
select '36 contadores recalculados [t t]: ' || (f.asistieron = coalesce(s.a, 0)) || ' ' || (f.emitidos = coalesce(s.e, 0))
  from public.aforos f
  left join (select actividad_id, sum(asistieron) filter (where asistio_en is not null and estado <> 'cancelado') a,
                    sum(lugares) filter (where estado = 'activo') e
               from public.boletos group by actividad_id) s on s.actividad_id = f.actividad_id
 where f.actividad_id = :'act';
