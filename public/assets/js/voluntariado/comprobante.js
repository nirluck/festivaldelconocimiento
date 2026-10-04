/* ============================================================================
   VOLUNTARIADO · COMPROBANTE DE UN TURNO
   ----------------------------------------------------------------------------
   Lo que la persona necesita el día del turno, en un solo lugar: cuándo,
   dónde, en qué punto, por quién preguntar y qué llevar. Sustituye al correo
   que el festival todavía no puede mandar (fase H aplazada), así que debe
   bastarse solo.

   Se usa al terminar de inscribirse (en el diálogo del directorio) y en
   «Mis turnos».
   ========================================================================== */

import { escapar, diaLargo, horario, duracion, lugar, categoria, estiloCategoria,
         urlTurno, descargarCalendario } from './util.js';

const ICO = {
  cal:  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  pin:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  meta: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/></svg>',
  per:  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></svg>',
  mano: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l4 4 8-9"/><path d="M14 16.5l2 2 4-4.5"/></svg>',
};

/** El estado, dicho para la persona. */
function estado(t) {
  if (t.estado === 'cancelado') {
    return t.cancelado_por === 'coordinacion'
      ? ['mal', 'La coordinación te retiró de este turno', 'Si crees que es un error, escribe a la persona de contacto.']
      : ['gris', 'Cancelaste este turno', 'Tu lugar quedó libre para alguien más.'];
  }
  if (t.asistencia === 'cumplio') return ['ok', `Turno cumplido · ${t.horas ?? ''} h`, 'Gracias por hacer posible el festival.'];
  if (t.asistencia === 'falto')   return ['mal', 'Marcado como no asistido', 'Si fue un error, escribe a la persona de contacto.'];
  if (t.puesto && t.puesto.empezo) return ['ok', 'Tu turno está en curso', ''];
  return ['ok', 'Estás inscrito', ''];
}

/**
 * @param {object} t   el turno (de inscribirse_voluntariado o ver_turnos)
 * @param {object} op  { nuevo: bool } · recién inscrito: el saludo cambia
 */
export function htmlComprobante(t, op = {}) {
  const p = t.puesto || {}, a = t.actividad || {};
  const [tipo, titulo, sub] = estado(t);
  const cat = categoria(p.categoria);
  const vigente = t.estado === 'inscrito';

  return `
  <article class="vo-comp vo-comp--${tipo}" style="${estiloCategoria(p.categoria)}">
    <p class="vo-comp__franja">
      <b>${op.nuevo ? '¡Listo! Ya eres parte del equipo' : escapar(titulo)}</b>
      ${op.nuevo ? '<span>Tu lugar quedó apartado.</span>' : (sub ? `<span>${escapar(sub)}</span>` : '')}
    </p>

    <div class="vo-comp__cuerpo">
      <p class="vo-comp__cat">${escapar(cat.nombre)}</p>
      <h3 class="vo-comp__tit">${escapar(p.titulo)}</h3>
      <p class="vo-comp__act">en <a href="/programa/${encodeURIComponent(a.slug || '')}/">${escapar(a.titulo)}</a></p>

      <dl class="vo-comp__datos">
        <div>${ICO.cal}<dt>Cuándo</dt>
          <dd><b>${escapar(diaLargo(p.fecha))}</b><br>${escapar(horario(p))} <span class="vo-comp__dur">· ${escapar(duracion(p))}</span>
          ${a.hora_inicio ? `<small>La actividad es de ${escapar(horario(a))}</small>` : ''}</dd></div>
        <div>${ICO.pin}<dt>Dónde</dt>
          <dd><b>${escapar(lugar(a))}</b>
          ${a.sede_direccion ? `<small>${escapar(a.sede_direccion)}</small>` : ''}
          ${a.mapa_url ? `<a class="vo-comp__mapa" href="${escapar(a.mapa_url)}" target="_blank" rel="noopener">Cómo llegar ↗</a>` : ''}</dd></div>
        ${p.punto_encuentro ? `
        <div>${ICO.meta}<dt>Punto de encuentro</dt><dd>${escapar(p.punto_encuentro)}</dd></div>` : ''}
        ${p.contacto_dia && vigente ? `
        <div>${ICO.per}<dt>Ese día, pregunta por</dt><dd>${escapar(p.contacto_dia)}</dd></div>` : ''}
        ${p.requisitos ? `
        <div>${ICO.mano}<dt>Lleva o considera</dt><dd>${escapar(p.requisitos)}</dd></div>` : ''}
      </dl>

      ${p.descripcion ? `<p class="vo-comp__desc"><b>Qué harás:</b> ${escapar(p.descripcion)}</p>` : ''}
      <p class="vo-comp__nombre">A nombre de <b>${escapar(t.nombre)}</b></p>
    </div>

    ${vigente ? `
    <div class="vo-comp__acc">
      <button type="button" class="pg-btn pg-btn--lleno" data-calendario>Agregar a mi calendario</button>
      <button type="button" class="pg-btn" data-copiar>Copiar la liga del comprobante</button>
    </div>` : ''}
  </article>`;
}

/** Conecta los botones del comprobante. Devuelve nada; «t» se lee al hacer clic. */
export function conectarComprobante(caja, t) {
  const cal = caja.querySelector('[data-calendario]');
  if (cal) cal.addEventListener('click', () => descargarCalendario(t));
  const cop = caja.querySelector('[data-copiar]');
  if (cop) cop.addEventListener('click', async () => {
    const url = urlTurno(t.token);
    try {
      await navigator.clipboard.writeText(url);
      cop.textContent = 'Liga copiada · guárdala';
    } catch (e) {
      // Sin portapapeles (http o navegador viejo): se enseña para copiarla a mano.
      prompt('Copia esta liga y guárdala: es tu comprobante.', url);
    }
  });
}
