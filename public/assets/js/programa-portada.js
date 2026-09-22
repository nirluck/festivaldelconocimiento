/* ============================================================================
   PROGRAMA EN LA LANDING · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Dos cosas, con la misma fuente de datos (vista_programa):
   · El carrusel del hero: las actividades publicadas que tienen póster.
   · El adelanto: sustituye el bloque «Programa · Próximamente» por las tres
     próximas actividades, en cuanto haya algo publicado.

   POR QUÉ NO USA app.js
   La landing es la página más visitada del sitio y hasta ahora no descarga
   supabase-js: cabecera.js lee la sesión del localStorage justamente para no
   pagar esa descarga. Traerla aquí, para pintar tres renglones, sería tirar
   por la ventana esa decisión. Una consulta de lectura contra la API REST es
   un «fetch» de diez líneas y la llave publishable ya vive en config.js.

   POR QUÉ EL RESPALDO ES EL HTML
   El bloque «Próximamente» se queda tal cual está escrito en index.html y este
   archivo solo lo reemplaza cuando de verdad hay actividades. Así nunca hay un
   hueco: si falla la red, si la base no responde o si todavía no se publica
   nada, la landing dice la verdad sin que nadie tenga que preverlo.
   ========================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { estiloEje } from './color.js';
import { urlPosterMini } from './archivos.js';

const CAJA    = document.getElementById('fdc-programa-caja');
const CUANTAS = 3;

const HERO       = document.getElementById('fdc-hero-prog');
const HERO_MAX   = 12;     // tarjetas como mucho: es un adelanto, no la cartelera
const HERO_PAUSA = 4500;   // ms entre un paso y el siguiente

if (HERO) carruselHero();
if (CAJA) adelanto();

/* ================================================================ hero ==
   Solo actividades publicadas (la vista ya filtra eso) y con póster: la tira
   es de imágenes, y una tarjeta sin imagen sería un hueco gris. Primero lo que
   viene; si el festival ya pasó, desde el principio, igual que el adelanto.
   ------------------------------------------------------------------------- */
async function carruselHero() {
  const campos = 'slug,titulo,resumen,poster,fecha,hora_inicio';
  const orden  = 'order=fecha.asc,hora_inicio.asc';

  let r = await pedir(`${campos}&poster=not.is.null&fecha=gte.${hoyLocal()}&${orden}&limit=${HERO_MAX}`);
  if (r && !r.datos.length) {
    r = await pedir(`${campos}&poster=not.is.null&${orden}&limit=${HERO_MAX}`);
  }
  if (!r || !r.datos.length) return;

  pintarHero(r.datos);
}

/* Cada tarjeta lleva un color de la marca, por turno. No es el color del eje
   a propósito: tres conciertos seguidos serían tres tarjetas magenta, y la
   maqueta pide que la fila se lea variada. */
const HERO_COLORES = ['--fdc-turquesa', '--fdc-magenta', '--fdc-amarillo', '--fdc-verde', '--fdc-naranja'];

function pintarHero(acts) {
  const flecha = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;

  HERO.innerHTML = `
    <button class="fdc-hp__btn fdc-hp__btn--prev" type="button" aria-label="Actividades anteriores">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
    </button>
    <ul class="fdc-hp__track" aria-label="Actividades del programa">
      ${acts.map((a, n) => `
      <li class="fdc-hp__item">
        <a class="fdc-hp__card" href="/programa/${encodeURIComponent(a.slug)}/"
           style="--c:var(${HERO_COLORES[n % HERO_COLORES.length]})">
          <img class="fdc-hp__img" src="${urlPosterMini(a.poster)}" alt=""
               width="640" height="640" decoding="async"
               ${n < 3 ? 'fetchpriority="high"' : 'loading="lazy"'}
               onerror="this.closest('li').remove()">
          <div class="fdc-hp__cuerpo">
            <p class="fdc-hp__cuando">${esc(cuando(a))}</p>
            <p class="fdc-hp__titulo">${esc(a.titulo)}</p>
            ${a.resumen ? `<p class="fdc-hp__resumen">${esc(breve(a.resumen))}</p>` : ''}
            <span class="fdc-hp__ir" aria-hidden="true">${flecha}</span>
          </div>
        </a>
      </li>`).join('')}
    </ul>
    <button class="fdc-hp__btn fdc-hp__btn--next" type="button" aria-label="Actividades siguientes">
      ${flecha}
    </button>`;
  HERO.hidden = false;

  const track = HERO.querySelector('.fdc-hp__track');
  const paso  = () => {
    const li = track.querySelector('.fdc-hp__item');
    return li ? li.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0) : 240;
  };

  // Si cabe entera no hay nada que desplazar: se centra y se quitan flechas
  // y avance automático. Se vuelve a decidir al cambiar el ancho.
  const medir = () => HERO.classList.toggle('is-corto', track.scrollWidth <= track.clientWidth + 2);
  medir();
  window.addEventListener('resize', medir, { passive: true });

  HERO.querySelector('.fdc-hp__btn--prev').addEventListener('click', () => { mover(-1); reiniciar(); });
  HERO.querySelector('.fdc-hp__btn--next').addEventListener('click', () => { mover(1);  reiniciar(); });

  function mover(dir) {
    const fin = track.scrollWidth - track.clientWidth;
    let x = track.scrollLeft + dir * paso();
    // En los extremos da la vuelta, para que el avance automático no se
    // quede clavado en la última tarjeta.
    if (x > fin + 1) x = 0;
    else if (x < -1) x = fin;
    track.scrollTo({ left: x, behavior: 'smooth' });
  }

  /* Avance automático. Se detiene mientras alguien toca, arrastra, apunta o
     tiene el foco dentro, y no arranca si el sistema pide menos movimiento. */
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = null, pausado = false;

  function arrancar() {
    if (quieto || timer) return;
    timer = setInterval(() => {
      if (!pausado && !document.hidden && !HERO.classList.contains('is-corto')) mover(1);
    }, HERO_PAUSA);
  }
  function reiniciar() { clearInterval(timer); timer = null; arrancar(); }

  HERO.addEventListener('pointerenter', () => { pausado = true; });
  HERO.addEventListener('pointerleave', () => { pausado = false; });
  HERO.addEventListener('focusin',      () => { pausado = true; });
  HERO.addEventListener('focusout',     () => { pausado = false; });
  track.addEventListener('touchstart',  () => { pausado = true; }, { passive: true });
  track.addEventListener('touchend',    () => { pausado = false; reiniciar(); }, { passive: true });

  arrancar();
}

async function adelanto() {
  const campos = 'slug,titulo,poster,eje,eje_color,tipo,sede,fecha,hora_inicio,acceso,estado_boletos,disponibles';

  // Lo que viene: de hoy en adelante. Si el festival ya pasó no queda nada por
  // delante, y entonces se pide el principio del programa —que es lo que
  // alguien querría ver al llegar a la página en enero—.
  const hoy = hoyLocal();
  let filas = await pedir(`${campos}&fecha=gte.${hoy}&order=fecha.asc,hora_inicio.asc&limit=${CUANTAS}`);
  let total = filas ? filas.total : 0;

  if (filas && !filas.datos.length) {
    filas = await pedir(`${campos}&order=fecha.asc,hora_inicio.asc&limit=${CUANTAS}`);
    total = filas ? filas.total : 0;
  }

  // Sin datos, con error de red o con el programa vacío: no se toca nada y el
  // «Próximamente» del HTML sigue siendo lo correcto.
  if (!filas || !filas.datos.length) return;

  pintar(filas.datos, total);
  corregirNotas();
}

/**
 * Dos notas de la landing dicen que el programa y las sedes «se anunciarán
 * próximamente». En cuanto hay programa dejan de ser ciertas, y quedarían
 * contradiciendo a la sección de arriba. Se cambian aquí, junto con el
 * adelanto, para que las dos cosas digan siempre lo mismo.
 */
function corregirNotas() {
  const nota = document.getElementById('fdc-nota-programa');
  if (nota) nota.textContent =
    'El programa se publica conforme se confirma cada actividad: ya puedes consultarlo.';

  const sedes = document.getElementById('fdc-nota-sedes');
  if (sedes) sedes.textContent =
    'Cada actividad del programa indica su sede y su horario.';
}

async function pedir(consulta) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/vista_programa?select=${consulta}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        // Pide de paso el total, que llega en Content-Range como «0-2/38».
        Prefer: 'count=exact',
      },
    });
    if (!r.ok) return null;
    const rango = r.headers.get('content-range') || '';
    const total = parseInt(rango.split('/')[1], 10);
    return { datos: await r.json(), total: Number.isFinite(total) ? total : 0 };
  } catch (e) {
    return null;
  }
}

/* ---------------------------------------------------------------- pintar -- */
function pintar(acts, total) {
  const pin = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>`;

  CAJA.innerHTML = `
    <div class="fdc-prog">
      <div class="fdc-prog__lista">
        ${acts.map(a => {
          // El CSS de la landing usa el prefijo --fdc-, así que se renombran
          // las dos variables que devuelve estiloEje().
          const vars = estiloEje(a.eje_color).replace(/--eje/g, '--fdc-eje');
          // Con póster, la tarjeta pasa a dos columnas: texto y miniatura. Es la
          // miniatura y no la imagen grande a propósito: esta es la página más
          // visitada y son tres imágenes que casi nadie va a ampliar.
          return `
          <a class="fdc-prog__item${a.poster ? ' fdc-prog__item--poster' : ''}"
             href="/programa/${encodeURIComponent(a.slug)}/" style="${esc(vars)}">
            <div class="fdc-prog__txt">
              <p class="fdc-prog__cuando">${esc(cuando(a) + boleto(a))}</p>
              <h4>${esc(a.titulo)}</h4>
              ${a.sede ? `<p class="fdc-prog__donde">${pin}${esc(a.sede)}</p>` : ''}
            </div>
            ${a.poster ? `<img class="fdc-prog__poster" src="${urlPosterMini(a.poster)}" alt=""
                 loading="lazy" decoding="async" width="84" height="84"
                 onerror="this.parentElement.classList.remove('fdc-prog__item--poster');this.remove()">` : ''}
          </a>`;
        }).join('')}
      </div>

      <div class="fdc-prog__pie">
        <a class="fdc-btn fdc-btn--magenta" href="/programa/">Ver el programa completo</a>
        <p class="fdc-prog__cuenta">
          <b>${total}</b> ${total === 1 ? 'actividad confirmada' : 'actividades confirmadas'}
          hasta ahora. Seguimos publicando.
        </p>
      </div>
    </div>`;
}

/** « · Boleto gratuito», o nada si la actividad es de entrada libre. Nunca el
    número de lugares: no es asunto del público. */
function boleto(a) {
  if (a.acceso === 'registro') return a.estado_boletos === 'cerrado' ? '' : ' · Confirma asistencia';
  if (a.acceso !== 'boleto') return '';
  switch (a.estado_boletos) {
    case 'pocos':   return ' · Últimos lugares';
    case 'agotado': return ' · Agotado';
    case 'pronto':  return ' · Boletos muy pronto';
    case 'cerrado': return '';
    default:        return ' · Boleto gratuito';
  }
}

/** «Sáb 18 · 10:00» */
function cuando(a) {
  const f = aFecha(a.fecha);
  if (!f) return 'Fecha por confirmar';
  const dia = f.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '');
  const h = a.hora_inicio ? String(a.hora_inicio).slice(0, 5) : '';
  return mayuscula(dia) + (h ? ' · ' + h : '');
}

/* ---------------------------------------------------------------- fechas --
   Con los tres componentes por separado. «new Date('2026-10-17')» es medianoche
   UTC y en Ensenada sale el 16: el programa entero corrido un día.
-------------------------------------------------------------------------- */
function aFecha(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  return (a && m && d) ? new Date(a, m - 1, d) : null;
}

function hoyLocal() {
  const f = new Date();
  return [f.getFullYear(),
          String(f.getMonth() + 1).padStart(2, '0'),
          String(f.getDate()).padStart(2, '0')].join('-');
}

function mayuscula(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** El primer párrafo del resumen, y como mucho «max» caracteres cortados en
    palabra. La tarjeta lo recorta a dos líneas de todos modos; esto evita
    mandar al HTML un texto de cinco párrafos para mostrar veinte palabras. */
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
