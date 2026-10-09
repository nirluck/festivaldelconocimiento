/* ============================================================================
   PROGRAMA · LA CARTELERA EN PARRILLA
   ----------------------------------------------------------------------------
   Cómo se pinta /programa/. Nació el 9 de octubre de 2026 como propuesta junto
   a la lista por días y ese mismo día la sustituyó. Vive aparte de
   programa.js, que carga los datos y pinta la ficha de cada actividad: este
   módulo solo se descarga al abrir la cartelera.

   El problema que resuelve, dicho por quienes usan el programa: es confuso de
   leer, es una lista muy larga con mucha información y cuesta entender de un
   vistazo qué va a haber en el festival. De ahí la planta:

     · Cabecera rosa con el título y nada más.
     · Debajo, la fila de días a todo el ancho, con cuántas actividades tiene
       cada uno. Es el mando principal y la primera vista de pájaro: de un
       golpe se ve qué días están llenos. Se queda pegada al bajar.
     · Los filtros, en una columna angosta a la izquierda del programa.
     · El programa: una parrilla continua de tres por fila, sin filas a
       medias. El póster manda, porque es por donde se reconoce una actividad.

   Qué recibe: el estado de la cartelera, ya cargado y filtrado por programa.js
   (las actividades, los días, el día elegido, los filtros, los ponentes) más
   las funciones de fecha y de boletos que ya existían. Aquí no se consulta la
   base ni se repite una regla de negocio; esto es solo otra forma de pintar lo
   mismo. El contrato está en la definición de «montar()».
   ========================================================================== */

/** Lo que programa.js pasa una vez, al montar. Se guarda para no arrastrar
    veinte argumentos en cada función de pintado. */
let C = null;

/**
 * @param {object} contexto
 * @param {object}   .ed          la edición activa
 * @param {object[]} .acts        lo publicado, ya ordenado por la base
 * @param {string[]} .dias        los días con programa, en orden
 * @param {Map}      .ponentes    id de actividad → sus ponentes
 * @param {function} .estado      () => ({ diaActivo, ejesOn, sedeOn, tipoOn })
 * @param {function} .filtradas   () => actividades que pasan los filtros
 * @param {function} .alCambiar   (cambios) => aplica y repinta las dos partes
 * @param {object}   .u           utilidades de programa.js, ver su llamada
 */
export function montar(contexto) {
  C = contexto;
  // Esta página usa un contenedor más ancho que el resto del sitio; ver
  // «ANCHO» en programa-rejilla.css.
  document.body.classList.add('pgr-ancha', 'pagina-ancha');
  // La columna de filtros se pega justo debajo de la fila de días, y la fila
  // de días cambia de alto con el ancho de la pantalla: se mide en vivo.
  window.addEventListener('resize', medirBarra);
}

/**
 * La barra de días, condensada mientras está pegada.
 *
 * Arriba de la página mide 149 px: rótulo, día de la semana, número y
 * cuántas actividades. Pegada, eso más la cabecera del sitio eran 221 px
 * fijos en una pantalla de 800, y al bajar solo cabía una fila de tarjetas.
 * Pegada se queda con lo que sirve para cambiar de día (el día y el
 * número); el rótulo y las cuentas ya se leyeron al llegar.
 *
 * Se llama después de pintar la plantilla, que es cuando existe el testigo.
 */
export function vigilarBarra() {
  const testigo = document.querySelector('.pgr-testigo');
  const barra = document.getElementById('pgr-barra');
  if (!testigo || !barra || !('IntersectionObserver' in window)) return;
  const tope = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cab-alto')) || 72;
  let obs = null;
  const armar = () => {
    if (obs) obs.disconnect();
    obs = new IntersectionObserver(([e]) => {
      const pegada = !e.isIntersecting && e.boundingClientRect.top < tope();
      if (barra.classList.contains('pgr-barra--pegada') === pegada) return;
      barra.classList.toggle('pgr-barra--pegada', pegada);
      medirBarra();
    }, { rootMargin: `-${tope()}px 0px 0px 0px` });
    obs.observe(testigo);
  };
  armar();
  // Las fuentes llegan después del primer pintado y la barra crece un par de
  // píxeles: sin volver a medir, el alto reservado quedaba corto y lo de abajo
  // saltaba esos píxeles al condensarse.
  if (document.fonts) document.fonts.ready.then(medirBarra);
  // La cabecera del sitio cambia de alto al pasar a menú compacto.
  window.addEventListener('resize', armar);
}

/* ============================================================================
   LA PLANTILLA
   ========================================================================== */
export function plantilla(ed) {
  const { escapar } = C.u;
  const nombre = ed.nombre || 'Festival del Conocimiento ' + ed.anio;
  return `
  <header class="pgr-hero" style="--foto:url(/assets/img/concierto.jpg)">
    <div class="pg-wrap pgr-hero__in">
      <!-- El espacio duro evita que la línea rompa después de «del» y deje la
           preposición colgando al final del primer renglón. -->
      <h1>Programa de actividades del&nbsp;${escapar(nombre)}</h1>
    </div>
  </header>

  <!-- Testigo de un píxel: cuando sale de la vista por arriba, la barra de
       días ya está pegada y se condensa. -->
  <div class="pgr-testigo" aria-hidden="true"></div>
  <!-- Dos cajas: la de fuera es la que se pega y guarda el alto original de la
       barra; la de dentro es la que se ve y la que se achica al condensarse.
       Si se achicara la de fuera, todo lo de abajo saltaría 90 px hacia arriba
       a media lectura, y el testigo podría volver a entrar en la vista y
       encender y apagar el condensado en bucle. -->
  <div class="pgr-barra" id="pgr-barra">
    <div class="pgr-barra__caja"><div class="pg-wrap" id="barra"></div></div>
  </div>

  <div class="pgr-cuerpo">
    <div class="pg-wrap pgr-cuerpo__in">
      <aside class="pgr-lado" aria-label="Filtros del programa">
        <div class="pgr-banda"><div id="filtros"></div></div>
      </aside>
      <div class="pgr-programa" id="lista"></div>
    </div>
  </div>`;
}

/* ============================================================================
   LOS DÍAS Y LOS FILTROS
   ----------------------------------------------------------------------------
   Los días reparten el ancho completo del contenedor, con el número de
   actividades de cada uno dentro. Antes eran pastillas de 60 px en un carril
   que se desplazaba: ocupaban un quinto del ancho y había que descubrir que
   se podían tocar.
   ========================================================================== */
export function pintarBarra() {
  const { escapar } = C.u;
  const { diaActivo, ejesOn, sedeOn, tipoOn } = C.estado();
  const ejes  = listaUnica('eje');
  const sedes = listaUnica('sede');
  const tipos = listaUnica('tipo');
  const sinFecha = C.acts.some(a => !a.fecha);
  const hoy = C.u.hoy();
  const puestos = ejesOn.size + (sedeOn ? 1 : 0) + (tipoOn ? 1 : 0);

  const boton = (dia) => {
    const { semana, numero } = C.u.diaCorto(dia);
    const n = C.acts.filter(a => C.u.ocurreEl(a, dia)).length;
    return `
      <button class="pgr-dia-btn${dia === hoy ? ' pgr-dia-btn--hoy' : ''}" type="button"
              data-dia="${dia}" aria-pressed="${diaActivo === dia}" ${n ? '' : 'disabled'}
              style="${estiloDelDia(dia)}"
              title="${escapar(C.u.diaLargo(dia))}${n ? '' : ' · sin actividades todavía'}">
        <small>${escapar(semana)}</small>
        <b>${escapar(numero)}</b>
        <u>${n ? n + (n === 1 ? ' actividad' : ' actividades') : 'Sin actividades'}</u>
      </button>`;
  };

  document.getElementById('barra').innerHTML = `
    <p class="pgr-rotulo">Elige un día <span class="pgr-cuenta" id="f-cuenta"></span></p>
    <div class="pgr-dias" role="group" aria-label="Días del festival">
      <button class="pgr-dia-btn pgr-dia-btn--todo" type="button" data-dia="todo"
              aria-pressed="${diaActivo === 'todo'}">
        <small>Ver</small><b>Todo</b><u>${C.acts.length} actividades</u>
      </button>
      ${C.dias.map(boton).join('')}
      ${sinFecha ? `
      <button class="pgr-dia-btn pgr-dia-btn--todo" type="button" data-dia="abierto"
              aria-pressed="${diaActivo === 'abierto'}">
        <small>Sin</small><b>fecha</b><u>${C.acts.filter(a => !a.fecha).length} actividades</u>
      </button>` : ''}
    </div>`;

  /* Los filtros, en la columna de la izquierda. Cada grupo con su nombre:
     en columna, tres pastillas y dos selectores sin rótulo no dicen qué
     filtran. En pantalla angosta la columna desaparece y todo queda detrás
     del botón «Filtrar». */
  document.getElementById('filtros').innerHTML = `
    <button class="pgr-abrir" type="button" id="f-abrir" aria-expanded="false" aria-controls="f-caja">
      Filtrar${puestos ? ` <b>${puestos}</b>` : ''}
    </button>

    <div class="pgr-filtros" id="f-caja">
      <p class="pgr-filtros__tit">Filtrar</p>

      <div class="pgr-grupo">
        <p class="pgr-grupo__rot">Eje</p>
        <div class="pgr-ejes" role="group" aria-label="Filtrar por eje">
          ${ejes.map(e => {
            const puro = colorDelEje(e);
            return `<button class="pgr-eje" type="button" data-eje="${escapar(e)}"
                      aria-pressed="${ejesOn.has(e)}"
                      style="--eje:${puro};--eje-tx:${C.u.colorTexto(puro)}">
                      <i></i>${escapar(e)}
                    </button>`;
          }).join('')}
        </div>
      </div>

      ${sedes.length > 1 ? `
      <label class="pgr-grupo">
        <span class="pgr-grupo__rot">Sede</span>
        ${selector('f-sede', 'Todas las sedes', sedes, sedeOn)}
      </label>` : ''}

      ${tipos.length > 1 ? `
      <label class="pgr-grupo">
        <span class="pgr-grupo__rot">Tipo de actividad</span>
        ${selector('f-tipo', 'Todos los tipos', tipos, tipoOn)}
      </label>` : ''}

      ${puestos ? '<button class="pgr-limpiar" type="button" id="f-limpiar">Quitar filtros</button>' : ''}
    </div>`;

  conectar();
  medirBarra();
}

/** Dos medidas de la barra de días, para la hoja de estilos:
      --pgr-barra-alta  el alto que tiene arriba de la página, sin condensar.
                        La caja de fuera lo reserva siempre (ver plantilla).
      --pgr-barra-alto  el alto que se ve ahora. La columna de filtros se pega
                        justo debajo. */
function medirBarra() {
  const b = document.getElementById('pgr-barra');
  if (!b) return;
  const visible = b.firstElementChild.offsetHeight;
  const raiz = document.documentElement.style;
  if (!b.classList.contains('pgr-barra--pegada')) raiz.setProperty('--pgr-barra-alta', visible + 'px');
  raiz.setProperty('--pgr-barra-alto', visible + 'px');
}

/** Los oyentes. Repintar rehace los botones, así que se vuelven a poner cada
    vez; el estado desplegado del teléfono vive en la clase del contenedor de
    fuera, que sobrevive al repintado. */
function conectar() {
  const barra   = document.getElementById('barra');
  const filtros = document.getElementById('filtros');

  const caja  = filtros.parentElement;            // .pgr-banda
  const abrir = document.getElementById('f-abrir');
  abrir.setAttribute('aria-expanded', caja.classList.contains('pgr-banda--abierta'));
  abrir.addEventListener('click', () => {
    abrir.setAttribute('aria-expanded', caja.classList.toggle('pgr-banda--abierta'));
  });

  barra.querySelectorAll('[data-dia]').forEach(b =>
    b.addEventListener('click', () => {
      C.alCambiar({ dia: b.dataset.dia });
      alPrincipio();
    }));

  filtros.querySelectorAll('[data-eje]').forEach(b =>
    b.addEventListener('click', () => C.alCambiar({ eje: b.dataset.eje })));

  const sel = (id, campo) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => C.alCambiar({ [campo]: el.value }));
  };
  sel('f-sede', 'sede');
  sel('f-tipo', 'tipo');

  const limpiar = document.getElementById('f-limpiar');
  if (limpiar) limpiar.addEventListener('click', () => C.alCambiar({ limpiar: true }));
}

/** Al cambiar de día con la página ya bajada, el programa nuevo es más corto y
    quedaría arriba, fuera de la vista: se vuelve a su principio. Si el
    programa ya está a la vista, no se mueve nada. */
function alPrincipio() {
  const cuerpo = document.querySelector('.pgr-cuerpo');
  if (!cuerpo) return;
  const tope = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cab-alto')) || 72;
  const barra = document.getElementById('pgr-barra').firstElementChild.offsetHeight;
  const y = cuerpo.getBoundingClientRect().top + scrollY - tope - barra;
  if (scrollY > y) window.scrollTo({ top: y, behavior: 'smooth' });
}

function selector(id, placeholder, valores, actual) {
  const { escapar } = C.u;
  return `<select class="pgr-sel" id="${id}">
    <option value="">${escapar(placeholder)}</option>
    ${valores.map(v =>
      `<option value="${escapar(v)}"${v === actual ? ' selected' : ''}>${escapar(v)}</option>`
    ).join('')}
  </select>`;
}

function listaUnica(campo) {
  return [...new Set(C.acts.map(f => f[campo]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
}

function colorDelEje(nombre) {
  const a = C.acts.find(x => x.eje === nombre && x.eje_color);
  return a ? a.eje_color : '#10ABC4';
}

/* ============================================================================
   EL COLOR DE CADA DÍA
   Los cuatro colores del logotipo, rotando por día del programa: es lo que le
   da vida a la página y, en una parrilla sin cortes, lo que deja ver dónde
   empieza otro día. El color puro para la gráfica y la variante oscurecida
   para la letra, que es la regla del logotipo.
   ========================================================================== */
const COLORES = [
  ['#E91587', '#C90D70'],   // magenta
  ['#10ABC4', '#0A7285'],   // turquesa
  ['#F5821F', '#B85800'],   // naranja
  ['#99CA3C', '#587A17'],   // verde
];

function estiloDelDia(dia) {
  const i = C.dias.indexOf(dia);
  if (i < 0) return '--dia:#8A8F98;--dia-tx:#5B616B';   // sin fecha
  const [puro, texto] = COLORES[i % COLORES.length];
  return `--dia:${puro};--dia-tx:${texto}`;
}

/* ============================================================================
   LA PARRILLA
   ----------------------------------------------------------------------------
   Una sola, sin cortes por día: un encabezado de ancho completo rompe la fila
   siempre, y el 12 y el 17 de octubre, con una actividad cada uno, abrían la
   página con dos filas a medias. El día lo lleva cada tarjeta, en su color.

   Con un día elegido, la fecha repetida en once tarjetas sobraría: ahí va un
   solo encabezado arriba y las tarjetas dicen solo la hora.
   ========================================================================== */
export function pintarLista() {
  const { diaActivo } = C.estado();
  const d = C.filtradas();

  const cuenta = document.getElementById('f-cuenta');
  if (cuenta) {
    cuenta.textContent = d.length === C.acts.length
      ? `${C.acts.length} actividades`
      : `${d.length} de ${C.acts.length} actividades`;
  }

  if (!d.length) {
    document.getElementById('lista').innerHTML = `
      <div class="pg-vacio">
        <h2>Nada con esos filtros</h2>
        <p>Prueba con otro día o quita algún filtro. El programa sigue creciendo:
           vuelve en unos días.</p>
        <button class="pg-btn" type="button" id="v-limpiar">Ver todo el programa</button>
      </div>`;
    const b = document.getElementById('v-limpiar');
    if (b) b.addEventListener('click', () => C.alCambiar({ limpiar: true, dia: 'todo' }));
    return;
  }

  const unDia = diaActivo !== 'todo';
  document.getElementById('lista').innerHTML =
    (unDia ? cabeceraDeDia(diaActivo, d.length) : '') +
    `<div class="pgr-rejilla">${agrupar(d).map(({ a, hijos }) =>
      hijos ? tarjetaGrupo(a, hijos, !unDia) : tarjeta(a, !unDia)).join('')}</div>`;
}

function cabeceraDeDia(dia, n) {
  const { escapar } = C.u;
  const abierto = dia === 'abierto';
  return `
    <div class="pgr-dia" style="${estiloDelDia(dia)}">
      <h2 class="pgr-dia__que">${abierto ? 'Fecha por confirmar' : escapar(C.u.diaLargo(dia))}</h2>
      ${dia === C.u.hoy() ? '<em class="pgr-dia__hoy">Hoy</em>' : ''}
      <span class="pgr-dia__cuenta">${n} ${n === 1 ? 'actividad' : 'actividades'}</span>
    </div>`;
}

/* ---- una tarjeta ---------------------------------------------------------
   Contesta tres preguntas y nada más: qué es (el póster, el tipo de actividad y
   el título), cuándo (el día en su color y la hora) y dónde. Cómo se entra aparece solo cuando
   hay que hacer algo.

   Lo que se quitó, y por qué (9 de octubre de 2026). La pesadez no estaba en
   el tamaño de cada dato sino en cuántos había: siete, repetidos cuarenta
   veces, y el póster ya trae impresos título, fecha, hora y lugar.
     · (El tipo y el eje se quitaron y volvieron el mismo día: muchos títulos
       —«Brillarelas», «Territoria»— no dicen si son taller, charla o
       presentación de libro. Van en una sola línea, el tipo primero.)
     · Quién presenta: dos renglones por tarjeta; está en la ficha.
     · «Nuevo»: el programa se publica de una vez; no hay novedades.
     · «Entrada libre»: es el caso de 25 de 40. Repetido 25 veces no informa;
       lo que distingue a una actividad es que pida boleto, y eso sí se ve.
     · «· 4 días» en las de varios días: «12–15 oct» ya lo dice.
   ========================================================================== */
function tarjeta(a, conFecha) {
  const { escapar, ICO, lugarCorto, estiloEje } = C.u;
  const dia = a.fecha ? String(a.fecha).slice(0, 10) : 'abierto';

  const pie = entrada(a);

  return `
  <article class="pgr-act" style="${estiloEje(a.eje_color)};${estiloDelDia(dia)}">
    ${media(a)}

    <div class="pgr-act__cuerpo">
      ${cuandoDe(a, conFecha)}
      ${clase(a)}
      <h3 class="pgr-act__tit"><a class="pgr-act__enlace"
         href="/programa/${encodeURIComponent(a.slug)}/">${escapar(a.titulo)}</a></h3>
      ${a.sede ? `<p class="pgr-act__sede">${ICO.pin}<span>${escapar(lugarCorto(a))}</span></p>` : ''}
    </div>

    ${pie ? `<div class="pgr-act__pie">${pie}</div>` : ''}
  </article>`;
}

/** «Taller · ● Ciencia»: qué clase de actividad es. El tipo manda, porque es
    lo que el título no siempre dice; el eje va al lado, más discreto. «Otro»
    no dice nada y no se escribe. */
function clase(a) {
  const { escapar } = C.u;
  const tipo = a.tipo && a.tipo !== 'Otro' ? `<b>${escapar(a.tipo)}</b>` : '';
  const eje  = a.eje ? `<span><i></i>${escapar(a.eje)}</span>` : '';
  return tipo || eje ? `<p class="pgr-act__tipo">${tipo}${eje}</p>` : '';
}

/** El póster a todo el ancho. Los aros del eje van debajo y el póster encima:
    si la imagen no carga se quita a sí misma y descubre los aros, sin hueco. */
function media(a) {
  return `
    <div class="pgr-act__media">
      ${AROS}
      ${a.poster ? `<img src="${C.u.urlPosterMini(a.poster)}" alt=""
           loading="lazy" decoding="async" width="640" height="640"
           onerror="this.remove()">` : ''}
    </div>`;
}

/** «11:00–16:00», «11:00» o «Hora por confirmar», ya escapado. */
function rangoHoras(a) {
  const { escapar, hora } = C.u;
  const i = hora(a.hora_inicio), f = hora(a.hora_fin);
  return i ? `${escapar(i)}${f ? `–${escapar(f)}` : ''}` : 'Hora por confirmar';
}

/** El cuándo de la tarjeta: el día (o el rango) en su color, si toca, y la hora. */
function cuandoDe(a, conFecha) {
  const { escapar, esRango } = C.u;
  const dia = a.fecha ? String(a.fecha).slice(0, 10) : 'abierto';
  let b = '';
  if (esRango(a))    b = `<b>${escapar(rangoCorto(a))}</b>`;
  else if (conFecha) b = `<b>${a.fecha ? escapar(diaCorto(dia)) : 'Sin fecha'}</b>`;
  return `<p class="pgr-act__cuando">${b}<span>${rangoHoras(a)}</span></p>`;
}

/* ============================================================================
   ACTIVIDADES QUE AGRUPAN A OTRAS
   ----------------------------------------------------------------------------
   El domingo 18 la Feria del Conocimiento ocupa el Parque Ejido El Porvenir de
   11 a 16 h, y nueve talleres corren dentro de ella con ese mismo horario.
   Como once tarjetas sueltas, el programa repetía diez veces el mismo día, la
   misma hora y el mismo lugar. Ahora la feria es una tarjeta del doble de
   ancho y sus talleres van dentro, en pequeño.

   La base no tiene un campo que diga «esto es parte de aquello», así que la
   actividad que agrupa se nombra aquí por su dirección, y las que entran se
   deducen: mismo día, misma sede, mismo horario (30 minutos de tolerancia en
   el inicio: la feria está capturada a las 10:59) y misma forma de entrada.
   El concierto de las 12, en el mismo parque pero con otro horario, queda
   fuera y conserva su tarjeta. Una que pidiera boleto también quedaría fuera,
   con su botón.

   Lo propio sería un campo en la base que la administración marque al dar de
   alta la actividad; mientras no exista, esta lista es el lugar.
   ========================================================================== */
const AGRUPAN = ['feria-del-conocimiento-valle-de-guadalupe'];

/** Separa las actividades que van dentro de otra. Devuelve la lista sin
    ellas, cada elemento con sus «hijos» si agrupa a alguna. Trabaja sobre lo
    que ya pasó los filtros: si un filtro deja fuera a la feria, sus talleres
    salen con tarjeta propia. */
function agrupar(lista) {
  const madres = lista.filter(a => AGRUPAN.includes(a.slug));
  const madreDe = new Map();
  for (const m of madres) {
    for (const a of lista) {
      if (a !== m && !AGRUPAN.includes(a.slug) && !madreDe.has(a.id) && esParteDe(a, m)) {
        madreDe.set(a.id, m.id);
      }
    }
  }
  return lista
    .filter(a => !madreDe.has(a.id))
    .map(a => {
      const hijos = lista.filter(h => madreDe.get(h.id) === a.id);
      return { a, hijos: hijos.length ? hijos : null };
    });
}

function esParteDe(a, m) {
  if (a.fecha !== m.fecha || a.sede !== m.sede || C.u.esRango(a)) return false;
  if ((a.acceso || 'libre') !== (m.acceso || 'libre')) return false;
  if (!a.hora_inicio || !m.hora_inicio) return false;
  const min = (t) => { const [h, mi] = String(t).split(':').map(Number); return h * 60 + mi; };
  if (Math.abs(min(a.hora_inicio) - min(m.hora_inicio)) > 30) return false;
  // Sin hora de cierre capturada cuenta como la misma: «Brillarelas» no la
  // tiene, y no por eso va a quedarse fuera de la feria.
  return !a.hora_fin || !m.hora_fin || a.hora_fin === m.hora_fin;
}

/** La tarjeta de una actividad que agrupa: el doble de ancho, con el póster y
    los datos lado a lado arriba y, debajo, lo que incluye. Cada actividad de
    dentro lleva a su ficha. */
function tarjetaGrupo(m, hijos, conFecha) {
  const { escapar, ICO, lugarCorto, estiloEje } = C.u;
  const dia = m.fecha ? String(m.fecha).slice(0, 10) : 'abierto';
  const n = hijos.length;
  const talleres = hijos.every(h => h.tipo === 'Taller');
  const cuantos = `${n} ${talleres ? (n === 1 ? 'taller' : 'talleres') : (n === 1 ? 'actividad' : 'actividades')}`;
  const pie = entrada(m);

  return `
  <article class="pgr-act pgr-act--grupo" style="${estiloEje(m.eje_color)};${estiloDelDia(dia)}">
    <div class="pgr-grupo__cab">
      ${media(m)}
      <div class="pgr-act__cuerpo">
        ${cuandoDe(m, conFecha)}
        ${clase(m)}
        <h3 class="pgr-act__tit"><a class="pgr-act__enlace"
           href="/programa/${encodeURIComponent(m.slug)}/">${escapar(m.titulo)}</a></h3>
        ${m.sede ? `<p class="pgr-act__sede">${ICO.pin}<span>${escapar(lugarCorto(m))}</span></p>` : ''}
        ${pie ? `<div class="pgr-act__pie">${pie}</div>` : ''}
      </div>
    </div>

    <div class="pgr-grupo__hijos">
      <p class="pgr-grupo__tit">Incluye ${cuantos}</p>
      <ul>
        ${hijos.map(h => `
        <li style="${estiloEje(h.eje_color)}">
          <a class="pgr-hijo" href="/programa/${encodeURIComponent(h.slug)}/">
            <span class="pgr-hijo__mini" aria-hidden="true">
              ${AROS}
              ${h.poster ? `<img src="${C.u.urlPosterMini(h.poster)}" alt="" loading="lazy"
                   decoding="async" width="640" height="640" onerror="this.remove()">` : ''}
            </span>
            <span class="pgr-hijo__tit">${escapar(h.titulo)}</span>
          </a>
        </li>`).join('')}
      </ul>
    </div>
  </article>`;
}

/** «Dom 18 oct». */
function diaCorto(iso) {
  const c = C.u.diaCorto(iso);
  return `${mayus(c.semana)} ${c.numero} ${c.mes.slice(0, 3)}`;
}

/** «12–15 oct», o «30 sep–2 oct» si cambia de mes. Cuántos días son se
    lee solo; decirlo aparte era un dato de más. */
function rangoCorto(a) {
  const i = C.u.diaCorto(String(a.fecha).slice(0, 10));
  const f = C.u.diaCorto(String(a.fecha_fin).slice(0, 10));
  const mi = i.mes.slice(0, 3), mf = f.mes.slice(0, 3);
  return mi === mf ? `${i.numero}–${f.numero} ${mf}` : `${i.numero} ${mi}–${f.numero} ${mf}`;
}

const mayus = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);

/* ---- cómo se entra ------------------------------------------------------
   Todas las tarjetas lo dicen, en el mismo lugar y a la misma altura: un
   botón cuando hay algo que hacer (pedir boleto, confirmar asistencia) y una
   etiqueta cuando no (entrada libre, visita escolar, boletos cerrados).

   La entrada libre se quitó y volvió el mismo día, 9 de octubre de 2026:
   sin nada, 25 de 40 tarjetas parecían incompletas. Es lo que ya había
   decidido el 29 de septiembre, cuando la gente no entendía que algunas
   piden boleto y otras no. Va como etiqueta y no como botón porque no hay
   nada que pulsar.

   Confirmar asistencia («registro») es opcional: botón con contorno, no
   relleno, para que no se lea como un boleto obligatorio.
   ========================================================================== */
function entrada(a) {
  const { escapar, ICO, boletoDeActividad } = C.u;
  const pedir = `/programa/${encodeURIComponent(a.slug)}/?o=programa#boleto`;
  const ir = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const nota  = (ico, texto, clase = '') => `<span class="pgr-ent${clase}">${ico}${texto}</span>`;
  const enlace = (href, texto, clase = '') =>
    `<a class="pgr-pedir${clase}" href="${href}">${ICO.boleto}<span>${texto}</span>${ir}</a>`;

  if (!a.acceso || a.acceso === 'libre') return nota(ICO.palomita, 'Entrada libre', ' pgr-ent--libre');
  if (a.acceso === 'escolar') return nota(ICO.escuela, 'Solo para la escuela');

  const mio = boletoDeActividad(a.slug);
  if (mio) {
    return enlace(`/boleto/#${escapar(mio.token)}`,
      mio.estado === 'espera' ? 'En lista de espera' : 'Ya tienes boleto',
      ' pgr-pedir--tuyo');
  }

  if (a.acceso === 'registro') {
    if (a.estado_boletos === 'cerrado') return nota(ICO.palomita, 'Entrada libre', ' pgr-ent--libre');
    return enlace(pedir, 'Confirmar asistencia', ' pgr-pedir--suave');
  }

  switch (a.estado_boletos) {
    case 'pronto':  return nota(ICO.boleto, 'Pide boleto: se abren pronto');
    case 'cerrado': return nota(ICO.boleto, 'Boletos cerrados');
    case 'agotado': return enlace(pedir, 'Agotado · Lista de espera', ' pgr-pedir--espera');
    case 'pocos':   return enlace(pedir, 'Boleto gratuito · últimos lugares');
    default:        return enlace(pedir, 'Boleto gratuito');
  }
}

/* Los aros del logotipo, en el color del eje: es lo que se ve en las seis
   actividades sin póster de 2026 y en cualquiera cuya imagen no cargue. */
const AROS = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="46" cy="42" r="24"/><circle cx="76" cy="46" r="24"/><circle cx="42" cy="72" r="24"/><circle cx="72" cy="76" r="24"/></svg>';
