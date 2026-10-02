/* ============================================================================
   CAMPO DE SEDE · Festival del Conocimiento
   ----------------------------------------------------------------------------
   El selector de sede con la opción «＋ Nueva sede…». Al elegirla se abren
   dos campos, nombre y dirección; al guardar la actividad, la sede se da de
   alta en el catálogo (alta_sede, sql/15-sedes-abiertas.sql) y queda en la
   lista para todos. Lo usan el registro, el módulo Resumen y el diálogo
   «Programar».

     llenarSedes(sel, sedes, { actual, placeholder, salas, salaActual })
     leer(sel)          → { sede, sala_id? } | { nueva: { nombre, direccion } } | { error: { campo } }
     guardar(lectura)   → el nombre definitivo (da de alta la sede si es nueva)
     salaElegida(sel)   → id de la sala elegida, o null

   SALAS (sql/16-sedes-salas.sql): si la sede elegida tiene salas, aparece
   «Sala o espacio» debajo. Las da de alta solo la administración, en
   /panel/sedes/. «sala_id» viene en la lectura solo cuando el campo se ve:
   si la sede no tiene salas no se manda, y la base suelta la sala vieja sola
   al cambiar de sede.

   Mientras escribe el nombre se le sugieren las sedes parecidas que ya
   existen, para que elija esa en vez de duplicarla. Si aun así escribe una
   que ya está, la base devuelve la existente.
   ========================================================================== */

import { db, olvidarCatalogos } from './app.js';

export const NUEVA = '__nueva__';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Igual que public.normalizar() en la base: sin mayúsculas, acentos ni
// espacios de más.
const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();
const limpio = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const listas = new WeakMap();   // select → sedes del catálogo
const salasDe = new WeakMap();  // select → salas del catálogo, de todas las sedes

/**
 * @param {HTMLSelectElement} sel
 * @param {string[]} sedes   las del catálogo
 * @param {object} op
 *   actual       la sede guardada. Si ya no está en el catálogo (p. ej. la
 *                retirada «Otra sede») se muestra igual, para no borrarla al
 *                guardar sin que nadie lo haya pedido.
 *   placeholder  primera opción vacía
 *   salas        las del catálogo: [{ id, sede, nombre }]
 *   salaActual   id de la sala guardada
 */
export function llenarSedes(sel, sedes, op = {}) {
  const actual = op.actual || '';
  const lista = actual && !sedes.includes(actual) ? [...sedes, actual] : sedes;
  listas.set(sel, sedes);
  sel.innerHTML =
    (op.placeholder ? `<option value="">${esc(op.placeholder)}</option>` : '') +
    lista.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('') +
    `<option value="${NUEVA}">＋ Nueva sede…</option>`;
  sel.value = actual;
  salasDe.set(sel, op.salas || []);
  montarNueva(sel);
  montarSala(sel, op.salaActual || null);
  // El diálogo «Programar» se reabre con otra actividad: sin restos de la anterior.
  ['nn', 'nd'].forEach(c => { document.getElementById(`${sel.id}-${c}`).value = ''; marcar(sel, c, ''); });
  document.getElementById(`${sel.id}-nueva`).querySelector('[data-parecidas]').hidden = true;
}

function montarNueva(sel) {
  let caja = document.getElementById(`${sel.id}-nueva`);
  if (!caja) {
    const id = sel.id;
    caja = document.createElement('div');
    caja.className = 'campo completo sede-nueva';
    caja.id = `${id}-nueva`;
    caja.innerHTML = `
      <p class="sede-nueva__tit">Nueva sede</p>
      <div class="campos campos--2">
        <div class="campo">
          <label for="${id}-nn">Nombre de la sede</label>
          <input type="text" id="${id}-nn" maxlength="120" autocomplete="off"
                 placeholder="Por ejemplo, Secundaria Técnica 32">
          <span class="sede-nueva__parecidas" data-parecidas hidden></span>
          <span class="error-campo" id="${id}-e-nn" hidden></span>
        </div>
        <div class="campo">
          <label for="${id}-nd">Dirección</label>
          <input type="text" id="${id}-nd" maxlength="200" autocomplete="off"
                 placeholder="Calle y número, colonia, Ensenada, B.C.">
          <span class="pista">En una línea, con ciudad y estado: es la que sale en el boleto y en el mapa.</span>
          <span class="error-campo" id="${id}-e-nd" hidden></span>
        </div>
      </div>
      <p class="pista">Al guardar, la sede se suma a la lista y cualquiera podrá elegirla.</p>`;
    (sel.closest('.campo') || sel).after(caja);

    sel.addEventListener('change', () => {
      caja.hidden = sel.value !== NUEVA;
      if (!caja.hidden) caja.querySelector(`#${id}-nn`).focus();
    });

    // Sugerencias: las sedes que ya existen y se parecen a lo que escribe.
    const nombre = caja.querySelector(`#${id}-nn`);
    const parecidas = caja.querySelector('[data-parecidas]');
    nombre.addEventListener('input', () => {
      const q = normal(nombre.value);
      const hay = q.length < 3 ? [] : (listas.get(sel) || [])
        .filter(s => normal(s).includes(q) || q.includes(normal(s))).slice(0, 3);
      parecidas.hidden = !hay.length;
      parecidas.innerHTML = hay.length
        ? '¿Es alguna de estas? ' + hay.map(s =>
            `<button type="button" class="sede-nueva__sug" data-sede="${esc(s)}">${esc(s)}</button>`).join(' ')
        : '';
    });
    parecidas.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-sede]');
      if (!b) return;
      sel.value = b.dataset.sede;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  caja.hidden = sel.value !== NUEVA;
}

function montarSala(sel, actual) {
  if (!document.getElementById(`${sel.id}-sala-campo`)) {
    const campo = document.createElement('div');
    campo.className = 'campo sede-sala';
    campo.id = `${sel.id}-sala-campo`;
    campo.innerHTML = `
      <label for="${sel.id}-sala">Sala o espacio</label>
      <select id="${sel.id}-sala"></select>
      <span class="pista">Dónde, dentro de la sede. Sale en el programa junto a ella.</span>`;
    (sel.closest('.campo') || sel).after(campo);
    sel.addEventListener('change', () => pintarSalas(sel, null));
  }
  pintarSalas(sel, actual);
}

function pintarSalas(sel, actual) {
  const campo = document.getElementById(`${sel.id}-sala-campo`);
  const salaSel = document.getElementById(`${sel.id}-sala`);
  const deEsta = (salasDe.get(sel) || []).filter(s => s.sede === sel.value);
  // Una sala desactivada después de asignarla: se conserva, no se borra sola.
  if (actual && !deEsta.some(s => s.id === actual)) deEsta.push({ id: actual, nombre: 'Sala desactivada' });
  salaSel.innerHTML = '<option value="">Sin especificar</option>' +
    deEsta.map(s => `<option value="${esc(s.id)}">${esc(s.nombre)}</option>`).join('');
  salaSel.value = actual || '';
  campo.hidden = !deEsta.length;
  salaSel.dispatchEvent(new Event('change', { bubbles: true }));
}

export function salaElegida(sel) {
  const campo = document.getElementById(`${sel.id}-sala-campo`);
  if (!campo || campo.hidden) return null;
  return document.getElementById(`${sel.id}-sala`).value || null;
}

function marcar(sel, campo, texto) {
  const c = document.getElementById(`${sel.id}-${campo}`);
  const e = document.getElementById(`${sel.id}-e-${campo}`);
  if (c) c.setAttribute('aria-invalid', texto ? 'true' : 'false');
  if (e) { e.textContent = texto || ''; e.hidden = !texto; }
}

/** Lee y valida. No escribe nada en la base. */
export function leer(sel) {
  if (sel.value !== NUEVA) {
    const campo = document.getElementById(`${sel.id}-sala-campo`);
    return campo && !campo.hidden
      ? { sede: sel.value || '', sala_id: salaElegida(sel) }
      : { sede: sel.value || '' };
  }

  const nombre    = limpio(document.getElementById(`${sel.id}-nn`).value);
  const direccion = limpio(document.getElementById(`${sel.id}-nd`).value);
  marcar(sel, 'nn', '');
  marcar(sel, 'nd', '');
  if (nombre.length < 3) {
    marcar(sel, 'nn', 'Escribe el nombre de la sede.');
    return { error: { campo: `${sel.id}-nn` } };
  }
  if (direccion.length < 5) {
    marcar(sel, 'nd', 'Escribe la dirección de la sede.');
    return { error: { campo: `${sel.id}-nd` } };
  }
  // Escrita igual que una que ya está: se usa esa, sin pasar por la base.
  const igual = (listas.get(sel) || []).find(s => normal(s) === normal(nombre));
  if (igual) return { sede: igual };
  return { nueva: { nombre, direccion } };
}

/**
 * Da de alta la sede si es nueva y devuelve el nombre con que quedó, que
 * puede ser el de una ya existente. Lanza el error de Supabase si falla.
 */
export async function guardar(lectura) {
  if (!lectura.nueva) return lectura.sede;
  const { data, error } = await db.rpc('alta_sede', {
    p_nombre: lectura.nueva.nombre, p_direccion: lectura.nueva.direccion,
  });
  if (error) throw error;
  olvidarCatalogos();
  return data;
}
