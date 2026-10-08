/* ============================================================================
   ACTIVIDADES DE VARIOS DÍAS · cómo se escribe el rango
   ----------------------------------------------------------------------------
   sql/20-fecha-fin.sql: «fecha_fin» es opcional. Vacía = un solo día, y cada
   pantalla sigue escribiendo la fecha como siempre. Llena = un rango, y se
   escribe con estas dos funciones para que diga lo mismo en todas partes.

   Sin dependencias a propósito: lo importan el programa público, el panel,
   el boleto y la puerta, y algunas de esas páginas no cargan supabase-js.

   Las fechas se arman con sus tres componentes, nunca con new Date('2026-…'):
   eso es medianoche UTC y en Ensenada sale el día anterior (trampa 16).
   ========================================================================== */

function partes(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  return a && m && d ? new Date(a, m - 1, d) : null;
}

const mesLargo = (f) => f.toLocaleDateString('es-MX', { month: 'long' });
const mesCorto = (f) => f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');

/** ¿Es de varios días? (fecha_fin llena y posterior a fecha) */
export function esRango(a) {
  return Boolean(a?.fecha && a?.fecha_fin && String(a.fecha_fin) > String(a.fecha));
}

/**
 * «Del 12 al 15 de octubre» · «Del 30 de septiembre al 2 de octubre».
 * null si la actividad es de un solo día: cada pantalla usa su formato.
 */
export function rangoLargo(a) {
  if (!esRango(a)) return null;
  const i = partes(a.fecha), f = partes(a.fecha_fin);
  return i.getMonth() === f.getMonth()
    ? `Del ${i.getDate()} al ${f.getDate()} de ${mesLargo(f)}`
    : `Del ${i.getDate()} de ${mesLargo(i)} al ${f.getDate()} de ${mesLargo(f)}`;
}

/** «12–15 oct» · «30 sep – 2 oct». null si es de un solo día. */
export function rangoCorto(a) {
  if (!esRango(a)) return null;
  const i = partes(a.fecha), f = partes(a.fecha_fin);
  return i.getMonth() === f.getMonth()
    ? `${i.getDate()}–${f.getDate()} ${mesCorto(f)}`
    : `${i.getDate()} ${mesCorto(i)} – ${f.getDate()} ${mesCorto(f)}`;
}

/** Cuántos días dura: 4 para «del 12 al 15». 1 si es de un solo día. */
export function diasQueDura(a) {
  if (!esRango(a)) return 1;
  return Math.round((partes(a.fecha_fin) - partes(a.fecha)) / 86400000) + 1;
}

/** El último día: fecha_fin si hay rango; si no, fecha. Para «¿ya pasó?». */
export const ultimoDia = (a) => (esRango(a) ? a.fecha_fin : a?.fecha) || null;
