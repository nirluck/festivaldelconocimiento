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

/* ------------------------------------------------ fecha de nacimiento --- */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Fecha de nacimiento en tres listas y no en un calendario: el selector de
 * fecha del teléfono abre en el mes actual, y llegar a 1978 son cuarenta y
 * tantos años de toques.
 */
export function htmlNacimiento(id) {
  const anio = new Date().getFullYear();
  const opciones = (desde, hasta, texto) => Array.from({ length: Math.abs(hasta - desde) + 1 },
    (_, i) => desde > hasta ? desde - i : desde + i)
    .map(n => `<option value="${n}">${texto ? texto(n) : n}</option>`).join('');
  return `
    <fieldset class="bf__fecha">
      <legend>Fecha de nacimiento</legend>
      <div class="bf__fecha-campos">
        <select name="dia" aria-label="Día"><option value="">Día</option>${opciones(1, 31)}</select>
        <select name="mes" aria-label="Mes"><option value="">Mes</option>${opciones(1, 12, n => MESES[n - 1])}</select>
        <select name="anio" aria-label="Año"><option value="">Año</option>${opciones(anio, 1920)}</select>
      </div>
      <small>Con tu nombre, sirve para recuperar tu boleto si lo pierdes.</small>
    </fieldset>`;
}

/** «AAAA-MM-DD», o null si falta algo o la fecha no existe (31 de febrero). */
export function leerNacimiento(d) {
  const a = Number(d.anio), m = Number(d.mes), dia = Number(d.dia);
  if (!a || !m || !dia) return null;
  const f = new Date(a, m - 1, dia);
  if (f.getFullYear() !== a || f.getMonth() !== m - 1 || f.getDate() !== dia) return null;
  if (f > new Date()) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
