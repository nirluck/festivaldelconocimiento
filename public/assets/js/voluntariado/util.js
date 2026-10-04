/* ============================================================================
   VOLUNTARIADO · UTILIDADES
   ----------------------------------------------------------------------------
   Lo que comparten el directorio, «Mis turnos» y el módulo del panel. Sin
   supabase-js: las fechas y el escapado vienen de boletos/util.js, que
   tampoco lo carga.
   ========================================================================== */

import { escapar, hora, aFecha, diaLargo, descargar } from '../boletos/util.js';

export { escapar, hora, aFecha, diaLargo, descargar };

/* Las categorías son fijas a propósito, como las del semáforo: la base las
   valida con un CHECK y los reportes cuentan «qué se pide más» por categoría.
   El título del puesto es libre; la categoría ordena. Cada una lleva un color
   del logotipo (el de gráfica y su variante legible para texto). */
export const CATEGORIAS = {
  acceso:   { nombre: 'Acceso y boletos',        corto: 'Acceso',     color: '#E91587', tx: '#C90D70' },
  montaje:  { nombre: 'Montaje y logística',     corto: 'Montaje',    color: '#F5821F', tx: '#B85800' },
  atencion: { nombre: 'Atención al público',     corto: 'Atención',   color: '#10ABC4', tx: '#0A7285' },
  apoyo:    { nombre: 'Apoyo en la actividad',   corto: 'Apoyo',      color: '#99CA3C', tx: '#587A17' },
  registro: { nombre: 'Registro y documentación', corto: 'Registro',  color: '#F6D20A', tx: '#7A6400' },
  difusion: { nombre: 'Difusión y redes',        corto: 'Difusión',   color: '#E91587', tx: '#C90D70' },
  otro:     { nombre: 'Otro apoyo',              corto: 'Otro',       color: '#98A2B3', tx: '#475467' },
};

export const categoria = (c) => CATEGORIAS[c] || CATEGORIAS.otro;

/** Variables de color de una categoría, para el style de una tarjeta. */
export const estiloCategoria = (c) => {
  const k = categoria(c);
  return `--cat:${k.color};--cat-tx:${k.tx}`;
};

/** «18:00 – 21:30» */
export function horario(t) {
  const i = hora(t?.hora_inicio), f = hora(t?.hora_fin);
  return i && f ? `${i} – ${f}` : (i || '');
}

/** Cuántas horas dura un turno: «3 h», «1.5 h». */
export function duracion(t) {
  const [hi, mi] = String(t?.hora_inicio || '').split(':').map(Number);
  const [hf, mf] = String(t?.hora_fin || '').split(':').map(Number);
  if (![hi, mi, hf, mf].every(Number.isFinite)) return '';
  const h = ((hf * 60 + mf) - (hi * 60 + mi)) / 60;
  return h > 0 ? `${Number.isInteger(h) ? h : h.toFixed(1)} h` : '';
}

/** «sáb 18 oct», para chips y textos cortos. */
export function diaCorto(iso) {
  const f = aFecha(iso);
  if (!f) return '';
  return f.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '').replace(',', '');
}

/** Sede y sala juntas: «Teatro Universitario · Sala 2». */
export function lugar(a) {
  return [a?.sede, a?.sala].filter(Boolean).join(' · ');
}

/** Liga de un turno. El token va tras el «#»: nunca llega al servidor. */
export function urlTurno(token) {
  return `${location.origin}/mis-turnos/#${token}`;
}

/* ----------------------------------------------------------- calendario --- */

const textoICS = (s) => String(s || '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/* Las líneas de un .ics no deben pasar de 75 bytes: se doblan con un espacio. */
function doblar(linea) {
  const out = [];
  let actual = '';
  for (const c of linea) {
    if (new TextEncoder().encode(actual + c).length > 74) { out.push(actual); actual = ' ' + c; }
    else actual += c;
  }
  out.push(actual);
  return out.join('\r\n');
}

const sello = (f) => [f.getFullYear(), String(f.getMonth() + 1).padStart(2, '0'),
                      String(f.getDate()).padStart(2, '0')].join('');

/** El turno como evento de calendario, con aviso dos horas antes. */
export function icsTurno(t) {
  const p = t.puesto || {}, a = t.actividad || {};
  const f = aFecha(p.fecha);
  const hi = hora(p.hora_inicio), hf = hora(p.hora_fin);
  const ahora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Festival del Conocimiento//Voluntariado//ES',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    // Ensenada sigue el horario de verano de EE. UU.
    'BEGIN:VTIMEZONE', 'TZID:America/Tijuana',
    'BEGIN:STANDARD', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'TZNAME:PST', 'END:STANDARD',
    'BEGIN:DAYLIGHT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'TZNAME:PDT', 'END:DAYLIGHT',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:turno-${String(t.token).slice(0, 16)}@festivaldelconocimiento.org`,
    `DTSTAMP:${ahora}`,
  ];
  if (f && hi && hf) {
    lineas.push(`DTSTART;TZID=America/Tijuana:${sello(f)}T${hi.replace(':', '')}00`,
                `DTEND;TZID=America/Tijuana:${sello(f)}T${hf.replace(':', '')}00`);
  }
  const notas = [
    `Voluntariado: ${p.titulo} en «${a.titulo}».`,
    p.punto_encuentro ? `Punto de encuentro: ${p.punto_encuentro}.` : '',
    p.contacto_dia ? `Contacto ese día: ${p.contacto_dia}.` : '',
    p.requisitos ? `Lleva o considera: ${p.requisitos}.` : '',
    `Tu comprobante: ${urlTurno(t.token)}`,
  ].filter(Boolean).join('\n');
  lineas.push(
    `SUMMARY:${textoICS('Voluntariado · ' + p.titulo)}`,
    `LOCATION:${textoICS([lugar(a), a.sede_direccion].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${textoICS(notas)}`,
    `URL:${urlTurno(t.token)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY',
    `DESCRIPTION:${textoICS('Tu turno de voluntariado: ' + p.titulo)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  );
  return lineas.map(doblar).join('\r\n') + '\r\n';
}

export function descargarCalendario(t) {
  descargar(new Blob([icsTurno(t)], { type: 'text/calendar;charset=utf-8' }),
            'voluntariado-festival-del-conocimiento.ics');
}
