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
   enlaces de vuelta cuando estás en cualquier otra página. */
const SECCIONES = [
  ['#fdc-festival', 'El festival'],
  ['#fdc-2026',     'Edición 2026'],
  ['#fdc-programa', 'Programa'],
  ['#fdc-memoria',  'Memoria 2025'],
  ['#fdc-participa','Participa'],
];

const esLanding = location.pathname === '/' || location.pathname.endsWith('/index.html');

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
      rol: localStorage.getItem('fdc_rol') || 'responsable',
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
  } else {
    // Fuera de la landing, las anclas apuntan de vuelta al sitio público.
    enlaces = [['/', 'El festival']];
    if (quien) {
      enlaces.push(['/mi-actividad/', 'Mis actividades']);
      if (quien.rol === 'coordinacion') enlaces.push(['/panel/', 'Tablero']);
    }
  }

  const navHtml = enlaces.map(([h, t]) => {
    const actual = !h.startsWith('#') && ruta.startsWith(h) && h !== '/';
    return `<a href="${esc(h)}"${actual ? ' aria-current="page"' : ''}>${esc(t)}</a>`;
  }).join('');

  /* --------------------------------- zona de sesión ---------------------- */
  let authHtml;
  if (quien) {
    const extra = esLanding
      ? `<a class="cab__btn cab__btn--linea" href="${quien.rol === 'coordinacion' ? '/panel/' : '/mi-actividad/'}">
           ${quien.rol === 'coordinacion' ? 'Tablero' : 'Mis actividades'}</a>`
      : '';
    authHtml = `
      ${extra}
      <span class="cab__quien" title="${esc(quien.correo)}">${esc(quien.nombre || quien.correo)}</span>
      <button class="cab__btn cab__btn--salir" type="button" data-salir>Salir</button>`;
  } else {
    authHtml = `
      <a class="cab__btn cab__btn--linea" href="/entrar/">Entrar</a>
      <a class="cab__btn cab__btn--cta" href="/registro/">Registrar actividad</a>`;
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
  medirAlto(cab);
  conectar(cab);
  return cab;
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-abierto')) {
      abrir(false);
      toggle.focus();
    }
  });

  // Al pulsar fuera, se cierra
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('is-abierto')) return;
    if (!cab.contains(e.target)) abrir(false);
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
