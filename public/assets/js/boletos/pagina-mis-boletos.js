/* ============================================================================
   /mis-boletos/ · LOS BOLETOS DE ESTE TELÉFONO
   ----------------------------------------------------------------------------
   Sin cuenta no hay «mis boletos» en el servidor: la lista vive en el
   navegador (almacen.js). Se pinta de inmediato con lo guardado y luego se
   pregunta a la base por cada boleto, para reflejar cancelaciones y entradas.
   ========================================================================== */

import { montarCabecera } from '../cabecera.js';
import { estiloEje } from '../color.js';
import { verBoleto } from './api.js';
import { boletosGuardados, guardarBoleto, olvidarBoleto } from './almacen.js';
import { escapar, diaLargo, rangoHoras, codigoLegible, lugaresTexto, aFecha } from './util.js';

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
        <p class="pg-hero__lede">Los boletos que pediste desde este teléfono.
          Si los pediste en otro dispositivo, están allá.</p>
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

      ${lista.length ? `
      <p class="bb-mas">¿Perdiste un boleto que pediste en otro lado? En la entrada
        pueden buscarlo con tu nombre o tu correo.</p>` : ''}
    </div>`;
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
