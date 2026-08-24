/* ============================================================================
   MÓDULO · RESUMEN
   ----------------------------------------------------------------------------
   Ver y EDITAR los datos de la actividad. Cierra el hueco que existía desde el
   principio: hasta ahora, una vez registrada, una actividad no se podía tocar.

   Quién edita qué:
     · El coordinador dueño edita todos los datos descriptivos.
     · La administración, además, decide si entra al programa público (publica).
   Ese reparto no lo cuida solo esta pantalla: lo respalda el disparador
   «proteger_estado» en la base. Aquí solo se muestra u oculta el interruptor.
   ========================================================================== */

import { db, catalogos, edicionActiva, llenar,
         aviso, limpiarAviso, explicar, escapar } from '/assets/js/app.js';

const $ = (sel, raiz) => (raiz || document).querySelector(sel);

export default {
  id: 'resumen',
  nombre: 'Resumen',
  aplica: () => true,

  async montar(contenedor, actividad, perfil, ctx) {
    const esAdmin = perfil.rol === 'administrador';

    // Los catálogos y la edición se necesitan para las listas y para acotar la
    // fecha. Si fallara, se dice qué pasó en vez de dejar la pantalla a medias.
    let cat, edicion;
    try {
      [cat, edicion] = await Promise.all([catalogos(), edicionActiva()]);
    } catch (e) {
      contenedor.innerHTML = `<div class="aviso aviso--mal">${escapar(explicar(e))}</div>`;
      return;
    }

    const v = s => escapar(s ?? '');

    contenedor.innerHTML = `
      <div class="aviso" id="r-aviso" hidden></div>

      <form class="tarjeta" id="r-forma" novalidate>
        <fieldset>
          <legend>Datos de la actividad</legend>
          <p class="leyenda">
            Corrige o completa lo que haga falta. Puedes volver cuantas veces
            quieras: mientras más completa esté, mejor sale en el programa.
          </p>

          <div class="campos campos--2">
            <div class="campo completo">
              <label for="r-titulo">Nombre de la actividad</label>
              <input type="text" id="r-titulo" value="${v(actividad.titulo)}" required>
              <span class="error-campo" id="r-e-titulo" hidden></span>
            </div>

            <div class="campo completo">
              <label for="r-resumen">Resumen</label>
              <textarea id="r-resumen" rows="2"
                placeholder="Una o dos frases para el programa público.">${v(actividad.resumen)}</textarea>
              <span class="pista">Lo corto que se lee en el programa. La descripción es el texto largo.</span>
            </div>

            <div class="campo">
              <label for="r-eje">Eje</label>
              <select id="r-eje" required></select>
              <span class="error-campo" id="r-e-eje" hidden></span>
            </div>

            <div class="campo">
              <label for="r-tipo">Tipo de actividad</label>
              <select id="r-tipo" required></select>
              <span class="error-campo" id="r-e-tipo" hidden></span>
            </div>

            <div class="campo">
              <label for="r-sede">Sede</label>
              <select id="r-sede"></select>
            </div>

            <div class="campo">
              <label for="r-fecha">Fecha</label>
              <input type="date" id="r-fecha" value="${v(actividad.fecha)}"
                     min="${v(edicion.fecha_inicio)}" max="${v(edicion.fecha_fin)}">
              <span class="error-campo" id="r-e-fecha" hidden></span>
            </div>

            <div class="campo">
              <label for="r-hora_inicio">Hora de inicio</label>
              <input type="time" id="r-hora_inicio" value="${v((actividad.hora_inicio||'').slice(0,5))}">
            </div>

            <div class="campo">
              <label for="r-hora_fin">Hora de término</label>
              <input type="time" id="r-hora_fin" value="${v((actividad.hora_fin||'').slice(0,5))}">
            </div>

            <div class="campo">
              <label for="r-cupo">Cupo</label>
              <input type="number" id="r-cupo" min="0" step="1"
                     value="${actividad.cupo ?? ''}" placeholder="Lugares que ofreces">
              <span class="pista">Déjalo vacío si aún no lo defines.</span>
              <span class="error-campo" id="r-e-cupo" hidden></span>
            </div>

            <div class="campo completo">
              <label for="r-descripcion">Descripción</label>
              <textarea id="r-descripcion" rows="4"
                placeholder="De qué trata y a qué público va dirigida.">${v(actividad.descripcion)}</textarea>
            </div>

            <div class="campo completo">
              <label for="r-requerimientos">Requerimientos</label>
              <textarea id="r-requerimientos" rows="3"
                placeholder="Equipo, montaje, mobiliario, proyección, sonido, apoyo de personal…">${v(actividad.requerimientos)}</textarea>
              <span class="pista">Qué hace falta para que la actividad pueda realizarse.</span>
            </div>

            ${esAdmin ? `
            <div class="campo completo">
              <label class="check">
                <input type="checkbox" id="r-publica" ${actividad.publica ? 'checked' : ''}>
                Mostrar esta actividad en el programa público
              </label>
              <span class="pista">Solo la administración ve y cambia esto.</span>
            </div>` : ''}
          </div>

          <div class="acciones">
            <button type="submit" class="btn btn--principal" id="r-guardar">Guardar cambios</button>
            <span class="pista" id="r-slug">Dirección pública: /programa/${v(actividad.slug)}/</span>
          </div>
        </fieldset>
      </form>`;

    // Listas, con la opción actual ya seleccionada.
    llenar($('#r-eje', contenedor),  cat.ejes.map(e => e.nombre), 'Elige un eje');
    llenar($('#r-tipo', contenedor), cat.tipos, 'Elige un tipo');
    llenar($('#r-sede', contenedor), cat.sedes, 'Elige una sede');
    if (actividad.eje)  $('#r-eje',  contenedor).value = actividad.eje;
    if (actividad.tipo) $('#r-tipo', contenedor).value = actividad.tipo;
    if (actividad.sede) $('#r-sede', contenedor).value = actividad.sede;

    const forma = $('#r-forma', contenedor);
    const caja  = $('#r-aviso', contenedor);

    const marca = (id, msg) => {
      const c = $('#r-' + id, contenedor), e = $('#r-e-' + id, contenedor);
      if (c) c.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (e) { e.textContent = msg || ''; e.hidden = !msg; }
    };

    forma.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limpiarAviso(caja);

      // Validación
      let ok = true;
      const titulo = $('#r-titulo', contenedor).value.trim();
      const eje    = $('#r-eje', contenedor).value;
      const tipo   = $('#r-tipo', contenedor).value;
      const fecha  = $('#r-fecha', contenedor).value;
      const cupoTx = $('#r-cupo', contenedor).value.trim();

      if (!titulo) { marca('titulo', 'Ponle nombre a la actividad.'); ok = false; } else marca('titulo', '');
      if (!eje)    { marca('eje', 'Elige un eje.');   ok = false; } else marca('eje', '');
      if (!tipo)   { marca('tipo', 'Elige un tipo.'); ok = false; } else marca('tipo', '');
      if (fecha && (fecha < edicion.fecha_inicio || fecha > edicion.fecha_fin)) {
        marca('fecha', 'La fecha tiene que caer dentro del festival.'); ok = false;
      } else marca('fecha', '');
      if (cupoTx && !/^\d+$/.test(cupoTx)) {
        marca('cupo', 'El cupo tiene que ser un número entero.'); ok = false;
      } else marca('cupo', '');
      if (!ok) return;

      const btn = $('#r-guardar', contenedor);
      btn.disabled = true; btn.textContent = 'Guardando…';

      // Se mandan solo los campos editables. No se toca slug, edicion_id ni
      // responsable_id: así se preservan y el disparador no regenera la
      // dirección pública. «publica» solo si quien edita es administración.
      const cambios = {
        titulo,
        resumen:        $('#r-resumen', contenedor).value.trim(),
        descripcion:    $('#r-descripcion', contenedor).value.trim(),
        requerimientos: $('#r-requerimientos', contenedor).value.trim(),
        eje, tipo,
        sede:           $('#r-sede', contenedor).value || '',
        fecha:          fecha || null,
        hora_inicio:    $('#r-hora_inicio', contenedor).value || null,
        hora_fin:       $('#r-hora_fin', contenedor).value || null,
        cupo:           cupoTx === '' ? null : parseInt(cupoTx, 10),
      };
      if (esAdmin) cambios.publica = $('#r-publica', contenedor).checked;

      const { error } = await db.from('actividades').update(cambios).eq('id', actividad.id);

      if (error) {
        aviso(caja, 'mal', explicar(error));
        btn.disabled = false; btn.textContent = 'Guardar cambios';
        return;
      }

      // Se recarga desde la base: así se ve el estado real —incluido el título
      // de la cabecera del panel— y no una copia en memoria.
      if (ctx && ctx.recargar) {
        await ctx.recargar();
      } else {
        aviso(caja, 'ok', 'Cambios guardados.');
        btn.disabled = false; btn.textContent = 'Guardar cambios';
      }
    });
  },
};
