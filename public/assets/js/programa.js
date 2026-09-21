/* ============================================================================
   PROGRAMA PÚBLICO · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Dos pantallas en un archivo, porque Netlify reescribe todo /programa/* a la
   misma página y aquí se decide cuál toca:

     /programa/            cartelera: los ocho días, filtrable
     /programa/<slug>/     la ficha de una actividad

   Lee solo de «vista_programa», que es la única cosa del esquema que se abre a
   quien no tiene cuenta. Esa vista no trae requerimientos ni responsable: si
   algún día hacen falta aquí, el problema no es de esta página.
   ========================================================================== */

import { db, edicionActiva, explicar, escapar, hora } from '/assets/js/app.js';
import { colorTexto, estiloEje } from '/assets/js/color.js';
import { urlPoster, urlPosterMini } from '/assets/js/archivos.js';
import { montarCabecera } from '/assets/js/cabecera.js';
import { boletoDeActividad } from '/assets/js/boletos/almacen.js';
import { fechaHoraTexto } from '/assets/js/boletos/util.js';

const pagina = document.getElementById('pagina');

/* Cuántos días cuenta una actividad como novedad. */
const DIAS_NUEVO = 7;

/* ============================================================================
   FECHAS
   ----------------------------------------------------------------------------
   Todas se construyen con sus tres componentes. «new Date('2026-10-17')» se lee
   como medianoche UTC y en Ensenada —siete horas atrás— sale el 16: el festival
   entero corrido un día. Es la trampa 16 del plan y aquí se pisa en cada línea.
   ========================================================================== */

function aFecha(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return (a && m && d) ? new Date(a, m - 1, d) : null;
}

const iso = (f) => [
  f.getFullYear(),
  String(f.getMonth() + 1).padStart(2, '0'),
  String(f.getDate()).padStart(2, '0'),
].join('-');

function mayuscula(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** «Sábado 18 de octubre» · el encabezado de cada día de la cartelera. */
function diaLargo(isoTexto) {
  const f = aFecha(isoTexto);
  if (!f) return 'Fecha por confirmar';
  return mayuscula(
    f.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
      .replace(',', '')
  );
}

/** «sáb» y «18» · las pastillas de la barra de días. */
function diaCorto(isoTexto) {
  const f = aFecha(isoTexto);
  if (!f) return { semana: '', numero: '' };
  return {
    semana: f.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', ''),
    numero: String(f.getDate()),
  };
}

/** Todos los días entre el inicio y el fin de la edición, inclusive. */
function diasDeLaEdicion(ed) {
  const ini = aFecha(ed.fecha_inicio), fin = aFecha(ed.fecha_fin);
  const out = [];
  if (!ini || !fin) return out;
  // Tope de seguridad: si alguien teclea mal un año en «ediciones», que la
  // página no se cuelgue dibujando tres mil pastillas.
  for (let f = new Date(ini), n = 0; f <= fin && n < 40; f.setDate(f.getDate() + 1), n++) {
    out.push(iso(new Date(f)));
  }
  return out;
}

/** «10:00 – 12:00», «10:00» o «Por confirmar». */
function rangoHoras(a) {
  const i = hora(a.hora_inicio), f = hora(a.hora_fin);
  if (i && f) return i + ' – ' + f;
  return i || f || 'Hora por confirmar';
}

function esNuevo(a) {
  if (!a.publicada_en) return false;
  const dias = (Date.now() - new Date(a.publicada_en).getTime()) / 86400000;
  return dias >= 0 && dias <= DIAS_NUEVO;
}

/* ============================================================================
   ICONOS
   En línea y pequeños: una petición de red por un pin de catorce píxeles no se
   justifica, y así heredan el color del texto que los acompaña.
   ========================================================================== */
const ICO = {
  pin:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  gente:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-2a4 4 0 0 0-8 0v2"/><circle cx="12" cy="8" r="3.4"/></svg>',
  reloj:  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>',
  calend: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  flecha: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  liga:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>',
  etiq:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13.5l-7 7a2 2 0 0 1-2.8 0l-7.2-7.2V3.5h9.8l7.2 7.2a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.4"/></svg>',
  boleto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8.5V6h17v2.5a2.5 2.5 0 0 0 0 5V16h-17v-2.5a2.5 2.5 0 0 0 0-5z"/><path d="M14 6v10" stroke-dasharray="1.6 2"/></svg>',
  palomita: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

const ANILLOS = `
  <svg class="pg-vacio__anillos" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="46" cy="40" r="24" stroke="#10ABC4"/>
    <circle cx="76" cy="44" r="24" stroke="#E91587"/>
    <circle cx="42" cy="70" r="24" stroke="#F5821F"/>
    <circle cx="72" cy="74" r="24" stroke="#99CA3C"/>
  </svg>`;

/* ============================================================================
   ARRANQUE · qué pantalla toca
   ========================================================================== */
(async function iniciar() {
  montarCabecera();

  // /programa/ → cartelera. /programa/algo/ → ficha de «algo».
  const partes = location.pathname.split('/').filter(Boolean);   // ['programa', slug?]
  const slug = partes[1] ? decodeURIComponent(partes[1]) : null;

  try {
    if (slug) await pintarFicha(slug);
    else      await pintarCartelera();
  } catch (e) {
    pagina.innerHTML = `<div class="pg-wrap"><div class="pg-error">
      ${escapar(explicar(e))}</div></div>`;
  }
})();

/* ============================================================================
   CARTELERA
   ========================================================================== */

let ACTS = [];           // lo publicado de la edición activa
let DIAS = [];           // los ocho días del festival
let diaActivo = 'todo';  // 'todo' | '2026-10-18'
let ejesOn = new Set();  // filtro de ejes; vacío = todos
let sedeOn = '';
let tipoOn = '';

async function pintarCartelera() {
  const ed = await edicionActiva();

  const { data, error } = await db
    .from('vista_programa')
    .select('*')
    .eq('edicion_id', ed.id)
    .order('fecha', { ascending: true, nullsFirst: false })
    .order('hora_inicio', { ascending: true, nullsFirst: false })
    .order('titulo', { ascending: true });

  // Supabase no lanza excepción: devuelve { data:null, error }. Sin revisarlo,
  // la cartelera se quedaría en «Cargando…» para siempre.
  if (error) throw error;

  ACTS = data || [];
  DIAS = diasDeLaEdicion(ed);

  if (!ACTS.length) { pintarSinPrograma(ed); return; }

  // Con qué día abrir: si el festival está ocurriendo, el de hoy. Si no, todo.
  // Quien entra un miércoles de festival quiere ver el miércoles, no bajar ocho
  // encabezados buscándolo.
  const hoy = iso(new Date());
  const delHash = location.hash.replace(/^#/, '');
  if (delHash === 'todo' || DIAS.includes(delHash)) diaActivo = delHash;
  else if (DIAS.includes(hoy) && ACTS.some(a => a.fecha === hoy)) diaActivo = hoy;

  pagina.innerHTML = `
    ${cabeceraCartelera(ed)}
    <div class="pg-barra"><div class="pg-wrap pg-barra__in" id="barra"></div></div>
    <div class="pg-cuerpo"><div class="pg-wrap" id="lista"></div></div>`;

  pintarBarra();
  pintarLista();

  // Volver atrás tras abrir una actividad devuelve al día donde se estaba.
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace(/^#/, '') || 'todo';
    if (h !== diaActivo && (h === 'todo' || DIAS.includes(h))) {
      diaActivo = h; pintarBarra(); pintarLista();
    }
  });
}

function cabeceraCartelera(ed) {
  const conFecha = ACTS.filter(a => a.fecha);
  const dias  = new Set(conFecha.map(a => a.fecha)).size;
  const sedes = new Set(ACTS.map(a => a.sede).filter(Boolean)).size;

  return `
  <header class="pg-hero">
    <div class="pg-wrap pg-hero__in">
      <p class="pg-kicker">Programa</p>
      <h1>${escapar(ed.nombre || 'Programa ' + ed.anio)}</h1>
      <p class="pg-hero__lede">
        Ocho días de ciencia, arte, tecnología y humanidades en Ensenada.
        Todas las actividades son gratuitas; las que tienen cupo piden boleto,
        que puedes conseguir aquí mismo.
      </p>
      <div class="pg-cifras">
        <div class="pg-cifra"><b>${ACTS.length}</b><span>Actividades</span></div>
        <div class="pg-cifra"><b>${dias}</b><span>${dias === 1 ? 'Día' : 'Días'} con programa</span></div>
        <div class="pg-cifra"><b>${sedes}</b><span>${sedes === 1 ? 'Sede' : 'Sedes'}</span></div>
      </div>
    </div>
  </header>`;
}

/* ------------------------------------------------------------- la barra --- */
/** Las dos variantes de un color, para los sitios donde hacen falta sueltas. */
function tono(hex) {
  const puro = hex || '#10ABC4';
  return { puro, texto: colorTexto(puro) };
}

function pintarBarra() {
  const ejes  = listaUnica(ACTS, 'eje');
  const sedes = listaUnica(ACTS, 'sede');
  const tipos = listaUnica(ACTS, 'tipo');
  const sinFecha = ACTS.some(a => !a.fecha);

  const pastilla = (d) => {
    const { semana, numero } = diaCorto(d);
    const hay = ACTS.some(a => a.fecha === d);
    return `<button class="pg-dia-btn" type="button" data-dia="${d}"
              aria-pressed="${diaActivo === d}" ${hay ? '' : 'disabled'}
              title="${hay ? escapar(diaLargo(d)) : escapar(diaLargo(d)) + ' · sin actividades todavía'}">
              <small>${escapar(semana)}</small><b>${escapar(numero)}</b>
            </button>`;
  };

  document.getElementById('barra').innerHTML = `
    <div class="pg-dias" role="group" aria-label="Días del festival">
      <button class="pg-dia-btn pg-dia-btn--todo" type="button" data-dia="todo"
              aria-pressed="${diaActivo === 'todo'}">
        <small>Ver</small><b>Todo</b>
      </button>
      ${DIAS.map(pastilla).join('')}
      ${sinFecha ? `
      <button class="pg-dia-btn pg-dia-btn--todo" type="button" data-dia="abierto"
              aria-pressed="${diaActivo === 'abierto'}">
        <small>Sin</small><b>fecha</b>
      </button>` : ''}
    </div>

    <button class="pg-abrir-filtros" type="button" id="f-abrir"
            aria-expanded="false" aria-controls="f-caja">
      Filtrar${cuantosFiltros() ? ` <b>${cuantosFiltros()}</b>` : ''}
    </button>

    <div class="pg-filtros" id="f-caja">
      <div class="pg-ejes" role="group" aria-label="Filtrar por eje">
        ${ejes.map(e => {
          const t = tono(colorDelEje(e));
          return `<button class="pg-eje-btn" type="button" data-eje="${escapar(e)}"
                    aria-pressed="${ejesOn.has(e)}"
                    style="--eje:${t.puro};--eje-tx:${t.texto}">
                    <i></i>${escapar(e)}
                  </button>`;
        }).join('')}
      </div>

      ${sedes.length > 1 ? selector('f-sede', 'Todas las sedes', sedes, sedeOn) : ''}
      ${tipos.length > 1 ? selector('f-tipo', 'Todos los tipos', tipos, tipoOn) : ''}

      ${hayFiltro() ? '<button class="pg-limpiar" type="button" id="f-limpiar">Limpiar filtros</button>' : ''}
      <span class="pg-cuenta" id="f-cuenta"></span>
    </div>`;

  const barra = document.getElementById('barra');

  // Repintar la barra rehace el botón, así que el estado desplegado vive en la
  // clase del contenedor exterior, que sobrevive.
  const caja = barra.parentElement;                 // .pg-barra
  const abrir = document.getElementById('f-abrir');
  abrir.setAttribute('aria-expanded', caja.classList.contains('pg-barra--abierta'));
  abrir.addEventListener('click', () => {
    const ahora = caja.classList.toggle('pg-barra--abierta');
    abrir.setAttribute('aria-expanded', ahora);
  });

  barra.querySelectorAll('[data-dia]').forEach(b =>
    b.addEventListener('click', () => {
      diaActivo = b.dataset.dia;
      // En el hash y no en la ruta: la ruta con un segmento más la tomaría la
      // ficha de actividad. Además deja compartir «el programa del sábado».
      history.replaceState(null, '', diaActivo === 'todo' ? location.pathname : '#' + diaActivo);
      pintarBarra(); pintarLista();
    }));

  barra.querySelectorAll('[data-eje]').forEach(b =>
    b.addEventListener('click', () => {
      const e = b.dataset.eje;
      ejesOn.has(e) ? ejesOn.delete(e) : ejesOn.add(e);
      pintarBarra(); pintarLista();
    }));

  const sel = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { fn(el.value); pintarBarra(); pintarLista(); });
  };
  sel('f-sede', v => sedeOn = v);
  sel('f-tipo', v => tipoOn = v);

  const limpiar = document.getElementById('f-limpiar');
  if (limpiar) limpiar.addEventListener('click', () => {
    ejesOn.clear(); sedeOn = ''; tipoOn = '';
    pintarBarra(); pintarLista();
  });
}

function selector(id, placeholder, valores, actual) {
  return `<select class="pg-sel" id="${id}" aria-label="${escapar(placeholder)}">
    <option value="">${escapar(placeholder)}</option>
    ${valores.map(v =>
      `<option value="${escapar(v)}"${v === actual ? ' selected' : ''}>${escapar(v)}</option>`
    ).join('')}
  </select>`;
}

function listaUnica(filas, campo) {
  return [...new Set(filas.map(f => f[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

function colorDelEje(nombre) {
  const a = ACTS.find(x => x.eje === nombre && x.eje_color);
  return a ? a.eje_color : '#10ABC4';
}

function hayFiltro() { return ejesOn.size || sedeOn || tipoOn; }

/** Cuántos filtros hay puestos. Va en el botón de celular, donde los filtros
    están plegados y de otro modo no habría manera de saber que están activos. */
function cuantosFiltros() { return ejesOn.size + (sedeOn ? 1 : 0) + (tipoOn ? 1 : 0); }

/* -------------------------------------------------------------- la lista -- */
function filtradas() {
  return ACTS.filter(a =>
    (!ejesOn.size || ejesOn.has(a.eje)) &&
    (!sedeOn || a.sede === sedeOn) &&
    (!tipoOn || a.tipo === tipoOn) &&
    (diaActivo === 'todo'
      || (diaActivo === 'abierto' ? !a.fecha : a.fecha === diaActivo))
  );
}

function pintarLista() {
  const d = filtradas();
  const cuenta = document.getElementById('f-cuenta');
  if (cuenta) {
    cuenta.textContent = d.length === ACTS.length
      ? `${ACTS.length} actividades`
      : `${d.length} de ${ACTS.length}`;
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
    if (b) b.addEventListener('click', () => {
      ejesOn.clear(); sedeOn = ''; tipoOn = ''; diaActivo = 'todo';
      history.replaceState(null, '', location.pathname);
      pintarBarra(); pintarLista();
    });
    return;
  }

  // Agrupar por día conservando el orden que ya trajo la base.
  const grupos = new Map();
  d.forEach(a => {
    const k = a.fecha || 'abierto';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(a);
  });

  document.getElementById('lista').innerHTML = [...grupos.entries()].map(([k, acts]) => `
    <section class="pg-dia${k === 'abierto' ? ' pg-dia--abierto' : ''}" id="dia-${escapar(k)}">
      <div class="pg-dia__tit">
        <h2>${k === 'abierto' ? 'Fecha por confirmar' : escapar(diaLargo(k))}</h2>
        <span>${acts.length} ${acts.length === 1 ? 'actividad' : 'actividades'}</span>
      </div>
      <div class="pg-lista">${acts.map(tarjeta).join('')}</div>
    </section>`).join('');
}

function tarjeta(a) {
  const i = hora(a.hora_inicio), f = hora(a.hora_fin);

  // La miniatura es decorativa (alt vacío): el título ya está escrito al lado
  // y un lector de pantalla no gana nada oyéndolo dos veces. Si la imagen no
  // carga, se quita junto con su columna para no dejar un hueco.
  const poster = a.poster
    ? `<img class="pg-act__poster" src="${urlPosterMini(a.poster)}" alt=""
            loading="lazy" decoding="async" width="120" height="120"
            onerror="this.parentElement.classList.remove('pg-act--poster');this.remove()">`
    : '';

  return `
  <a class="pg-act${a.poster ? ' pg-act--poster' : ''}" href="/programa/${encodeURIComponent(a.slug)}/" style="${estiloEje(a.eje_color)}">
    <div class="pg-act__hora">
      ${i ? `<b>${escapar(i)}</b>${f ? `<i></i><small>${escapar(f)}</small>` : ''}`
          : '<em>Hora por<br>confirmar</em>'}
    </div>
    <div class="pg-act__cuerpo">
      <p class="pg-act__eti">
        <b>${escapar(a.eje || 'Festival')}</b>
        ${a.tipo ? `<u></u><span>${escapar(a.tipo)}</span>` : ''}
        ${esNuevo(a) ? '<span class="pg-nuevo">Nuevo</span>' : ''}
      </p>
      <h3 class="pg-act__tit">${escapar(a.titulo)}</h3>
      ${a.resumen ? `<p class="pg-act__res">${escapar(a.resumen)}</p>` : ''}
      <p class="pg-act__meta">
        ${a.sede ? `<span class="pg-sede">${ICO.pin}${escapar(a.sede)}</span>` : ''}
        ${etiquetaBoleto(a)}
      </p>
    </div>
    ${poster}
  </a>`;
}

/* ============================================================================
   BOLETOS EN EL PROGRAMA
   El público nunca ve el cupo: trae el sobrecupo incluido (decisión del 16 de
   septiembre) y ya no es la capacidad de la sala. Ve si hay lugar.
   ========================================================================== */
function etiquetaBoleto(a) {
  if (!a.acceso || a.acceso === 'libre') return '';
  const mio = boletoDeActividad(a.slug);
  if (mio) {
    return `<span class="pg-bol pg-bol--tuyo">${ICO.palomita}${mio.estado === 'espera' ? 'En lista de espera' : 'Tienes boleto'}</span>`;
  }
  const e = a.estado_boletos;
  if (a.acceso === 'registro') {
    return e === 'cerrado' ? '' : `<span class="pg-bol">${ICO.boleto}Confirma asistencia</span>`;
  }
  switch (e) {
    // Sin número: cuántos lugares quedan no es asunto del público, y con el
    // sobrecupo incluido ni siquiera es la capacidad de la sala.
    case 'pocos':
      return `<span class="pg-bol pg-bol--pocos">${ICO.boleto}Últimos lugares</span>`;
    case 'agotado':
      return `<span class="pg-bol pg-bol--agotado">${ICO.boleto}Agotado · lista de espera</span>`;
    case 'pronto':
      return `<span class="pg-bol pg-bol--apagado">${ICO.boleto}Boletos muy pronto</span>`;
    case 'cerrado':
      return `<span class="pg-bol pg-bol--apagado">${ICO.boleto}Boletos cerrados</span>`;
    default:
      return `<span class="pg-bol">${ICO.boleto}Boleto gratuito</span>`;
  }
}

function entradaFicha(a) {
  if (a.acceso === 'boleto')   return 'Con boleto gratuito<small>Cupo limitado</small>';
  if (a.acceso === 'registro') return 'Libre<small>Con confirmación de asistencia</small>';
  return 'Libre<small>Sin registro previo</small>';
}

/** El recuadro «Consigue tu boleto» de la ficha. */
function bloqueBoleto(a) {
  if (!a.acceso || a.acceso === 'libre') return '';
  const mio = boletoDeActividad(a.slug);
  const e = a.estado_boletos;
  const registro = a.acceso === 'registro';

  let texto, boton = '';
  if (mio) {
    texto = mio.estado === 'espera'
      ? 'Estás en la lista de espera desde este teléfono.'
      : `Ya tienes boleto en este teléfono, a nombre de <b>${escapar(mio.nombre)}</b>.`;
    boton = `<a class="pg-btn pg-btn--lleno" href="/boleto/#${escapar(mio.token)}">Ver mi boleto</a>
             <button class="pg-btn" type="button" data-abrir-boleto data-forzar>Pedir otro para otra persona</button>`;
  } else if (e === 'pronto') {
    const f = fechaHoraTexto(a.boletos_desde);
    texto = `Esta actividad tiene cupo. Los boletos se abren el <b>${escapar(f)}</b>.`;
  } else if (e === 'cerrado') {
    texto = 'El registro cerró. Si sobran lugares, en la entrada se ocupan por orden de llegada.';
  } else if (registro) {
    texto = 'La entrada es libre. <b>Confirma tu asistencia</b> para que sepamos cuánta gente esperar.';
    boton = '<button class="pg-btn pg-btn--lleno" type="button" data-abrir-boleto>Confirmar asistencia</button>';
  } else if (e === 'agotado') {
    texto = '<b>Se terminaron los lugares.</b> Anótate en la lista de espera: si alguien cancela o sobran lugares en la entrada, pasas primero.';
    boton = '<button class="pg-btn pg-btn--lleno" type="button" data-abrir-boleto>Anotarme en la lista de espera</button>';
  } else {
    texto = e === 'pocos'
      ? 'Esta actividad tiene cupo y pide boleto gratuito. <b>Quedan los últimos lugares.</b>'
      : 'Esta actividad tiene cupo y pide boleto gratuito.';
    boton = '<button class="pg-btn pg-btn--lleno" type="button" data-abrir-boleto>Consigue tu boleto</button>';
  }

  return `
    <section class="pg-boleto" id="bloque-boleto" style="${estiloEje(a.eje_color)}">
      <h2>${registro ? 'Confirma tu asistencia' : 'Boleto gratuito'}</h2>
      <p>${texto}</p>
      ${boton}
    </section>`;
}

/**
 * El botón principal en el hero, junto al título. Es la misma acción que el
 * recuadro de la columna de datos, sin la explicación: el recuadro se queda
 * con ella. En «pronto» y «cerrado» no hay nada que pulsar y el hero no pone
 * botón; la explicación de por qué sí la da el recuadro.
 */
function ctaHero(a) {
  if (!a.acceso || a.acceso === 'libre') return '';
  const mio = boletoDeActividad(a.slug);
  if (mio) {
    return `<a class="pg-btn pg-btn--lleno pg-btn--grande" href="/boleto/#${escapar(mio.token)}">${ICO.boleto}Ver mi boleto</a>`;
  }
  const e = a.estado_boletos;
  if (e === 'pronto' || e === 'cerrado') return '';
  const texto = a.acceso === 'registro' ? 'Confirmar asistencia'
              : e === 'agotado'        ? 'Anotarme en la lista de espera'
              :                          'Consigue tu boleto';
  return `<button class="pg-btn pg-btn--lleno pg-btn--grande" type="button" data-abrir-boleto>${ICO.boleto}${texto}</button>`;
}

/** De dónde llegó la persona a la ficha, para el campo «origen» del boleto. */
function origenFicha() {
  const o = new URLSearchParams(location.search).get('o');
  if (['cartel', 'programa', 'ficha', 'portada', 'redes', 'otro'].includes(o)) return o;
  try {
    const r = new URL(document.referrer);
    if (r.origin === location.origin) {
      if (r.pathname === '/' || r.pathname === '/index.html') return 'portada';
      if (r.pathname === '/programa/') return 'programa';
    }
  } catch (e) { /* sin referrer */ }
  return 'ficha';
}

function conectarBloque(a, origen) {
  // Solo los botones que aún no tienen oyente. Ahora hay dos sitios con botón,
  // el hero y el recuadro, que se repintan por separado; uno conectado dos
  // veces llamaría a showModal sobre un diálogo ya abierto, y eso lanza error.
  document.querySelectorAll('[data-abrir-boleto]:not([data-conectado])').forEach(b => {
    b.setAttribute('data-conectado', '');
    b.addEventListener('click', () => abrirDialogo(a, origen, b.hasAttribute('data-forzar')));
  });
}

async function abrirDialogo(a, origen, forzar) {
  let d = document.getElementById('dlg-boleto');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'dlg-boleto';
    d.className = 'bd';
    d.setAttribute('aria-labelledby', 'dlg-boleto-tit');
    document.body.appendChild(d);
    // Un clic en el fondo oscuro cierra, como en cualquier ventana emergente.
    d.addEventListener('click', (ev) => { if (ev.target === d) cerrarDialogo(); });
    // Respaldo para la tecla Escape, que cierra sin pasar por cerrarDialogo().
    d.addEventListener('close', () => refrescarBloque(d.dataset.id, d.dataset.origen));
  }
  d.dataset.id = a.id;
  d.dataset.origen = origen;
  d.setAttribute('style', estiloEje(a.eje_color));
  d.innerHTML = `
    <div class="bd__marco">
      <div class="bd__cab">
        <div>
          <p>${a.acceso === 'registro' ? 'Confirma tu asistencia' : 'Consigue tu boleto'}</p>
          <h2 id="dlg-boleto-tit">${escapar(a.titulo)}</h2>
        </div>
        <button class="bd__cerrar" type="button" aria-label="Cerrar" data-cerrar>×</button>
      </div>
      <div class="bd__cuerpo" id="dlg-boleto-cuerpo"><p class="bf-cargando">Preparando el formulario…</p></div>
    </div>`;
  d.querySelector('[data-cerrar]').addEventListener('click', cerrarDialogo);
  d.showModal();

  try {
    // Se carga al abrir: la cartelera no paga el formulario ni el QR si nadie
    // pide boleto.
    const { montarFormulario } = await import('/assets/js/boletos/formulario.js');
    // Al emitir se actualiza el recuadro de atrás de una vez, sin esperar a
    // que se cierre el diálogo.
    await montarFormulario(document.getElementById('dlg-boleto-cuerpo'), a,
      { origen, forzar, alEmitir: () => refrescarBloque(a.id, origen) });
  } catch (e) {
    document.getElementById('dlg-boleto-cuerpo').innerHTML =
      '<p class="pg-error">No se pudo cargar el formulario. Revisa tu conexión y vuelve a intentarlo.</p>';
  }
}

/**
 * Cierra el diálogo y actualiza el recuadro. No se confía solo en el evento
 * «close»: el panel de vista previa del editor no lo dispara (igual que no
 * avanza animaciones, trampa 15), y un recuadro desactualizado ofrecería un
 * boleto que la persona ya tiene.
 */
function cerrarDialogo() {
  const d = document.getElementById('dlg-boleto');
  if (!d || !d.open) return;
  d.close();
  refrescarBloque(d.dataset.id, d.dataset.origen);
}

/** La disponibilidad pudo cambiar, y quizá ya hay boleto. */
let _refrescando = null;
async function refrescarBloque(id, origen) {
  // Cerrar justo después de emitir pediría dos veces lo mismo.
  if (_refrescando === id) return;
  _refrescando = id;
  setTimeout(() => { _refrescando = null; }, 400);
  const { data } = await db.from('vista_programa').select('*').eq('id', id).maybeSingle();
  const viejo = document.getElementById('bloque-boleto');
  if (!data || !viejo) return;
  const t = document.createElement('template');
  t.innerHTML = bloqueBoleto(data).trim();
  if (t.content.firstElementChild) viejo.replaceWith(t.content.firstElementChild);
  const hero = document.getElementById('hero-boleto');
  if (hero) hero.innerHTML = ctaHero(data);
  conectarBloque(data, origen);
}

/* ------------------------------------------- todavía no hay nada publicado */
function pintarSinPrograma(ed) {
  pagina.innerHTML = `
    <header class="pg-hero">
      <div class="pg-wrap pg-hero__in">
        <p class="pg-kicker">Programa</p>
        <h1>${escapar(ed.nombre || 'Programa ' + ed.anio)}</h1>
        <p class="pg-hero__lede">
          Estamos confirmando actividades, horarios y sedes. En cuanto cada una
          queda en firme aparece aquí.
        </p>
      </div>
    </header>
    <div class="pg-cuerpo"><div class="pg-wrap">
      <div class="pg-vacio">
        ${ANILLOS}
        <h2>El programa se está armando</h2>
        <p>Las actividades se publican conforme se confirman. La forma más rápida
           de enterarte es seguirnos en redes: ahí sale cada anuncio primero.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a class="pg-btn pg-btn--lleno" href="https://www.facebook.com/festivaldelconocimiento.ens/"
             target="_blank" rel="noopener">Seguir en Facebook</a>
          <a class="pg-btn" href="/#fdc-participa">Participar en el festival</a>
        </div>
      </div>
    </div></div>`;
}

/* ============================================================================
   FICHA DE UNA ACTIVIDAD
   ========================================================================== */
async function pintarFicha(slug) {
  const { data, error } = await db
    .from('vista_programa')
    .select('*')
    .eq('slug', slug);

  if (error) throw error;

  if (!data || !data.length) { pintarNoExiste(); return; }

  // El slug es único dentro de una edición, no en toda la base: un taller que
  // se repite cada año comparte dirección. Gana la edición que está corriendo.
  let a = data[0];
  if (data.length > 1) {
    try {
      const ed = await edicionActiva();
      a = data.find(x => x.edicion_id === ed.id) || data[0];
    } catch (e) { /* sin edición activa, se queda la primera */ }
  }

  document.title = a.titulo + ' · Programa 2026 · Festival del Conocimiento';
  const meta = document.querySelector('meta[name="description"]');
  if (meta && a.resumen) meta.setAttribute('content', a.resumen);

  const cuandoDia = a.fecha ? diaLargo(a.fecha) : null;
  const poster    = a.poster ? urlPoster(a.poster) : '';

  // El resumen suele traer varios párrafos —el de Los Panchos trae cuatro— y se
  // pintaba en un solo <p>, así que llegaba como un bloque corrido. Si el
  // primero es corto sube al hero como entradilla; el resto abre el texto, y
  // detrás va la descripción.
  const resumen = bloquesDe(a.resumen);
  const lede = (resumen.length && esEntradilla(resumen[0])) ? resumen.shift() : '';
  const cuerpo = formato([...resumen, ...bloquesDe(a.descripcion)].join('\n\n'));

  pagina.innerHTML = `
  <header class="pg-hero pg-hero--act${poster ? ' pg-hero--poster' : ''}" style="${estiloEje(a.eje_color)}">
    ${poster ? `
    <div class="pg-hero__fondo" aria-hidden="true"></div>
    <div class="pg-hero__velo" aria-hidden="true"></div>` : ''}
    <div class="pg-wrap pg-hero__in pg-hero__rejilla">
      <div class="pg-hero__txt">
        <a class="pg-volver" href="/programa/${location.hash === '#boleto' ? '' : location.hash}">${ICO.flecha} Todo el programa</a>
        ${a.tipo || a.eje ? `
        <p class="pg-hero__tipo"><i></i>${escapar(a.tipo || a.eje)}</p>` : ''}
        <p class="pg-kicker">${escapar(a.eje || 'Festival del Conocimiento')}</p>
        <h1>${escapar(a.titulo)}</h1>
        ${lede ? `<p class="pg-hero__lede">${enLinea(escapar(lede))}</p>` : ''}
        <div class="pg-hero__cta" id="hero-boleto">${ctaHero(a)}</div>
      </div>
      ${poster ? `
      <a class="pg-hero__poster" href="${escapar(poster)}" target="_blank" rel="noopener"
         title="Ver el póster completo">
        <img src="${escapar(poster)}" alt="Póster de «${escapar(a.titulo)}»" decoding="async"
             onerror="this.closest('.pg-hero').classList.remove('pg-hero--poster');this.closest('.pg-hero__poster').remove()">
      </a>` : ''}
    </div>
  </header>

  <div class="pg-det"><div class="pg-wrap">
    <div class="pg-det__rejilla">

      <aside class="pg-lado" aria-label="Datos de la actividad">
        <div class="pg-ficha" style="${estiloEje(a.eje_color)}">
          <h2>Los datos</h2>
          <dl>
            <div class="pg-ficha__fila">${ICO.calend}
              <div><dt>Cuándo</dt>
                <dd>${cuandoDia ? escapar(cuandoDia) : 'Por confirmar'}
                  ${a.fecha ? `<small>${escapar(String(a.fecha).slice(0, 4))}</small>` : ''}
                </dd></div>
            </div>
            <div class="pg-ficha__fila">${ICO.reloj}
              <div><dt>Horario</dt><dd>${escapar(rangoHoras(a))}</dd></div>
            </div>
            ${a.sede ? `
            <div class="pg-ficha__fila">${ICO.pin}
              <div><dt>Sede</dt><dd>${escapar(a.sede)}
                ${a.sede_direccion ? `<small>${escapar(a.sede_direccion)}</small>` : ''}
              </dd></div>
            </div>` : ''}
            ${a.tipo ? `
            <div class="pg-ficha__fila">${ICO.etiq}
              <div><dt>Tipo de actividad</dt><dd>${escapar(a.tipo)}</dd></div>
            </div>` : ''}
            <div class="pg-ficha__fila">${ICO.gente}
              <div><dt>Entrada</dt>
                <dd>${entradaFicha(a)}</dd></div>
            </div>
          </dl>
        </div>
        ${bloqueBoleto(a)}
      </aside>

      <div class="pg-texto" style="${estiloEje(a.eje_color)}">
        ${cuerpo || (lede ? '' : `
          <p>La descripción completa de esta actividad se publicará pronto.
             Los datos de día, hora y sede ya están en firme.</p>`)}

        <div class="pg-comp">
          <p class="pg-comp__tit">Comparte esta actividad</p>
          <div class="pg-comp__botones">${botonesCompartir(a)}</div>
        </div>
      </div>

    </div>

    <section class="pg-mismo" id="mismo-dia" hidden>
      <h2>Ese mismo día</h2>
      <div class="pg-lista" id="mismo-lista"></div>
    </section>
  </div></div>`;

  // El fondo desenfocado se pone desde aquí y no en un atributo style: la ruta
  // viene de la base, y JSON.stringify la deja como cadena CSS bien cerrada
  // aunque trajera comillas o paréntesis.
  const fondo = pagina.querySelector('.pg-hero__fondo');
  if (fondo) fondo.style.backgroundImage = `url(${JSON.stringify(poster)})`;

  document.querySelectorAll('.pg-btn[data-copiar]').forEach(b =>
    b.addEventListener('click', copiarLiga));

  const origen = origenFicha();
  conectarBloque(a, origen);
  // /programa/<slug>/#boleto abre el formulario directo: sirve para compartir
  // «consigue tu boleto» en redes sin mandar a la gente a buscar el botón.
  if (location.hash === '#boleto' && document.querySelector('[data-abrir-boleto]')) {
    abrirDialogo(a, origen === 'ficha' ? 'redes' : origen, false);
  }

  if (a.fecha) await pintarMismoDia(a);
}

/* ============================================================================
   EL TEXTO DE LA FICHA
   ----------------------------------------------------------------------------
   Coordinación escribe en un cuadro de texto plano y aquí se respeta lo que
   pone, en vez de fundirlo en un solo bloque:

     · un renglón en blanco separa párrafos
     · un renglón que empieza con guion, viñeta o asterisco es una lista
     · un renglón que empieza con «1.» o «1)» es una lista numerada
     · un renglón corto y suelto que acaba en dos puntos es un subtítulo
     · **así** va en negritas, y las ligas http(s) se vuelven enlaces

   Todo se ESCAPA PRIMERO y el formato se aplica sobre texto ya escapado: nada
   de lo que se escriba en ese cuadro puede meter HTML en la página.
   ========================================================================== */
const ENTRADILLA_MAX = 220;
const RE_VINETA = /^[-•*–]\s+/;
const RE_NUMERO = /^\d{1,2}[.)]\s+/;

/** Parte un texto en bloques separados por renglones en blanco. */
function bloquesDe(texto) {
  return String(texto || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map(b => b.trim())
    .filter(Boolean);
}

/** Un párrafo que puede subir al hero: corto, de un renglón y que no es lista. */
function esEntradilla(bloque) {
  return bloque.length <= ENTRADILLA_MAX
    && !bloque.includes('\n')
    && !RE_VINETA.test(bloque) && !RE_NUMERO.test(bloque);
}

/** Negritas y enlaces. Recibe texto YA escapado. */
function enLinea(html) {
  return html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // El último carácter no puede ser puntuación: «visita https://x.org.» no
    // debe llevarse el punto final dentro del enlace.
    .replace(/(^|[\s(])(https?:\/\/[^\s<]*[^\s<.,;:!?)])/g,
      '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}

function formato(texto) {
  return bloquesDe(texto).map(bloque => {
    let html = '', grupo = [], tipo = null;          // tipo: 'ul' | 'ol' | 'p'

    const cerrar = () => {
      if (!grupo.length) return;
      if (tipo === 'ul' || tipo === 'ol') {
        html += `<${tipo}>${grupo.map(l => `<li>${enLinea(escapar(l))}</li>`).join('')}</${tipo}>`;
      } else if (grupo.length === 1 && grupo[0].length <= 60 && grupo[0].endsWith(':')) {
        html += `<h3>${enLinea(escapar(grupo[0].slice(0, -1)))}</h3>`;
      } else {
        html += `<p>${grupo.map(l => enLinea(escapar(l))).join('<br>')}</p>`;
      }
      grupo = [];
    };

    // Renglón por renglón, porque es común escribir el título de una lista y
    // sus puntos sin dejar renglón en blanco en medio.
    for (const renglon of bloque.split('\n')) {
      const l = renglon.trim();
      if (!l) continue;
      const t = RE_VINETA.test(l) ? 'ul' : RE_NUMERO.test(l) ? 'ol' : 'p';
      if (t !== tipo) { cerrar(); tipo = t; }
      grupo.push(t === 'ul' ? l.replace(RE_VINETA, '') : t === 'ol' ? l.replace(RE_NUMERO, '') : l);
    }
    cerrar();
    return html;
  }).join('');
}

/* Compartir va en segundo plano: botones de contorno y pequeños. Con WhatsApp
   relleno en magenta competía con «Consigue tu boleto», que es la única acción
   principal de la página. */
function botonesCompartir(a) {
  const url = location.origin + '/programa/' + encodeURIComponent(a.slug) + '/';
  const texto = `${a.titulo} · Festival del Conocimiento`;
  return `
    <a class="pg-btn" target="_blank" rel="noopener"
       href="https://wa.me/?text=${encodeURIComponent(texto + ' ' + url)}">WhatsApp</a>
    <a class="pg-btn" target="_blank" rel="noopener"
       href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a>
    <button class="pg-btn" type="button" data-copiar="${escapar(url)}">${ICO.liga} Copiar liga</button>`;
}

async function copiarLiga(ev) {
  const btn = ev.currentTarget;
  const url = btn.dataset.copiar;
  const antes = btn.innerHTML;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = '¡Copiada!';
  } catch (e) {
    // En http:// y en navegadores viejos el portapapeles no está disponible.
    // Decirlo es mejor que un botón que no hace nada.
    btn.textContent = 'Copia la liga de la barra';
  }
  setTimeout(() => { btn.innerHTML = antes; }, 2200);
}

async function pintarMismoDia(a) {
  const { data, error } = await db
    .from('vista_programa')
    .select('*')
    .eq('edicion_id', a.edicion_id)
    .eq('fecha', a.fecha)
    .neq('id', a.id)
    .order('hora_inicio', { ascending: true, nullsFirst: false })
    .limit(4);

  if (error || !data || !data.length) return;

  document.getElementById('mismo-lista').innerHTML = data.map(tarjeta).join('');
  const sec = document.getElementById('mismo-dia');
  sec.querySelector('h2').textContent = diaLargo(a.fecha) + ', además';
  sec.hidden = false;
}

function pintarNoExiste() {
  pagina.innerHTML = `
    <header class="pg-hero">
      <div class="pg-wrap pg-hero__in">
        <p class="pg-kicker">Programa</p>
        <h1>No encontramos esa actividad</h1>
        <p class="pg-hero__lede">
          Puede que la dirección esté mal escrita, o que la actividad todavía no
          se haya publicado en el programa.
        </p>
      </div>
    </header>
    <div class="pg-cuerpo"><div class="pg-wrap">
      <div class="pg-vacio">
        ${ANILLOS}
        <h2>Mejor empecemos por el programa completo</h2>
        <p>Ahí están todas las actividades confirmadas, día por día.</p>
        <a class="pg-btn pg-btn--lleno" href="/programa/">Ver el programa</a>
      </div>
    </div></div>`;
}
