/* ============================================================================
   ADELANTO DEL PROGRAMA EN LA LANDING · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Sustituye el bloque «Programa · Próximamente» por las tres próximas
   actividades, en cuanto haya algo publicado.

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

if (CAJA) adelanto();

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
                 loading="lazy" decoding="async" width="78" height="98"
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

/** « · Quedan 3 lugares», o nada si la actividad es de entrada libre. */
function boleto(a) {
  if (a.acceso === 'registro') return a.estado_boletos === 'cerrado' ? '' : ' · Confirma asistencia';
  if (a.acceso !== 'boleto') return '';
  switch (a.estado_boletos) {
    case 'pocos':   return a.disponibles === 1 ? ' · Queda 1 lugar' : ` · Quedan ${a.disponibles} lugares`;
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

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
