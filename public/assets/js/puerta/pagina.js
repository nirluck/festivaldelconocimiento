/* ============================================================================
   PUERTA · LA PANTALLA
   ----------------------------------------------------------------------------
   Dos pantallas:
     · Entrar   el código de puerta (ABCD-2345). Una vez por actividad.
     · Puerta   cámara, resultado enorme y de color, contador contra la
                capacidad de la sala, «+1 sin boleto», búsqueda por nombre o
                código, quiénes entraron y las actividades del teléfono.

   Lo que se hace cuenta en el momento y se sube cuando hay red (estado.js).
   Quién pasa sin boleto o desde la lista de espera lo decide quien está en la
   puerta: la pantalla da los números, no frena.
   ========================================================================== */

import { Puerta, ventana } from './estado.js';
import { Escaner } from './escaner.js';
import { escapar, hora, rangoHoras, codigoLegible, lugaresTexto, aLas, aFecha } from '../boletos/util.js';
import { lugarCorto } from '../lugar.js';
import { sincronizarColorNavegador } from '../marca.js';

sincronizarColorNavegador();

const puerta = new Puerta();
const main = document.getElementById('pt-main');
const pildora = document.getElementById('pt-red');

let pantalla = null;         // 'entrar' | 'puerta'
let escaner = null;
let res = null;              // el último resultado: lo que muestra la tarjeta grande
let ultimo = { texto: '', t: 0 };
let pausaHasta = 0;
let candado = null;          // Wake Lock: que la pantalla no se apague con la cámara abierta
let audio = null;
let camaraAntes = false;     // para reabrirla al volver a la pestaña
let leyendo = false;         // una lectura a la vez: el resultado anterior manda
let esperaSiguiente = false; // la tarjeta de abajo muestra una entrada válida recién escaneada

/* ========================================================== pantalla: entrar */

function mostrarEntrar(error) {
  pantalla = 'entrar';
  detenerCamara();
  main.innerHTML = `
    <section class="pt-entrar">
      <p class="pt-kicker">Registro de entradas</p>
      <h1>Código de puerta</h1>
      <p class="pt-lead">Escribe el código que te dio quien coordina la actividad.</p>
      <form class="pt-codigo" id="pt-forma" novalidate>
        <label class="sr" for="pt-codigo">Código de puerta</label>
        <input id="pt-codigo" autocomplete="off" autocapitalize="characters" autocorrect="off"
               spellcheck="false" maxlength="9" placeholder="ABCD-2345" enterkeyhint="go"
               aria-describedby="pt-codigo-ayuda">
        <button class="pt-btn pt-btn--principal" type="submit">Entrar</button>
        <p class="pt-error" id="pt-error" role="alert"${error ? '' : ' hidden'}>${escapar(error || '')}</p>
      </form>
      <p class="pt-nota" id="pt-codigo-ayuda">Quien coordina lo genera en su panel:
        <b>Mis actividades › la actividad › Boletos › Puerta</b>.
        Si cuidas varias actividades, escribe un código por cada una: el teléfono
        las recuerda y cada boleto se registra solo en la suya.</p>
      ${puerta.claves.length ? '<button class="pt-btn pt-btn--linea" type="button" data-volver>Volver a la puerta</button>' : ''}
    </section>`;
  conectarCodigo(main.querySelector('#pt-forma'), (ok) => { if (ok) mostrarPuerta(); });
  main.querySelector('[data-volver]')?.addEventListener('click', mostrarPuerta);
  main.querySelector('#pt-codigo').focus();
}

/** Formulario de código: el de la pantalla de entrada y el de «agregar otra». */
function conectarCodigo(forma, alTerminar) {
  const campo = forma.querySelector('input');
  const err = forma.querySelector('.pt-error');
  // ABCD2345 → ABCD-2345 mientras se escribe.
  campo.addEventListener('input', () => {
    const s = campo.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
    campo.value = s.length > 4 ? s.slice(0, 4) + '-' + s.slice(4) : s;
  });
  forma.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const codigo = campo.value.replace(/-/g, '');
    const decir = (t) => { err.textContent = t; err.hidden = false; campo.focus(); };
    if (codigo.length !== 8) return decir('El código tiene ocho caracteres, por ejemplo ABCD-2345.');
    const btn = forma.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Revisando…';
    const r = await puerta.agregar(codigo);
    btn.disabled = false; btn.textContent = btn.dataset.texto || 'Entrar';
    if (!r.ok) return decir(MENSAJES_CODIGO[r.error] || 'No se pudo entrar. Intenta de nuevo.');
    err.hidden = true;
    campo.value = '';
    alTerminar(true, r);
    if (r.sinLista) avisar('ambar', 'El código es correcto, pero no se pudo descargar la lista. Revisa la señal: se reintentará sola.');
  });
}

const MENSAJES_CODIGO = {
  codigo: 'Ese código no existe. Revisa las letras con quien coordina: no lleva O, I ni L.',
  clave_vencida: 'Ese código ya venció o lo revocaron. Pide uno nuevo a quien coordina.',
  demasiados: 'Demasiados códigos equivocados desde esta red. Espera diez minutos.',
  red: 'Sin conexión. Para entrar la primera vez hace falta señal; después funciona sin ella.',
  sin_migracion: 'La base de datos todavía no tiene la puerta (falta aplicar sql/17-puerta.sql).',
};

/* ========================================================== pantalla: puerta */

function mostrarPuerta() {
  // La cámara anterior apuntaba a un <video> que se va a reemplazar.
  detenerCamara();
  escaner = null;
  pantalla = 'puerta';
  main.innerHTML = `
    <div class="pt-aviso" id="pt-aviso" role="status" hidden></div>
    <nav class="pt-acts" id="pt-acts" aria-label="Actividades en este teléfono"></nav>
    <section class="pt-act" id="pt-act"></section>

    <section class="pt-cam" id="pt-cam">
      <div class="pt-cam__visor" id="pt-visor" hidden>
        <video id="pt-video" playsinline muted></video>
        <i class="pt-cam__marco" aria-hidden="true"></i>
        <span class="pt-cam__cuenta" id="pt-cam-cuenta" aria-hidden="true"></span>
        <span class="pt-cam__guia" aria-hidden="true">Pon el QR del boleto dentro del cuadro</span>
        <div class="pt-cam__res" id="pt-cam-res" role="status" hidden></div>
      </div>
      <div class="pt-cam__acc">
        <button class="pt-btn pt-btn--principal pt-btn--enorme" type="button" id="pt-camara">
          ${ICONO_CAMARA} Escanear boletos</button>
        <button class="pt-btn pt-btn--linea" type="button" id="pt-luz" hidden aria-pressed="false">Linterna</button>
      </div>
      <p class="pt-error" id="pt-cam-error" role="alert" hidden></p>
    </section>

    <section class="pt-res" id="pt-res" aria-live="assertive" aria-atomic="true"></section>

    <section class="pt-sin">
      <button class="pt-btn pt-btn--sin" type="button" id="pt-mas1">+1 sin boleto</button>
      <p class="pt-nota" id="pt-sin-nota"></p>
    </section>

    <section class="pt-buscar">
      <label class="pt-rotulo" for="pt-q">Sin QR: buscar por nombre o código</label>
      <input type="search" id="pt-q" autocomplete="off" autocorrect="off" spellcheck="false"
             placeholder="Nombre o código del boleto" enterkeyhint="search">
      <ul class="pt-hallados" id="pt-hallados"></ul>
    </section>

    <details class="pt-plegable" id="pt-lista">
      <summary></summary>
      <div class="pt-plegable__in"></div>
    </details>

    <details class="pt-plegable" id="pt-mias">
      <summary></summary>
      <div class="pt-plegable__in">
        <ul class="pt-mias" id="pt-mias-lista"></ul>
        <form class="pt-codigo pt-codigo--chico" id="pt-otra" novalidate>
          <label class="pt-rotulo" for="pt-otra-codigo">Agregar otra actividad</label>
          <input id="pt-otra-codigo" autocomplete="off" autocapitalize="characters" autocorrect="off"
                 spellcheck="false" maxlength="9" placeholder="ABCD-2345">
          <button class="pt-btn pt-btn--linea" type="submit" data-texto="Agregar">Agregar</button>
          <p class="pt-error" role="alert" hidden></p>
        </form>
        <p class="pt-nota">Los nombres de las listas se guardan en este teléfono solo
          mientras la clave está vigente: se borran solos a las 6 de la mañana del día
          siguiente a la actividad. Al terminar también puedes quitarlas tú.</p>
      </div>
    </details>`;

  main.querySelector('#pt-camara').addEventListener('click', () => {
    escaner?.activo ? detenerCamara() : abrirCamara();
  });
  main.querySelector('#pt-luz').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;            // después del await ya no existe
    const on = await escaner?.alternarLinterna();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  main.querySelector('#pt-mas1').addEventListener('click', () => {
    const id = puerta.actual();
    if (!id) return;
    const local = puerta.sinBoleto(id, 1);
    mostrarResultado({ tipo: 'sin_boleto', actividadId: id, actividad: puerta.vista(id).actividad, entrada: local });
  });

  let espera;
  main.querySelector('#pt-q').addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(pintarHallados, 120);
  });

  conectarCodigo(main.querySelector('#pt-otra'), () => {
    main.querySelector('#pt-mias').open = false;
    avisar('ok', 'Actividad agregada. Sus boletos ya se reconocen al escanear.');
  });

  pintarRed();
  repintar();
}

function repintar() {
  if (!puerta.claves.length) return mostrarEntrar();
  pintarRed();
  pintarActs();
  pintarActividad();
  pintarResultado();
  pintarSin();
  pintarHallados();
  pintarLista();
  pintarMias();
}

const $ = (sel) => main.querySelector(sel);

/* --------------------------------------------------------- estado de red -- */
function pintarRed() {
  const n = puerta.cola.length;
  if (puerta.enLinea === null && !n) { pildora.hidden = true; return; }
  pildora.hidden = false;
  if (puerta.enLinea === false) {
    pildora.className = 'pt-red pt-red--sin';
    pildora.textContent = n ? `Sin señal · ${n} por subir` : 'Sin señal';
  } else {
    pildora.className = 'pt-red pt-red--si';
    pildora.textContent = n ? `Subiendo ${n}…` : 'En línea';
  }
}

/* ------------------------------------------------- actividades (fichas) -- */
function pintarActs() {
  const caja = $('#pt-acts');
  const acts = puerta.actividades();
  if (acts.length < 2) { caja.hidden = true; caja.innerHTML = ''; return; }
  const actual = puerta.actual();
  caja.hidden = false;
  caja.innerHTML = acts.map(a => {
    const v = puerta.vista(a.actividad_id);
    const es = a.actividad_id === actual;
    return `
      <button class="pt-ficha${es ? ' is-actual' : ''}${a.invalida ? ' is-invalida' : ''}" type="button"
              data-act="${a.actividad_id}" aria-pressed="${puerta.fijada === a.actividad_id}"
              style="--eje:${escapar(a.actividad.eje_color || '#10ABC4')}">
        <span>${escapar(cuando(a.actividad))}</span>
        <b>${escapar(a.actividad.titulo)}</b>
        <small>${a.invalida ? 'clave vencida' : `${v.adentro} / ${v.tope}`}${puerta.fijada === a.actividad_id ? ' · fijada' : ''}</small>
      </button>`;
  }).join('');
  caja.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => puerta.fijar(b.dataset.act)));
}

/** «10:00» si es hoy; «sáb 18 · 10:00» si no. */
function cuando(a) {
  const f = aFecha(a.fecha);
  const hoy = new Date();
  const h = hora(a.hora_inicio) || 'sin hora';
  if (!f || f.toDateString() === hoy.toDateString()) return h;
  return f.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' }).replace('.', '') + ' · ' + h;
}

/* ----------------------------------------------- actividad y contador -- */
function pintarActividad() {
  const caja = $('#pt-act');
  if (!caja) return;
  const id = puerta.actual();
  if (!id) {
    caja.innerHTML = `
      <p class="pt-kicker">Sin lista</p>
      <p class="pt-lead">No se ha podido descargar la lista de ${puerta.claves.length === 1 ? 'la actividad' : 'ninguna actividad'}.
        Revisa la señal: se reintentará sola.</p>
      <button class="pt-btn pt-btn--linea" type="button" data-reintentar>Reintentar ahora</button>`;
    caja.querySelector('[data-reintentar]').addEventListener('click', () => puerta.descargarTodas());
    return;
  }
  const v = puerta.vista(id);
  const a = v.actividad;
  const w = ventana(a), t = Date.now();
  const mini = $('#pt-cam-cuenta');
  if (mini) mini.textContent = `Adentro ${v.adentro}${v.tope ? ' / ' + v.tope : ''}`;
  const momento = puerta.fijada ? 'Fijada' : !w ? '' : t < w.ini - 45 * 60e3 ? 'Próxima' : t > w.fin ? 'Terminó' : 'Ahora';
  const lleno = v.tope && v.adentro >= v.tope;
  const pct = v.tope ? Math.min(100, Math.round(100 * v.adentro / v.tope)) : 0;
  caja.style.setProperty('--eje', a.eje_color || '#10ABC4');
  caja.innerHTML = `
    <p class="pt-kicker">${momento ? `<b>${momento}</b> · ` : ''}${escapar(cuando(a) === hora(a.hora_inicio) ? rangoHoras(a) : cuando(a))}${lugarCorto(a) ? ' · ' + escapar(lugarCorto(a)) : ''}</p>
    <h1 class="pt-act__tit">${escapar(a.titulo)}</h1>
    ${v.invalida ? '<p class="pt-error">La clave de esta actividad venció o la revocaron: ya no registra entradas. Pide un código nuevo.</p>' : ''}
    <div class="pt-cuenta${lleno ? ' pt-cuenta--lleno' : ''}">
      <b>${v.adentro}</b><span>/ ${v.tope || '—'}</span>
      <small>adentro · ${v.capacidad_es_sala ? 'capacidad de la sala' : 'cupo (la sala no tiene capacidad registrada)'}</small>
    </div>
    <div class="pt-barra" role="img" aria-label="${pct} % de la capacidad"><i style="width:${pct}%"></i></div>
    <ul class="pt-datos">
      ${lleno ? '<li class="pt-datos__lleno"><b>Sala llena</b></li>'
              : `<li><b>${Math.max(v.tope - v.adentro, 0)}</b> lugares libres</li>`}
      <li><b>${v.porLlegar}</b> por llegar con boleto</li>
      ${v.enEspera ? `<li><b>${v.enEspera}</b> en lista de espera</li>` : ''}
      <li><b>${v.sinBoleto}</b> sin boleto</li>
    </ul>`;
}

/* --------------------------------------------------------- «+1» y notas -- */
function pintarSin() {
  const id = puerta.actual();
  const btn = $('#pt-mas1');
  btn.disabled = !id || puerta.vista(id)?.invalida;
  const multi = puerta.actividades().length > 1;
  $('#pt-sin-nota').textContent = id
    ? `Para quien llega sin boleto y decides que pase. Si son varias personas, ajusta el número en la tarjeta.${multi ? ` Se cuenta en «${puerta.vista(id).actividad.titulo}».` : ''}`
    : '';
}

/* ================================================================ cámara */

async function abrirCamara() {
  const btn = $('#pt-camara'), err = $('#pt-cam-error');
  if (!btn) return;
  err.hidden = true;
  prepararSonido();
  escaner ||= new Escaner($('#pt-video'), alLeer);
  btn.disabled = true;
  try {
    $('#pt-visor').hidden = false;
    await escaner.iniciar();
  } catch (e) {
    $('#pt-visor').hidden = true;
    btn.disabled = false;
    err.textContent = ERRORES_CAMARA[e.message] || ERRORES_CAMARA.sin_camara;
    err.hidden = false;
    return;
  }
  btn.disabled = false;
  btn.innerHTML = 'Detener cámara';
  btn.classList.remove('pt-btn--principal', 'pt-btn--enorme');
  btn.classList.add('pt-btn--linea');
  $('#pt-luz').hidden = !escaner.hayLinterna;
  // En el celular la cámara queda arriba y el resultado se ve encima de ella.
  $('#pt-cam').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try { candado = await navigator.wakeLock?.request('screen'); } catch (e) { /* no hay */ }
}

function detenerCamara() {
  escaner?.detener();
  quitarDestello();
  candado?.release?.().catch(() => {});
  candado = null;
  const btn = $('#pt-camara');
  if (!btn) return;
  $('#pt-visor').hidden = true;
  $('#pt-luz').hidden = true;
  btn.innerHTML = `${ICONO_CAMARA} Escanear boletos`;
  btn.classList.add('pt-btn--principal', 'pt-btn--enorme');
  btn.classList.remove('pt-btn--linea');
}

const ERRORES_CAMARA = {
  permiso: 'El navegador no dejó usar la cámara. Toca el candado junto a la dirección, permite la cámara y vuelve a intentar.',
  ocupada: 'Otra aplicación está usando la cámara. Ciérrala y vuelve a intentar.',
  sin_lector: 'No se pudo cargar el lector de QR: revisa la señal y vuelve a intentar. Mientras, busca por nombre o código.',
  sin_camara: 'Este navegador no puede usar la cámara aquí. Abre festivaldelconocimiento.org/puerta en Chrome o Safari.',
};

async function alLeer(texto) {
  const t = Date.now();
  if (leyendo || t < pausaHasta) return;
  // El mismo QR frente a la cámara se lee diez veces por segundo: se ignora
  // seis segundos, y todo el tiempo que su tarjeta verde siga a la vista,
  // para no convertir un «Adelante» en «Ya entró». Otro boleto sí se lee
  // aunque no se haya tocado «Siguiente»: reemplaza la tarjeta.
  if (texto === ultimo.texto && (esperaSiguiente || t - ultimo.t < 6000)) return;
  ultimo = { texto, t };
  pausaHasta = t + 900;
  leyendo = true;
  // Se ve al instante que el QR se leyó, aunque la respuesta tarde (red lenta).
  destello({ tono: 'leyendo', icono: '…', tit: 'Leyendo', linea: '' }, 0);
  try { mostrarResultado(await puerta.registrar(texto)); }
  finally { leyendo = false; }
}

/* ============================================================== resultado */

function mostrarResultado(r) {
  res = r;
  // Id de la entrada a la que se refieren los botones de la tarjeta.
  if (r.boleto?.id && !r.entrada) r.entrada = r.boleto.id;
  avisarConSentidos(TONO[r.tipo] || 'mal');
  pintarResultado();
  esperaSiguiente = r.tipo === 'adelante' || r.tipo === 'sin_boleto';
  // Sobre la cámara, solo el aviso; los botones van en la tarjeta de abajo.
  if (escaner?.activo) destello(resumen(r), 3000);
  if (r.tipo !== 'sin_boleto' && !escaner?.activo) $('#pt-res')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const TONO = {
  adelante: 'ok', sin_boleto: 'ok', ya_entro: 'ambar', espera: 'azul', qr_actividad: 'ambar',
  sin_red: 'gris', anulado: 'gris',
};

function pintarResultado() {
  const caja = $('#pt-res');
  if (!caja) return;
  if (!res) { caja.hidden = true; caja.innerHTML = ''; return; }
  const r = res;
  // La tarjeta se pinta con lo que dice la vista en este momento: si se
  // ajustó el número o ya se subió, se nota.
  const v = r.actividadId ? puerta.vista(r.actividadId) : null;
  const b = (r.entrada && v?.boletos.find(x => x.id === puerta.real(r.entrada) || x.id === r.entrada)) || r.boleto || null;
  const multi = puerta.actividades().length > 1;
  const deAct = multi && r.actividad ? `<p class="pt-res__act">${escapar(r.actividad.titulo)} · ${escapar(cuando(r.actividad))}</p>` : '';
  const tono = TONO[r.tipo] || 'mal';
  let html = '';

  if (r.tipo === 'adelante' && b) {
    html = `
      <p class="pt-res__tit">Adelante</p>
      <p class="pt-res__nom">${escapar(b.nombre || 'Sin nombre')}</p>
      <p class="pt-res__det">${lugaresTexto(b.lugares)}${b.codigo ? ' · ' + escapar(codigoLegible(b.codigo)) : ''}${r.admitido ? ' · desde la lista de espera' : ''}</p>
      ${deAct}${b.asistio_en ? controles(b, b.lugares) : ''}`;
  } else if (r.tipo === 'sin_boleto') {
    const n = b?.asistieron ?? 1;
    html = `
      <p class="pt-res__tit">Sin boleto</p>
      <p class="pt-res__nom">${n === 1 ? '1 persona' : `${n} personas`}</p>
      ${deAct}${b ? controles(b, 100) : ''}`;
  } else if (r.tipo === 'ya_entro') {
    const ahoraB = b?.asistio_en ? b : r.boleto;
    html = `
      <p class="pt-res__tit">Ya entró</p>
      <p class="pt-res__nom">${escapar(ahoraB?.nombre || '')}</p>
      <p class="pt-res__det">${ahoraB?.asistio_en ? escapar(aLas(ahoraB.asistio_en)) : ''}${ahoraB?.lugares ? ' · ' + (ahoraB.asistieron != null && ahoraB.asistieron !== ahoraB.lugares ? `${ahoraB.asistieron} de ${ahoraB.lugares}` : lugaresTexto(ahoraB.lugares)) : ''}${r.otroTelefono ? ' · lo marcó otro teléfono' : ''}</p>
      ${deAct}
      ${b?.id && b.asistio_en ? `<div class="pt-res__acc"><button class="pt-mini" type="button" data-deshacer>Fue un error: anular su entrada</button></div>` : ''}`;
  } else if (r.tipo === 'espera' && b) {
    html = `
      <p class="pt-res__tit">Lista de espera</p>
      <p class="pt-res__nom">${escapar(b.nombre || '')}</p>
      <p class="pt-res__det">${lugaresTexto(b.lugares)} · adentro ${v?.adentro ?? '—'} de ${v?.tope || '—'}</p>
      ${deAct}
      <div class="pt-res__acc"><button class="pt-btn pt-btn--blanco" type="button" data-admitir>Dejar pasar</button></div>`;
  } else {
    const [tit, det] = textoDe(r);
    html = `<p class="pt-res__tit">${tit}</p><p class="pt-res__det">${det}</p>`;
  }

  caja.hidden = false;
  caja.className = `pt-res pt-res--${tono}`;
  caja.innerHTML = `${html}<button class="pt-res__cerrar" type="button" data-cerrar aria-label="Cerrar">×</button>`;

  caja.querySelector('[data-cerrar]').addEventListener('click', () => { res = null; pintarResultado(); });
  caja.querySelector('[data-menos]')?.addEventListener('click', () => cambiarCuantos(-1, b));
  caja.querySelector('[data-mas]')?.addEventListener('click', () => cambiarCuantos(+1, b));
  caja.querySelector('[data-siguiente]')?.addEventListener('click', siguiente);
  caja.querySelector('[data-deshacer]')?.addEventListener('click', () => {
    puerta.deshacer(r.actividadId, b.id);
    res = { tipo: 'anulado', nombre: b.nombre, actividadId: r.actividadId };
    esperaSiguiente = false;
    pintarResultado();
    // Se puede volver a escanear el mismo boleto de inmediato.
    ultimo = { texto: '', t: 0 };
    if (escaner?.activo) destello({ tono: 'gris', icono: '↺', tit: 'Anulada', nombre: b.nombre, linea: 'Esa entrada ya no cuenta' }, 1500);
    else quitarDestello();
  });
  caja.querySelector('[data-admitir]')?.addEventListener('click', () => {
    mostrarResultado(puerta.entrar(r.actividadId, b.id, { admitir: true }));
  });
}

/* ---------------------------------------------- resultado sobre la cámara -- */

/**
 * El resultado en grande ENCIMA de la cámara: en el celular la cámara ocupa la
 * pantalla y la tarjeta queda abajo, fuera de la vista. Se quita sola (o con
 * un toque) para seguir escaneando; la tarjeta de abajo conserva los botones.
 */
let relojDestello = null;
function destello(d, ms) {
  const caja = $('#pt-cam-res');
  const visor = $('#pt-visor');
  if (!caja || !visor) return;
  clearTimeout(relojDestello);
  caja.className = `pt-cam__res pt-cam__res--${d.tono}`;
  caja.innerHTML = `
    <span class="pt-cam__icono" aria-hidden="true">${d.icono}</span>
    <b>${escapar(d.tit)}</b>
    ${d.nombre ? `<span class="pt-cam__nom">${escapar(d.nombre)}</span>` : ''}
    ${d.linea ? `<span>${escapar(d.linea)}</span>` : ''}`;
  caja.hidden = false;
  visor.dataset.tono = d.tono;
  caja.onclick = () => quitarDestello();
  if (ms) relojDestello = setTimeout(quitarDestello, ms);
}

/** «Siguiente»: despeja la cámara y la tarjeta, listo para el próximo boleto. */
function siguiente() {
  quitarDestello();
  esperaSiguiente = false;
  res = null;
  pintarResultado();
  // Un respiro para retirar el boleto de enfrente de la cámara.
  pausaHasta = Date.now() + 600;
}

function quitarDestello() {
  clearTimeout(relojDestello);
  const caja = $('#pt-cam-res');
  if (caja) caja.hidden = true;
  const visor = $('#pt-visor');
  if (visor) delete visor.dataset.tono;
}

/** Lo esencial de un resultado, para leerlo de un vistazo sobre la cámara. */
function resumen(r) {
  const tono = TONO[r.tipo] || 'mal';
  const b = r.boleto || {};
  const lugares = b.lugares ? lugaresTexto(b.lugares) : '';
  switch (r.tipo) {
    case 'adelante':
      return { tono, icono: '✓', tit: 'Adelante', nombre: b.nombre, linea: lugares };
    case 'sin_boleto':
      return { tono, icono: '✓', tit: 'Sin boleto', linea: '1 persona' };
    case 'ya_entro':
      return { tono, icono: '!', tit: 'Ya entró', nombre: b.nombre,
               linea: [b.asistio_en ? aLas(b.asistio_en) : '', lugares].filter(Boolean).join(' · ') };
    case 'espera':
      return { tono, icono: '⏳', tit: 'Lista de espera', nombre: b.nombre, linea: `${lugares} · «Dejar pasar» abajo` };
    case 'otra_actividad':
      return { tono, icono: '✕', tit: 'Otra actividad', linea: r.actividad ? `Es para «${r.actividad.titulo}» · ${cuando(r.actividad)}` : '' };
    default: {
      const [tit] = textoDe(r);
      return { tono, icono: tono === 'gris' ? '?' : tono === 'ambar' ? '!' : '✕', tit,
               linea: { cancelado: 'Su lugar quedó libre', no_existe: 'Revisa el código', no_es_boleto: 'Ese QR no es de un boleto',
                        qr_actividad: 'Es para pedir boleto, no para entrar', sin_red: 'Búscalo por nombre abajo' }[r.tipo] || '' };
    }
  }
}

/**
 * Bajo una entrada válida: «Entraron − 3 + de 4» (solo si hay más de un
 * lugar) y los dos botones, Deshacer a la izquierda y Siguiente a la derecha.
 */
function controles(b, max) {
  const n = b.asistieron ?? b.lugares;
  const sin = !b.nombre;
  return `
    ${max > 1 ? `
    <div class="pt-paso">
      <span>${sin ? 'Personas' : 'Entraron'}</span>
      <button type="button" data-menos aria-label="Una persona menos"${n <= 1 ? ' disabled' : ''}>−</button>
      <b>${n}</b>
      <button type="button" data-mas aria-label="Una persona más"${n >= max ? ' disabled' : ''}>+</button>
      ${sin ? '' : `<span>de ${b.lugares}</span>`}
    </div>` : ''}
    <p class="pt-res__estado">${b.pendiente ? 'Registrada en el teléfono · pendiente de subir' : 'Registrada'}</p>
    <div class="pt-res__botones">
      <button class="pt-res__deshacer" type="button" data-deshacer>Deshacer</button>
      <button class="pt-res__siguiente" type="button" data-siguiente>Siguiente</button>
    </div>`;
}

function cambiarCuantos(d, b) {
  const n = (b.asistieron ?? b.lugares) + d;
  const max = !b.nombre ? 100 : b.lugares;
  if (n < 1 || n > max) return;
  puerta.ajustar(res.actividadId, b.id, n);
}

function textoDe(r) {
  const a = r.actividad;
  switch (r.tipo) {
    case 'otra_actividad':
      return ['Otra actividad', a
        ? `Este boleto es para <b>${escapar(a.titulo)}</b>: ${escapar(cuando(a))}${lugarCorto(a) ? ' · ' + escapar(lugarCorto(a)) : ''}.`
        : 'Este boleto es de otra actividad.'];
    case 'cancelado':    return ['Cancelado', 'Ese boleto se canceló y su lugar quedó libre.'];
    case 'no_existe':    return ['No es válido', 'Ese boleto no existe. Revisa el código o busca a la persona por su nombre.'];
    case 'no_es_boleto': return ['No es un boleto', 'Ese QR no es de un boleto del festival.'];
    case 'qr_actividad': return ['Es el QR del cartel', 'Sirve para pedir boleto, no para entrar. Pide a la persona su boleto o su nombre.'];
    case 'sin_red':      return ['Sin señal', 'No está en la lista guardada y no hay red para preguntar. Búscalo por nombre o espera la señal.'];
    case 'sin_permiso':  return ['Clave vencida', 'La clave de esta actividad ya no es válida. Pide un código nuevo a quien coordina.'];
    case 'sin_claves':   return ['Sin actividad', 'Agrega el código de puerta de una actividad.'];
    case 'anulado':      return ['Entrada anulada', `${escapar(r.nombre || 'La entrada')} ya no cuenta como adentro.`];
    case 'corregido':    return [r.titulo, r.detalle];
    default:             return ['No se pudo registrar', 'Intenta de nuevo.'];
  }
}

/* ------------------------------------------- correcciones de la base -- */
function alAviso(a) {
  // ¿Es el boleto que está en la tarjeta?
  const enTarjeta = res && res.actividadId === a.actividadId && a.boletoId
    && (res.entrada === a.boletoId || puerta.real(res.entrada) === puerta.real(a.boletoId));
  if (a.tipo === 'ya_entro') {
    if (enTarjeta) {
      res = { ...res, tipo: 'ya_entro', otroTelefono: true };
      avisarConSentidos('ambar'); pintarResultado();
      if (escaner?.activo) destello({ tono: 'ambar', icono: '!', tit: 'Ya había entrado', nombre: a.nombre, linea: `${aLas(a.hora)} · otro teléfono` }, 4000);
    }
    else avisar('ambar', `${a.nombre || 'Un boleto'} ya había entrado ${aLas(a.hora)}: lo marcó otro teléfono.`);
  } else if (a.tipo === 'sin_permiso') {
    const act = puerta.listas[a.actividadId]?.actividad?.titulo || 'una actividad';
    avisar('mal', `La clave de «${act}» venció o la revocaron.${a.perdidas ? ` ${a.perdidas === 1 ? 'Una entrada no se pudo subir' : `${a.perdidas} entradas no se pudieron subir`}.` : ''} Pide un código nuevo.`);
  } else if (['cancelado', 'no_existe', 'espera'].includes(a.tipo)) {
    const txt = { cancelado: 'el boleto estaba cancelado', no_existe: 'el boleto ya no existe', espera: 'el boleto está en lista de espera' }[a.tipo];
    if (enTarjeta) {
      res = { tipo: 'corregido', titulo: 'Corrección', detalle: `La base dice que ${txt}: la entrada de ${escapar(a.nombre || 'esa persona')} no se registró.` };
      avisarConSentidos('mal'); pintarResultado();
      if (escaner?.activo) destello({ tono: 'mal', icono: '✕', tit: 'Corrección', nombre: a.nombre, linea: txt }, 4000);
    } else avisar('mal', `La entrada de ${a.nombre || 'un boleto'} no se registró: ${txt}.`);
  }
}

function avisar(tono, texto) {
  const caja = $('#pt-aviso');
  if (!caja) return;
  caja.className = `pt-aviso pt-aviso--${tono}`;
  caja.textContent = texto;
  caja.hidden = false;
  clearTimeout(avisar.reloj);
  avisar.reloj = setTimeout(() => { caja.hidden = true; }, 9000);
}

/* ---------------------------------------------------- sonido y vibración -- */
function prepararSonido() {
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); }
  catch (e) { audio = null; }
}

function avisarConSentidos(tono) {
  const patron = { ok: [70], ambar: [90, 80, 90], azul: [90, 80, 90], gris: [40], mal: [300] }[tono];
  try { navigator.vibrate?.(patron); } catch (e) { /* sin vibración */ }
  if (!audio) return;
  const notas = { ok: [880], ambar: [660, 520], azul: [660, 520], gris: [440], mal: [220, 180] }[tono] || [440];
  let t = audio.currentTime;
  for (const f of notas) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = f; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(audio.destination);
    o.start(t); o.stop(t + 0.15);
    t += 0.17;
  }
}

/* ================================================================ buscar */
function pintarHallados() {
  const q = $('#pt-q')?.value || '';
  const ul = $('#pt-hallados');
  if (!ul) return;
  if (q.trim().length < 2) { ul.innerHTML = ''; return; }
  const hallados = puerta.buscar(q);
  const multi = puerta.actividades().length > 1;
  ul.innerHTML = hallados.length ? hallados.map(({ v, b }) => {
    const estado = b.asistio_en ? `Entró ${escapar(aLas(b.asistio_en))}` : b.estado === 'espera' ? 'En lista de espera' : 'Sin entrar';
    const accion = b.asistio_en ? ''
      : `<button class="pt-btn ${b.estado === 'espera' ? 'pt-btn--linea' : 'pt-btn--principal'} pt-btn--chico" type="button"
                 data-entrar="${b.id}" data-act="${v.id}" data-admitir="${b.estado === 'espera'}">${b.estado === 'espera' ? 'Dejar pasar' : 'Registrar entrada'}</button>`;
    return `
      <li class="${b.asistio_en ? 'is-dentro' : ''}">
        <div>
          <b>${escapar(b.nombre)}</b>
          <span>${lugaresTexto(b.lugares)} · ${escapar(codigoLegible(b.codigo))} · ${estado}</span>
          ${multi ? `<span class="pt-hallados__act">${escapar(v.actividad.titulo)} · ${escapar(cuando(v.actividad))}</span>` : ''}
        </div>
        ${accion}
      </li>`;
  }).join('') : '<li class="pt-hallados__nada">Nadie con ese nombre o código en las listas de este teléfono.</li>';
  ul.querySelectorAll('[data-entrar]').forEach(btn => btn.addEventListener('click', () => {
    const r = puerta.entrar(btn.dataset.act, btn.dataset.entrar, { admitir: btn.dataset.admitir === 'true' });
    $('#pt-q').value = '';
    mostrarResultado(r);
    $('#pt-res').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
}

/* ======================================================= quiénes entraron */
function pintarLista() {
  const det = $('#pt-lista');
  const id = puerta.actual();
  if (!det || !id) { if (det) det.hidden = true; return; }
  det.hidden = false;
  const v = puerta.vista(id);
  const dentro = v.boletos.filter(b => b.asistio_en && b.estado !== 'cancelado')
    .sort((x, y) => new Date(y.asistio_en) - new Date(x.asistio_en));
  det.querySelector('summary').innerHTML =
    `Quiénes entraron · <b>${v.adentro}</b> ${v.adentro === 1 ? 'persona' : 'personas'}`;
  det.querySelector('.pt-plegable__in').innerHTML = `
    <p class="pt-nota">${v.conBoleto} con boleto (${v.boletosAdentro} ${v.boletosAdentro === 1 ? 'boleto' : 'boletos'}) · ${v.sinBoleto} sin boleto.
      En «${escapar(v.actividad.titulo)}».</p>
    ${dentro.length ? `<ol class="pt-entradas">${dentro.map(b => `
      <li>
        <time>${escapar(aLas(b.asistio_en).replace(/^a las? /, ''))}</time>
        <span>${escapar(b.nombre || 'Sin boleto')}</span>
        <b>${b.nombre && b.asistieron !== b.lugares ? `${b.asistieron} de ${b.lugares}` : b.asistieron}</b>
        ${b.pendiente ? '<small>por subir</small>' : ''}
      </li>`).join('')}</ol>` : '<p class="pt-nota">Todavía no entra nadie.</p>'}`;
}

/* ================================================= actividades del teléfono */
function pintarMias() {
  const det = $('#pt-mias');
  if (!det) return;
  const acts = puerta.claves.map(c => ({ c, a: puerta.listas[c.actividad_id]?.actividad }));
  det.querySelector('summary').textContent =
    `Actividades en este teléfono (${acts.length}) · agregar otra`;
  const ul = $('#pt-mias-lista');
  ul.innerHTML = acts.map(({ c, a }) => {
    const pend = puerta.pendientesDe(c.actividad_id);
    return `
      <li data-id="${c.actividad_id}">
        <div>
          <b>${escapar(a?.titulo || 'Lista sin descargar')}</b>
          <span>${a ? escapar(cuando(a)) : ''}${c.etiqueta ? ' · ' + escapar(c.etiqueta) : ''}${c.invalida ? ' · clave vencida' : ''}${pend ? ` · ${pend} por subir` : ''}</span>
        </div>
        <button class="pt-mini" type="button" data-quitar data-pend="${pend}">Quitar</button>
      </li>`;
  }).join('');
  ul.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => {
    const pend = +b.dataset.pend;
    if (!b.dataset.confirmar) {
      b.dataset.confirmar = '1';
      b.textContent = pend ? `Hay ${pend} sin subir. ¿Quitar?` : '¿Quitar?';
      return;
    }
    const id = b.closest('li').dataset.id;
    if (res?.actividadId === id) res = null;
    puerta.quitar(id);
  }));
}

/* ================================================================ íconos */
const ICONO_CAMARA = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
  <rect x="7" y="7" width="10" height="10" rx="1"/></svg>`;

/* ================================================================ arranque */
// Al final del archivo: usa constantes (íconos, mensajes) declaradas arriba.

// Para que la página abra sin señal si el navegador se cerró (puerta/sw.js).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/puerta/sw.js', { scope: '/puerta/' }).catch(() => {});
}

puerta.cargar();
puerta.on('cambio', () => { if (pantalla === 'puerta') repintar(); });
puerta.on('red', pintarRed);
puerta.on('aviso', alAviso);

if (puerta.claves.length) mostrarPuerta(); else mostrarEntrar();
puerta.descargarTodas().then(() => puerta.sincronizar());

// Reintentos: la cola cada 10 s; las listas (para ver lo que marcan otros
// teléfonos) cada minuto, solo si no falta nada por subir.
setInterval(() => { if (puerta.cola.length) puerta.sincronizar(); }, 10e3);
setInterval(async () => {
  if (puerta.purgar()) { puerta.emitir('cambio'); if (!puerta.claves.length) return mostrarEntrar(); }
  if (!puerta.cola.length && document.visibilityState === 'visible') await puerta.descargarTodas();
}, 60e3);
// Lo que depende de la hora («Ahora», «Próxima») se repinta solo.
setInterval(() => { if (pantalla === 'puerta') pintarActividad(); }, 30e3);

document.addEventListener('keydown', (ev) => {
  if (esperaSiguiente && ev.key === 'Enter' && !ev.target.closest?.('input')) { ev.preventDefault(); siguiente(); }
});

window.addEventListener('online', () => { puerta.sincronizar().then(() => puerta.descargarTodas()); });
window.addEventListener('offline', () => puerta.marcarRed(false));

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') {
    camaraAntes = !!escaner?.activo;
    if (camaraAntes) detenerCamara();
  } else {
    if (camaraAntes) abrirCamara();
    puerta.sincronizar();
  }
});
