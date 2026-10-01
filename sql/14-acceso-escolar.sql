-- =============================================================================
--  FESTIVAL DEL CONOCIMIENTO · 14 · ACCESO ESCOLAR
--
--  Las visitas itinerantes a escuelas no encajaban en ningún modo de acceso:
--  no son de entrada libre (solo va el alumnado de la escuela), y pedir boleto
--  o confirmación no tiene sentido. Tampoco convenía dar de alta cada escuela
--  como sede. Decisión del 30 de septiembre de 2026:
--
--    1. Sede «Escuelas», una sola para todas; cuáles se visitan va en la
--       descripción.
--    2. Cuarto modo de acceso, «escolar»: sale en el programa como actividad
--       solo para la escuela, sin boleto ni registro.
--    3. «escolar» solo se permite si el tipo es «Visita a escuela».
--
--  OJO · la regla 3 reconoce el tipo por su NOMBRE: «actividades.tipo» es texto,
--  sin llave foránea. Si algún día se renombra «Visita a escuela» en el
--  catálogo, hay que cambiar aquí la restricción y TIPO_ESCOLAR en
--  public/assets/js/campos-acceso.js.
--
--  OJO · 11-boletos.sql vuelve a crear las dos vistas con su definición
--  original. Si se vuelve a correr 11, hay que correr 14 después.
--
--  Se puede ejecutar más de una vez.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1 · SEDE «Escuelas»
-- -----------------------------------------------------------------------------
insert into public.sedes (nombre, orden) values ('Escuelas', 97)
on conflict (nombre) do update set orden = excluded.orden;


-- -----------------------------------------------------------------------------
--  2 · MODO «escolar» y 3 · SOLO PARA «Visita a escuela»
-- -----------------------------------------------------------------------------
alter table public.actividades drop constraint if exists actividades_acceso_valido;
alter table public.actividades
  add constraint actividades_acceso_valido
  check (acceso in ('libre', 'registro', 'boleto', 'escolar'));

alter table public.actividades drop constraint if exists actividades_escolar_es_visita;
alter table public.actividades
  add constraint actividades_escolar_es_visita
  check (acceso <> 'escolar' or tipo = 'Visita a escuela');

comment on column public.actividades.acceso is
  'libre: sin boleto ni registro · registro: confirma asistencia, sin tope · boleto: con cupo · escolar: solo para el alumnado de la escuela visitada (exige tipo «Visita a escuela»).';


-- -----------------------------------------------------------------------------
--  Una actividad escolar no emite boletos, por ningún camino.
--
--  Las funciones de 11 y 12 solo rechazan «libre»; todo lo demás lo tratan
--  como algo que se puede pedir. En vez de copiar aquí esas funciones enteras
--  para añadir «escolar», el candado va en la tabla: cubre la solicitud
--  pública, la emisión desde el panel y la puerta. El sitio ya no ofrece el
--  formulario en estas actividades; esto es el respaldo.
-- -----------------------------------------------------------------------------
create or replace function public.boleto_no_escolar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.actividades
              where id = new.actividad_id and acceso = 'escolar') then
    raise exception 'Esta es una actividad escolar: es solo para el alumnado de la escuela y no lleva boletos.';
  end if;
  return new;
end;
$$;

revoke all on function public.boleto_no_escolar() from public, anon, authenticated;

drop trigger if exists boletos_no_escolar on public.boletos;
create trigger boletos_no_escolar
  before insert on public.boletos
  for each row execute function public.boleto_no_escolar();


-- -----------------------------------------------------------------------------
--  VISTAS · «escolar» se comporta como «libre»: sin estado de boletos en el
--  programa y fuera del tablero de aforo.
--
--  «create or replace» y no borrar y recrear: las columnas no cambian, y así se
--  conservan los permisos y lo que dependa de ellas. Fuera de las dos líneas
--  marcadas, la definición es la de 11-boletos.sql.
-- -----------------------------------------------------------------------------
create or replace view public.vista_programa as
select
  a.id,
  a.edicion_id,
  a.slug,
  a.titulo,
  a.resumen,
  a.descripcion,
  a.poster,
  a.eje,
  e.color          as eje_color,
  a.tipo,
  a.sede,
  s.direccion      as sede_direccion,
  a.fecha,
  a.hora_inicio,
  a.hora_fin,
  a.cupo,
  a.publicada_en,
  a.acceso,
  a.lugares_max,
  case when a.acceso = 'boleto'
       then greatest(a.cupo - coalesce(f.emitidos, 0), 0)
  end              as disponibles,
  public.boletos_apertura(a.boletos_desde, a.publicada_en)        as boletos_desde,
  public.boletos_cierre(a.boletos_hasta, a.fecha, a.hora_inicio)  as boletos_hasta,
  case
    when a.acceso in ('libre', 'escolar') then null                -- ← 14
    when now() < public.boletos_apertura(a.boletos_desde, a.publicada_en) then 'pronto'
    when now() >= public.boletos_cierre(a.boletos_hasta, a.fecha, a.hora_inicio) then 'cerrado'
    when a.acceso = 'registro' then 'abierto'
    when a.cupo - coalesce(f.emitidos, 0) <= 0 then 'agotado'
    when a.cupo - coalesce(f.emitidos, 0) <= greatest(3, ceil(a.cupo * 0.1)) then 'pocos'
    else 'abierto'
  end              as estado_boletos
from public.actividades a
left join public.ejes   e on e.nombre = a.eje
left join public.sedes  s on s.nombre = a.sede
left join public.aforos f on f.actividad_id = a.id
where a.publica
  and not a.archivada;

alter view public.vista_programa set (security_invoker = true);


create or replace view public.vista_aforo as
select
  a.id, a.edicion_id, a.titulo, a.slug, a.eje, a.sede, a.fecha, a.hora_inicio,
  a.publica, a.archivada, a.acceso, a.cupo, a.lugares_max,
  s.capacidad                                   as capacidad_sala,
  coalesce(f.emitidos, 0)                       as emitidos,
  coalesce(f.en_espera, 0)                      as en_espera,
  coalesce(f.asistieron, 0)                     as asistieron,
  case when a.acceso = 'boleto' and a.cupo > 0
       then round(100.0 * coalesce(f.emitidos, 0) / a.cupo)::int
  end                                           as ocupacion_pct,
  public.boletos_apertura(a.boletos_desde, a.publicada_en)       as boletos_desde,
  public.boletos_cierre(a.boletos_hasta, a.fecha, a.hora_inicio) as boletos_hasta,
  f.actualizado                                 as aforo_actualizado
from public.actividades a
left join public.sedes  s on s.nombre = a.sede
left join public.aforos f on f.actividad_id = a.id
where a.acceso in ('registro', 'boleto');                          -- ← 14

alter view public.vista_aforo set (security_invoker = true);


-- =============================================================================
--  COMPROBACIÓN · deben salir las tres en «sí».
-- =============================================================================
select 'Sede «Escuelas» en el catálogo' as que,
       case when exists (select 1 from public.sedes where nombre = 'Escuelas') then 'sí' else 'NO' end as listo
union all
select 'Tipo «Visita a escuela» en el catálogo',
       case when exists (select 1 from public.tipos where nombre = 'Visita a escuela') then 'sí' else 'NO' end
union all
select 'Candado de boletos escolares',
       case when exists (select 1 from pg_trigger where tgname = 'boletos_no_escolar') then 'sí' else 'NO' end;
