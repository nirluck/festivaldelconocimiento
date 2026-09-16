/* ============================================================================
   BOLETOS GUARDADOS EN ESTE TELÉFONO
   ----------------------------------------------------------------------------
   Mientras no haya correo, esta es la forma principal de no perder un boleto.
   Se guarda lo necesario para pintar «Mis boletos» sin red; la verdad —si
   sigue activo, si ya se usó— se vuelve a preguntar a la base cuando hay
   conexión.

   Todo va envuelto en try/catch: en modo privado o con el almacenamiento
   lleno, localStorage lanza. Si falla, el boleto se muestra igual; solo no se
   recuerda.
   ========================================================================== */

const CLAVE = 'fdc_boletos';

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

/** Solo lo que hace falta para pintarlo. Nunca el correo. */
function resumir(b) {
  const a = b.actividad || {};
  return {
    token: b.token,
    codigo: b.codigo,
    estado: b.estado,
    lugares: b.lugares,
    nombre: b.nombre,
    asistio_en: b.asistio_en || null,
    actividad: {
      titulo: a.titulo, slug: a.slug, fecha: a.fecha,
      hora_inicio: a.hora_inicio, hora_fin: a.hora_fin,
      sede: a.sede, sede_direccion: a.sede_direccion,
      eje: a.eje, eje_color: a.eje_color,
    },
    guardado: new Date().toISOString(),
  };
}

/** Guarda o actualiza. Devuelve false si el navegador no dejó guardar. */
export function guardarBoleto(b) {
  if (!b?.token) return false;
  const t = leerTodo();
  t[b.token] = { ...(t[b.token] || {}), ...resumir(b) };
  return escribirTodo(t);
}

export function olvidarBoleto(token) {
  const t = leerTodo();
  delete t[token];
  escribirTodo(t);
}

/** Todos, ordenados por fecha y hora de la actividad. */
export function boletosGuardados() {
  return Object.values(leerTodo())
    .filter(b => b && b.token)
    .sort((x, y) => (
      String(x.actividad?.fecha || '9999') + String(x.actividad?.hora_inicio || '')
    ).localeCompare(
      String(y.actividad?.fecha || '9999') + String(y.actividad?.hora_inicio || '')
    ));
}

/** El boleto vigente que este teléfono tiene para una actividad, si hay. */
export function boletoDeActividad(slug) {
  return boletosGuardados().find(b =>
    b.actividad?.slug === slug && b.estado !== 'cancelado') || null;
}

export function hayBoletos() {
  return boletosGuardados().some(b => b.estado !== 'cancelado');
}
