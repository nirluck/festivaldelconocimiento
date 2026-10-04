/* ============================================================================
   TURNOS GUARDADOS EN ESTE TELÉFONO
   ----------------------------------------------------------------------------
   Mientras no haya correo saliente, esta es la forma principal de no perder
   el comprobante de un turno, igual que boletos/almacen.js. Se guarda lo
   necesario para pintar «Mis turnos» sin red; la verdad —si sigue activo, si
   la coordinación lo movió— se vuelve a preguntar a la base cuando hay red.

   Nunca se guardan datos personales aquí, salvo el nombre que ya enseña el
   comprobante: ni correo ni teléfono. El token es secreto: quien lo tiene,
   puede cancelar el turno.

   Todo va envuelto en try/catch: en modo privado o con el almacenamiento
   lleno, localStorage lanza. Si falla, el turno se muestra igual; solo no se
   recuerda.
   ========================================================================== */

const CLAVE = 'fdc_turnos';

function leerTodo() {
  try {
    const t = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    return (t && typeof t === 'object' && !Array.isArray(t)) ? t : {};
  } catch (e) {
    return {};
  }
}

function escribirTodo(t) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(t));
    return true;
  } catch (e) {
    return false;
  }
}

/** Lo justo para pintarlo sin red. */
function resumir(t) {
  const p = t.puesto || {}, a = t.actividad || {};
  return {
    token: t.token,
    estado: t.estado,
    nombre: t.nombre,
    guardado: Date.now(),
    cancelado_por: t.cancelado_por || null,
    puesto: {
      id: p.id, titulo: p.titulo, categoria: p.categoria, fecha: p.fecha,
      hora_inicio: p.hora_inicio, hora_fin: p.hora_fin,
      punto_encuentro: p.punto_encuentro, contacto_dia: p.contacto_dia,
      descripcion: p.descripcion, requisitos: p.requisitos,
    },
    actividad: {
      titulo: a.titulo, slug: a.slug, eje: a.eje, eje_color: a.eje_color,
      sede: a.sede, sala: a.sala, sede_direccion: a.sede_direccion, mapa_url: a.mapa_url,
    },
  };
}

export function guardarTurno(turno) {
  if (!turno || !turno.token) return false;
  const t = leerTodo();
  t[turno.token] = resumir(turno);
  return escribirTodo(t);
}

export function turnosGuardados() {
  return Object.values(leerTodo())
    .filter(t => t && t.token)
    .sort((a, b) => String(a.puesto.fecha + a.puesto.hora_inicio)
                      .localeCompare(String(b.puesto.fecha + b.puesto.hora_inicio)));
}

export function tokensGuardados() {
  return Object.keys(leerTodo());
}

export function olvidarTurno(token) {
  const t = leerTodo();
  delete t[token];
  return escribirTodo(t);
}

/** Los puestos donde esta persona ya tiene turno vigente, para marcarlos. */
export function puestosTomados() {
  return new Set(turnosGuardados().filter(t => t.estado === 'inscrito').map(t => t.puesto.id).filter(Boolean));
}

/** ¿Hay algún turno vigente? La cabecera lo usa para enseñar «Mis turnos». */
export function hayTurnos() {
  return turnosGuardados().some(t => t.estado !== 'cancelado');
}
