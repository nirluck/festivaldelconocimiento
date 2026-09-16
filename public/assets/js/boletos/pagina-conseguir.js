/* ============================================================================
   /b/<slug> · CONSIGUE TU BOLETO
   ----------------------------------------------------------------------------
   A donde llevan los QR de los carteles. Quien llega aquí está de pie, con el
   teléfono en una mano: la página muestra lo mínimo para decidir —qué, cuándo,
   dónde, cuántos lugares quedan— y el formulario, sin desplazarse por la
   descripción. La ficha completa está a un toque.

   ?o=<origen> dice de dónde viene la persona (cartel, redes…). Se lee una vez
   y se quita de la barra: si alguien comparte la liga desde aquí, su origen no
   debe heredar el del cartel.
   ========================================================================== */

import { montarCabecera } from '../cabecera.js';
import { estiloEje } from '../color.js';
import { urlPosterMini } from '../archivos.js';
import { actividadPorSlug, mensaje } from './api.js';
import { montarFormulario } from './formulario.js';
import { escapar, diaLargo, rangoHoras } from './util.js';

const ORIGENES = ['cartel', 'programa', 'ficha', 'portada', 'redes', 'otro'];
const pagina = document.getElementById('pagina');

(async function iniciar() {
  montarCabecera();

  const partes = location.pathname.split('/').filter(Boolean);     // ['b', slug]
  const slug = partes[1] ? decodeURIComponent(partes[1]) : '';

  const params = new URLSearchParams(location.search);
  const o = params.get('o');
  const origen = ORIGENES.includes(o) ? o : 'otro';
  if (o !== null) history.replaceState(null, '', location.pathname + location.hash);

  if (!slug) return noExiste();

  let act;
  try {
    act = await actividadPorSlug(slug);
  } catch (e) {
    pagina.innerHTML = `<div class="pg-wrap bb-envoltura"><p class="pg-error">${escapar(mensaje(e))}</p></div>`;
    return;
  }
  if (!act) return noExiste();

  document.title = 'Boleto · ' + act.titulo + ' · Festival del Conocimiento';

  pagina.innerHTML = `
    <header class="bb-cab" style="${estiloEje(act.eje_color)}">
      <div class="pg-wrap bb-cab__in">
        ${act.poster ? `<img class="bb-cab__poster" src="${urlPosterMini(act.poster)}" alt=""
              width="84" height="105" onerror="this.remove()">` : ''}
        <div>
          <p class="bb-cab__eje"><i></i>${escapar(act.eje || 'Festival del Conocimiento')}
            ${act.tipo ? `<span>· ${escapar(act.tipo)}</span>` : ''}</p>
          <h1>${escapar(act.titulo)}</h1>
          <p class="bb-cab__cuando">
            <b>${escapar(act.fecha ? diaLargo(act.fecha) : 'Fecha por confirmar')}</b>
            · ${escapar(rangoHoras(act))}
            ${act.sede ? `<br>${escapar(act.sede)}` : ''}
          </p>
        </div>
      </div>
    </header>
    <div class="pg-wrap bb-envoltura">
      <section class="bb-caja" id="caja-boleto" aria-label="Conseguir boleto"></section>
      <p class="bb-mas"><a href="/programa/${encodeURIComponent(act.slug)}/">Ver la descripción completa de la actividad</a></p>
    </div>`;

  await montarFormulario(document.getElementById('caja-boleto'), act, { origen, cambiarURL: true });
})();

function noExiste() {
  pagina.innerHTML = `
    <div class="pg-wrap bb-envoltura">
      <div class="bf-nota">
        <h1>No encontramos esa actividad</h1>
        <p>Puede que la liga esté incompleta o que la actividad todavía no esté
           publicada en el programa.</p>
        <div class="bf-nota__botones">
          <a class="pg-btn pg-btn--lleno" href="/programa/">Ver el programa</a>
        </div>
      </div>
    </div>`;
}
