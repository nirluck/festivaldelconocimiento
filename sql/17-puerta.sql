-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 17 · LA PUERTA (fase F4)
--
--  Lo que necesita /puerta/, la pantalla con la que se registran las entradas
--  desde un celular. Decisiones del 2 de octubre de 2026:
--
--    · Nadie entra con QR ni con liga: /puerta/ pide un CÓDIGO DE PUERTA de
--      ocho caracteres (ABCD-2345) que el coordinador genera y copia en el
--      panel de su actividad, pestaña Boletos. Se teclea una vez: el teléfono
--      lo cambia por la clave larga de siempre y la recuerda.
--    · Un teléfono puede tener los códigos de varias actividades (una misma
--      sala, varias funciones). Al escanear, el boleto va solo a la suya.
--    · Entrar sin boleto o desde la lista de espera es criterio de quien está
--      en la puerta: la base no lo frena.
--
--  Qué hace este archivo
--    1. puertas.codigo: el código corto, generado por la base.
--    2. entrar_puerta(codigo): cambia el código por la clave, con límite de
--       intentos fallidos por dirección IP.
--    3. anular_entrada: corrige un defecto. Buscaba «asistente_id», que
--       12-datos-minimos.sql eliminó: «Deshacer» fallaba siempre.
--    4. ajustar_entrada: «entraron 3 de 4», después de marcar.
--
--  Se puede ejecutar más de una vez.
--
--  OJO · 11-boletos.sql vuelve a crear anular_entrada con el defecto, y su
--  disparador de puertas sin el código corto. Si se vuelve a correr 11, hay
--  que correr 12, 16 y este después.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1 · CÓDIGO DE PUERTA
--
--  Ocho caracteres del alfabeto de los boletos (sin 0/O, 1/I/L): 31⁸ ≈ 850 mil
--  millones de combinaciones. Más largo que el del boleto (seis) porque este
--  sí abre algo: la lista de nombres de la actividad. Con el límite de diez
--  fallos cada diez minutos por dirección, adivinarlo no es práctico.
-- -----------------------------------------------------------------------------
create or replace function public.codigo_puerta_nuevo()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  b bytea;
  c text;
begin
  loop
    -- Dos uuid: ocho bytes aleatorios sin tocar la marca de versión.
    b := substr(uuid_send(gen_random_uuid()), 1, 6) || substr(uuid_send(gen_random_uuid()), 1, 2);
    c := '';
    for i in 0..7 loop
      c := c || substr(alfabeto, 1 + get_byte(b, i) % 31, 1);
    end loop;
    exit when not exists (select 1 from public.puertas where codigo = c);
  end loop;
  return c;
end;
$$;

revoke all on function public.codigo_puerta_nuevo() from public, anon, authenticated;

alter table public.puertas add column if not exists codigo text;

comment on column public.puertas.codigo is
  'Lo que se teclea en /puerta/. Ocho caracteres; se muestra como ABCD-2345. Lo genera la base.';

-- El mismo disparador de 11, con el código. Lo genera siempre la base, y no
-- cambia después: para otro código se crea otra clave.
create or replace function public.preparar_puerta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.token      := public.token_nuevo();
    new.codigo     := public.codigo_puerta_nuevo();
    new.creado_por := auth.uid();
    if new.vence is null then
      select public.inicio_actividad(a.fecha + 1, time '06:00')
        into new.vence
        from public.actividades a
       where a.id = new.actividad_id;
    end if;
  else
    new.token        := old.token;
    new.actividad_id := old.actividad_id;
    new.creado_por   := old.creado_por;
    -- Las claves creadas antes de este archivo reciben aquí su código.
    new.codigo       := coalesce(old.codigo, public.codigo_puerta_nuevo());
  end if;
  return new;
end;
$$;

revoke all on function public.preparar_puerta() from public, anon, authenticated;

update public.puertas set codigo = codigo where codigo is null;

alter table public.puertas alter column codigo set not null;
create unique index if not exists puertas_codigo_unico on public.puertas (codigo);


-- -----------------------------------------------------------------------------
--  2 · entrar_puerta · el código tecleado a cambio de la clave
--
--  Respuestas: ok · codigo (no existe) · clave_vencida (revocada o vencida) ·
--              demasiados
--
--  Solo cuentan los FALLOS: en una sede, todos los voluntarios salen a
--  internet por la misma dirección, y diez códigos bien tecleados no deben
--  bloquear a nadie.
-- -----------------------------------------------------------------------------
create or replace function public.entrar_puerta(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip  text := public.ip_peticion();
  v_cod text := upper(regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Za-z]', '', 'g'));
  p     public.puertas%rowtype;
  v_err text;
begin
  if v_ip is not null and (select count(*) from public.intentos
        where ip = v_ip and tipo = 'puerta' and creado > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'demasiados');
  end if;

  if length(v_cod) = 8 then
    select * into p from public.puertas where codigo = v_cod;
  end if;

  if p.id is null then
    v_err := 'codigo';
  elsif not p.activa or (p.vence is not null and p.vence <= now()) then
    v_err := 'clave_vencida';
  end if;

  if v_err is not null then
    if v_ip is not null then
      insert into public.intentos (ip, tipo) values (v_ip, 'puerta');
      -- Que una lluvia de códigos falsos no haga crecer la tabla sin fin.
      if random() < 0.02 then
        delete from public.intentos where creado < now() - interval '1 day';
      end if;
    end if;
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  return jsonb_build_object('ok', true, 'clave', p.token, 'actividad_id', p.actividad_id,
                            'etiqueta', p.etiqueta, 'vence', p.vence);
end;
$$;

revoke all on function public.entrar_puerta(text) from public, anon, authenticated;
grant execute on function public.entrar_puerta(text) to anon, authenticated;


-- -----------------------------------------------------------------------------
--  3 · anular_entrada · «Deshacer»
--
--  Idéntica a la de 11 salvo el bloque marcado. Una entrada sin boleto (el
--  «+1» de la puerta) no tiene nombre: se cancela entera y libera su lugar.
-- -----------------------------------------------------------------------------
create or replace function public.anular_entrada(p_actividad uuid, p_boleto uuid, p_clave text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.boletos%rowtype;
begin
  if public.es_personal(p_actividad, p_clave) is null then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;

  perform 1 from public.aforos where actividad_id = p_actividad for update;
  select * into b from public.boletos
   where id = p_boleto and actividad_id = p_actividad for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if b.asistio_en is null or b.estado = 'cancelado' then
    return jsonb_build_object('ok', true);
  end if;

  if b.origen = 'puerta' and b.nombre is null then          -- ← 17
    -- Sin hora de entrada: si no, el panel la seguiría contando como «Entró».
    update public.boletos
       set estado = 'cancelado', cancelado_en = now(), asistio_en = null, asistieron = null
     where id = b.id;
    update public.aforos
       set asistieron = greatest(asistieron - coalesce(b.asistieron, 0), 0),
           emitidos   = greatest(emitidos - b.lugares, 0),
           actualizado = now()
     where actividad_id = p_actividad;
  else
    update public.boletos
       set asistio_en = null, asistieron = null, marcado_por = null, puerta_id = null
     where id = b.id;
    update public.aforos
       set asistieron = greatest(asistieron - coalesce(b.asistieron, 0), 0),
           actualizado = now()
     where actividad_id = p_actividad;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.anular_entrada(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.anular_entrada(uuid, uuid, text) to anon, authenticated;


-- -----------------------------------------------------------------------------
--  4 · ajustar_entrada · cuántas personas de un boleto entraron de verdad
--
--  La puerta marca todos los lugares al escanear, para no frenar la fila. Si
--  de un boleto de 4 llegan 3, se corrige aquí. En una entrada sin boleto
--  cambia también sus lugares: «+1» que en realidad eran 3.
--
--  Respuestas: ok · sin_entrada · lugares · no_existe · sin_permiso
-- -----------------------------------------------------------------------------
create or replace function public.ajustar_entrada(
  p_actividad  uuid,
  p_boleto     uuid,
  p_asistieron integer,
  p_clave      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b     public.boletos%rowtype;
  v_n   integer := p_asistieron;
  v_sin boolean;
  v_max integer;
begin
  if public.es_personal(p_actividad, p_clave) is null then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;

  perform 1 from public.aforos where actividad_id = p_actividad for update;
  select * into b from public.boletos
   where id = p_boleto and actividad_id = p_actividad for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if b.asistio_en is null or b.estado = 'cancelado' then
    return jsonb_build_object('ok', false, 'error', 'sin_entrada');
  end if;

  v_sin := b.origen = 'puerta' and b.nombre is null;
  v_max := case when v_sin then 100 else b.lugares end;
  -- Para «nadie», Deshacer: así el boleto vuelve a quedar sin usar.
  if v_n is null or v_n < 1 or v_n > v_max then
    return jsonb_build_object('ok', false, 'error', 'lugares', 'maximo', v_max);
  end if;

  if v_sin then
    update public.boletos set lugares = v_n, asistieron = v_n where id = b.id;
    update public.aforos
       set emitidos    = greatest(emitidos + v_n - b.lugares, 0),
           asistieron  = greatest(asistieron + v_n - coalesce(b.asistieron, 0), 0),
           actualizado = now()
     where actividad_id = p_actividad;
  else
    update public.boletos set asistieron = v_n where id = b.id;
    update public.aforos
       set asistieron  = greatest(asistieron + v_n - coalesce(b.asistieron, 0), 0),
           actualizado = now()
     where actividad_id = p_actividad;
  end if;

  return jsonb_build_object('ok', true, 'asistieron', v_n,
                            'lugares', case when v_sin then v_n else b.lugares end);
end;
$$;

revoke all on function public.ajustar_entrada(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.ajustar_entrada(uuid, uuid, integer, text) to anon, authenticated;


-- -----------------------------------------------------------------------------
--  5 · Menos superficie (revisión de seguridad del 3 de octubre de 2026)
--
--  buscar_en_puerta usaba LIKE con el texto tecleado: «%» coincidía con todos.
--  No filtraba nada que la clave no diera ya en lista_puerta, pero era un
--  error. Ahora busca el texto tal cual (strpos). La pantalla nueva busca en
--  la copia del teléfono y no la usa; se conserva para quien la necesite.
--
--  puerta_por_clave servía a la liga /puerta/#<clave>, que ya no existe: se
--  cierra. Si se vuelve a correr 11, vuelve a abrirse; correr 17 después.
-- -----------------------------------------------------------------------------
create or replace function public.buscar_en_puerta(p_actividad uuid, p_texto text, p_clave text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t   text := left(btrim(coalesce(p_texto, '')), 120);
  v_n   text := public.normalizar(v_t);
  v_cod text := upper(regexp_replace(v_t, '[^0-9A-Za-z]', '', 'g'));
begin
  if public.es_personal(p_actividad, p_clave) is null then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  if length(v_t) < 3 then
    return jsonb_build_object('ok', true, 'boletos', '[]'::jsonb);
  end if;

  return jsonb_build_object('ok', true, 'boletos', coalesce((
    select jsonb_agg(r) from (
      select b.id, b.codigo, b.nombre, b.lugares, b.estado, b.asistio_en, b.asistieron
        from public.boletos b
       where b.actividad_id = p_actividad
         and b.estado <> 'cancelado'
         and (b.codigo = v_cod
              or (v_n <> '' and strpos(public.normalizar(b.nombre), v_n) > 0))   -- ← 17
       order by b.nombre
       limit 20
    ) r
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.buscar_en_puerta(uuid, text, text) from public, anon, authenticated;
grant execute on function public.buscar_en_puerta(uuid, text, text) to anon, authenticated;

revoke all on function public.puerta_por_clave(text) from public, anon, authenticated;


-- =============================================================================
--  COMPROBACIÓN · las cinco en «sí»
-- =============================================================================
select 'Código corto en cada clave' as que,
       case when not exists (select 1 from public.puertas where codigo is null)
             and exists (select 1 from information_schema.columns
                          where table_name = 'puertas' and column_name = 'codigo')
            then 'sí' else 'NO' end as listo
union all
select 'Entrar con código',
       case when has_function_privilege('anon', 'public.entrar_puerta(text)', 'execute') then 'sí' else 'NO' end
union all
select 'Deshacer ya no busca asistente_id',
       case when (select prosrc from pg_proc where proname = 'anular_entrada') not like '%asistente_id%'
            then 'sí' else 'NO' end
union all
select 'Ajustar cuántos entraron',
       case when has_function_privilege('anon', 'public.ajustar_entrada(uuid, uuid, integer, text)', 'execute')
            then 'sí' else 'NO' end
union all
select 'El código no lo lee nadie sin cuenta',
       case when not has_table_privilege('anon', 'public.puertas', 'select') then 'sí' else 'NO' end;
