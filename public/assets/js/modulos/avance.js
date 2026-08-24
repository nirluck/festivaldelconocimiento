/* ============================================================================
   MÓDULO · AVANCE
   ----------------------------------------------------------------------------
   El reporte de avance y su historial. Antes vivía dentro de /mi-actividad;
   ahora es un módulo del panel, uno por actividad.

   El historial es de solo agregar: cada envío queda guardado y ninguno pisa al
   anterior. Es la misma regla que impone la base (no hay UPDATE ni DELETE sobre
   «reportes»); aquí solo se refleja.
   ========================================================================== */

import { db, aviso, limpiarAviso, explicar, fechaHora, escapar } from '/assets/js/app.js';
import { ALERTAS } from '/assets/js/config.js';

const $ = (sel, raiz) => (raiz || document).querySelector(sel);

export default {
  id: 'avance',
  nombre: 'Avance',
  aplica: () => true,

  async montar(contenedor, actividad, perfil, ctx) {
    const { data: historial, error } = await db
      .from('reportes').select('*')
      .eq('actividad_id', actividad.id)
      .order('creado', { ascending: false });

    if (error) {
      contenedor.innerHTML = `<div class="aviso aviso--mal">${escapar(explicar(error))}</div>`;
      return;
    }

    contenedor.innerHTML = `
      <div class="aviso" id="a-aviso" hidden></div>

      <form class="tarjeta" id="a-forma">
        <fieldset style="margin-bottom:0">
          <legend>Reportar avance</legend>
          <p class="leyenda">
            Cuéntanos cómo va. Cada envío queda guardado, así que puedes reportar
            las veces que haga falta.
          </p>

          <div class="campos">
            <div class="campo">
              <label for="a-avance">¿Qué tanto has avanzado?</label>
              <div class="rango">
                <input type="range" id="a-avance" min="0" max="100" step="5" value="${actividad.avance || 0}">
                <output id="a-salida">${actividad.avance || 0}%</output>
              </div>
            </div>

            <div class="campo">
              <label for="a-avances">¿Qué has logrado desde el último reporte?</label>
              <textarea id="a-avances" placeholder="Lo que ya está resuelto o confirmado."></textarea>
            </div>

            <div class="campo">
              <label for="a-necesidades">¿Qué necesitas?</label>
              <textarea id="a-necesidades" placeholder="Equipo, espacio, difusión, apoyo de la coordinación…"></textarea>
            </div>

            <div class="campo">
              <label for="a-problematica">¿Hay alguna problemática?</label>
              <textarea id="a-problematica" placeholder="Déjalo vacío si no hay nada atorado."></textarea>
              <span class="pista">Si escribes algo aquí, la coordinación lo verá marcado para darle seguimiento.</span>
            </div>

            <div class="campo">
              <label for="a-siguiente">¿Cuál es tu siguiente paso?</label>
              <input type="text" id="a-siguiente" placeholder="Ej. Confirmar al ponente esta semana">
            </div>

            <div class="campo">
              <label for="a-alerta">¿Está en riesgo de no realizarse?</label>
              <select id="a-alerta"></select>
            </div>
          </div>

          <div class="acciones">
            <button type="submit" class="btn btn--principal" id="a-enviar">Enviar reporte</button>
          </div>
        </fieldset>
      </form>

      <h2 style="margin:38px 0 14px">Historial de reportes</h2>
      ${historial && historial.length ? `
        <div class="tabla-caja">
          <table>
            <thead><tr><th>Fecha</th><th class="num">Avance</th><th>Qué reportó</th></tr></thead>
            <tbody>${historial.map(r => `
              <tr>
                <td>${escapar(fechaHora(r.creado))}</td>
                <td class="num"><strong>${r.avance}%</strong></td>
                <td>${escapar(r.avances || '—')}${r.problematica ? `<br><span style="color:var(--rojo)">Problemática: ${escapar(r.problematica)}</span>` : ''}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `<div class="vacio"><p>Todavía no se ha enviado ningún reporte.</p></div>`}`;

    // Opciones de alerta, con la última declarada ya elegida.
    const sel = $('#a-alerta', contenedor);
    sel.innerHTML = '';
    ALERTAS.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      sel.appendChild(o);
    });
    sel.value = actividad.alerta && ALERTAS.includes(actividad.alerta) ? actividad.alerta : ALERTAS[0];

    const rango = $('#a-avance', contenedor), salida = $('#a-salida', contenedor);
    rango.addEventListener('input', () => { salida.textContent = rango.value + '%'; });

    const caja = $('#a-aviso', contenedor);
    $('#a-forma', contenedor).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limpiarAviso(caja);
      const btn = $('#a-enviar', contenedor);
      btn.disabled = true; btn.textContent = 'Enviando…';

      const { error: err } = await db.from('reportes').insert({
        actividad_id: actividad.id,
        avance:       parseInt(rango.value, 10),
        avances:      $('#a-avances', contenedor).value.trim(),
        necesidades:  $('#a-necesidades', contenedor).value.trim(),
        problematica: $('#a-problematica', contenedor).value.trim(),
        siguiente:    $('#a-siguiente', contenedor).value.trim(),
        alerta:       $('#a-alerta', contenedor).value,
      });

      if (err) {
        aviso(caja, 'mal', explicar(err));
        btn.disabled = false; btn.textContent = 'Enviar reporte';
        return;
      }

      // Recargar para que el semáforo, la barra y el historial reflejen el
      // reporte recién enviado. Si el panel no ofreció recargar, al menos se
      // confirma en pantalla.
      if (ctx && ctx.recargar) {
        await ctx.recargar();
      } else {
        aviso(caja, 'ok', 'Gracias, tu reporte quedó registrado.');
        btn.disabled = false; btn.textContent = 'Enviar reporte';
      }
    });
  },
};
