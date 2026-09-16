/* ============================================================================
   CABECERA · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Un solo componente, DOS MENÚS. Cuál se pinta lo decide la página en la que
   estás, no quién eres:

     · SITIO PÚBLICO     portada, programa, talleres, boletos, privacidad.
                         Para quien viene al festival. No muestra el sistema:
                         a quien tiene sesión abierta solo le ofrece un botón
                         para entrar a él.

     · SISTEMA INTERNO   actividades, panel, registro y acceso.
                         Para coordinación y administración. Menú según el
                         rol, una etiqueta «Sistema» junto a la marca y un
                         enlace de vuelta al sitio.

   Antes eran un solo menú al que se le iban sumando enlaces según la sesión.
   Con cuenta de administración la barra mezclaba las dos cosas: «Programa» y
   «Armar programa», «Mis boletos» y «Boletos», uno junto al otro, y quien
   venía al festival veía el acceso del personal como botón principal aunque
   el público no tiene cuenta.

   Uso:
     import { montarCabecera } from '/assets/js/cabecera.js';
     montarCabecera();          // deduce la sesión de lo guardado (rápido)
     montarCabecera(perfil);    // con el perfil ya confirmado
   ========================================================================== */

import { SUPABASE_URL } from './config.js';
import { sincronizarColorNavegador } from './marca.js';

/* ============================================================= PÚBLICO === */

/* Secciones del sitio. En la portada son anclas; en cualquier otra página
   pública llevan de vuelta a la portada, a esa misma sección.

   «Programa» es el único que no es un ancla: desde que existe /programa/, el
   menú lleva a la cartelera completa y no a la sección de adelanto. La portada
   conserva esa sección, con su botón, para quien baja leyendo. */
const PUBLICO = [
  ['#fdc-festival',  'El festival'],
  ['#fdc-2026',      'Edición 2026'],
  ['/programa/',     'Programa'],
  ['#fdc-memoria',   'Memoria 2025'],
  ['#fdc-participa', 'Participa'],
];

/* Talleres y laboratorios publicados. Van en un desplegable justo después de
   «Programa».

   Es una lista y no un enlace suelto porque va a crecer: cada convocatoria
   nueva se agrega aquí y aparece en el menú de todo el sitio sin tocar nada
   más. El tercer campo es la línea de apoyo que se ve bajo el nombre. */
const TALLERES = [
  ['/laboratorio-arte-de-comunicar-ciencia/',
   'El arte de comunicar ciencia',
   'Laboratorio escénico · Convocatoria abierta'],
];

/* ============================================================= SISTEMA === */

/* Las rutas del sistema. Todo lo que no empiece por una de estas es público.
   /registro y /entrar cuentan como sistema aunque se lleguen sin sesión: son
   la puerta de entrada, y ahí sobra el menú del festival. */
const RUTAS_SISTEMA = ['/mi-actividad/', '/actividad/', '/panel/', '/registro/', '/entrar/'];

/* Menú por rol. El tercer campo son otras rutas que cuentan como «estar ahí»:
   el panel de una actividad (/actividad/) se abre desde la lista de cada
   quien, así que se marca el enlace del que se vino.

   «Armar programa» y no «Programa»: la etiqueta dice lo que se hace ahí y
   coincide con el título de la página. */
const MENU_SISTEMA = {
  administrador: [
    ['/panel/',          'Tablero',         ['/actividad/']],
    ['/panel/programa/', 'Armar programa'],
    ['/panel/boletos/',  'Boletos'],
    ['/mi-actividad/',   'Mis actividades'],
  ],
  coordinador: [
    ['/mi-actividad/', 'Mis actividades', ['/actividad/']],
    ['/registro/',     'Registrar actividad'],
  ],
};

/* Adónde lleva entrar al sistema, según el rol. Es la página que se abre desde
   el sitio público y adonde apunta la marca dentro del sistema. */
const INICIO = {
  administrador: ['/panel/',        'Tablero'],
  coordinador:   ['/mi-actividad/', 'Mis actividades'],
};
const inicioDe = (rol) => INICIO[rol] || INICIO.coordinador;

/* ============================================================== CONTEXTO == */

const ruta = location.pathname;

// Solo la raíz. Antes bastaba con que la ruta terminara en /index.html, y
// cualquier página servida así se habría tomado por la portada.
const esLanding = ruta === '/' || ruta === '/index.html';
const esSistema = RUTAS_SISTEMA.some(r => ruta.startsWith(r));

/* ¿Este navegador guardó boletos? Se lee directo del almacenamiento para no
   importar el módulo de boletos en todas las páginas. Solo entonces aparece
   «Mis boletos» en el menú: a quien no tiene ninguno no le dice nada. */
function tieneBoletos() {
  try {
    const t = JSON.parse(localStorage.getItem('fdc_boletos') || '{}');
    return Object.values(t).some(b => b && b.estado !== 'cancelado');
  } catch (e) {
    return false;
  }
}

/* ---------------------------------------------------------------------------
   Sesión sin cargar Supabase.

   La portada es la página más visitada y no tiene por qué pagar la descarga de
   la librería solo para saber si pintar «Entrar» o un botón al sistema.
   supabase-js guarda la sesión en localStorage, así que se lee de ahí: si el
   dato resultara viejo, el enlace lleva a /entrar y no se pierde nada.
--------------------------------------------------------------------------- */
function sesionGuardada() {
  try {
    const ref = (SUPABASE_URL.match(/^https:\/\/([^.]+)\./) || [])[1];
    if (!ref) return null;
    const crudo = localStorage.getItem('sb-' + ref + '-auth-token');
    if (!crudo) return null;
    const s = JSON.parse(crudo);
    if (!s || !s.access_token) return null;
    return {
      nombre: s.user?.user_metadata?.nombre || s.user?.email || '',
      correo: s.user?.email || '',
      rol: localStorage.getItem('fdc_rol') || 'coordinador',
    };
  } catch (e) {
    return null;
  }
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/* ¿Este enlace es la página en la que estás? */
function esActual(h, tambien = []) {
  // Las anclas y la portada no se marcan: en la portada lo hace el observador
  // de secciones, según lo que esté a la vista.
  if (h.includes('#') || h === '/') return false;
  if (tambien.some(r => ruta.startsWith(r))) return true;
  // «/panel/» se compara exacto: con startsWith, estando en /panel/programa/
  // saldrían dos enlaces marcados como la página actual.
  return h === '/panel/' ? ruta === h : ruta.startsWith(h);
}

function enlace(h, t, tambien) {
  return `<a href="${esc(h)}"${esActual(h, tambien) ? ' aria-current="page"' : ''}>${esc(t)}</a>`;
}

/* ========================================================================= */
export function montarCabecera(perfil) {
  const hueco = document.querySelector('[data-cabecera]');
  if (!hueco) return;

  // La barra del navegador en el móvil toma el oscuro de la marca. Va aquí
  // porque la cabecera se monta en todas las páginas.
  sincronizarColorNavegador();

  const quien = perfil || sesionGuardada();
  const cab = el(esSistema ? cabeceraSistema(quien) : cabeceraPublica(quien));

  hueco.replaceWith(cab);
  // Va antes de pintar nada: se monta en modo ancho y, si no cabe, se pliega
  // en la misma tarea, así no se alcanza a ver la barra rota.
  ajustarPlegado(cab);
  medirAlto(cab);
  conectar(cab);
  return cab;
}

/* ------------------------------------------------------------- público --- */
function cabeceraPublica(quien) {
  const piezas = PUBLICO.map(([h, t]) =>
    enlace(h.startsWith('#') && !esLanding ? '/' + h : h, t));

  const tras = PUBLICO.findIndex(([h]) => h === '/programa/') + 1;
  piezas.splice(tras, 0, grupoTalleres());

  if (tieneBoletos() || ruta.startsWith('/mis-boletos/')) {
    piezas.push(enlace('/mis-boletos/', 'Mis boletos'));
  }

  // El público no tiene cuenta. «Entrar» es para el personal y va discreto,
  // para no sugerirle a quien viene al festival que necesita una. Con la
  // sesión abierta, un solo botón al sistema: todo lo demás vive allá.
  let auth;
  if (quien) {
    const [h, t] = inicioDe(quien.rol);
    auth = `<a class="cab__btn cab__btn--linea" href="${esc(h)}">${esc(t)}</a>`;
  } else {
    auth = `<a class="cab__discreto" href="/entrar/">Entrar</a>`;
  }

  return plantilla({
    sistema: false,
    marcaHref: '/',
    nav: piezas.join(''),
    auth,
  });
}

function grupoTalleres() {
  const enUnTaller = TALLERES.some(([h]) => ruta.startsWith(h));
  return `
    <div class="cab__grupo" data-grupo>
      <button class="cab__grupo-btn" type="button"
              aria-expanded="false" aria-controls="cab-talleres"
              ${enUnTaller ? 'data-actual' : ''}>
        Talleres
        <svg class="cab__flecha" viewBox="0 0 10 6" aria-hidden="true" focusable="false">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor"
                stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="cab__panel" id="cab-talleres" hidden>
        ${TALLERES.map(([h, t, pie]) => `
        <a href="${esc(h)}"${ruta.startsWith(h) ? ' aria-current="page"' : ''}>
          <b>${esc(t)}</b>
          <small>${esc(pie)}</small>
        </a>`).join('')}
      </div>
    </div>`;
}

/* ------------------------------------------------------------- sistema --- */
function cabeceraSistema(quien) {
  // Sin sesión —en /entrar o en /registro por invitación— no hay menú: solo
  // la vuelta al sitio y, en el registro, la entrada para quien ya tiene cuenta.
  const items = quien ? (MENU_SISTEMA[quien.rol] || MENU_SISTEMA.coordinador) : [];
  const nav = items.map(([h, t, tambien]) => enlace(h, t, tambien)).join('');

  let auth = `<a class="cab__discreto" href="/">Ver el sitio <span aria-hidden="true">↗</span></a>`;
  if (quien) {
    auth += `
      <span class="cab__quien" title="${esc(quien.correo)}">${esc(quien.nombre || quien.correo)}</span>
      <button class="cab__btn cab__btn--salir" type="button" data-salir>Salir</button>`;
  } else if (!ruta.startsWith('/entrar/')) {
    auth += `<a class="cab__btn cab__btn--linea" href="/entrar/">Entrar</a>`;
  }

  return plantilla({
    sistema: true,
    marcaHref: quien ? inicioDe(quien.rol)[0] : '/',
    nav,
    auth,
  });
}

/* ------------------------------------------------------------ montaje ---- */
function plantilla({ sistema, marcaHref, nav, auth }) {
  const clases = ['cab', sistema ? 'cab--sistema' : 'cab--publica'];
  if (!sistema && esLanding) clases.push('cab--flotante');

  return `
    <header class="${clases.join(' ')}" role="banner">
      <div class="cab__in">
        <a class="cab__marca" href="${esc(marcaHref)}"
           aria-label="${sistema ? 'Sistema del Festival del Conocimiento, inicio' : 'Festival del Conocimiento, inicio'}">
          <img src="/assets/img/icono-festcon.png" alt="" width="34">
          <b>Festival del Conocimiento</b>
          ${sistema ? '<span class="cab__sistema">Sistema</span>' : ''}
        </a>

        <button class="cab__toggle" type="button" aria-expanded="false"
                aria-controls="cab-menu" aria-label="Abrir el menú">
          <span></span><span></span><span></span>
        </button>

        <div class="cab__menu" id="cab-menu">
          ${nav ? `<nav class="cab__nav" aria-label="${sistema ? 'Menú del sistema' : 'Navegación principal'}">${nav}</nav>` : ''}
          <div class="cab__auth">${auth}</div>
        </div>
      </div>
    </header>`;
}

/**
 * Pliega el menú cuando la barra deja de caber.
 *
 * No sirve un punto de corte fijo en CSS porque el ancho que hace falta
 * depende del estado: con la sesión cerrada son 989px, y con sesión de
 * administración 1269px, porque entran «Tablero», el nombre y «Salir». El
 * corte fijo que había en 1120px dejaba la barra partida entre 1120 y 1173
 * justo para quien había iniciado sesión.
 */
function ajustarPlegado(cab) {
  const caja  = cab.querySelector('.cab__in');
  const marca = cab.querySelector('.cab__marca');
  const menu  = cab.querySelector('.cab__menu');
  if (!caja || !marca || !menu) return;

  let necesita = 0;

  // El ancho útil se saca restando el relleno y no del de la ventana: el
  // contenedor está limitado a 1240px, y si box-sizing cambia entre páginas
  // el borde exterior deja de ser comparable.
  function disponible() {
    const est = getComputedStyle(caja);
    return caja.clientWidth
      - (parseFloat(est.paddingLeft) || 0)
      - (parseFloat(est.paddingRight) || 0);
  }

  function medir() {
    // Hay que medir en modo ancho: plegado, el menú es absoluto y en columna,
    // así que su ancho ya no dice lo que ocuparía puesto en una sola fila.
    const estaba = cab.classList.contains('cab--compacta');
    cab.classList.remove('cab--compacta');

    const hueco = parseFloat(getComputedStyle(caja).columnGap) || 18;
    necesita = Math.ceil(marca.getBoundingClientRect().width + menu.scrollWidth + hueco);

    if (estaba) cab.classList.add('cab--compacta');
    decidir();
  }

  function decidir() {
    cab.classList.toggle('cab--compacta', disponible() < necesita);
  }

  medir();

  // Con las tipografías de respaldo el texto ocupa otra cosa; cuando llegan
  // Space Grotesk e Inter hay que volver a medir.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(medir).catch(() => {});
  }

  // resize y no ResizeObserver: el observador vería el cambio de alto que
  // provoca plegarse y podría realimentarse.
  window.addEventListener('resize', decidir, { passive: true });
}

/**
 * Publica el alto real de la cabecera como variable CSS.
 * No se puede fijar a mano: cambia con el ancho de pantalla y con el contenido,
 * y de ese número depende que las secciones ancladas no queden escondidas.
 */
function medirAlto(cab) {
  const aplicar = () => {
    const h = Math.round(cab.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--cab-alto', h + 'px');
  };
  aplicar();
  if ('ResizeObserver' in window) {
    new ResizeObserver(aplicar).observe(cab);
  } else {
    window.addEventListener('resize', aplicar, { passive: true });
  }
}

/* ========================================================================= */
function conectar(cab) {
  const menu   = cab.querySelector('.cab__menu');
  const toggle = cab.querySelector('.cab__toggle');
  const suave  = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------- menú en móvil ------- */
  function abrir(si) {
    menu.classList.toggle('is-abierto', si);
    toggle.setAttribute('aria-expanded', si ? 'true' : 'false');
    toggle.setAttribute('aria-label', si ? 'Cerrar el menú' : 'Abrir el menú');
  }
  toggle.addEventListener('click', () => abrir(!menu.classList.contains('is-abierto')));

  /* ------------------------------------------------ desplegable talleres --
     Se abre al pulsar y no al pasar el ratón: en pantalla táctil el hover no
     existe, y abrir por hover en escritorio hace que el panel salte solo al
     cruzar el cursor de camino a otra cosa. */
  const grupo    = cab.querySelector('[data-grupo]');
  const grupoBtn = grupo && grupo.querySelector('.cab__grupo-btn');
  const panel    = grupo && grupo.querySelector('.cab__panel');

  function abrirGrupo(si) {
    if (!grupo) return;
    panel.hidden = !si;
    grupoBtn.setAttribute('aria-expanded', si ? 'true' : 'false');
    grupo.classList.toggle('is-abierto', si);
  }

  if (grupo) {
    grupoBtn.addEventListener('click', (e) => {
      e.stopPropagation();               // que no lo cierre el clic de fuera
      abrirGrupo(panel.hidden);
    });

    // No se abre solo al entrar en un taller aunque el botón salga resaltado:
    // taparía el contenido nada más cargar, y el enlace que revelaría es el de
    // la página en la que ya estás.
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Escape cierra lo más interior primero: el desplegable antes que el menú.
    if (grupo && !panel.hidden) {
      abrirGrupo(false);
      grupoBtn.focus();
      return;
    }
    if (menu.classList.contains('is-abierto')) {
      abrir(false);
      toggle.focus();
    }
  });

  // Al pulsar fuera, se cierra
  document.addEventListener('click', (e) => {
    if (cab.contains(e.target)) return;
    if (grupo && !panel.hidden) abrirGrupo(false);
    if (menu.classList.contains('is-abierto')) abrir(false);
  });

  /* --------------------------------- anclas de la landing ---------------- */
  cab.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const destino = document.querySelector(a.getAttribute('href'));
      if (!destino) return;
      e.preventDefault();
      abrir(false);
      destino.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });

  // Cerrar el menú al navegar a otra página desde móvil
  cab.querySelectorAll('.cab__nav a:not([href^="#"])').forEach(a => {
    a.addEventListener('click', () => abrir(false));
  });

  /* ------------------------------------------------ salir de la cuenta --- */
  const btnSalir = cab.querySelector('[data-salir]');
  if (btnSalir) {
    btnSalir.addEventListener('click', async () => {
      btnSalir.disabled = true;
      btnSalir.textContent = 'Saliendo…';
      try {
        const { db } = await import('/assets/js/app.js');
        await db.auth.signOut();
      } catch (e) { /* aunque falle, se limpia y se sale */ }
      localStorage.removeItem('fdc_rol');
      location.href = '/';
    });
  }

  /* ------------------------- fondo sólido al bajar (solo landing) -------- */
  if (cab.classList.contains('cab--flotante')) {
    // Se comprueba directamente y no dentro de requestAnimationFrame: hay
    // entornos donde rAF no dispara (pestaña en segundo plano, webviews
    // embebidos, ahorro de energía) y la cabecera se quedaría transparente
    // para siempre. Alternar una clase es barato y no justifica el riesgo.
    const mirar = () => cab.classList.toggle('is-solida', window.scrollY > 60);
    mirar();
    window.addEventListener('scroll', mirar, { passive: true });
    window.addEventListener('pageshow', mirar);
  }

  /* ---------------------------- sección visible resaltada (landing) ------ */
  if (esLanding && 'IntersectionObserver' in window) {
    const anclas = new Map();
    cab.querySelectorAll('.cab__nav a[href^="#"]').forEach(a => {
      const s = document.querySelector(a.getAttribute('href'));
      if (s) anclas.set(s, a);
    });
    if (anclas.size) {
      const io = new IntersectionObserver((entradas) => {
        entradas.forEach(en => {
          if (!en.isIntersecting) return;
          anclas.forEach(a => a.removeAttribute('aria-current'));
          anclas.get(en.target)?.setAttribute('aria-current', 'true');
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      anclas.forEach((_, s) => io.observe(s));
    }
  }
}
