/* ============================================================================
   PROGRAMA EN LA LANDING · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Todo lo que la portada toma de la base de datos, con UNA sola consulta a
   «vista_programa» (lo publicado y sin archivar, que es lo único abierto a quien
   no tiene cuenta):

     · Portada          tres actividades destacadas, con póster
     · Esta semana      lo próximo, en orden y agrupado por día
     · El festival      cuántas actividades tiene cada eje
     · Sedes            cada sede con su dirección y cuántas actividades

   POR QUÉ NO USA app.js
   La landing es la página más visitada del sitio y no descarga supabase-js:
   cabecera.js lee la sesión del localStorage justamente para no pagar esa
   descarga. Una lectura contra la API REST es un «fetch» de diez líneas y la
   llave publishable ya vive en config.js.

   POR QUÉ LOS HUECOS VAN OCULTOS
   Los contenedores están en index.html vacíos y con «hidden». Aquí se llenan
   y se muestran solo si hay datos. Sin red o sin programa, la página sigue
   completa y sin huecos: no hay nada que prometa lo que no está.
   ========================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { urlPosterMini } from './archivos.js';
import { lugarCorto } from './lugar.js';

const HERO   = document.getElementById('fdc-hero-prog');
const PROX   = document.getElementById('fdc-proximas');
const SEDES  = document.getElementById('fdc-sedes-caja');

const DESTACADAS = 3;    // tarjetas de la portada
const DIAS_PROX  = 3;    // días que muestra «Esta semana»
const POR_DIA    = 4;    // actividades como mucho por día ahí

/* Colores de las etiquetas de fecha, por turno. No es el color del eje a
   propósito: tres conciertos seguidos serían tres tarjetas magenta. Con el
   amarillo el texto va oscuro; con los demás, blanco. */
const COLORES = [
  ['--fdc-amarillo', 'var(--fdc-dark)'],
  ['--fdc-turquesa', '#fff'],
  ['--fdc-magenta',  '#fff'],
  ['--fdc-verde',    'var(--fdc-dark)'],
  ['--fdc-naranja',  '#fff'],
];

const FLECHA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

arrancar();

async function arrancar() {
  const campos = 'slug,titulo,resumen,poster,eje,eje_color,tipo,sede,sede_direccion,fecha,hora_inicio,hora_fin,acceso,estado_boletos';
  const orden = '&order=fecha.asc,hora_inicio.asc,titulo.asc&limit=400';
  // «sala» y «sede_corta» llegan con sql/16-sedes-salas.sql. Si la base aún
  // no las tiene, la portada sale igual que antes en vez de quedarse vacía.
  const acts = await pedir(`${campos},sala,sede_corta${orden}`) || await pedir(campos + orden);
  if (!acts || !acts.length) return;

  if (HERO)  pintarDestacadas(acts);
  if (PROX)  pintarProximas(acts);
  pintarCifrasEje(acts);
  if (SEDES) pintarSedes(acts);
}

async function pedir(consulta) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/vista_programa?select=${consulta}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/* ================================================================ portada ==
   Las tres primeras con póster, de hoy en adelante. Si el festival ya pasó,
   las tres primeras del programa: es lo que alguien querría ver en enero. */
function pintarDestacadas(acts) {
  const hoy = hoyLocal();
  let conPoster = acts.filter(a => a.poster && a.fecha && a.fecha >= hoy);
  if (!conPoster.length) conPoster = acts.filter(a => a.poster);
  if (!conPoster.length) return;

  const tres = conPoster.slice(0, DESTACADAS);

  HERO.innerHTML = `
    <div class="fdc-destacadas">
      <div>
        <h2 class="fdc-destacadas__tit">Actividades<br>destacadas</h2>
        <span class="fdc-destacadas__raya" aria-hidden="true"></span>
        <p class="fdc-destacadas__txt">Música, ciencia y encuentros para empezar a armar tu semana.</p>
        <a class="fdc-enlace" href="/programa/">Ver todo el programa <span aria-hidden="true">→</span></a>
      </div>
      <ul class="fdc-cards-grid">
        ${tres.map((a, n) => tarjeta(a, n)).join('')}
      </ul>
    </div>`;
  HERO.hidden = false;
}

function tarjeta(a, n) {
  const [c, ctx] = COLORES[n % COLORES.length];
  const f = piezasFecha(a);
  const mini = urlPosterMini(a.poster);
  return `
    <li>
      <a class="fdc-card" href="/programa/${encodeURIComponent(a.slug)}/" style="--c:var(${c});--c-tx:${ctx}">
        <div class="fdc-card__media">
          <img class="fdc-card__fondo" src="${mini}" alt="" aria-hidden="true" loading="lazy" decoding="async">
          <img class="fdc-card__img" src="${mini}" alt="" width="640" height="640"
               ${n === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"
               onerror="this.closest('li').remove()">
          ${f ? `<span class="fdc-card__badge"><small>${esc(f.dia)}</small><b>${esc(f.num)}</b><small>${esc(f.mes)}</small></span>` : ''}
        </div>
        <div class="fdc-card__cuerpo">
          <h3 class="fdc-card__titulo">${esc(a.titulo)}</h3>
          <p class="fdc-card__cuando">${esc(cuando(a))}</p>
          ${a.resumen ? `<p class="fdc-card__resumen">${esc(breve(a.resumen, 110))}</p>` : ''}
          <span class="fdc-card__ir" aria-hidden="true">${FLECHA}</span>
        </div>
      </a>
    </li>`;
}

/* ============================================================ esta semana ==
   Los próximos días con programa, desde hoy. Durante el festival es «hoy y
   los dos días siguientes»; antes, los tres primeros días. Después de la
   clausura no hay nada por delante y la sección no aparece. */
function pintarProximas(acts) {
  const hoy = hoyLocal();
  const porDia = new Map();
  acts.filter(a => a.fecha && a.fecha >= hoy).forEach(a => {
    if (!porDia.has(a.fecha)) porDia.set(a.fecha, []);
    porDia.get(a.fecha).push(a);
  });
  const dias = [...porDia.keys()].sort().slice(0, DIAS_PROX);
  if (!dias.length) return;

  const enCurso = dias[0] === hoy;

  document.getElementById('fdc-proximas-caja').innerHTML = `
    <div class="fdc-cabeza-sec">
      <div>
        <p class="fdc-eyebrow">${enCurso ? 'El festival está en marcha' : 'Lo que viene'}</p>
        <h2 class="fdc-h2">${enCurso ? 'Hoy y los<br>próximos días' : 'Así arranca<br>el festival'}</h2>
      </div>
      <p class="fdc-lead">
        Ocho días de actividades, del sábado 17 al sábado 24 de octubre, en
        teatros, plazas, escuelas y centros de investigación de Ensenada.
        Todo es gratuito; lo que tiene cupo pide un boleto que se consigue aquí.
      </p>
    </div>

    <div class="fdc-dias">
      ${dias.map(d => {
        const lista = porDia.get(d);
        const f = piezasFecha({ fecha: d });
        const sobran = lista.length - POR_DIA;
        return `
        <section class="fdc-dia" aria-label="${esc(diaLargo(d))}">
          <div class="fdc-dia__fecha${d === hoy ? ' is-hoy' : ''}">
            <small>${esc(f.dia)}</small>
            <b>${esc(f.num)}</b>
            <span>${esc(f.mesLargo)}</span>
            ${d === hoy ? '<em class="fdc-dia__hoy">Hoy</em>' : ''}
          </div>
          <div class="fdc-dia__lista">
            ${lista.slice(0, POR_DIA).map(fila).join('')}
            ${sobran > 0 ? `
            <a class="fdc-enlace" href="/programa/#${esc(d)}" style="margin-top:8px">
              ${sobran} ${sobran === 1 ? 'actividad más ese día' : 'actividades más ese día'} <span aria-hidden="true">→</span>
            </a>` : ''}
          </div>
        </section>`;
      }).join('')}
    </div>

    <div class="fdc-proximas__pie">
      <p>El programa se publica conforme se confirma cada actividad.</p>
      <a class="fdc-btn fdc-btn--linea" href="/programa/">Programa completo <span aria-hidden="true">→</span></a>
    </div>`;
  PROX.hidden = false;
}

function fila(a) {
  const h  = a.hora_inicio ? String(a.hora_inicio).slice(0, 5) : '';
  const hf = a.hora_fin ? String(a.hora_fin).slice(0, 5) : '';
  const url = `/programa/${encodeURIComponent(a.slug)}/`;
  const acc = accion(a, url);
  // Miniatura decorativa (alt vacío): el título está al lado. Si no carga,
  // queda el color del eje con su aro, igual que cuando no hay póster.
  const mini = a.poster
    ? `<span class="fdc-fila__mini" aria-hidden="true"><img src="${urlPosterMini(a.poster)}" alt="" loading="lazy" decoding="async"
         onerror="this.parentElement.classList.add('fdc-fila__mini--vacia');this.remove()"></span>`
    : `<span class="fdc-fila__mini fdc-fila__mini--vacia" aria-hidden="true"></span>`;

  return `
    <article class="fdc-fila" style="--c:${esc(a.eje_color || '#10ABC4')}">
      <div class="fdc-fila__hora">${h ? esc(h) : '—'}${hf ? `<small>a ${esc(hf)}</small>` : ''}</div>
      ${mini}
      <div class="fdc-fila__txt">
        <p class="fdc-fila__eje"><i></i>${esc(a.eje || 'Festival')}${a.tipo ? ` · ${esc(a.tipo)}` : ''}</p>
        <h3 class="fdc-fila__tit"><a href="${url}">${esc(a.titulo)}</a></h3>
        ${a.sede ? `<p class="fdc-fila__sede">${esc(lugarCorto(a))}</p>` : ''}
        ${acc.nota ? `<p class="fdc-fila__estado">${esc(acc.nota)}</p>` : ''}
      </div>
      <div class="fdc-fila__accion">${acc.html}</div>
    </article>`;
}

/**
 * El botón de la fila según cómo se entra. Para pedir boleto lleva a la
 * actividad con #boleto, que abre el formulario directo, y con ?o=portada
 * para que el boleto registre de dónde vino. El público nunca ve el cupo:
 * ve si hay lugar.
 */
function accion(a, url) {
  const ir = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  const pedir = `${url}?o=portada#boleto`;
  const boton = (href, texto, extra = '') =>
    `<a class="fdc-fila__btn${extra}" href="${href}">${esc(texto)}${ir}</a>`;
  const apagado = (texto) => `<span class="fdc-fila__btn fdc-fila__btn--off">${esc(texto)}</span>`;

  const mio = boletoGuardado(a.slug);
  if (mio) {
    const destino = mio.token ? `/boleto/#${encodeURIComponent(mio.token)}` : '/mis-boletos/';
    return { html: boton(destino, mio.estado === 'espera' ? 'Ver mi lugar en espera' : 'Ver mi boleto', ' fdc-fila__btn--tuyo') };
  }
  if (!a.acceso || a.acceso === 'libre') {
    return { html: boton(url, 'Ver actividad', ' fdc-fila__btn--linea'), nota: 'Entrada libre' };
  }
  if (a.acceso === 'escolar') {
    return { html: boton(url, 'Ver actividad', ' fdc-fila__btn--linea'), nota: 'Solo para la escuela' };
  }
  if (a.acceso === 'registro') {
    return a.estado_boletos === 'cerrado'
      ? { html: apagado('Registro cerrado') }
      : { html: boton(pedir, 'Confirmar asistencia'), nota: 'Entrada libre con confirmación' };
  }
  switch (a.estado_boletos) {
    case 'pronto':  return { html: apagado('Boletos muy pronto') };
    case 'cerrado': return { html: apagado('Boletos cerrados') };
    case 'agotado': return { html: boton(pedir, 'Anotarme en lista de espera'), nota: 'Agotado' };
    case 'pocos':   return { html: boton(pedir, 'Solicitar boleto gratuito'), nota: 'Últimos lugares' };
    default:        return { html: boton(pedir, 'Solicitar boleto gratuito') };
  }
}

/* Los boletos de este navegador, leídos directo del almacenamiento para no
   importar el módulo de boletos en la página más visitada. Las claves son los
   tokens; la actividad va dentro (ver boletos/almacen.js). */
function boletoGuardado(slug) {
  try {
    const t = JSON.parse(localStorage.getItem('fdc_boletos') || '{}');
    return Object.values(t).find(b => b && b.actividad?.slug === slug && b.estado !== 'cancelado') || null;
  } catch (e) { return null; }
}

/* ============================================================ cifras eje ==
   Rellena los <b data-eje-cifra="Ciencia"> de las tarjetas de eje. Con cero
   se queda vacío y el CSS lo oculta. */
function pintarCifrasEje(acts) {
  const cuenta = new Map();
  acts.forEach(a => { if (a.eje) cuenta.set(a.eje, (cuenta.get(a.eje) || 0) + 1); });
  document.querySelectorAll('[data-eje-cifra]').forEach(el => {
    const n = cuenta.get(el.dataset.ejeCifra) || 0;
    el.textContent = n ? String(n) : '';
    el.setAttribute('aria-label', n ? `${n} ${n === 1 ? 'actividad' : 'actividades'}` : '');
  });
}

/* ================================================================== sedes ==
   Cada sede con su dirección y cuántas actividades tiene, ordenadas de más a
   menos. Enlaza al programa filtrado por esa sede. */
function pintarSedes(acts) {
  const mapa = new Map();
  acts.forEach(a => {
    if (!a.sede) return;
    const s = mapa.get(a.sede) || { nombre: a.sede, direccion: a.sede_direccion || '', n: 0 };
    s.n++;
    if (!s.direccion && a.sede_direccion) s.direccion = a.sede_direccion;
    mapa.set(a.sede, s);
  });
  const sedes = [...mapa.values()].sort((x, y) => y.n - x.n || x.nombre.localeCompare(y.nombre, 'es'));
  if (!sedes.length) return;

  SEDES.innerHTML = `
    <ul class="fdc-sedes">
      ${sedes.map(s => `
      <li>
        <a class="fdc-sede" href="/programa/?sede=${encodeURIComponent(s.nombre)}">
          <h3>${esc(s.nombre)}</h3>
          ${s.direccion ? `<p>${esc(s.direccion)}</p>` : ''}
          <span class="fdc-sede__n">${s.n}<small>${s.n === 1 ? 'actividad' : 'actividades'}</small></span>
        </a>
      </li>`).join('')}
    </ul>
    <p class="fdc-nota fdc-sedes__nota">${sedes.length} sedes con programa publicado hasta ahora. Cada actividad indica su dirección y cómo llegar.</p>`;
}

/* ================================================================= fechas ==
   Con los tres componentes por separado. «new Date('2026-10-17')» es
   medianoche UTC y en Ensenada sale el 16: el programa entero corrido un día. */
function aFecha(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  return (a && m && d) ? new Date(a, m - 1, d) : null;
}

function hoyLocal() {
  const f = new Date();
  return [f.getFullYear(), String(f.getMonth() + 1).padStart(2, '0'), String(f.getDate()).padStart(2, '0')].join('-');
}

/** { dia: 'SÁB', num: '17', mes: 'OCT', mesLargo: 'octubre' } */
function piezasFecha(a) {
  const f = aFecha(a.fecha);
  if (!f) return null;
  const corto = (op) => f.toLocaleDateString('es-MX', op).replace(/\./g, '').toUpperCase();
  return {
    dia: corto({ weekday: 'short' }),
    num: String(f.getDate()),
    mes: corto({ month: 'short' }),
    mesLargo: f.toLocaleDateString('es-MX', { month: 'long' }),
  };
}

/** «Sáb 18 de oct · 10:00» */
function cuando(a) {
  const f = aFecha(a.fecha);
  if (!f) return 'Fecha por confirmar';
  const dia = f.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const h = a.hora_inicio ? String(a.hora_inicio).slice(0, 5) : '';
  return mayuscula(dia) + (h ? ' · ' + h : '');
}

/** «Sábado 17 de octubre» */
function diaLargo(iso) {
  const f = aFecha(iso);
  return f ? mayuscula(f.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')) : '';
}

function mayuscula(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** El primer párrafo del resumen, cortado en palabra a «max» caracteres. */
function breve(txt, max = 140) {
  const p = String(txt || '').split(/\n+/).map(t => t.trim()).find(Boolean) || '';
  if (p.length <= max) return p;
  const corte = p.lastIndexOf(' ', max);
  return p.slice(0, corte > 60 ? corte : max).replace(/[,;:.]$/, '') + '…';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
