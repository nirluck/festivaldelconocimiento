/* ============================================================================
   CABECERA · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Un solo componente para todo el sitio. Se adapta a dos cosas:

     · DÓNDE estás      la landing muestra sus secciones; las páginas internas
                        muestran las suyas y un enlace de vuelta al sitio.
     · QUIÉN eres       sin sesión ofrece entrar o registrarse; con sesión
                        ofrece tus actividades, y el tablero si coordinas.

   Uso:
     import { montarCabecera } from '/assets/js/cabecera.js';
     montarCabecera();          // deduce la sesión de lo guardado (rápido)
     montarCabecera(perfil);    // con el perfil ya confirmado
   ========================================================================== */

import { SUPABASE_URL } from './config.js';

/* Secciones de la landing. Se muestran como anclas cuando estás en ella y como
   enlaces de vuelta cuando estás en cualquier otra página.

   «Programa» es el único que no es un ancla: desde que existe /programa/, el
   menú lleva a la cartelera completa y no a la sección de adelanto. La landing
   conserva esa sección, con su botón, para quien baja leyendo. */
const SECCIONES = [
  ['#fdc-festival', 'El festival'],
  ['#fdc-2026',     'Edición 2026'],
  ['/programa/',    'Programa'],
  ['#fdc-memoria',  'Memoria 2025'],
  ['#fdc-participa','Participa'],
];

/* Talleres y laboratorios publicados.

   Es una lista y no un enlace suelto porque va a crecer: cada convocatoria
   nueva se agrega aquí y aparece en el menú de todo el sitio sin tocar nada
   más. El tercer campo es la línea de apoyo que se ve bajo el nombre. */
const TALLERES = [
  ['/laboratorio-arte-de-comunicar-ciencia/',
   'El arte de comunicar ciencia',
   'Laboratorio escénico · Convocatoria abierta'],
];

const esLanding = location.pathname === '/' || location.pathname.endsWith('/index.html');

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

   La landing es la página más visitada y no tiene por qué pagar la descarga de
   la librería solo para saber si pintar «Entrar» o «Mis actividades».
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

/* ========================================================================= */
export function montarCabecera(perfil) {
  const hueco = document.querySelector('[data-cabecera]');
  if (!hueco) return;

  const quien = perfil || sesionGuardada();
  const ruta  = location.pathname;

  /* ----------------------------- enlaces de navegación ------------------- */
  let enlaces;
  if (esLanding) {
    enlaces = SECCIONES.map(([h, t]) => [h, t]);
    if (tieneBoletos()) enlaces.push(['/mis-boletos/', 'Mis boletos']);
  } else {
    // Fuera de la landing, las anclas apuntan de vuelta al sitio público.
    enlaces = [['/', 'El festival'], ['/programa/', 'Programa']];
    if (tieneBoletos() || ruta.startsWith('/mis-boletos/')) enlaces.push(['/mis-boletos/', 'Mis boletos']);
    if (quien) {
      enlaces.push(['/mi-actividad/', 'Mis actividades']);
      if (quien.rol === 'administrador') {
        enlaces.push(['/panel/', 'Tablero']);
        // «Armar programa» y no «Programa»: el público ya tiene uno con ese
        // nombre tres enlaces antes, y son cosas distintas.
        enlaces.push(['/panel/programa/', 'Armar programa']);
        enlaces.push(['/panel/boletos/', 'Boletos']);
      }
    }
  }

  const piezas = enlaces.map(([h, t]) => {
    // «/panel/» se compara exacto: con startsWith, estando en /panel/programa/
    // saldrían dos enlaces marcados como la página actual.
    const actual = !h.startsWith('#') && h !== '/' &&
      (h === '/panel/' ? ruta === h : ruta.startsWith(h));
    return `<a href="${esc(h)}"${actual ? ' aria-current="page"' : ''}>${esc(t)}</a>`;
  });

  /* --------------------------------- talleres ---------------------------- */
  const enUnTaller = TALLERES.some(([h]) => ruta.startsWith(h));

  const tallerHtml = `
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

  /* Va junto a la programación, no al final: justo después de «Programa», que
     en los dos casos es el tercer enlace contando desde uno. */
  piezas.splice(esLanding ? 3 : 2, 0, tallerHtml);
  const navHtml = piezas.join('');

  /* --------------------------------- zona de sesión ---------------------- */
  let authHtml;
  if (quien) {
    const extra = esLanding
      ? `<a class="cab__btn cab__btn--linea" href="${quien.rol === 'administrador' ? '/panel/' : '/mi-actividad/'}">
           ${quien.rol === 'administrador' ? 'Tablero' : 'Mis actividades'}</a>`
      : '';
    authHtml = `
      ${extra}
      <span class="cab__quien" title="${esc(quien.correo)}">${esc(quien.nombre || quien.correo)}</span>
      <button class="cab__btn cab__btn--salir" type="button" data-salir>Salir</button>`;
  } else {
    // El registro es por invitación: no se anuncia en el menú. A /registro se
    // llega por la liga que manda la administración.
    authHtml = `<a class="cab__btn cab__btn--cta" href="/entrar/">Entrar</a>`;
  }

  /* ------------------------------------- montaje ------------------------- */
  const cab = el(`
    <header class="cab${esLanding ? ' cab--flotante' : ''}" role="banner">
      <div class="cab__in">
        <a class="cab__marca" href="/" aria-label="Festival del Conocimiento, inicio">
          <img src="/assets/img/icono-festcon.png" alt="" width="34">
          <b>Festival del Conocimiento</b>
        </a>

        <button class="cab__toggle" type="button" aria-expanded="false"
                aria-controls="cab-menu" aria-label="Abrir el menú">
          <span></span><span></span><span></span>
        </button>

        <div class="cab__menu" id="cab-menu">
          <nav class="cab__nav" aria-label="Navegación principal">${navHtml}</nav>
          <div class="cab__auth">${authHtml}</div>
        </div>
      </div>
    </header>`);

  hueco.replaceWith(cab);
  // Va antes de pintar nada: se monta en modo ancho y, si no cabe, se pliega
  // en la misma tarea, así no se alcanza a ver la barra rota.
  ajustarPlegado(cab);
  medirAlto(cab);
  conectar(cab);
  return cab;
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
