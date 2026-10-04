-- =============================================================================
--  PRUEBAS · 19-voluntariado.sql
--
--  Corre sobre la base desechable que arma pruebas/voluntariado/probar.sh.
--  Cada prueba que falla detiene el archivo con «FALLA n: …»; si llega al
--  final, imprime «TODAS LAS PRUEBAS DE VOLUNTARIADO PASARON».
--
--  Personas (las crea pruebas/boletos/preparar.sh):
--    1111…  coordinador, dueño de «Taller de microscopía» y «Charla empalmada»
--           (publicadas, dentro de 5 días: 10:00–12:00 y 11:00–…)
--    3333…  otro coordinador, dueño de «Borrador ajeno» (sin publicar)
--    2222…  administración
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

do $$
begin
  perform set_config('prueba.taller',   (select id::text from public.actividades where titulo = 'Taller de microscopía'), false);
  perform set_config('prueba.charla',   (select id::text from public.actividades where titulo = 'Charla empalmada'), false);
  perform set_config('prueba.borrador', (select id::text from public.actividades where titulo = 'Borrador ajeno'), false);
  perform set_config('prueba.uabc',     (select id::text from public.instituciones where clave = 'uabc'), false);
end $$;


-- ---- el coordinador da de alta sus puestos ---------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare v uuid;
begin
  -- 1 · puesto de 2 vacantes, el mismo día del taller, empieza antes
  insert into public.puestos (actividad_id, categoria, titulo, descripcion, hora_inicio, hora_fin, vacantes, contacto_dia)
  values (current_setting('prueba.taller')::uuid, 'acceso', 'Validar boletos en la puerta',
          'Escanear boletos con el teléfono.', '09:30', '12:30', 2, 'Pregunta por Ana en taquilla')
  returning id into v;
  perform set_config('prueba.puerta', v::text, false);
  if (select creado_por from public.puestos where id = v) <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'FALLA 1: creado_por no quedó con quien dio de alta el puesto';
  end if;

  -- 2 · otro puesto de la charla, que se empalma con el de la puerta
  insert into public.puestos (actividad_id, categoria, titulo, hora_inicio, hora_fin, vacantes)
  values (current_setting('prueba.charla')::uuid, 'atencion', 'Acomodar al público', '11:00', '13:00', 3)
  returning id into v;
  perform set_config('prueba.acomodar', v::text, false);

  -- 3 · uno que NO se empalma: la misma charla, por la tarde
  insert into public.puestos (actividad_id, categoria, titulo, hora_inicio, hora_fin, vacantes)
  values (current_setting('prueba.charla')::uuid, 'montaje', 'Desmontaje', '13:00', '15:00', 1)
  returning id into v;
  perform set_config('prueba.desmontaje', v::text, false);

  -- 4 · uno oculto del directorio
  insert into public.puestos (actividad_id, titulo, hora_inicio, hora_fin, vacantes, en_directorio)
  values (current_setting('prueba.taller')::uuid, 'Puesto interno', '08:00', '09:00', 1, false)
  returning id into v;
  perform set_config('prueba.oculto', v::text, false);

  -- 5 · no puede crear puestos en la actividad de otra persona
  begin
    insert into public.puestos (actividad_id, titulo, hora_inicio, hora_fin, vacantes)
    values (current_setting('prueba.borrador')::uuid, 'Ajeno', '10:00', '11:00', 1);
    raise exception 'FALLA 5: dejó crear un puesto en una actividad ajena';
  exception when insufficient_privilege then null;
  end;

  -- 6 · el horario tiene que terminar después de empezar
  begin
    insert into public.puestos (actividad_id, titulo, hora_inicio, hora_fin, vacantes)
    values (current_setting('prueba.taller')::uuid, 'Al revés', '12:00', '10:00', 1);
    raise exception 'FALLA 6: aceptó un horario que termina antes de empezar';
  exception when check_violation then null;
  end;
end $$;

-- El otro coordinador crea un puesto en SU borrador (sin publicar).
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare v uuid;
begin
  insert into public.puestos (actividad_id, titulo, hora_inicio, hora_fin, vacantes)
  values (current_setting('prueba.borrador')::uuid, 'Del borrador', '15:00', '17:00', 2)
  returning id into v;
  perform set_config('prueba.del_borrador', v::text, false);

  -- 7 · no ve los puestos del otro coordinador
  if exists (select 1 from public.puestos where id = current_setting('prueba.puerta')::uuid) then
    raise exception 'FALLA 7: un coordinador ve los puestos de otro';
  end if;
end $$;


-- ---- sin cuenta -------------------------------------------------------------
reset request.jwt.claim.sub;
set role anon;

do $$
declare r jsonb; n int;
begin
  -- 8 · sin cuenta no se lee ninguna tabla de personas ni de puestos
  begin perform 1 from public.voluntarios limit 1;   raise exception 'FALLA 8a: anon lee voluntarios';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.inscripciones limit 1; raise exception 'FALLA 8b: anon lee inscripciones';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.puestos limit 1;       raise exception 'FALLA 8c: anon lee puestos';
  exception when insufficient_privilege then null; end;

  -- 9 · el directorio: solo lo visible de lo publicado
  select count(*) into n from public.directorio_voluntariado();
  if n <> 3 then raise exception 'FALLA 9: el directorio debía traer 3 puestos y trajo %', n; end if;
  if exists (select 1 from public.directorio_voluntariado()
              where id in (current_setting('prueba.oculto')::uuid, current_setting('prueba.del_borrador')::uuid)) then
    raise exception 'FALLA 9b: el directorio enseña un puesto oculto o de una actividad sin publicar';
  end if;

  -- 10 · las instituciones activas se leen sin cuenta
  if (select count(*) from public.instituciones) < 5 then raise exception 'FALLA 10: no se leen las instituciones'; end if;

  -- 11 · inscribirse: bien
  r := public.inscribirse_voluntariado(current_setting('prueba.puerta')::uuid,
        'Luis Pérez', '  Luis@Correo.MX ', '646 123 4567', current_setting('prueba.uabc')::uuid, null,
        'Biología', 'A01234', 'Mtra. Rosa Díaz', 'rosa@uabc.mx', true, true);
  if not (r->>'ok')::boolean then raise exception 'FALLA 11: no inscribió: %', r; end if;
  perform set_config('prueba.token_luis', r->'turno'->>'token', false);
  if r->'turno'->'puesto'->>'contacto_dia' is null then raise exception 'FALLA 11b: el comprobante no trae el contacto del día'; end if;

  -- 12 · el directorio NO enseña el contacto del día
  if exists (select 1 from jsonb_object_keys(to_jsonb((select d from public.directorio_voluntariado() d limit 1))) k
              where k = 'contacto_dia') then
    raise exception 'FALLA 12: el directorio enseña el contacto del día';
  end if;

  -- 13 · el mismo correo, otra vez al mismo puesto: ya_inscrito, y SIN token
  r := public.inscribirse_voluntariado(current_setting('prueba.puerta')::uuid,
        'Impostor', 'luis@correo.mx', '6460000000', current_setting('prueba.uabc')::uuid, null,
        'Otra', null, 'Alguien', null, true, true);
  if r->>'error' <> 'ya_inscrito' then raise exception 'FALLA 13: esperaba ya_inscrito: %', r; end if;
  if r ? 'turno' or r::text like '%token%' then raise exception 'FALLA 13b: entregó el turno de otra persona'; end if;

  -- 14 · el impostor no cambió los datos de Luis
  -- (se revisa abajo, como administración)

  -- 15 · empalme: Luis a «Acomodar» (11–13) choca con la puerta (9:30–12:30)
  r := public.inscribirse_voluntariado(current_setting('prueba.acomodar')::uuid,
        'Luis Pérez', 'luis@correo.mx', '6461234567', current_setting('prueba.uabc')::uuid, null,
        'Biología', null, 'Mtra. Rosa Díaz', null, true, true);
  if r->>'error' <> 'empalme' then raise exception 'FALLA 15: esperaba empalme: %', r; end if;
  if r->'choque'->>'puesto' <> 'Validar boletos en la puerta' then raise exception 'FALLA 15b: no dijo con qué choca: %', r; end if;

  -- 16 · sin empalme: Luis a «Desmontaje» (13–15) sí puede: turnos seguidos no chocan
  r := public.inscribirse_voluntariado(current_setting('prueba.desmontaje')::uuid,
        'Luis Pérez', 'luis@correo.mx', '6461234567', current_setting('prueba.uabc')::uuid, null,
        'Biología', null, 'Mtra. Rosa Díaz', null, true, true);
  if not (r->>'ok')::boolean then raise exception 'FALLA 16: no dejó tomar un turno que no se empalma: %', r; end if;

  -- 17 · lleno: el desmontaje tenía 1 vacante
  r := public.inscribirse_voluntariado(current_setting('prueba.desmontaje')::uuid,
        'Ana López', 'ana@correo.mx', '6469998877', null, 'Escuela de Artes',
        'Danza', null, 'Prof. Juan', null, true, true);
  if r->>'error' <> 'lleno' then raise exception 'FALLA 17: esperaba lleno: %', r; end if;

  -- 18 · sin consentimiento, sin mayoría de edad y con datos malos
  r := public.inscribirse_voluntariado(current_setting('prueba.puerta')::uuid, 'Ana López', 'ana@correo.mx',
        '6469998877', null, 'Escuela de Artes', 'Danza', null, 'Prof. Juan', null, true, false);
  if r->>'error' <> 'consentimiento' then raise exception 'FALLA 18a: %', r; end if;
  r := public.inscribirse_voluntariado(current_setting('prueba.puerta')::uuid, 'Ana López', 'ana@correo.mx',
        '6469998877', null, 'Escuela de Artes', 'Danza', null, 'Prof. Juan', null, false, true);
  if r->>'error' <> 'mayor_edad' then raise exception 'FALLA 18b: %', r; end if;
  r := public.inscribirse_voluntariado(current_setting('prueba.puerta')::uuid, 'Ana López', 'no-es-correo',
        '6469998877', null, 'Escuela de Artes', 'Danza', null, 'Prof. Juan', null, true, true);
  if r->>'error' <> 'datos' or r->>'campo' <> 'correo' then raise exception 'FALLA 18c: %', r; end if;
  r := public.inscribirse_voluntariado(current_setting('prueba.puerta')::uuid, 'Ana López', 'ana@correo.mx',
        '123', null, 'Escuela de Artes', 'Danza', null, 'Prof. Juan', null, true, true);
  if r->>'campo' <> 'telefono' then raise exception 'FALLA 18d: %', r; end if;
  r := public.inscribirse_voluntariado(current_setting('prueba.puerta')::uuid, 'Ana López', 'ana@correo.mx',
        '6469998877', null, '', 'Danza', null, 'Prof. Juan', null, true, true);
  if r->>'campo' <> 'institucion' then raise exception 'FALLA 18e: %', r; end if;

  -- 19 · no se toma un puesto oculto ni uno de una actividad sin publicar
  r := public.inscribirse_voluntariado(current_setting('prueba.oculto')::uuid, 'Ana López', 'ana@correo.mx',
        '6469998877', null, 'Escuela de Artes', 'Danza', null, 'Prof. Juan', null, true, true);
  if r->>'error' <> 'cerrado' then raise exception 'FALLA 19a: %', r; end if;
  r := public.inscribirse_voluntariado(current_setting('prueba.del_borrador')::uuid, 'Ana López', 'ana@correo.mx',
        '6469998877', null, 'Escuela de Artes', 'Danza', null, 'Prof. Juan', null, true, true);
  if r->>'error' <> 'cerrado' then raise exception 'FALLA 19b: %', r; end if;

  -- 20 · Ana sí entra a la puerta (queda 1 de 2 → 2 de 2)
  r := public.inscribirse_voluntariado(current_setting('prueba.puerta')::uuid, 'Ana López', 'ana@correo.mx',
        '6469998877', null, 'Escuela de Artes', 'Danza', null, 'Prof. Juan', null, true, true);
  if not (r->>'ok')::boolean then raise exception 'FALLA 20: %', r; end if;
  perform set_config('prueba.token_ana', r->'turno'->>'token', false);
  if (select ocupadas from public.directorio_voluntariado() where id = current_setting('prueba.puerta')::uuid) <> 2 then
    raise exception 'FALLA 20b: el directorio no cuenta las vacantes ocupadas';
  end if;

  -- 21 · ver los turnos guardados en el teléfono
  r := public.ver_turnos(array[current_setting('prueba.token_luis'), 'token-inventado']);
  if jsonb_array_length(r) <> 1 then raise exception 'FALLA 21: ver_turnos trajo % turnos', jsonb_array_length(r); end if;

  -- 22 · Ana cancela: libera el lugar
  r := public.cancelar_turno(current_setting('prueba.token_ana'));
  if r->'turno'->>'estado' <> 'cancelado' then raise exception 'FALLA 22: no canceló: %', r; end if;
  if (select ocupadas from public.directorio_voluntariado() where id = current_setting('prueba.puerta')::uuid) <> 1 then
    raise exception 'FALLA 22b: cancelar no liberó el lugar';
  end if;

  -- 23 · vuelve al mismo puesto: se reactiva con un token NUEVO
  r := public.inscribirse_voluntariado(current_setting('prueba.puerta')::uuid, 'Ana López', 'ana@correo.mx',
        '6469998877', null, 'Escuela de Artes', 'Danza', null, 'Prof. Juan', null, true, true);
  if not (r->>'ok')::boolean then raise exception 'FALLA 23: no la reactivó: %', r; end if;
  if r->'turno'->>'token' = current_setting('prueba.token_ana') then raise exception 'FALLA 23b: reusó el token viejo'; end if;
  perform set_config('prueba.token_ana', r->'turno'->>'token', false);
end $$;


-- ---- el coordinador, con su gente -------------------------------------------
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare r jsonb; v_ana uuid; v_luis_puerta uuid;
begin
  -- 24 · ve a la gente de su actividad, con sus datos de contacto
  r := public.voluntarios_de_actividad(current_setting('prueba.taller')::uuid);
  if not (r->>'ok')::boolean or jsonb_array_length(r->'inscripciones') < 2 then
    raise exception 'FALLA 24: no ve a su gente: %', r;
  end if;
  if not exists (select 1 from jsonb_array_elements(r->'inscripciones') x
                  where x->'voluntario'->>'telefono' = '646 123 4567'
                    and x->'voluntario'->>'institucion' like 'Universidad Autónoma%') then
    raise exception 'FALLA 24b: faltan datos de contacto o institución';
  end if;

  select (x->>'id')::uuid into v_ana from jsonb_array_elements(r->'inscripciones') x
   where x->'voluntario'->>'correo' = 'ana@correo.mx' and x->>'estado' = 'inscrito';
  select (x->>'id')::uuid into v_luis_puerta from jsonb_array_elements(r->'inscripciones') x
   where x->'voluntario'->>'correo' = 'luis@correo.mx' and x->>'estado' = 'inscrito';

  -- 25 · no ve a la gente de la actividad de otro
  r := public.voluntarios_de_actividad(current_setting('prueba.borrador')::uuid);
  if r->>'error' <> 'permiso' then raise exception 'FALLA 25: vio la gente de una actividad ajena'; end if;

  -- 26 · ocupación de sus puestos
  r := public.ocupacion_puestos(array[current_setting('prueba.puerta')::uuid, current_setting('prueba.del_borrador')::uuid]);
  if (r->>current_setting('prueba.puerta'))::int <> 2 then raise exception 'FALLA 26: ocupación mal contada: %', r; end if;
  if r ? current_setting('prueba.del_borrador') then raise exception 'FALLA 26b: contó un puesto ajeno'; end if;

  -- 27 · asignar a mano: la puerta está llena (2 de 2) → lleno, salvo con sobrecupo
  r := public.asignar_voluntario(current_setting('prueba.puerta')::uuid, 'Carla Ruiz', 'carla@correo.mx',
        '6465551111', null, 'Por WhatsApp', 'Física', null, 'Dr. Mario', null, true, false);
  if r->>'error' <> 'lleno' then raise exception 'FALLA 27a: %', r; end if;
  r := public.asignar_voluntario(current_setting('prueba.puerta')::uuid, 'Carla Ruiz', 'carla@correo.mx',
        '6465551111', null, 'Por WhatsApp', 'Física', null, 'Dr. Mario', null, true, true);
  if not (r->>'ok')::boolean then raise exception 'FALLA 27b: con sobrecupo no la asignó: %', r; end if;

  -- 28 · asignar a mano NO se salta los empalmes
  r := public.asignar_voluntario(current_setting('prueba.acomodar')::uuid, 'Luis Pérez', 'luis@correo.mx',
        '6461234567', current_setting('prueba.uabc')::uuid, null, 'Biología', null, 'Mtra. Rosa Díaz', null, true, true);
  if r->>'error' <> 'empalme' then raise exception 'FALLA 28: asignar a mano se saltó un empalme: %', r; end if;

  -- 29 · mover a Ana de la puerta a «Acomodar»: Ana no tiene otro turno, se puede
  r := public.mover_voluntario(v_ana, current_setting('prueba.acomodar')::uuid, false);
  if not (r->>'ok')::boolean then raise exception 'FALLA 29: no movió: %', r; end if;

  -- 30 · marcar asistencia: «cumplió» sin horas pone lo que dura el puesto
  r := public.marcar_asistencia(v_luis_puerta, 'cumplio', null, 'Llegó temprano');
  if not (r->>'ok')::boolean then raise exception 'FALLA 30: %', r; end if;
  r := public.voluntarios_de_actividad(current_setting('prueba.taller')::uuid);
  if not exists (select 1 from jsonb_array_elements(r->'inscripciones') x
                  where (x->>'id')::uuid = v_luis_puerta and (x->>'horas')::numeric = 3.00 and x->>'asistencia' = 'cumplio') then
    raise exception 'FALLA 30b: las horas por omisión no son las del puesto (9:30–12:30 = 3)';
  end if;

  -- 31 · quitar a alguien libera el lugar y queda como retirado por la coordinación
  r := public.quitar_voluntario(v_ana);
  if not (r->>'ok')::boolean then raise exception 'FALLA 31: %', r; end if;

  -- 32 · eliminar un puesto con gente: se niega y dice cuántos
  r := public.eliminar_puesto(current_setting('prueba.puerta')::uuid);
  if r->>'error' <> 'tiene_inscritos' then raise exception 'FALLA 32: borró un puesto con gente: %', r; end if;
  -- …y uno vacío sí se borra
  r := public.eliminar_puesto(current_setting('prueba.oculto')::uuid);
  if not (r->>'ok')::boolean then raise exception 'FALLA 32b: no borró un puesto vacío: %', r; end if;
end $$;

-- 33 · el otro coordinador no puede tocar a la gente del primero
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r jsonb;
begin
  r := public.eliminar_puesto(current_setting('prueba.desmontaje')::uuid);
  if r->>'error' <> 'permiso' then raise exception 'FALLA 33: borró un puesto ajeno'; end if;
  r := public.asignar_voluntario(current_setting('prueba.desmontaje')::uuid, 'X', 'x@x.mx',
        '6460000000', null, 'x', 'x', null, 'x', null, true, true);
  if r->>'error' <> 'permiso' then raise exception 'FALLA 33b: asignó en un puesto ajeno'; end if;
end $$;


-- ---- de vuelta sin cuenta: la persona retirada no vuelve sola ---------------
reset request.jwt.claim.sub;
set role anon;
do $$
declare r jsonb;
begin
  -- 34 · Ana fue retirada de «Acomodar» por la coordinación
  r := public.inscribirse_voluntariado(current_setting('prueba.acomodar')::uuid, 'Ana López', 'ana@correo.mx',
        '6469998877', null, 'Escuela de Artes', 'Danza', null, 'Prof. Juan', null, true, true);
  if r->>'error' <> 'retirado' then raise exception 'FALLA 34: la persona retirada volvió sola: %', r; end if;
end $$;


-- ---- la administración --------------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  -- 14 · el «impostor» de la prueba 13 no cambió el teléfono ni el nombre de Luis
  if (select telefono from public.voluntarios where correo = 'luis@correo.mx') <> '646 123 4567'
     or (select nombre from public.voluntarios where correo = 'luis@correo.mx') <> 'Luis Pérez' then
    raise exception 'FALLA 14: alguien con solo el correo cambió los datos de otra persona';
  end if;
  -- 35 · la administración lee voluntarios e inscripciones directo
  if (select count(*) from public.voluntarios) < 3 then raise exception 'FALLA 35: la administración no ve a los voluntarios'; end if;
  if (select count(*) from public.inscripciones) < 4 then raise exception 'FALLA 35b: la administración no ve las inscripciones'; end if;
  -- 36 · el correo quedó normalizado
  if not exists (select 1 from public.voluntarios where correo = 'luis@correo.mx') then
    raise exception 'FALLA 36: el correo no se guardó en minúsculas y sin espacios';
  end if;
end $$;

-- El coordinador NO lee la tabla de voluntarios directo.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  -- 37
  if exists (select 1 from public.voluntarios) then
    raise exception 'FALLA 37: un coordinador lee la tabla de voluntarios de todo el festival';
  end if;
end $$;

-- 38 · con una institución desactivada, el formulario público sigue leyendo
--      la lista: la regla «activa OR es_administrador()» no debe tronar para
--      quien no tiene cuenta.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.instituciones set activa = false where clave = 'cicese';
reset request.jwt.claim.sub;
set role anon;
do $$
begin
  if (select count(*) from public.instituciones) <> 4 then
    raise exception 'FALLA 38: sin cuenta no se lee bien la lista con una institución inactiva';
  end if;
end $$;
reset role;
update public.instituciones set activa = true where clave = 'cicese';

reset role;
\echo 'TODAS LAS PRUEBAS DE VOLUNTARIADO PASARON'
