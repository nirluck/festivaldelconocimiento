/* ============================================================================
   BOLETOS · «CONSIGUE TU BOLETO»
   ----------------------------------------------------------------------------
   Un solo componente para las dos entradas: la página /b/<slug> (a donde
   llevan los QR) y el diálogo de la ficha del programa.

     montarFormulario(caja, actividad, { origen, alEmitir })

   «actividad» es una fila de vista_programa: trae acceso, lugares_max,
   disponibles, estado_boletos y boletos_desde.

   El formulario es corto a propósito (PLAN.md, fase F): cada campo de más
   pierde gente. Nombre, correo, lugares, edad y ocupación; la procedencia es
   opcional.
   ========================================================================== */

import { opcionesFormulario, solicitarBoleto, mensaje } from './api.js';
import { guardarBoleto, boletoDeActividad } from './almacen.js';
import { htmlBoleto, htmlAcciones, conectarAcciones } from './tarjeta.js';
import { escapar, lugaresTexto, fechaHoraTexto } from './util.js';

let _n = 0;

export async function montarFormulario(caja, act, op = {}) {
  const origen = op.origen || 'otro';

  if (act.acceso === 'libre') {
    caja.innerHTML = `<div class="bf-nota">
      <h2>Entrada libre</h2>
      <p>Esta actividad no necesita boleto: llega a la sede a la hora indicada.
         El cupo lo marca el espacio, así que conviene llegar con tiempo.</p></div>`;
    return;
  }

  if (act.estado_boletos === 'pronto') {
    const f = fechaHoraTexto(act.boletos_desde);
    caja.innerHTML = `<div class="bf-nota">
      <h2>Los boletos se abren pronto</h2>
      <p>Podrás conseguir tu boleto a partir del <b>${escapar(f)}</b>.
         Guarda esta página y vuelve ese día.</p></div>`;
    return;
  }

  if (act.estado_boletos === 'cerrado') {
    caja.innerHTML = `<div class="bf-nota">
      <h2>Ya no se entregan boletos</h2>
      <p>El registro para esta actividad cerró. Si sobran lugares, en la
         entrada se ocupan por orden de llegada.</p></div>`;
    return;
  }

  // ¿Este teléfono ya tiene boleto para esta actividad?
  const previo = boletoDeActividad(act.slug);
  if (previo && !op.forzar) {
    caja.innerHTML = `<div class="bf-nota bf-nota--ok">
      <h2>${previo.estado === 'espera' ? 'Ya estás en la lista de espera' : 'Ya tienes boleto'}</h2>
      <p>En este teléfono hay ${previo.estado === 'espera' ? 'un lugar en la lista de espera' : 'un boleto'}
         para esta actividad a nombre de <b>${escapar(previo.nombre)}</b>
         (${escapar(lugaresTexto(previo.lugares || 1))}).</p>
      <div class="bf-nota__botones">
        <a class="pg-btn pg-btn--lleno" href="/boleto/#${escapar(previo.token)}">Ver mi boleto</a>
        <button class="pg-btn" type="button" data-otro>Pedir otro para otra persona</button>
      </div></div>`;
    caja.querySelector('[data-otro]').addEventListener('click', () =>
      montarFormulario(caja, act, { ...op, forzar: true }));
    return;
  }

  caja.innerHTML = '<p class="bf-cargando">Preparando el formulario…</p>';
  let opciones;
  try {
    opciones = await opcionesFormulario();
  } catch (e) {
    caja.innerHTML = `<p class="pg-error">${escapar(mensaje(e))}</p>`;
    return;
  }

  pintarFormulario(caja, act, opciones, { ...op, origen }, act.estado_boletos === 'agotado');
}

/* ========================================================================== */

function disponibilidad(act, espera) {
  if (act.acceso === 'registro') {
    return `<p class="bf__disp">Entrada libre. <b>Confirma tu asistencia</b> para
      que sepamos cuánta gente esperar.</p>`;
  }
  if (espera) {
    return `<p class="bf__disp bf__disp--agotado"><b>Se terminaron los lugares.</b>
      Anótate en la lista de espera: si alguien cancela, o si sobran lugares en la
      entrada, pasan primero quienes están en ella.</p>`;
  }
  // Sin el número de lugares: no es asunto del público. Cuando quedan pocos se
  // avisa, sin decir cuántos.
  const pocos = act.estado_boletos === 'pocos';
  return `<p class="bf__disp${pocos ? ' bf__disp--pocos' : ''}">
    Boleto gratuito${pocos ? ' · <b>últimos lugares</b>' : ''}</p>`;
}

function opcionesHtml(lista, placeholder) {
  return `<option value="">${escapar(placeholder)}</option>`
    + lista.map(v => `<option value="${escapar(v)}">${escapar(v)}</option>`).join('');
}

function pintarFormulario(caja, act, opciones, op, espera) {
  const id = 'bf' + (++_n);
  const max = Math.max(1, act.lugares_max || 1);
  // Con boleto se ofrecen solo los lugares que quedan; en espera, los del máximo.
  const tope = (act.acceso === 'boleto' && !espera && act.disponibles > 0)
    ? Math.min(max, act.disponibles) : max;

  caja.innerHTML = `
  <form class="bf" novalidate>
    ${disponibilidad(act, espera)}

    <div class="bf__campo">
      <label for="${id}-nombre">Tu nombre</label>
      <input id="${id}-nombre" name="nombre" autocomplete="name" maxlength="120" required>
    </div>

    <div class="bf__campo">
      <label for="${id}-correo">Correo electrónico</label>
      <input id="${id}-correo" name="correo" type="email" autocomplete="email" inputmode="email"
             maxlength="254" required aria-describedby="${id}-correo-ayuda">
      <small id="${id}-correo-ayuda">Sirve para que cada persona tenga un solo boleto y para
        encontrar el tuyo si lo pierdes. No te mandaremos publicidad.</small>
    </div>

    ${max > 1 ? `
    <fieldset class="bf__lugares">
      <legend>¿Cuántos lugares?</legend>
      <div class="bf__segmentos">
        ${Array.from({ length: max }, (_, i) => i + 1).map(n => `
        <label>
          <input type="radio" name="lugares" value="${n}"${n === 1 ? ' checked' : ''}${n > tope ? ' disabled' : ''}>
          <span>${n}</span>
        </label>`).join('')}
      </div>
      <small>Tú y quienes vienen contigo. De tus acompañantes no pedimos ningún dato.</small>
    </fieldset>` : ''}

    <div class="bf__dos">
      <div class="bf__campo">
        <label for="${id}-edad">Tu edad</label>
        <select id="${id}-edad" name="edad" required>${opcionesHtml(opciones.edad, 'Elige…')}</select>
      </div>
      <div class="bf__campo">
        <label for="${id}-ocupacion">Ocupación</label>
        <select id="${id}-ocupacion" name="ocupacion" required>${opcionesHtml(opciones.ocupacion, 'Elige…')}</select>
      </div>
    </div>

    ${opciones.procedencia.length ? `
    <div class="bf__campo">
      <label for="${id}-procedencia">¿Desde dónde vienes? <span class="bf__opcional">Opcional</span></label>
      <select id="${id}-procedencia" name="procedencia">${opcionesHtml(opciones.procedencia, 'Prefiero no decir')}</select>
    </div>` : ''}

    <!-- Campo trampa: invisible para personas, irresistible para robots. -->
    <div class="bf__trampa" aria-hidden="true">
      <label>Sitio web <input name="sitio" tabindex="-1" autocomplete="off"></label>
    </div>

    <label class="bf__consent">
      <input type="checkbox" name="consiento" required aria-labelledby="${id}-consent">
      <span id="${id}-consent">Leí el <a href="/privacidad/" target="_blank" rel="noopener">aviso de privacidad</a>
        y acepto que mis datos se usen para emitir y administrar mi boleto.
        Si soy menor de edad, cuento con la autorización de mi madre, padre o tutor.</span>
    </label>

    <p class="bf__error" role="alert" hidden></p>

    <button class="pg-btn pg-btn--lleno bf__enviar" type="submit">
      ${espera ? 'Anotarme en la lista de espera'
        : act.acceso === 'registro' ? 'Confirmar mi asistencia' : 'Conseguir mi boleto'}
    </button>
  </form>`;

  const form = caja.querySelector('form');
  const errorCaja = form.querySelector('.bf__error');
  const boton = form.querySelector('.bf__enviar');
  const textoBoton = boton.textContent;

  const error = (texto, campo) => {
    errorCaja.textContent = texto;
    errorCaja.hidden = false;
    form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    if (campo) {
      const el = form.elements[campo];
      const foco = el instanceof RadioNodeList ? el[0] : el;
      if (foco && foco.setAttribute) {
        if (!(el instanceof RadioNodeList)) foco.setAttribute('aria-invalid', 'true');
        foco.focus();
      }
    } else {
      errorCaja.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  form.addEventListener('input', () => { errorCaja.hidden = true; });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    if (d.sitio) return;   // robot: no se manda nada y no se le explica por qué

    const nombre = (d.nombre || '').trim();
    const correo = (d.correo || '').trim();
    if (nombre.length < 2) return error('Escribe tu nombre para que podamos identificar tu boleto en la entrada.', 'nombre');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return error('Revisa tu correo: parece que le falta algo.', 'correo');
    if (!d.edad) return error('Elige tu rango de edad.', 'edad');
    if (!d.ocupacion) return error('Elige tu ocupación.', 'ocupacion');
    if (!form.elements.consiento.checked) return error('Para darte tu boleto necesitamos que aceptes el aviso de privacidad.', 'consiento');

    await enviar({
      slug: act.slug, nombre, correo,
      edad: d.edad, ocupacion: d.ocupacion, procedencia: d.procedencia || null,
      lugares: Number(d.lugares || 1), origen: op.origen, consiento: true, espera,
    });
  });

  async function enviar(datos) {
    boton.disabled = true;
    boton.textContent = datos.espera ? 'Anotándote…' : 'Un momento…';
    let r;
    try {
      r = await solicitarBoleto(datos);
    } catch (e) {
      boton.disabled = false; boton.textContent = textoBoton;
      return error(mensaje(e));
    }
    boton.disabled = false; boton.textContent = textoBoton;

    if (r.ok) {
      const b = { ...r };
      const guardado = guardarBoleto(b);
      pintarResultado(caja, b, guardado, op);
      if (op.alEmitir) op.alEmitir(b);
      return;
    }

    if (r.error === 'agotado' && !datos.espera) {
      if (r.disponibles > 0) {
        // Quedan menos de los que pidió: se ajusta la elección.
        form.querySelectorAll('input[name="lugares"]').forEach(i => {
          i.disabled = Number(i.value) > r.disponibles;
          if (i.disabled && i.checked) i.checked = false;
        });
        const primero = form.querySelector('input[name="lugares"]:not(:disabled)');
        if (primero && !form.querySelector('input[name="lugares"]:checked')) primero.checked = true;
        return error(mensaje(r), 'lugares');
      }
      // Se agotó mientras llenaba el formulario: se ofrece la lista de espera
      // sin volver a pedir los datos.
      ofrecerEspera(datos);
      return;
    }

    const campos = { nombre: 'nombre', correo: 'correo', edad: 'edad', ocupacion: 'ocupacion',
                     consentimiento: 'consiento', lugares: 'lugares', duplicado: 'correo',
                     empalme: 'correo', tope: 'correo' };
    error(mensaje(r), campos[r.error]);
  }

  function ofrecerEspera(datos) {
    errorCaja.hidden = true;
    const panel = document.createElement('div');
    panel.className = 'bf-espera';
    panel.innerHTML = `
      <p><b>Se acaban de terminar los lugares.</b> ¿Te anotamos en la lista de
         espera con los mismos datos? Si alguien cancela, o si sobran lugares en la
         entrada, pasan primero quienes están en ella.</p>
      <div>
        <button class="pg-btn pg-btn--lleno" type="button" data-si>Sí, anotarme</button>
        <button class="pg-btn" type="button" data-no>No, gracias</button>
      </div>`;
    boton.hidden = true;
    form.appendChild(panel);
    panel.querySelector('[data-si]').focus();
    panel.querySelector('[data-no]').addEventListener('click', () => {
      caja.innerHTML = `<div class="bf-nota"><h2>Entendido</h2>
        <p>No se guardó nada. <a href="/programa/">Mira qué más hay en el programa</a>:
           muchas actividades son de entrada libre.</p></div>`;
    });
    panel.querySelector('[data-si]').addEventListener('click', () => {
      panel.remove();
      boton.hidden = false;
      espera = true;
      enviar({ ...datos, espera: true });
    });
  }
}

/* ========================================================================== */

function pintarResultado(caja, b, guardado, op) {
  const titulo = b.estado === 'espera'
    ? 'Quedaste en la lista de espera'
    : b.actividad?.acceso === 'registro' ? '¡Listo! Confirmaste tu asistencia' : '¡Listo! Este es tu boleto';

  caja.innerHTML = `
    <div class="bf-listo" tabindex="-1">
      <h2>${escapar(titulo)}</h2>
      <p>${guardado
        ? 'Quedó guardado en este teléfono, en <a href="/mis-boletos/">Mis boletos</a>. Para no depender de él, guárdalo también como imagen.'
        : '<b>Este navegador no permite guardarlo.</b> Usa «Guardar imagen» o copia la liga antes de salir de esta página.'}</p>
    </div>
    ${htmlBoleto(b)}
    ${htmlAcciones(b)}`;

  conectarAcciones(caja, b, {
    alCambiar: (nuevo) => pintarResultado(caja, nuevo, true, op),
  });

  // En /b/ la dirección pasa a ser la del boleto: si la persona recarga o
  // guarda la página en favoritos, vuelve a su boleto y no a un formulario.
  if (op.cambiarURL) history.replaceState(null, '', '/boleto/#' + b.token);

  const listo = caja.querySelector('.bf-listo');
  listo.focus({ preventScroll: true });
  listo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
