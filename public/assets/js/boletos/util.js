/* ============================================================================
   BOLETOS · UTILIDADES
   Las mismas que app.js, copiadas aquí porque app.js importa supabase-js y las
   páginas de boletos no lo cargan (ver api.js).
   ========================================================================== */

export function escapar(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** «14:30:00» → «14:30» */
export function hora(hhmmss) {
  return hhmmss ? String(hhmmss).slice(0, 5) : '';
}

/**
 * Fecha sin hora, construida con sus tres componentes. new Date('2026-10-17')
 * es medianoche UTC y en Ensenada sale el día 16 (trampa 16 del plan).
 */
export function aFecha(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  return (a && m && d) ? new Date(a, m - 1, d) : null;
}

/** «Sábado 18 de octubre» */
export function diaLargo(iso) {
  const f = aFecha(iso);
  if (!f) return 'Fecha por confirmar';
  const t = f.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Un instante, en hora de Ensenada: «viernes 18 de septiembre a las 10:00».
 * toLocaleString mete comas y «a.m.» que, al final de una frase, dejan doble
 * punto; armarlo a mano se lee mejor.
 */
export function fechaHoraTexto(iso) {
  const f = new Date(iso);
  if (isNaN(f)) return '';
  const dia = f.toLocaleDateString('es-MX',
    { timeZone: 'America/Tijuana', weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  return `${dia} ${aLas(iso)}`;
}

/** «a las 10:24» o «a la 1:24», en hora de Ensenada. */
export function aLas(iso) {
  const f = new Date(iso);
  if (isNaN(f)) return '';
  // es-MX escribe «01:17» aunque se pida la hora sin relleno; sin el cero se
  // lee «a la 1:17», que es como se dice.
  const h = f.toLocaleTimeString('es-MX',
    { timeZone: 'America/Tijuana', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .replace(/^0(\d)/, '$1');
  return `${h.startsWith('1:') ? 'a la' : 'a las'} ${h}`;
}

/** «10:00 – 12:00» */
export function rangoHoras(a) {
  const i = hora(a?.hora_inicio), f = hora(a?.hora_fin);
  if (i && f) return i + ' – ' + f;
  return i || 'Hora por confirmar';
}

/** «7KQ3MX» → «7KQ·3MX», para leerlo en voz alta en la puerta. */
export function codigoLegible(c) {
  const s = String(c || '');
  return s.length === 6 ? s.slice(0, 3) + '·' + s.slice(3) : s;
}

export function lugaresTexto(n) {
  return n === 1 ? '1 lugar' : `${n} lugares`;
}

/** Liga pública del boleto. El token va en el fragmento: nunca llega al servidor. */
export function urlBoleto(token) {
  return `${location.origin}/boleto/#${token}`;
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
