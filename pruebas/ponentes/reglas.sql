-- =============================================================================
--  PRUEBAS · 13-ponentes.sql
--
--  Corre sobre la base desechable que arma pruebas/ponentes/probar.sh. Cada
--  prueba que falla detiene el archivo con «FALLA n: …»; si llega al final,
--  imprime «TODAS LAS PRUEBAS DE PONENTES PASARON».
--
--  Personas (las crea pruebas/boletos/preparar.sh):
--    1111…  coordinador, dueño de «Taller de microscopía» (publicada)
--    3333…  otro coordinador, dueño de «Borrador ajeno» (sin publicar)
--    2222…  administración
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

-- Lo que Supabase concede de fábrica sobre Storage y la simulación no trae.
grant select, insert, update, delete on storage.objects to authenticated;

do $$
begin
  perform set_config('prueba.taller',   (select id::text from public.actividades where titulo = 'Taller de microscopía'), false);
  perform set_config('prueba.borrador', (select id::text from public.actividades where titulo = 'Borrador ajeno'), false);
end $$;


-- ---- como el coordinador dueño ----------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare v_id uuid;
begin
  -- 1 · da de alta a un ponente, y la base anota quién fue
  insert into public.ponentes (nombre, semblanza, institucion)
  values ('Dra. Ana Ruiz', 'Investigadora en nanomateriales.', 'CNyN-UNAM')
  returning id into v_id;
  perform set_config('prueba.ana', v_id::text, false);

  if not exists (select 1 from public.ponentes
                  where id = current_setting('prueba.ana')::uuid
                    and creado_por = '11111111-1111-1111-1111-111111111111') then
    raise exception 'FALLA 1: creado_por no quedó con quien lo dio de alta';
  end if;

  -- 2 · no puede escribir «creado_por» a mano
  begin
    insert into public.ponentes (nombre, creado_por)
    values ('Suplantado', '33333333-3333-3333-3333-333333333333');
    raise exception 'FALLA 2: dejó escribir creado_por al insertar';
  exception when insufficient_privilege then null;
  end;

  -- 3 · lo liga a su actividad
  insert into public.actividad_ponentes (actividad_id, ponente_id, papel, orden)
  values (current_setting('prueba.taller')::uuid, current_setting('prueba.ana')::uuid, 'Ponente', 1);

  -- 4 · no lo puede ligar a una actividad ajena
  begin
    insert into public.actividad_ponentes (actividad_id, ponente_id)
    values (current_setting('prueba.borrador')::uuid, current_setting('prueba.ana')::uuid);
    raise exception 'FALLA 4: dejó ligar un ponente a una actividad ajena';
  exception when insufficient_privilege then null;
  end;

  -- 5 · edita su semblanza
  update public.ponentes set semblanza = 'Investigadora del CNyN.'
   where id = current_setting('prueba.ana')::uuid;
  if not found then raise exception 'FALLA 5: el dueño no pudo editar la semblanza'; end if;

  -- 6 · no puede cambiar «creado_por»
  begin
    update public.ponentes set creado_por = '33333333-3333-3333-3333-333333333333'
     where id = current_setting('prueba.ana')::uuid;
    raise exception 'FALLA 6: dejó cambiar creado_por';
  exception when insufficient_privilege then null;
  end;

  -- 7 · la foto tiene que vivir en la carpeta del ponente
  begin
    update public.ponentes set foto = gen_random_uuid()::text || '/foto-x.webp'
     where id = current_setting('prueba.ana')::uuid;
    raise exception 'FALLA 7: aceptó una foto de otra carpeta';
  exception when check_violation then null;
  end;

  -- 8 · el sitio solo puede ser http(s)
  begin
    update public.ponentes set sitio = 'javascript:alert(1)'
     where id = current_setting('prueba.ana')::uuid;
    raise exception 'FALLA 8: aceptó un sitio javascript:';
  exception when check_violation then null;
  end;
  update public.ponentes set sitio = 'https://www.cnyn.unam.mx'
   where id = current_setting('prueba.ana')::uuid;

  -- 9 · no puede cambiar la participación de actividad
  begin
    update public.actividad_ponentes set actividad_id = current_setting('prueba.borrador')::uuid
     where ponente_id = current_setting('prueba.ana')::uuid;
    raise exception 'FALLA 9: dejó mover una participación a otra actividad';
  exception when insufficient_privilege then null;
  end;

  -- 10 · la foto: sube a la carpeta de su ponente, no a otra ni a una ruta rota
  insert into storage.objects (bucket_id, name)
  values ('ponentes', current_setting('prueba.ana') || '/foto-a1.webp');

  begin
    insert into storage.objects (bucket_id, name)
    values ('ponentes', gen_random_uuid()::text || '/foto-a1.webp');
    raise exception 'FALLA 10: dejó subir a la carpeta de otro ponente';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('ponentes', 'hola/foto.webp');
    raise exception 'FALLA 10b: dejó subir a una carpeta que no es un ponente';
  exception when insufficient_privilege then null;
  end;

  update public.ponentes set foto = current_setting('prueba.ana') || '/foto-a1.webp'
   where id = current_setting('prueba.ana')::uuid;
end $$;


-- ---- como otro coordinador --------------------------------------------------
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

do $$
declare n int;
begin
  -- 11 · ve a los ponentes del equipo, para reutilizarlos
  if not exists (select 1 from public.ponentes where id = current_setting('prueba.ana')::uuid) then
    raise exception 'FALLA 11: otro coordinador no puede buscar ponentes ya registrados';
  end if;

  -- 12 · pero no edita a uno que no es suyo ni está en sus actividades
  update public.ponentes set semblanza = 'Vandalizada'
   where id = current_setting('prueba.ana')::uuid;
  if found then raise exception 'FALLA 12: editó un ponente ajeno'; end if;

  -- 13 · ni borra su foto
  delete from storage.objects
   where bucket_id = 'ponentes' and name = current_setting('prueba.ana') || '/foto-a1.webp';
  if found then raise exception 'FALLA 13: borró la foto de un ponente ajeno'; end if;

  -- 14 · no ve las participaciones de borradores ajenos, pero sí las publicadas
  select count(*) into n from public.actividad_ponentes
   where ponente_id = current_setting('prueba.ana')::uuid;
  if n <> 1 then raise exception 'FALLA 14: esperaba 1 participación visible y vio %', n; end if;

  -- 15 · lo invita a SU actividad: desde ahí puede actualizar su semblanza
  insert into public.actividad_ponentes (actividad_id, ponente_id, papel)
  values (current_setting('prueba.borrador')::uuid, current_setting('prueba.ana')::uuid, 'Moderadora');

  update public.ponentes set semblanza = 'Investigadora del CNyN, UNAM.'
   where id = current_setting('prueba.ana')::uuid;
  if not found then raise exception 'FALLA 15: quien lo invitó no pudo actualizar la semblanza'; end if;

  -- 16 · no lo borra: quitarlo de una actividad no borra a la persona
  delete from public.ponentes where id = current_setting('prueba.ana')::uuid;
  if found then raise exception 'FALLA 16: un coordinador borró a un ponente'; end if;
end $$;

-- Un ponente que no participa en nada, para la prueba de anon
insert into public.ponentes (nombre) values ('Huérfano de prueba');


-- ---- sin cuenta -------------------------------------------------------------
reset request.jwt.claim.sub;
set role anon;

do $$
declare n int;
begin
  -- 17 · ve a Ana en lo publicado, no en el borrador
  select count(*) into n from public.vista_programa_ponentes
   where ponente_id = current_setting('prueba.ana')::uuid;
  if n <> 1 then raise exception 'FALLA 17: esperaba 1 fila pública de Ana y vio %', n; end if;

  if exists (select 1 from public.vista_programa_ponentes
              where actividad_id = current_setting('prueba.borrador')::uuid) then
    raise exception 'FALLA 17b: la vista enseñó un ponente de un borrador';
  end if;

  -- 17c · lee todas las columnas de la vista, que es lo que pide la página
  perform actividad_id, edicion_id, slug, orden, papel, ponente_id,
          nombre, institucion, semblanza, foto, sitio
     from public.vista_programa_ponentes;

  -- 18 · no ve a quien no participa en nada publicado
  if exists (select 1 from public.ponentes where nombre = 'Huérfano de prueba') then
    raise exception 'FALLA 18: sin cuenta se ve un ponente que no está en el programa';
  end if;

  -- 19 · no lee quién lo dio de alta
  begin
    perform creado_por from public.ponentes limit 1;
    raise exception 'FALLA 19: sin cuenta se lee creado_por';
  exception when insufficient_privilege then null;
  end;

  -- 20 · no escribe
  begin
    insert into public.ponentes (nombre) values ('Anónimo');
    raise exception 'FALLA 20: sin cuenta se dio de alta un ponente';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.puede_editar_ponente(current_setting('prueba.ana'));
    raise exception 'FALLA 20b: sin cuenta se puede llamar a puede_editar_ponente';
  exception when insufficient_privilege then null;
  end;
end $$;


-- ---- administración ---------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
begin
  -- 21 · edita a cualquiera y borra
  update public.ponentes set institucion = 'CNyN · UNAM'
   where id = current_setting('prueba.ana')::uuid;
  if not found then raise exception 'FALLA 21: la administración no pudo editar'; end if;

  delete from public.ponentes where nombre = 'Huérfano de prueba';
  if not found then raise exception 'FALLA 21b: la administración no pudo borrar'; end if;
end $$;


-- ---- borrar una actividad no borra a la persona ------------------------------
reset role;
reset request.jwt.claim.sub;

delete from public.actividades where id = current_setting('prueba.borrador')::uuid;

do $$
begin
  -- 22
  if exists (select 1 from public.actividad_ponentes
              where actividad_id = current_setting('prueba.borrador')::uuid) then
    raise exception 'FALLA 22: quedaron participaciones de una actividad borrada';
  end if;
  if not exists (select 1 from public.ponentes where id = current_setting('prueba.ana')::uuid) then
    raise exception 'FALLA 22b: borrar la actividad se llevó a la persona';
  end if;
end $$;

\unset QUIET
select 'TODAS LAS PRUEBAS DE PONENTES PASARON' as resultado;
