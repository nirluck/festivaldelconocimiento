/* ============================================================================
   /mis-boletos/ · LOS BOLETOS DE ESTE TELÉFONO
   ----------------------------------------------------------------------------
   Sin cuenta no hay «mis boletos» en el servidor: la lista vive en el
   navegador (almacen.js). Se pinta de inmediato con lo guardado y luego se
   pregunta a la base por cada boleto, para reflejar cancelaciones y entradas.
   ========================================================================== */

import { montarCabecera } from '../cabecera.js';
import { estiloEje } from '../color.js';
import { verBoleto, recuperarBoletos, mensaje } from './api.js';
import { boletosGuardados, guardarBoleto, olvidarBoleto } from './almacen.js';
import { escapar, diaLargo, rangoHoras, codigoLegible, lugaresTexto, aFecha,
         htmlNacimiento, leerNacimiento } from './util.js';

const pagina = document.getElementById('pagina');

montarCabecera();
pintar(boletosGuardados());
actualizar();

async function actualizar() {
  const lista = boletosGuardados();
  if (!lista.length) return;
  const resultados = await Promise.allSettled(lista.map(b => verBoleto(b.token)));
  let cambio = false;
  resultados.forEach((res, i) => {
    if (res.status !== 'fulfilled') return;          // sin red: se queda la copia
    const b = lista[i];
    if (!res.value.ok) { olvidarBoleto(b.token); cambio = true; return; }
    const r = res.value;
    if (r.estado !== b.estado || r.asistio_en !== b.asistio_en) cambio = true;
    guardarBoleto({ ...r, token: b.token });
  });
  if (cambio) pintar(boletosGuardados());
}

function pasado(b) {
  const f = aFecha(b.actividad?.fecha);
  if (!f) return false;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return f < hoy;
}

function pintar(lista) {
  const vigentes  = lista.filter(b => b.estado !== 'cancelado' && !pasado(b));
  const anteriores = lista.filter(b => b.estado === 'cancelado' || pasado(b));

  pagina.innerHTML = `
    <header class="pg-hero">
      <div class="pg-wrap pg-hero__in">
        <p class="pg-kicker">Festival del Conocimiento</p>
        <h1>Mis boletos</h1>
        <p class="pg-hero__lede">Los boletos que pediste desde este teléfono. Si pediste
          alguno en otro lado, abajo puedes recuperarlo con tu nombre y fecha de nacimiento.</p>
      </div>
    </header>
    <div class="pg-wrap bb-envoltura bb-envoltura--lista">
      ${lista.length ? '' : `
      <div class="bf-nota">
        <h2>Todavía no hay boletos aquí</h2>
        <p>Cuando consigas un boleto desde este teléfono aparecerá en esta lista.
           Algunas actividades del programa piden boleto gratuito para controlar el cupo.</p>
        <div class="bf-nota__botones"><a class="pg-btn pg-btn--lleno" href="/programa/">Ver el programa</a></div>
      </div>`}

      ${vigentes.length ? `<ul class="mb-lista">${vigentes.map(fila).join('')}</ul>` : ''}

      ${anteriores.length ? `
      <h2 class="mb-sub">Cancelados y anteriores</h2>
      <ul class="mb-lista mb-lista--apagada">${anteriores.map(fila).join('')}</ul>` : ''}

      <section class="mb-recuperar bf-nota" id="recuperar" aria-labelledby="recuperar-tit">
        <h2 id="recuperar-tit">¿Perdiste un boleto o lo pediste en otro teléfono?</h2>
        <p>Escribe tu nombre y tu fecha de nacimiento tal como los pusiste al pedirlo.
           Te mostramos tus boletos vigentes y quedan guardados en este teléfono.</p>
        <form class="bf" id="rec-forma" novalidate>
          <div class="bf__campo">
            <label for="rec-nombre">Tu nombre</label>
            <input id="rec-nombre" name="nombre" autocomplete="name" maxlength="120">
          </div>
          ${htmlNacimiento('rec')}
          <p class="bf__error" id="rec-aviso" role="status" hidden></p>
          <button class="pg-btn pg-btn--lleno bf__enviar" type="submit">Buscar mis boletos</button>
        </form>
        <p class="bb-mas">También puedes decir tu nombre en la entrada de la actividad:
          allá tienen la lista.</p>
      </section>
    </div>`;

  conectarRecuperar();
}

function conectarRecuperar() {
  const forma = document.getElementById('rec-forma');
  const aviso = document.getElementById('rec-aviso');
  const boton = forma.querySelector('button');
  const decir = (texto, bien) => {
    aviso.textContent = texto;
    aviso.className = bien ? 'bf-exito' : 'bf__error';
    aviso.hidden = false;
  };

  forma.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(forma));
    const nombre = (d.nombre || '').trim();
    const nacimiento = leerNacimiento(d);
    if (nombre.length < 2) { forma.elements.nombre.focus(); return decir('Escribe tu nombre.'); }
    if (!nacimiento) { forma.elements.dia.focus(); return decir('Elige tu fecha de nacimiento completa: día, mes y año.'); }

    boton.disabled = true;
    boton.textContent = 'Buscando…';
    let r;
    try {
      r = await recuperarBoletos(nombre, nacimiento);
    } catch (e) {
      r = null;
      decir(mensaje(e));
    }
    boton.disabled = false;
    boton.textContent = 'Buscar mis boletos';
    if (!r) return;
    if (!r.ok) return decir(mensaje(r));
    if (!r.boletos.length) {
      return decir('No encontramos boletos vigentes con ese nombre y fecha. Revisa que el nombre '
        + 'esté escrito igual que cuando lo pediste (con o sin segundo apellido, por ejemplo).');
    }
    r.boletos.forEach(b => guardarBoleto(b));
    pintar(boletosGuardados());
    const n = r.boletos.length;
    const nuevo = document.getElementById('rec-aviso');
    nuevo.textContent = n === 1 ? 'Encontramos tu boleto: ya está arriba, en tu lista.'
                                : `Encontramos ${n} boletos: ya están arriba, en tu lista.`;
    nuevo.className = 'bf-exito';
    nuevo.hidden = false;
    document.querySelector('.mb-lista')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function fila(b) {
  const a = b.actividad || {};
  const etiqueta = b.estado === 'cancelado' ? 'Cancelado'
    : b.asistio_en ? 'Usado'
    : b.estado === 'espera' ? 'Lista de espera'
    : pasado(b) ? 'Sin usar' : '';
  return `
  <li>
    <a class="mb-bol" href="/boleto/#${escapar(b.token)}" style="${estiloEje(a.eje_color)}">
      <span class="mb-bol__fecha">
        <b>${escapar(a.fecha ? String(aFecha(a.fecha)?.getDate() ?? '') : '—')}</b>
        <small>${escapar(a.fecha ? aFecha(a.fecha).toLocaleDateString('es-MX', { month: 'short' }).replace('.', '') : '')}</small>
      </span>
      <span class="mb-bol__cuerpo">
        <b class="mb-bol__tit">${escapar(a.titulo || 'Actividad')}</b>
        <span class="mb-bol__meta">${escapar(a.fecha ? diaLargo(a.fecha) : '')} · ${escapar(rangoHoras(a))}${a.sede ? ' · ' + escapar(a.sede) : ''}</span>
        <span class="mb-bol__meta">Código <b>${escapar(codigoLegible(b.codigo))}</b> · ${escapar(lugaresTexto(b.lugares || 1))}</span>
      </span>
      ${etiqueta ? `<span class="mb-bol__estado">${escapar(etiqueta)}</span>` : ''}
    </a>
  </li>`;
}
