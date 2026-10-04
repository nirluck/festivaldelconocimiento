/* ============================================================================
   /mis-turnos/ · LOS TURNOS GUARDADOS EN ESTE TELÉFONO
   ----------------------------------------------------------------------------
   El equivalente de «Mis boletos» para el voluntariado. Pinta primero lo
   guardado —así sirve sin red, en la puerta de una sede sin señal— y luego
   pregunta a la base cómo está cada turno: si sigue vigente, si la
   coordinación lo movió o lo canceló, si ya se marcó como cumplido.

   Con #<token> en la dirección se suma ese turno: es la liga que la persona
   copió del comprobante para abrirla en otro dispositivo.
   ========================================================================== */

import { montarCabecera } from '../cabecera.js';
import { verTurnos, cancelar, mensaje, mensajeRed } from './api.js';
import { turnosGuardados, tokensGuardados, guardarTurno, olvidarTurno } from './almacen.js';
import { htmlComprobante, conectarComprobante } from './comprobante.js';
import { escapar, aFecha } from './util.js';

const $ = (s) => document.querySelector(s);
const caja = $('#lista');

(async function iniciar() {
  montarCabecera();

  const delHash = location.hash.replace(/^#/, '').trim();
  const nuevo = /^[0-9a-f]{64}$/i.test(delHash) ? delHash : null;
  if (location.hash) history.replaceState(null, '', location.pathname);

  // 1 · lo guardado, de inmediato
  pintar(turnosGuardados(), { cargando: true });

  // 2 · la verdad, de la base
  const tokens = [...new Set([...tokensGuardados(), ...(nuevo ? [nuevo] : [])])];
  if (!tokens.length) { pintar([], {}); return; }
  let vivos;
  try {
    vivos = await verTurnos(tokens);
  } catch (e) {
    pintar(turnosGuardados(), { aviso: `${mensajeRed(e)} Te mostramos lo guardado en este teléfono.` });
    return;
  }
  (vivos || []).forEach(guardarTurno);
  if (nuevo && !(vivos || []).some(t => t.token === nuevo)) {
    pintar(turnosGuardados(), { aviso: 'La liga que abriste no corresponde a ningún turno. Revisa que esté completa.' });
    return;
  }
  const encontrados = new Set((vivos || []).map(t => t.token));
  pintar(turnosGuardados(), { perdidos: tokens.filter(t => !encontrados.has(t)) });
})();

/** ¿El turno ya terminó? Se compara la fecha y la hora de fin, en local. */
function termino(t) {
  const f = aFecha(t.puesto?.fecha);
  if (!f || !t.puesto?.hora_fin) return false;
  const [h, m] = t.puesto.hora_fin.split(':').map(Number);
  f.setHours(h, m);
  return f < new Date();
}

function pintar(turnos, op) {
  const perdidos = new Set(op.perdidos || []);
  const proximos = turnos.filter(t => t.estado === 'inscrito' && !termino(t) && !perdidos.has(t.token));
  const pasados  = turnos.filter(t => !proximos.includes(t));
  const horas = turnos.filter(t => t.asistencia === 'cumplio')
                      .reduce((s, t) => s + Number(t.horas || 0), 0);

  $('#resumen').textContent = !turnos.length
    ? 'Aquí aparecen los turnos de voluntariado que tomes desde este teléfono.'
    : `${proximos.length} ${proximos.length === 1 ? 'turno próximo' : 'turnos próximos'}` +
      (horas ? ` · ${Number.isInteger(horas) ? horas : horas.toFixed(1)} h de voluntariado cumplidas` : '') + '.';

  if (!turnos.length) {
    caja.innerHTML = `
      ${op.aviso ? `<p class="bo-aviso bo-aviso--info">${escapar(op.aviso)}</p>` : ''}
      <div class="pg-vacio">
        <h2>Todavía no tienes turnos aquí</h2>
        <p>Elige un puesto en el directorio de voluntariado. ¿Te inscribiste desde otro
           teléfono o computadora? Abre aquí la liga de tu comprobante y se guarda.</p>
        <a class="pg-btn pg-btn--lleno" href="/voluntariado/">Ver las vacantes</a>
      </div>`;
    return;
  }

  caja.innerHTML = `
    ${op.aviso ? `<p class="bo-aviso bo-aviso--info">${escapar(op.aviso)}</p>` : ''}
    ${op.cargando ? '<p class="vo-mis__nota">Revisando si hubo cambios…</p>' : ''}
    ${proximos.length ? `
      <h2 class="vo-mis__tit">Próximos</h2>
      <div class="vo-mis__lista">${proximos.map(t => bloque(t, true, false)).join('')}</div>`
    : `<div class="pg-vacio vo-mis__vacio"><h2>Sin turnos próximos</h2>
         <p>Hay más puestos esperando en el directorio.</p>
         <a class="pg-btn pg-btn--lleno" href="/voluntariado/">Buscar otro turno</a></div>`}
    ${pasados.length ? `
      <h2 class="vo-mis__tit">Historial</h2>
      <div class="vo-mis__lista">${pasados.map(t => bloque(t, false, perdidos.has(t.token))).join('')}</div>` : ''}
    <p class="vo-mis__pie"><a class="pg-btn" href="/voluntariado/">Tomar otro turno</a></p>`;

  turnos.forEach(t => {
    const b = caja.querySelector(`[data-turno="${t.token}"]`);
    if (!b) return;
    conectarComprobante(b, t);
    b.querySelector('[data-cancelar]')?.addEventListener('click', () => cancelarTurno(t, b));
    b.querySelector('[data-olvidar]')?.addEventListener('click', () => { olvidarTurno(t.token); b.remove(); });
  });
}

function bloque(t, vigente, perdido) {
  const puedeCancelar = vigente && t.estado === 'inscrito' && !t.puesto?.empezo;
  return `
    <div class="vo-mis__item" data-turno="${escapar(t.token)}">
      ${perdido ? '<p class="bo-aviso bo-aviso--info">Este turno ya no existe: la coordinación quitó el puesto.</p>' : ''}
      ${htmlComprobante(t)}
      ${puedeCancelar ? `
        <div class="vo-mis__cancelar">
          <button type="button" class="bo-btn-peligro" data-cancelar>Ya no puedo ir · cancelar mi turno</button>
          <p class="bf__error" role="alert" hidden></p>
        </div>` : ''}
      ${!vigente ? `<button type="button" class="pg-limpiar vo-mis__olvidar" data-olvidar>Quitar de este teléfono</button>` : ''}
    </div>`;
}

async function cancelarTurno(t, b) {
  if (!confirm(`¿Cancelar tu turno «${t.puesto.titulo}»?\n\nTu lugar queda libre para alguien más.`)) return;
  const btn = b.querySelector('[data-cancelar]');
  const err = b.querySelector('.bf__error');
  btn.disabled = true;
  let r;
  try {
    r = await cancelar(t.token);
  } catch (e) {
    btn.disabled = false;
    err.textContent = mensajeRed(e); err.hidden = false;
    return;
  }
  if (!r.ok) {
    btn.disabled = false;
    err.textContent = mensaje(r); err.hidden = false;
    return;
  }
  guardarTurno(r.turno);
  pintar(turnosGuardados(), {});
}
