/* ============================================================================
   /voluntariado/ · LA BOLSA DE VACANTES
   ----------------------------------------------------------------------------
   Dos niveles, para no dar una lista enorme (decisión del 4 de octubre de
   2026):

     1. Las ACTIVIDADES que buscan voluntarios, por día, con la fecha grande
        como separador (el mismo lenguaje que la cartelera). Cada tarjeta dice
        qué tipo de apoyo pide y cuántos lugares le quedan.
     2. Al tocar una, sus PUESTOS: cada uno es una oferta con lo que se hace,
        cuándo y cuántos lugares quedan. Inscribirse abre un diálogo encima.

   El nivel vive en la dirección (#a=<slug>), así que el botón «atrás» del
   teléfono regresa a la lista y la vista de una actividad se puede compartir.

   Decisiones de diseño:
     · Lo LLENO se queda a la vista, apagado: dice que el festival se mueve, y
       que conviene buscar otro. Con «Solo con lugar» se esconde.
     · El cupo se ve como asientos (●●●○) cuando son pocos: «quedan 2 de 4» se
       entiende de un vistazo. Con muchas vacantes, una barra.
     · La tarjeta del puesto es corta; lo largo («qué llevar») va en el
       diálogo, que es donde la persona ya decidió y lee con calma.
     · Lo que la persona ya tomó en este teléfono se marca.

   Ligas que llegan aquí:
     /voluntariado/?i=uabc     invitación de una institución: queda elegida
     /voluntariado/#a=<slug>   los puestos de una actividad
     /voluntariado/#p=<id>     un puesto concreto: se abre su diálogo (es la
                               liga que el coordinador copia desde su panel)
   ========================================================================== */

import { montarCabecera } from '../cabecera.js';
import { urlPosterMini } from '../archivos.js';
import { directorio, fechasActividades, instituciones as leerInstituciones, mensajeRed } from './api.js';
import { puestosTomados } from './almacen.js';
import { montarFormulario } from './formulario.js';
import { htmlComprobante, conectarComprobante } from './comprobante.js';
import { escapar, aFecha, diaLargo, diaCorto, horario, duracion, lugar, categoria,
         estiloCategoria, CATEGORIAS } from './util.js';

const $ = (s) => document.querySelector(s);

let PUESTOS = [];
let INSTITUCIONES = [];
let ACTIVIDADES = [];          // [{ id, slug, titulo, …, fecha, puestos:[…] }]
const FECHAS = new Map();      // actividad_id → su día (de vista_programa)
const params = new URLSearchParams(location.search);
const CLAVE_INST = (params.get('i') || '').toLowerCase();

const filtro = { dia: 'todo', cats: new Set(), sede: '', libres: false };

/* Para «← Todas las actividades»: si se llegó desde la lista, regresar es
   history.back() (y vuelve al mismo punto); si se llegó con la liga directa,
   no hay a dónde regresar y se pinta la lista. */
let vinoDeLista = false;
let ultimaActividad = null;

/* =================================================================== datos */
(async function iniciar() {
  montarCabecera();
  try {
    [PUESTOS, INSTITUCIONES] = await Promise.all([directorio(), leerInstituciones()]);
  } catch (e) {
    $('#lista').innerHTML = `<div class="pg-error">${escapar(mensajeRed(e))}</div>`;
    return;
  }
  await leerFechas();
  agrupar();
  pintarInvitacion();
  pintarCifras();
  window.addEventListener('hashchange', () => pintar());
  pintar({ primera: true });
})();

/** Vuelve a pedir el directorio (tras una inscripción, o si el cupo cambió). */
async function refrescar() {
  try { PUESTOS = await directorio(); } catch (e) { return; }
  await leerFechas();
  agrupar();
  pintarCifras();
  pintar({ quieto: true });
}

/* Sin el día de la actividad no se cae nada: se usa el del primer puesto. */
async function leerFechas() {
  const faltan = [...new Set(PUESTOS.map(p => p.actividad_id))].filter(id => !FECHAS.has(id));
  if (!faltan.length) return;
  try {
    (await fechasActividades(faltan)).forEach(a => { if (a.fecha) FECHAS.set(a.id, a.fecha); });
  } catch (e) { /* sin red para esto: se agrupa por el día del primer puesto */ }
}

function agrupar() {
  const m = new Map();
  for (const p of PUESTOS) {
    if (!m.has(p.actividad_id)) {
      m.set(p.actividad_id, {
        id: p.actividad_id, slug: p.slug, titulo: p.actividad, eje: p.eje, eje_color: p.eje_color,
        tipo: p.tipo, sede: p.sede, sala: p.sala, poster: p.poster,
        hora_inicio: p.actividad_inicio, hora_fin: p.actividad_fin,
        fecha: FECHAS.get(p.actividad_id) || p.fecha, puestos: [],
      });
    }
    m.get(p.actividad_id).puestos.push(p);
  }
  ACTIVIDADES = [...m.values()].sort((a, b) =>
    String(a.fecha).localeCompare(String(b.fecha)) ||
    String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || '')) ||
    a.titulo.localeCompare(b.titulo, 'es'));
}

const libres = (p) => Math.max(0, p.vacantes - p.ocupadas);
const disponible = (p) => p.abierto && libres(p) > 0;
const lugaresDe = (ps) => ps.filter(disponible).reduce((s, p) => s + libres(p), 0);

/* ============================================================== invitación */
function pintarInvitacion() {
  const inst = INSTITUCIONES.find(i => i.clave === CLAVE_INST);
  if (!inst) return;
  const caja = $('#invitacion');
  caja.innerHTML = `<div class="pg-wrap"><p>
    <b>Invitación para estudiantes de ${escapar(inst.nombre)}.</b>
    Tu institución ya queda elegida al inscribirte.</p></div>`;
  caja.hidden = false;
}

/* ================================================================= cifras */
function pintarCifras() {
  const abiertos = PUESTOS.filter(disponible);
  const lugares = lugaresDe(abiertos);
  const actividades = new Set(abiertos.map(p => p.actividad_id)).size;
  const caja = $('#cifras');
  if (!PUESTOS.length) { caja.hidden = true; return; }
  caja.innerHTML = `
    <div class="pg-cifra"><b>${lugares}</b><span>${lugares === 1 ? 'Lugar libre' : 'Lugares libres'}</span></div>
    <div class="pg-cifra"><b>${actividades}</b><span>${actividades === 1 ? 'Actividad te espera' : 'Actividades te esperan'}</span></div>
    <div class="pg-cifra"><b>${abiertos.length}</b><span>${abiertos.length === 1 ? 'Puesto abierto' : 'Puestos abiertos'}</span></div>`;
  caja.hidden = false;
}

/* ================================================================== rutas */
/** Pinta el nivel que pide la dirección: la lista, una actividad, o un
    puesto (su actividad con el diálogo abierto). */
function pintar(op = {}) {
  const h = location.hash;
  let act = null, puesto = null;

  const mp = h.match(/^#p=([0-9a-f-]{36})$/i);
  const ma = h.match(/^#a=([^&]+)$/);
  if (mp) {
    puesto = PUESTOS.find(x => x.id === mp[1]) || null;
    act = puesto ? ACTIVIDADES.find(a => a.id === puesto.actividad_id) : null;
  } else if (ma) {
    const slug = decodeURIComponent(ma[1]);
    act = ACTIVIDADES.find(a => a.slug === slug) || null;
  }

  if (act) {
    const otra = !ultimaActividad || ultimaActividad.id !== act.id || !$('.vo-vista');
    ultimaActividad = act;
    pintarActividad(act);
    if (otra && !op.quieto) subir(op.primera);
    if (puesto && !dlg.open) abrir(puesto.id);
  } else {
    if (dlg.open && !op.quieto) dlg.close();
    const venia = !op.quieto && $('.vo-vista') && ultimaActividad;
    pintarBarra();
    pintarLista();
    if (venia) document.getElementById('act-' + ultimaActividad.id)?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
}

/* Al entrar a una actividad, el principio de su vista queda bajo la
   cabecera fija: si no, en el teléfono se quedaría a media página. */
function subir(primera) {
  const cuerpo = $('.pg-cuerpo');
  if (!cuerpo) return;
  const cab = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cab-alto'), 10) || 72;
  const y = cuerpo.getBoundingClientRect().top + scrollY - cab;
  // Con la liga directa la persona no ha visto nada: se queda la cabecera
  // turquesa con los pasos; desde la lista, se sube a los puestos.
  if (primera) return;
  // 'instant' y no 'auto': programa.css pone scroll-behavior:smooth, y un
  // cambio de vista no se anima (se vería la lista correr hacia abajo).
  scrollTo({ top: Math.max(0, y), behavior: 'instant' });
}

/* ================================================================== barra */
function pintarBarra() {
  $('.pg-barra').hidden = false;
  const dias = [...new Set(ACTIVIDADES.map(a => a.fecha))].sort();
  const cats = Object.keys(CATEGORIAS).filter(c => PUESTOS.some(p => p.categoria === c));
  const sedes = [...new Set(ACTIVIDADES.map(a => a.sede).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  if (filtro.dia !== 'todo' && !dias.includes(filtro.dia)) filtro.dia = 'todo';

  const pastilla = (d) => {
    const f = aFecha(d);
    return `<button class="pg-dia-btn" type="button" data-dia="${d}" aria-pressed="${filtro.dia === d}">
      <small>${escapar(f.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', ''))}</small>
      <b>${f.getDate()}</b></button>`;
  };

  $('#barra').innerHTML = `
    <div class="pg-dias" role="group" aria-label="Días">
      <button class="pg-dia-btn pg-dia-btn--todo" type="button" data-dia="todo" aria-pressed="${filtro.dia === 'todo'}">
        <small>Ver</small><b>Todos</b></button>
      ${dias.map(pastilla).join('')}
    </div>
    <div class="pg-filtros">
      <div class="pg-ejes vo-cats" role="group" aria-label="Tipo de apoyo">
        ${cats.map(c => `
          <button class="pg-eje-btn" type="button" data-cat="${c}" aria-pressed="${filtro.cats.has(c)}"
                  style="--eje:${categoria(c).color};--eje-tx:${categoria(c).tx}">
            <i></i>${escapar(categoria(c).corto)}</button>`).join('')}
      </div>
      ${sedes.length > 1 ? `
      <select class="pg-sel" id="f-sede" aria-label="Sede">
        <option value="">Todas las sedes</option>
        ${sedes.map(s => `<option${s === filtro.sede ? ' selected' : ''}>${escapar(s)}</option>`).join('')}
      </select>` : ''}
      <label class="vo-libres">
        <input type="checkbox" id="f-libres"${filtro.libres ? ' checked' : ''}> Solo con lugar
      </label>
      <span class="pg-cuenta" id="cuenta" aria-live="polite"></span>
    </div>`;

  $('#barra').querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => {
    filtro.dia = b.dataset.dia; pintarBarra(); pintarLista();
  }));
  $('#barra').querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.cat;
    filtro.cats.has(c) ? filtro.cats.delete(c) : filtro.cats.add(c);
    pintarBarra(); pintarLista();
  }));
  const sel = $('#f-sede');
  if (sel) sel.addEventListener('change', () => { filtro.sede = sel.value; pintarLista(); });
  $('#f-libres').addEventListener('change', (e) => { filtro.libres = e.target.checked; pintarLista(); });
}

/* ========================================================= nivel 1: lista */
/** Los puestos de una actividad que pasan los filtros de tipo y de lugar. */
const puestosQuePasan = (a) => a.puestos.filter(p =>
  (!filtro.cats.size || filtro.cats.has(p.categoria)) &&
  (!filtro.libres || disponible(p)));

/** Las actividades que tienen al menos un puesto que pasa los filtros. */
function filtradas() {
  return ACTIVIDADES
    .filter(a => (filtro.dia === 'todo' || a.fecha === filtro.dia) && (!filtro.sede || a.sede === filtro.sede))
    .map(a => ({ a, ps: puestosQuePasan(a) }))
    .filter(x => x.ps.length);
}

function pintarLista() {
  const caja = $('#lista');
  if (!PUESTOS.length) {
    caja.innerHTML = `
      <div class="pg-vacio">
        <h2>Muy pronto</h2>
        <p>Las actividades del festival están publicando los puestos que necesitan.
           Vuelve en unos días, o pregunta a quien coordina tu servicio social.</p>
        <a class="pg-btn" href="/programa/">Mientras tanto, mira el programa</a>
      </div>`;
    $('#cuenta') && ($('#cuenta').textContent = '');
    return;
  }

  const d = filtradas();
  $('#cuenta').textContent = `${d.length} de ${ACTIVIDADES.length} ${ACTIVIDADES.length === 1 ? 'actividad' : 'actividades'}`;
  if (!d.length) {
    caja.innerHTML = `
      <div class="pg-vacio">
        <h2>Nada con esos filtros</h2>
        <p>Prueba con otro día u otro tipo de apoyo.</p>
        <button class="pg-btn" type="button" id="ver-todo">Ver todas las actividades</button>
      </div>`;
    $('#ver-todo').addEventListener('click', () => {
      Object.assign(filtro, { dia: 'todo', sede: '', libres: false }); filtro.cats.clear();
      pintarBarra(); pintarLista();
    });
    return;
  }

  const tomados = puestosTomados();
  const porDia = new Map();
  d.forEach(x => { if (!porDia.has(x.a.fecha)) porDia.set(x.a.fecha, []); porDia.get(x.a.fecha).push(x); });

  caja.innerHTML = [...porDia].map(([fecha, xs]) => {
    const f = aFecha(fecha);
    const semana = f.toLocaleDateString('es-MX', { weekday: 'long' });
    const mes = f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
    const lugares = xs.reduce((s, x) => s + lugaresDe(x.ps), 0);
    return `
    <section class="pg-dia">
      <div class="pg-dia__tit">
        <div class="pg-dia__fecha">
          <small>${escapar(semana)}</small><b>${f.getDate()}</b><span>${escapar(mes)}</span>
          <span class="pg-dia__cuenta">${xs.length} ${xs.length === 1 ? 'actividad' : 'actividades'} · ${lugares} ${lugares === 1 ? 'lugar libre' : 'lugares libres'}</span>
        </div>
        <h2 class="sr">${escapar(diaLargo(fecha))}</h2>
      </div>
      <div class="vo-acts">${xs.map(x => tarjetaActividad(x.a, x.ps, tomados)).join('')}</div>
    </section>`;
  }).join('');

  caja.querySelectorAll('.vo-act').forEach(el =>
    el.addEventListener('click', () => { vinoDeLista = true; }));
}

/** El póster cuadrado; sin póster, un cuadro con el color del eje. */
function poster(a, clase) {
  return a.poster
    ? `<img class="${clase}" src="${urlPosterMini(a.poster)}" alt="" loading="lazy" decoding="async"
            width="120" height="120" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${clase} ${clase}--sin'}))">`
    : `<span class="${clase} ${clase}--sin" aria-hidden="true"></span>`;
}

const estiloEje = (a) => `--eje:${a.eje_color || 'var(--turquesa)'}`;

function tarjetaActividad(a, ps, tomados) {
  const lugares = lugaresDe(ps);
  const cats = Object.keys(CATEGORIAS).filter(c => ps.some(p => p.categoria === c));
  const tuyo = a.puestos.some(p => tomados.has(p.id));
  const completa = lugares === 0;
  const hora = horario(a);

  return `
  <a class="vo-act${completa ? ' vo-act--completa' : ''}${tuyo ? ' vo-act--tuyo' : ''}"
     href="#a=${encodeURIComponent(a.slug)}" id="act-${a.id}" style="${estiloEje(a)}">
    ${poster(a, 'vo-act__poster')}
    <div class="vo-act__cuerpo">
      <p class="vo-act__eti"><i></i>${escapar([a.eje, a.tipo].filter(Boolean).join(' · ') || 'Festival')}</p>
      <h3 class="vo-act__tit">${escapar(a.titulo)}</h3>
      <p class="vo-act__meta">${[hora, lugar(a)].filter(Boolean).map(escapar).join(' · ')}</p>
      <ul class="vo-act__cats" aria-label="Tipos de apoyo">
        ${cats.map(c => `<li style="${estiloCategoria(c)}"><i></i>${escapar(categoria(c).corto)}</li>`).join('')}
      </ul>
    </div>
    <div class="vo-act__pie">
      <p class="vo-act__lugares">${completa
        ? '<b>Completa</b><span>Ya no quedan lugares</span>'
        : `<b>${lugares}</b><span>${lugares === 1 ? 'lugar libre' : 'lugares libres'} · ${ps.length} ${ps.length === 1 ? 'puesto' : 'puestos'}</span>`}</p>
      <span class="vo-act__ir">Ver puestos<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
    </div>
    ${tuyo ? '<p class="vo-tuyo">Tienes turno aquí</p>' : ''}
  </a>`;
}

/* ===================================================== nivel 2: actividad */
function pintarActividad(a) {
  $('.pg-barra').hidden = true;
  const tomados = puestosTomados();
  const lugares = lugaresDe(a.puestos);
  const abiertos = a.puestos.filter(disponible).length;

  $('#lista').innerHTML = `
  <div class="vo-vista">
    <a class="vo-volver" href="./${location.search}" data-volver>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>Todas las actividades</a>

    <header class="vo-acth" style="${estiloEje(a)}">
      ${poster(a, 'vo-acth__poster')}
      <div class="vo-acth__txt">
        <p class="vo-act__eti"><i></i>${escapar([a.eje, a.tipo].filter(Boolean).join(' · ') || 'Festival')}</p>
        <h2 class="vo-acth__tit">${escapar(a.titulo)}</h2>
        <p class="vo-acth__datos">
          <span><b>${escapar(diaLargo(a.fecha))}</b>${horario(a) ? `, ${escapar(horario(a))}` : ''}</span>
          ${lugar(a) ? `<span>${escapar(lugar(a))}</span>` : ''}
        </p>
        <a class="vo-acth__prog" href="/programa/${encodeURIComponent(a.slug)}/">De qué se trata la actividad</a>
      </div>
    </header>

    <p class="vo-acth__res">${lugares
      ? `<b>${lugares} ${lugares === 1 ? 'lugar libre' : 'lugares libres'}</b> en ${abiertos} ${abiertos === 1 ? 'puesto' : 'puestos'}.
         Puedes tomar varios, siempre que sus horarios no se empalmen.`
      : '<b>Esta actividad ya completó su equipo.</b> Busca otra en la lista.'}</p>

    <div class="vo-lista">${a.puestos.map(p => tarjeta(p, a, tomados.has(p.id))).join('')}</div>
  </div>`;

  $('#lista').querySelector('[data-volver]').addEventListener('click', (e) => {
    e.preventDefault();
    if (vinoDeLista) { vinoDeLista = false; history.back(); return; }
    history.pushState(null, '', location.pathname + location.search);
    pintar();
  });
  $('#lista').querySelectorAll('[data-inscribir]').forEach(b =>
    b.addEventListener('click', () => abrir(b.dataset.inscribir)));
}

/* ----------------------------------------------------------------- cupo -- */
function cupo(p) {
  const l = libres(p);
  const pct = Math.min(100, Math.round(p.ocupadas / p.vacantes * 100));
  const tono = l === 0 ? 'lleno' : (l === 1 || pct >= 75) ? 'pocos' : 'ok';
  const texto = l === 0 ? `Lleno · ${p.vacantes} de ${p.vacantes}`
              : l === 1 ? (p.vacantes === 1 ? 'Un lugar' : '¡Último lugar!')
              : `Quedan ${l} de ${p.vacantes}`;
  // Hasta 10 vacantes, un asiento por lugar; más, una barra.
  const visual = p.vacantes <= 10
    ? `<span class="vo-asientos" aria-hidden="true">${
        Array.from({ length: p.vacantes }, (_, i) => `<i class="${i < p.ocupadas ? 'is-ocupado' : ''}"></i>`).join('')}</span>`
    : `<span class="vo-barra" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
  return `<div class="vo-cupo vo-cupo--${tono}">${visual}<span>${texto}</span></div>`;
}

/** La tarjeta de un puesto, dentro de su actividad: no repite la actividad
    ni la sede, que ya están en la cabecera de la vista. */
function tarjeta(p, a, tuyo) {
  const cat = categoria(p.categoria);
  const lleno = libres(p) === 0;
  const empezo = !p.abierto;
  // Solo si el turno es otro día que la actividad (el montaje de la víspera).
  const otroDia = p.fecha !== a.fecha ? `${diaCorto(p.fecha)} · ` : '';
  const boton = tuyo
    ? `<a class="pg-btn vo-card__btn" href="/mis-turnos/">Ya estás inscrito · Ver</a>`
    : empezo ? `<button class="pg-btn vo-card__btn" type="button" disabled>Ya empezó</button>`
    : lleno  ? `<button class="pg-btn vo-card__btn" type="button" disabled>Lleno</button>`
    : `<button class="pg-btn pg-btn--lleno vo-card__btn" type="button" data-inscribir="${p.id}">Ver e inscribirme</button>`;

  return `
  <article class="vo-card${lleno || empezo ? ' vo-card--apagada' : ''}${tuyo ? ' vo-card--tuyo' : ''}"
           style="${estiloCategoria(p.categoria)}" id="p-${p.id}">
    <div class="vo-card__top">
      <p class="vo-card__cat"><i></i>${escapar(cat.nombre)}</p>
      <p class="vo-card__hora"><b>${escapar(horario(p))}</b><span>${escapar(otroDia + duracion(p))}</span></p>
    </div>
    <h3 class="vo-card__tit">${escapar(p.titulo)}</h3>
    ${p.descripcion ? `<p class="vo-card__desc">${escapar(p.descripcion)}</p>` : ''}
    <div class="vo-card__pie">
      ${cupo(p)}
      ${boton}
    </div>
    ${tuyo ? '<p class="vo-tuyo">Tu turno</p>' : ''}
  </article>`;
}

/* ================================================================ diálogo */
const dlg = $('#dlg');

/* Al cerrar, la dirección vuelve a la de la actividad (sin pintar de nuevo).
   Se hace en el momento, no solo en el evento «close»: ese llega después, y
   un «atrás» inmediato encontraría todavía el #p= del puesto. */
function soltarPuesto() {
  if (!location.hash.startsWith('#p=')) return;
  const a = ultimaActividad;
  history.replaceState(null, '', location.pathname + location.search + (a ? `#a=${encodeURIComponent(a.slug)}` : ''));
}
function cerrar() { soltarPuesto(); dlg.close(); }

dlg.querySelector('[data-cerrar]').addEventListener('click', cerrar);
// Cerrar al tocar fuera de la hoja, como cualquier ventana emergente.
dlg.addEventListener('click', (e) => { if (e.target === dlg) cerrar(); });
// Con Escape el navegador cierra solo: ahí sí se espera al evento.
dlg.addEventListener('close', soltarPuesto);

function abrir(id) {
  const p = PUESTOS.find(x => x.id === id);
  if (!p) return;
  const cat = categoria(p.categoria);
  dlg.style.cssText = `--eje:${cat.color};--eje-tx:${cat.tx}`;
  $('#dlg-kicker').textContent = cat.nombre;
  $('#dlg-tit').textContent = p.titulo;
  history.replaceState(null, '', `${location.pathname}${location.search}#p=${p.id}`);

  // Aquí va todo lo que la tarjeta resume: qué se hace completo, dónde
  // presentarse y qué llevar.
  const cuerpo = $('#dlg-cuerpo');
  cuerpo.innerHTML = `
    <div class="vo-resumen">
      <p><b>${escapar(diaLargo(p.fecha))}</b>, de ${escapar(horario(p))} <span>(${escapar(duracion(p))})</span></p>
      <p>${escapar(lugar(p))} · para «${escapar(p.actividad)}»</p>
      ${p.punto_encuentro ? `<p>Te presentas en: <b>${escapar(p.punto_encuentro)}</b></p>` : ''}
      ${cupo(p)}
    </div>
    ${p.descripcion ? `<p class="vo-dlg__desc">${escapar(p.descripcion)}</p>` : ''}
    ${p.requisitos ? `<p class="vo-card__req vo-dlg__req"><b>Lleva o considera:</b> ${escapar(p.requisitos)}</p>` : ''}
    <div id="dlg-form"></div>`;

  if (!disponible(p)) {
    cuerpo.querySelector('#dlg-form').innerHTML =
      `<p class="bf__error">${p.abierto ? 'Este puesto ya se llenó.' : 'Este turno ya empezó.'} Busca otro en la lista.</p>`;
  } else {
    montarFormulario(cuerpo.querySelector('#dlg-form'), p, INSTITUCIONES, {
      institucion: CLAVE_INST,
      alInscribir: (turno) => exito(turno),
      alCambiar: refrescar,
    });
  }
  if (!dlg.open) dlg.showModal();
  cuerpo.scrollTop = 0;
}

function exito(turno) {
  const cuerpo = $('#dlg-cuerpo');
  $('#dlg-kicker').textContent = 'Inscripción lista';
  cuerpo.innerHTML = `
    ${htmlComprobante(turno, { nuevo: true })}
    <div class="vo-guardar">
      <p><b>Tu comprobante ya quedó en este teléfono</b>, en «Mis turnos». El festival todavía
         no manda correos: si te inscribes desde otra computadora, copia la liga y guárdala.</p>
      <div class="vo-guardar__acc">
        <a class="pg-btn" href="/mis-turnos/">Ver mis turnos</a>
        <button class="pg-btn pg-btn--lleno" type="button" data-otro>Inscribirme a otro turno</button>
      </div>
    </div>`;
  conectarComprobante(cuerpo, turno);
  cuerpo.querySelector('[data-otro]').addEventListener('click', cerrar);
  cuerpo.scrollTop = 0;
  refrescar();
}
