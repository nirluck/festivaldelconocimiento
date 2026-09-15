/* ============================================================================
   MÓDULO · PÓSTER
   ----------------------------------------------------------------------------
   Subir, cambiar o quitar el póster de la actividad después de registrarla.
   Lo ven el coordinador dueño y la administración: el panel ya solo abre la
   actividad a esas dos personas, y las políticas de Storage de
   sql/10-poster.sql lo vuelven a exigir del lado de la base.

   El póster se lee de «actividades» y no de «vista_actividades», que es lo que
   trae el panel: esa vista es la del semáforo, y reconstruirla para sumarle una
   columna es el riesgo que describen las trampas 6 y 8 del plan. El póster es
   dato de este módulo, y este módulo lo lee.
   ========================================================================== */

import { db, explicar, escapar } from '/assets/js/app.js';
import { montarSelector, subirPoster, quitarPoster } from '/assets/js/subir-poster.js';

export default {
  id: 'poster',
  nombre: 'Póster',
  aplica: () => true,

  async montar(contenedor, actividad) {
    const { data, error } = await db
      .from('actividades').select('poster').eq('id', actividad.id).maybeSingle();

    if (error) {
      contenedor.innerHTML = `<div class="aviso aviso--mal">${escapar(explicar(error))}</div>`;
      return;
    }

    // Se guarda aquí y se actualiza tras cada cambio: al reemplazar el póster
    // hay que saber cuál borrar, y no puede ser el que había al abrir la
    // pestaña si en medio ya se cambió una vez.
    let ruta = data ? data.poster : null;

    contenedor.innerHTML = `
      <div class="tarjeta">
        <fieldset>
          <legend>Póster de la actividad</legend>
          <p class="leyenda">
            Es la imagen que acompaña a tu actividad en el programa público: en la
            cartelera, en su página y en la portada del sitio.
            ${actividad.publica
              ? '<strong>Esta actividad ya está en el programa: el cambio se ve de inmediato.</strong>'
              : 'Aparecerá en cuanto la administración la publique en el programa.'}
          </p>
          <div id="poster-selector"></div>
        </fieldset>
      </div>`;

    montarSelector(contenedor.querySelector('#poster-selector'), {
      rutaActual: ruta,
      titulo: actividad.titulo,
      explicar,
      alElegir: async (preparado) => {
        ruta = await subirPoster(actividad.id, preparado, ruta);
      },
      alQuitar: async () => {
        await quitarPoster(actividad.id, ruta);
        ruta = null;
      },
    });
  },
};
