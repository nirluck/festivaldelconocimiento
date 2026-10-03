-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 18 · ELIMINAR BOLETOS
--
--  Pedido del 3 de octubre de 2026: limpiar las pruebas de la puerta. Un
--  boleto que ya entró no se puede cancelar (cancelar libera un lugar que ya
--  se usó), y las pruebas se quedaban en la lista y en los contadores.
--
--  eliminar_boletos_panel(ids) borra los boletos PARA SIEMPRE, en cualquier
--  estado, con su entrada, y vuelve a contar el aforo de sus actividades.
--
--  Solo la ADMINISTRACIÓN. Borrar una entrada destruye el dato de asistencia,
--  que es la razón del sistema; un coordinador cancela lo que no ha entrado
--  y, si algo que entró está mal, lo corrige desde la puerta (Deshacer).
--
--  Se puede ejecutar más de una vez. Correr después de 17.
-- =============================================================================

create or replace function public.eliminar_boletos_panel(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acts uuid[];
  v_n    integer;
begin
  if not public.es_administrador() then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 then
    return jsonb_build_object('ok', true, 'eliminados', 0);
  end if;
  if cardinality(p_ids) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'demasiados', 'maximo', 2000);
  end if;

  select array_agg(distinct actividad_id) into v_acts
    from public.boletos where id = any(p_ids);
  if v_acts is null then
    return jsonb_build_object('ok', true, 'eliminados', 0);
  end if;

  -- Mismo candado que la emisión y la puerta, en orden fijo para no trabarse
  -- con otra operación que tome varias actividades.
  perform 1 from public.aforos where actividad_id = any(v_acts)
   order by actividad_id for update;

  delete from public.boletos where id = any(p_ids);
  get diagnostics v_n = row_count;

  -- Los contadores se recalculan desde lo que queda (igual que recontar_aforo).
  update public.aforos f
     set emitidos   = coalesce((select sum(lugares) from public.boletos b
                                 where b.actividad_id = f.actividad_id and b.estado = 'activo'), 0),
         en_espera  = coalesce((select sum(lugares) from public.boletos b
                                 where b.actividad_id = f.actividad_id and b.estado = 'espera'), 0),
         asistieron = coalesce((select sum(asistieron) from public.boletos b
                                 where b.actividad_id = f.actividad_id and b.asistio_en is not null
                                   and b.estado <> 'cancelado'), 0),
         actualizado = now()
   where f.actividad_id = any(v_acts);

  return jsonb_build_object('ok', true, 'eliminados', v_n);
end;
$$;

revoke all on function public.eliminar_boletos_panel(uuid[]) from public, anon, authenticated;
grant execute on function public.eliminar_boletos_panel(uuid[]) to authenticated;


-- =============================================================================
--  COMPROBACIÓN · las dos en «sí»
-- =============================================================================
select 'Eliminar boletos desde el panel' as que,
       case when has_function_privilege('authenticated', 'public.eliminar_boletos_panel(uuid[])', 'execute')
            then 'sí' else 'NO' end as listo
union all
select 'Cerrada a quien no tiene cuenta',
       case when not has_function_privilege('anon', 'public.eliminar_boletos_panel(uuid[])', 'execute')
            then 'sí' else 'NO' end;
