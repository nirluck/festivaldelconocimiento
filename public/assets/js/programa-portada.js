/* ============================================================================
   PROGRAMA EN LA LANDING · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Todo lo que la portada toma de la base de datos, con UNA sola consulta a
   «vista_programa» (lo publicado y sin archivar, que es lo único abierto a quien
   no tiene cuenta):

     · Portada          el carrusel «El festival siempre tiene algo para ti»
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
import { rangoCorto, ultimoDia } from './rango-fechas.js';

const HERO   = document.getElementById('fdc-hero-prog');
const SEDES  = document.getElementById('fdc-sedes-caja');

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
  // «sala» y «sede_corta» llegan con sql/16-sedes-salas.sql, y «fecha_fin»
  // con sql/20-fecha-fin.sql. Si la base aún no las tiene, la portada sale
  // igual que antes en vez de quedarse vacía.
  const acts = await pedir(`${campos},sala,sede_corta,fecha_fin${orden}`)
            || await pedir(`${campos},sala,sede_corta${orden}`) || await pedir(campos + orden);
  if (!acts || !acts.length) return;

  if (HERO)  pintarCarrusel(acts);
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

/* ============================================================== carrusel ==
   «El festival siempre tiene algo para ti». Una selección hecha a mano, en el
   orden en que se quiere mostrar, que termina en el programa completo.

   Arranca quieta y, tras unos segundos a la vista, avanza sola y despacio
   (9 de octubre de 2026). Se probó como cinta continua desde el primer
   instante y, antes de terminar de leer lo de arriba, ya se habían ido las
   primeras, que son las principales: la espera es para eso. También se
   recorre con las flechas, arrastrándola con el ratón o deslizándola con el
   dedo, y en cuanto alguien la toca deja de moverse sola un rato. Un desvanecido en la orilla dice que hay más:
   a la derecha mientras quede algo por ver, a la izquierda en cuanto se ha
   avanzado. Al principio no hay ninguno a la izquierda, para que la primera
   tarjeta, que es la más importante, se vea entera.

   La selección es de la edición 2026 y se nombra por dirección (slug), porque
   el título se puede corregir y la dirección no. Las que ya pasaron se van
   quitando durante el festival, mientras queden al menos tres; si de la lista
   no queda nada (otra edición, direcciones cambiadas), se muestran las
   próximas con póster.
   ========================================================================== */
const SELECCION = [
  'concierto-trio-los-panchos',
  'contemplacion-de-un-paisaje-retrospectiva-de-la-vida-y-la-pintura-de-estela-hussong',
  'concierto-a-cargo-de-pate-de-fua',
  'feria-del-conocimiento-valle-de-guadalupe',
  'charla-de-astronomia',                                   // ¿Hay alguien ahí?
  'orquesta-de-amart-academia',
  'taller-de-teatro-abierto',
  'nanorun-con-runella-corre-hacia-el-conocimiento',
  'teatro-clown-la-herencia',
  'alcoholes-academicos-47-ciencia-ciudadana',
  'taller-de-grabado-en-linoleo',
  'concierto-man-and-machine-a-love-electric',
];

const AROS = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="46" cy="42" r="24"/><circle cx="76" cy="46" r="24"/><circle cx="42" cy="72" r="24"/><circle cx="72" cy="76" r="24"/></svg>';

function pintarCarrusel(acts) {
  const hoy = hoyLocal();
  const porSlug = new Map(acts.map(a => [a.slug, a]));
  let elegidas = SELECCION.map(s => porSlug.get(s)).filter(Boolean);
  const vigentes = elegidas.filter(a => !a.fecha || ultimoDia(a) >= hoy);
  if (vigentes.length >= 3) elegidas = vigentes;
  if (elegidas.length < 3) {
    elegidas = acts.filter(a => a.poster && a.fecha && ultimoDia(a) >= hoy);
    if (elegidas.length < 3) elegidas = acts.filter(a => a.poster);
    elegidas = elegidas.slice(0, 10);
  }
  if (!elegidas.length) return;

  const tarjetas = [...elegidas.map((a, n) => tarjeta(a, n)), tarjetaPrograma(acts.length)];

  HERO.innerHTML = `
    <section class="fdc-carrusel" aria-labelledby="fdc-carrusel-tit">
      <h2 class="fdc-carrusel__tit" id="fdc-carrusel-tit">El festival siempre tiene algo para ti</h2>
      <!-- Las flechas van en las orillas de las tarjetas y no bajo el título:
           una flecha pegada al borde de una fila que se desvanece dice sola
           que hay más hacia ese lado. -->
      <div class="fdc-carrusel__marco">
        <div class="fdc-cinta fdc-cinta--inicio">
          <ul class="fdc-cinta__fila">
            ${tarjetas.map(t => `<li class="fdc-cinta__item">${t}</li>`).join('')}
          </ul>
        </div>
        <button class="fdc-carrusel__btn fdc-carrusel__btn--ant" type="button" data-dir="-1" aria-label="Anteriores">${FLECHA}</button>
        <button class="fdc-carrusel__btn fdc-carrusel__btn--sig" type="button" data-dir="1" aria-label="Siguientes">${FLECHA}</button>
      </div>
    </section>`;
  HERO.hidden = false;
  recorrer(HERO.querySelector('.fdc-carrusel'));
}

/**
 * Flechas, arrastre con el ratón y desvanecidos según dónde se está.
 *
 * El dedo no necesita nada: la cinta es un contenedor que se desplaza a lo
 * ancho. El ratón sí, porque arrastrar con él no desplaza por sí solo: al
 * pulsar se guarda dónde estaba y se mueve la cinta lo que se mueva el
 * puntero. Mientras se arrastra se apaga el ajuste a tarjetas («snap») y al
 * soltar vuelve, de modo que la cinta se acomoda a la tarjeta más cercana. Si
 * el arrastre pasó de unos píxeles, el clic que llega al soltar se anula: era
 * un arrastre, no una visita a la actividad.
 */
function recorrer(car) {
  const cinta = car.querySelector('.fdc-cinta');
  const [ant, sig] = car.querySelectorAll('[data-dir]');

  const paso = () => {
    const li = cinta.querySelector('.fdc-cinta__item');
    return li ? li.getBoundingClientRect().width + (parseFloat(getComputedStyle(li).marginRight) || 0) : cinta.clientWidth;
  };
  const orillas = () => {
    const inicio = cinta.scrollLeft <= 4;
    const fin = cinta.scrollLeft + cinta.clientWidth >= cinta.scrollWidth - 4;
    cinta.classList.toggle('fdc-cinta--inicio', inicio);
    cinta.classList.toggle('fdc-cinta--fin', fin);
    ant.disabled = inicio;
    sig.disabled = fin;
  };
  [ant, sig].forEach(b => b.addEventListener('click', () =>
    cinta.scrollBy({ left: Number(b.dataset.dir) * paso(), behavior: 'smooth' })));
  cinta.addEventListener('scroll', orillas, { passive: true });
  window.addEventListener('resize', orillas);
  orillas();

  // Arrastre con el ratón. Con el dedo o el lápiz, el desplazamiento nativo.
  let x0 = 0, s0 = 0, movido = 0, arrastrando = false;
  cinta.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    arrastrando = true; movido = 0;
    x0 = e.clientX; s0 = cinta.scrollLeft;
    cinta.setPointerCapture(e.pointerId);
    cinta.classList.add('is-arrastrando');
  });
  cinta.addEventListener('pointermove', (e) => {
    if (!arrastrando) return;
    const dx = e.clientX - x0;
    movido = Math.max(movido, Math.abs(dx));
    cinta.scrollLeft = s0 - dx;
  });
  const soltar = () => {
    if (!arrastrando) return;
    arrastrando = false;
    cinta.classList.remove('is-arrastrando');
  };
  cinta.addEventListener('pointerup', soltar);
  cinta.addEventListener('pointercancel', soltar);
  cinta.addEventListener('click', (e) => {
    if (movido > 6) { e.preventDefault(); e.stopPropagation(); }
    movido = 0;
  }, true);
  // Que el navegador no intente arrastrar la imagen o el enlace como archivo.
  cinta.addEventListener('dragstart', (e) => e.preventDefault());

  // La flecha de «siguiente» late hasta que alguien usa el carrusel: es la
  // pista de que hay más tarjetas que las tres a la vista.
  const tocado = () => car.classList.add('is-tocado');
  [ant, sig].forEach(b => b.addEventListener('click', tocado));
  cinta.addEventListener('pointerdown', tocado);
  cinta.addEventListener('wheel', tocado, { passive: true });

  pasear(car, cinta, [ant, sig]);
}

/* Cuánto espera quieta y a qué paso avanza después. 28 px por segundo es una
   tarjeta cada once o doce segundos: se lee de pasada sin perseguirla. */
const ESPERA_MS = 5000;
const PX_POR_SEG = 28;

/**
 * El avance solo. Arranca ESPERA_MS después de que el carrusel queda a la
 * vista, y se detiene mientras el cursor o el foco están dentro, mientras no
 * se ve y mientras la pestaña está oculta. Si alguien lo toca, arrastra o usa
 * las flechas, se detiene y vuelve a esperar antes de seguir. Al llegar al
 * final espera y regresa al principio.
 *
 * Avanza sumando a una posición propia y no a «scrollLeft»: a este paso, cada
 * cuadro mueve menos de un píxel y hay navegadores que redondean scrollLeft,
 * así que sumándole a él la cinta no avanzaría nunca. Mientras pasea se apaga
 * el ajuste a tarjetas, que si no la devolvería a su sitio en cada cuadro.
 */
function pasear(car, cinta, botones) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let andando = false, encima = false, visible = false, pos = 0, antes = 0, reloj = null;

  const cuadro = (t) => {
    if (!andando) return;
    const dt = antes ? Math.min(64, t - antes) / 1000 : 0;
    antes = t;
    if (!encima && visible && !document.hidden) {
      const max = cinta.scrollWidth - cinta.clientWidth;
      pos = Math.min(max, pos + PX_POR_SEG * dt);
      cinta.scrollLeft = pos;
      if (pos >= max) { parar(); reloj = setTimeout(volver, ESPERA_MS); return; }
    }
    requestAnimationFrame(cuadro);
  };
  const arrancar = () => {
    if (andando || encima || !visible) return;
    andando = true; antes = 0; pos = cinta.scrollLeft;
    cinta.classList.add('is-paseando');
    requestAnimationFrame(cuadro);
  };
  const parar = () => { andando = false; cinta.classList.remove('is-paseando'); };
  const esperar = (ms = ESPERA_MS) => { clearTimeout(reloj); reloj = setTimeout(arrancar, ms); };
  const volver = () => { cinta.scrollTo({ left: 0, behavior: 'smooth' }); esperar(ESPERA_MS + 800); };
  const interrumpir = () => { parar(); esperar(); };

  car.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { encima = true; parar(); clearTimeout(reloj); } });
  car.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { encima = false; esperar(); } });
  car.addEventListener('focusin',  () => { encima = true; parar(); clearTimeout(reloj); });
  car.addEventListener('focusout', () => { encima = false; esperar(); });
  cinta.addEventListener('pointerdown', interrumpir);
  cinta.addEventListener('wheel', interrumpir, { passive: true });
  botones.forEach(b => b.addEventListener('click', interrumpir));

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !andando) esperar();
    }, { threshold: .5 }).observe(cinta);
  } else {
    visible = true; esperar();
  }
}

/* La tarjeta: póster cuadrado y entero con la fecha en una etiqueta de color;
   debajo, tipo de actividad, título (dos líneas como mucho, para que la fila
   no crezca), hora, lugar y cómo se entra. Sin resumen, como en el programa.

   Es un <article> y no un enlace: dentro va el botón de boleto, y un enlace no
   admite otro dentro. El enlace del título se estira sobre toda la tarjeta. */
function tarjeta(a, n) {
  const [c, ctx] = COLORES[n % COLORES.length];
  const f = piezasFecha(a);
  const r = rangoCorto(a);
  const hora = a.hora_inicio ? String(a.hora_inicio).slice(0, 5) : '';
  const cuandoTxt = r ? `Del ${r.replace(/\s*–\s*/, ' al ')}${hora ? ' · ' + hora : ''}` : (hora || 'Hora por confirmar');
  const url = `/programa/${encodeURIComponent(a.slug)}/`;
  return `
      <article class="fdc-card" style="--c:var(${c});--c-tx:${ctx};--eje:${a.eje_color || 'var(--fdc-turquesa)'}">
        <div class="fdc-card__media${a.poster ? '' : ' fdc-card__media--vacia'}">
          ${a.poster ? `<img class="fdc-card__img" src="${urlPosterMini(a.poster)}" alt="" width="640" height="640"
               loading="lazy" decoding="async"
               onerror="this.parentElement.classList.add('fdc-card__media--vacia');this.remove()">` : ''}
          ${f ? `<span class="fdc-card__badge"><small>${esc(f.dia)}</small><b>${esc(f.num)}</b><small>${esc(f.mes)}</small></span>` : ''}
        </div>
        <div class="fdc-card__cuerpo">
          ${a.tipo && a.tipo !== 'Otro' ? `<p class="fdc-card__tipo">${esc(a.tipo)}</p>` : ''}
          <h3 class="fdc-card__titulo"><a class="fdc-card__enlace" href="${url}">${esc(a.titulo)}</a></h3>
          <p class="fdc-card__cuando">${esc(cuandoTxt)}</p>
          ${a.sede ? `<p class="fdc-card__sede">${esc(lugarCorto(a))}</p>` : ''}
          <div class="fdc-card__pie">${entrada(a, url)}</div>
        </div>
      </article>`;
}

/* Cómo se entra, con las mismas reglas que el programa: un botón cuando hay
   algo que hacer y una etiqueta cuando no. */
function entrada(a, url) {
  const pedir = `${url}?o=portada#boleto`;
  const boton = (href, texto, extra = '') => `<a class="fdc-card__btn${extra}" href="${href}">${esc(texto)}</a>`;
  const etiqueta = (texto, extra = '') => `<span class="fdc-card__tag${extra}">${esc(texto)}</span>`;

  const mio = boletoGuardado(a.slug);
  if (mio) {
    const destino = mio.token ? `/boleto/#${encodeURIComponent(mio.token)}` : '/mis-boletos/';
    return boton(destino, mio.estado === 'espera' ? 'Ver mi lugar en espera' : 'Ver mi boleto', ' fdc-card__btn--tuyo');
  }
  if (!a.acceso || a.acceso === 'libre') return etiqueta('Entrada libre', ' fdc-card__tag--libre');
  if (a.acceso === 'escolar') return etiqueta('Solo para la escuela');
  if (a.acceso === 'registro') {
    return a.estado_boletos === 'cerrado' ? etiqueta('Registro cerrado')
                                          : boton(pedir, 'Confirmar asistencia', ' fdc-card__btn--suave');
  }
  switch (a.estado_boletos) {
    case 'pronto':  return etiqueta('Boletos muy pronto');
    case 'cerrado': return etiqueta('Boletos cerrados');
    case 'agotado': return boton(pedir, 'Agotado · Lista de espera', ' fdc-card__btn--suave');
    default:        return boton(pedir, 'Consigue tu boleto');
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

/* La última: al programa completo, en turquesa con letra oscura para que se
   distinga de las tarjetas (y del magenta de los botones) y se lea como el
   final del recorrido. Con letra blanca el turquesa no pasa contraste. */
function tarjetaPrograma(total) {
  return `
      <a class="fdc-card fdc-card--programa" href="/programa/">
        <span class="fdc-card--programa__aros" aria-hidden="true">${AROS}</span>
        <span class="fdc-card--programa__txt">
          <b>Ver el programa completo</b>
          <span>${total} actividades, día por día</span>
        </span>
        <span class="fdc-card__ir" aria-hidden="true">${FLECHA}</span>
      </a>`;
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

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
