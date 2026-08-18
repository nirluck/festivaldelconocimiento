/* ==========================================================================
   FESTIVAL DEL CONOCIMIENTO 2026 — Interacción
   --------------------------------------------------------------------------
   Sin librerías externas. Todo encapsulado en una IIFE: no crea variables
   globales ni interfiere con los scripts del tema de WordPress.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------- *
   *  CONFIGURACIÓN
   *  La entrega PHP en window.FDC_CONFIG (ver fdc_encolar_assets()).
   *  Los valores de respaldo permiten abrir este archivo fuera de WordPress.
   *
   *  Para cambiar las fechas NO hace falta tocar este archivo; usa los filtros
   *  'fdc_fecha_inicio' y 'fdc_fecha_fin' desde el functions.php del tema.
   * ---------------------------------------------------------------------- */
  var CFG = window.FDC_CONFIG || {};

  var IMG    = CFG.img || '/assets/img/';
  var INICIO = new Date(CFG.inicio || '2026-10-17T09:00:00-07:00');
  var FIN    = new Date(CFG.fin    || '2026-10-24T23:59:59-07:00');

  var root = document.querySelector('.fdc');
  if (!root) return;

  var $  = function (s, c) { return (c || root).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || root).querySelectorAll(s)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ====================================================================== *
   *  0. ANCHO REAL DE LA VENTANA (para el sangrado completo)
   *  100vw incluye la barra de desplazamiento; clientWidth no. Sin esto las
   *  bandas a sangre sobresalen unos píxeles y algunos temas muestran una
   *  barra de desplazamiento horizontal.
   * ====================================================================== */
  (function anchoReal() {
    var t;
    function medir() {
      var w = document.documentElement.clientWidth;
      /* Si la página está oculta (pestaña en segundo plano, previsualización de
         un maquetador, contenedor con display:none) clientWidth vale 0. Fijar
         --fdc-vw en 0 dejaría las bandas sin ancho, así que en ese caso no se
         toca nada y sigue valiendo el respaldo 100vw de la hoja de estilo. */
      if (w > 0) { root.style.setProperty('--fdc-vw', w + 'px'); }
    }
    medir();
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(medir, 120);
    }, { passive: true });
  })();

  /* ====================================================================== *
   *  1. CARRUSEL DEL HERO
   * ====================================================================== */
  (function heroSlider() {
    var slides = $$('.fdc-hero__slide');
    var dotsBox = $('.fdc-hero__dots');
    if (slides.length < 2 || !dotsBox) return;

    var i = 0, timer = null, DELAY = 6000;

    slides.forEach(function (_, n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', 'Imagen ' + (n + 1) + ' de ' + slides.length);
      b.setAttribute('aria-selected', n === 0 ? 'true' : 'false');
      b.addEventListener('click', function () { go(n); restart(); });
      dotsBox.appendChild(b);
    });
    var dots = $$('button', dotsBox);

    function go(n) {
      slides[i].classList.remove('is-active');
      dots[i].setAttribute('aria-selected', 'false');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('is-active');
      dots[i].setAttribute('aria-selected', 'true');
    }
    function start() { if (!reduced) timer = setInterval(function () { go(i + 1); }, DELAY); }
    function restart() { clearInterval(timer); start(); }

    // Precarga de la siguiente imagen para que el cambio sea limpio
    slides.forEach(function (s) {
      var m = /url\(['"]?(.+?)['"]?\)/.exec(s.style.backgroundImage);
      if (m) { var im = new Image(); im.src = m[1]; }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { clearInterval(timer); } else { restart(); }
    });

    start();
  })();

  /* ====================================================================== *
   *  2. CUENTA REGRESIVA
   * ====================================================================== */
  (function countdown() {
    var box = $('#fdc-count');
    if (!box) return;

    var out = {
      d: $('[data-count="d"]', box), h: $('[data-count="h"]', box),
      m: $('[data-count="m"]', box), s: $('[data-count="s"]', box)
    };
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };

    function tick() {
      var diff = INICIO - new Date();

      if (diff <= 0) {
        var enCurso = new Date() <= FIN;
        box.innerHTML = '<p class="fdc-count__live">' +
          (enCurso ? '¡El festival está en marcha!' : 'Nos vemos en la próxima edición') +
          '</p>';
        box.style.cssText = 'display:block;font-family:var(--fdc-f-disp);font-weight:700;' +
          'font-size:1.3em;color:var(--fdc-amarillo);margin-bottom:36px;';
        clearInterval(iv);
        return;
      }

      var sec = Math.floor(diff / 1000);
      out.d.textContent = Math.floor(sec / 86400);
      out.h.textContent = pad(Math.floor(sec / 3600) % 24);
      out.m.textContent = pad(Math.floor(sec / 60) % 60);
      out.s.textContent = pad(sec % 60);
    }

    tick();
    var iv = setInterval(tick, 1000);
  })();

  /* ====================================================================== *
   *  3. DATOS DE IMÁGENES
   * ====================================================================== */

  /* Galería fotográfica — ediciones anteriores */
  var GALERIA = [
    { f: '480806028_1154935316226158_277435804462500065_n.jpg', span: 'g-wide',
      a: 'Público numeroso al atardecer frente al mar durante una actividad del festival en Ventana al Mar, Ensenada' },
    { f: 'festival-del-conocimiento.jpg', span: '',
      a: 'Concierto nocturno en el patio del Centro Social, Cívico y Cultural Riviera, iluminado con series de foquitos' },
    { f: '556889478_1329700475416307_7284762312387271769_n.jpg', span: 'g-tall',
      a: 'Bailarinas de danza contemporánea en escena, con los brazos extendidos hacia arriba' },
    { f: 'desfile.jpg', span: '',
      a: 'La Euphoria Brass Band recorre la explanada entre el público durante la inauguración' },
    { f: '552305890_1319497169769971_9170207779982222089_n.jpg', span: '',
      a: 'Músicos de la Euphoria Brass Band tocando saxofón y trompeta frente al escenario' },
    { f: 'conferencias.jpg', span: '',
      a: 'Conferencia de divulgación en el salón principal del Centro Cultural Riviera' },
    { f: '558231606_1328825995503755_2949356644922703898_n.jpg', span: 'g-wide',
      a: 'Público de todas las edades sentado en el patio del Bar Andaluz durante una actividad del festival' },
    { f: '557774157_1325283222524699_8946800914365687521_n.jpg', span: '',
      a: 'Músico interpretando bajo eléctrico frente a una gran proyección de imágenes del fondo marino' },
    { f: '558482940_1331551008564587_1807930637752515562_n.jpg', span: 'g-tall',
      a: 'Taller de dibujo científico: jóvenes ilustran mariposas y libélulas en una mesa al aire libre' },
    { f: '557171283_1331550955231259_8755640443420755645_n.jpg', span: '',
      a: 'Asistentes participan en una dinámica sensorial al aire libre durante una jornada del festival' },
    { f: 'IMG_4528-scaled-1-768x494.jpg', span: '',
      a: 'Escena teatral: una actriz caracterizada camina por el escenario con una canasta de mimbre' },
    { f: '556616478_1329700022083019_5051460133271407009_n.jpg', span: '',
      a: 'Danza contemporánea en movimiento bajo iluminación roja intensa' },
    { f: '571331896_1351780023208352_3292280999866211490_n.jpg', span: 'g-wide',
      a: 'Foto de grupo de los participantes de la Caminata del Conocimiento frente a las letras UNAM del CNyN' },
    { f: '559441654_1331551595231195_3043151711261235938_n.jpg', span: '',
      a: 'Una persona observa de cerca un abejorro dentro de un frasco de vidrio en un taller de naturaleza' },
    { f: 'clausura-scaled-1-768x512.jpg', span: '',
      a: 'Concierto de clausura al aire libre con el público sentado frente al escenario iluminado' },
    { f: '557969777_1329695122083509_5746870533817592789_n.jpg', span: '',
      a: 'Divulgador joven dirigiéndose a un auditorio de estudiantes de bachillerato durante una visita escolar' },
    { f: 'todo-es-la-luz-scaled-1-768x431.jpg', span: '',
      a: 'Charla ante público lleno en una sala rodeada de pinturas de gran formato' },
    { f: 'conferencias-2.jpg', span: '',
      a: 'Auditorio lleno durante una conferencia de humanidades con proyección sobre literatura' },
    { f: '557776053_1328802145506140_4814912789270814381_n.jpg', span: '',
      a: 'Ponente durante una charla junto a un banner institucional de la UNAM' },
    { f: 'DSC_1929-scaled-1-768x510.jpg', span: 'g-wide',
      a: 'Ceremonia de inauguración de una edición anterior con el presídium y el público en el foro' }
  ];

  /* Cartelera 2025 — carteles del programa.
     Los archivos van numerados en el orden en que se publicaron. */
  var CARTELES = [
    { f: 'cartel-01.jpg', c: 'Caminata del Conocimiento · Domingo 21 de septiembre · Salida Museo Caracol, meta cancha deportiva CNyN-UNAM' },
    { f: 'cartel-02.jpg', c: 'Caminata por el centro histórico de Ensenada · Domingo 21 de septiembre · Salida Monumento a Miguel Hidalgo' },
    { f: 'cartel-03.jpg', c: 'Inauguración y concierto de Euphoria Brass Band · Domingo 21 de septiembre · Andador Cultural de UABC Sauzal' },
    { f: 'cartel-04.jpg', c: 'Obra de teatro de sombras “La vida es un sueño en 30 mundos” · Lunes 22 de septiembre · Teatro Universitario y de los Periodistas' },
    { f: 'cartel-05.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-06.jpg', c: 'Charla “Dos tipos de cuidado: Heisenberg y Schrödinger” · Dr. Francisco Mireles Higuera · Aula Magna del CEART' },
    { f: 'cartel-07.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-08.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-09.jpg', c: 'Obra de teatro “La tragedia de la gallina” · Miércoles 24 de septiembre · Foro Experimental del CEART' },
    { f: 'cartel-10.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-11.jpg', c: 'Dinámica sensorial “Explorando los aromas y sabores del vino” · Centro de Estudios Vitivinícolas de CETYS' },
    { f: 'cartel-12.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-13.jpg', c: 'Alcoholes Académicos 46 · Ovejas Negras presenta el Cancionero Científico con los Beatles · Patio Bugambilia, Riviera' },
    { f: 'cartel-14.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-15.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-16.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-17.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-18.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-19.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-20.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-21.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-22.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-23.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-24.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-25.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' },
    { f: 'cartel-26.jpg', c: 'Actividad del programa Festival del Conocimiento 2025' }
  ];

  var CARPETA_CARTELES = 'programa-2025/';
  var VISIBLES = 8; /* carteles mostrados antes de pulsar "Ver toda la cartelera" */

  /* ====================================================================== *
   *  4. CONSTRUCCIÓN DE GALERÍAS
   * ====================================================================== */
  var lbGrupo = [], lbIndex = 0;

  /* Si «diferida» es true, la imagen NO se descarga todavía: guardamos la ruta
     en data-src y sólo la asignamos cuando la tarjeta se hace visible.
     Sin esto, los 18 carteles ocultos se descargarían igual al cargar la
     página (loading="lazy" no basta cuando el elemento está en display:none). */
  function crearBoton(src, alt, grupo, idx, clase, diferida) {
    var b = document.createElement('button');
    b.type = 'button';
    if (clase) b.className = clase;
    b.setAttribute('aria-label', 'Ampliar: ' + alt);

    var im = document.createElement('img');
    if (diferida) { im.setAttribute('data-src', src); } else { im.src = src; }
    im.alt = alt;
    im.loading = 'lazy';
    im.decoding = 'async';
    b.appendChild(im);

    b.addEventListener('click', function () { abrirLb(grupo, idx); });
    return b;
  }

  /* Asigna src a las imágenes diferidas que haya dentro de un contenedor */
  function activarDiferidas(cont) {
    $$('img[data-src]', cont).forEach(function (im) {
      im.src = im.getAttribute('data-src');
      im.removeAttribute('data-src');
    });
  }

  /* Galería fotográfica */
  (function construirGaleria() {
    var cont = $('#fdc-gal');
    if (!cont) return;

    var grupo = GALERIA.map(function (g) {
      return { src: IMG + g.f, alt: g.a, cap: g.a };
    });

    GALERIA.forEach(function (g, n) {
      cont.appendChild(crearBoton(IMG + g.f, g.a, grupo, n, g.span, false));
    });
  })();

  /* Cartelera 2025 */
  (function construirCarteles() {
    var cont = $('#fdc-cards');
    var btn  = $('#fdc-cards-more');
    if (!cont) return;

    var grupo = CARTELES.map(function (c) {
      return { src: IMG + CARPETA_CARTELES + c.f, alt: c.c, cap: c.c };
    });

    CARTELES.forEach(function (c, n) {
      var oculto = n >= VISIBLES;
      cont.appendChild(crearBoton(IMG + CARPETA_CARTELES + c.f, c.c, grupo, n,
                                  oculto ? 'is-hidden' : '', oculto));
    });

    if (!btn) return;
    if (CARTELES.length <= VISIBLES) { btn.style.display = 'none'; return; }

    var abierto = false;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'fdc-cards');
    btn.addEventListener('click', function () {
      abierto = !abierto;
      if (abierto) activarDiferidas(cont);
      $$('button', cont).forEach(function (b, n) {
        if (n >= VISIBLES) b.classList.toggle('is-hidden', !abierto);
      });
      btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      btn.textContent = abierto ? 'Ver menos' : 'Ver toda la cartelera';
      if (!abierto) cont.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  })();

  /* ====================================================================== *
   *  5. LIGHTBOX
   * ====================================================================== */
  var lb      = $('#fdc-lb');
  var lbImg   = lb ? $('img', lb) : null;
  var lbCap   = lb ? $('figcaption', lb) : null;
  var ultimoFoco = null;

  function pintarLb() {
    var it = lbGrupo[lbIndex];
    if (!it) return;
    lbImg.src = it.src;
    lbImg.alt = it.alt;
    lbCap.textContent = it.cap + '  ·  ' + (lbIndex + 1) + ' / ' + lbGrupo.length;
  }

  function abrirLb(grupo, idx) {
    if (!lb) return;
    lbGrupo = grupo; lbIndex = idx;
    ultimoFoco = document.activeElement;
    pintarLb();
    lb.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    $('.fdc-lb__close', lb).focus();
  }

  function cerrarLb() {
    if (!lb) return;
    lb.hidden = true;
    lbImg.src = '';
    document.documentElement.style.overflow = '';
    if (ultimoFoco) ultimoFoco.focus();
  }

  function mover(n) {
    if (!lbGrupo.length) return;
    lbIndex = (lbIndex + n + lbGrupo.length) % lbGrupo.length;
    pintarLb();
  }

  if (lb) {
    $('.fdc-lb__close', lb).addEventListener('click', cerrarLb);
    $('.fdc-lb__nav--prev', lb).addEventListener('click', function () { mover(-1); });
    $('.fdc-lb__nav--next', lb).addEventListener('click', function () { mover(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) cerrarLb(); });

    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape')     { cerrarLb(); }
      if (e.key === 'ArrowLeft')  { mover(-1); }
      if (e.key === 'ArrowRight') { mover(1); }
    });

    /* Deslizar en táctil */
    var x0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.changedTouches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) mover(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
  }

  /* ====================================================================== *
   *  6. VIDEO DE YOUTUBE (fachada — sólo carga al hacer clic)
   * ====================================================================== */
  (function video() {
    var box = $('.fdc-video');
    if (!box) return;
    var btn = $('.fdc-video__play', box);
    if (!btn) return;

    btn.addEventListener('click', function () {
      var id = box.getAttribute('data-yt');
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
      f.title = 'Video institucional del Festival del Conocimiento';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      f.allowFullscreen = true;
      f.setAttribute('loading', 'lazy');
      box.innerHTML = '';
      box.appendChild(f);
    });
  })();

  /* ====================================================================== *
   *  7. NAVEGACIÓN SUAVE (sólo para los enlaces internos del festival)
   * ====================================================================== */
  $$('a[href^="#fdc-"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var dest = document.getElementById(a.getAttribute('href').slice(1));
      if (!dest) return;
      e.preventDefault();
      dest.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ====================================================================== *
   *  8. VOLVER ARRIBA
   * ====================================================================== */
  (function volverArriba() {
    var btn = $('#fdc-top');
    if (!btn) return;

    btn.addEventListener('click', function () {
      root.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        btn.classList.toggle('is-on', window.scrollY > 700);
        ticking = false;
      });
    }, { passive: true });
  })();

  /* ====================================================================== *
   *  9. APARICIÓN AL HACER SCROLL
   * ====================================================================== */
  (function reveal() {
    if (reduced || !('IntersectionObserver' in window)) return;

    var sel = '.fdc-intro, .fdc-disc__card, .fdc-datebar, .fdc-acts li,' +
              '.fdc-soon, .fdc-video, .fdc-memo__card, .fdc-sedes, .fdc-part__card,' +
              '.fdc-contact, .fdc-social__card, .fdc-note, .fdc-h2, .fdc-lead';

    var items = $$(sel);
    items.forEach(function (el, n) {
      el.classList.add('fdc-rv');
      el.style.transitionDelay = ((n % 4) * 70) + 'ms';
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    items.forEach(function (el) { io.observe(el); });
  })();

  /* ====================================================================== *
   *  10. AÑO EN EL PIE DE PÁGINA
   * ====================================================================== */
  (function anio() {
    var y = document.getElementById('fdc-year');
    if (y) y.textContent = new Date().getFullYear();
  })();

})();
