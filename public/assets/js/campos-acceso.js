/* ============================================================================
   CAMPOS DE ACCESO · Festival del Conocimiento
   ----------------------------------------------------------------------------
   El modo de acceso de una actividad (libre, registro, boleto), el cupo y, si
   se piden, los lugares por boleto y la ventana de boletos. Los usan tres
   pantallas que deben decir lo mismo: el registro, el módulo Resumen y el
   diálogo «Programar».

     html(prefijo, valores, { lugares, ventana, capacidad })
     conectar(raiz, prefijo)          muestra u oculta según el modo
     leer(raiz, prefijo)              → { cambios } o { error: { campo, texto } }

   Regla de la base (sql/11-boletos.sql): «boleto» exige cupo mayor que cero.
   Aquí se valida antes para decirlo en claro, no con el error de la
   restricción.

   El cupo YA TRAE el sobrecupo (decisión del 16 de septiembre de 2026): es el
   número de boletos que se van a emitir, no la capacidad de la sala.
   ========================================================================== */

const MODOS = [
  ['libre',    'Entrada libre',            'Sin registro. Llega quien llegue, hasta que se llene el espacio.'],
  ['registro', 'Confirmar asistencia',     'Entrada libre, pero se pide confirmar para saber cuánta gente esperar. Sin tope.'],
  ['boleto',   'Con boleto gratuito',      'Cupo limitado: solo entra quien consiguió boleto, hasta agotar los lugares.'],
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------ hora de Ensenada ↔ ISO -- */

/** timestamptz → «2026-10-01T09:00» en hora de Ensenada, para datetime-local. */
export function aLocalEnsenada(iso) {
  if (!iso) return '';
  const f = new Date(iso);
  if (isNaN(f)) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Tijuana', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(f).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * «2026-10-01T09:00» leído como hora de Ensenada → ISO con zona.
 * No sirve new Date(valor): lo interpreta en la zona del navegador, y quien
 * programa desde otra ciudad movería la apertura horas.
 */
export function deLocalEnsenada(valor) {
  if (!valor) return null;
  const [d, t] = valor.split('T');
  const [a, m, dia] = d.split('-').map(Number);
  const [h, min] = (t || '00:00').split(':').map(Number);
  const supuesto = Date.UTC(a, m - 1, dia, h, min);
  // Diferencia entre la hora de pared de Ensenada en ese instante y UTC.
  const desfase = (instante) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Tijuana', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(instante)).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - instante;
  };
  // Dos pasadas bastan incluso junto al cambio de horario.
  let instante = supuesto - desfase(supuesto);
  instante = supuesto - desfase(instante);
  return new Date(instante).toISOString();
}

/* ---------------------------------------------------------------- html --- */

/**
 * @param {string} p        prefijo de los id, p. ej. 'r' → 'r-acceso-boleto'
 * @param {object} v        { acceso, cupo, lugares_max, boletos_desde, boletos_hasta }
 * @param {object} op
 *   lugares   mostrar «lugares por boleto»
 *   ventana   mostrar la ventana de boletos
 *   capacidad capacidad de la sala, como referencia junto al cupo
 *   titulo    texto del grupo (por omisión «¿Cómo se entra?»)
 */
export function html(p, v = {}, op = {}) {
  const acceso = v.acceso || 'libre';
  return `
  <div class="acceso" data-acceso="${esc(p)}">
    <fieldset class="acceso__modos">
      <legend class="acceso__tit">${esc(op.titulo || '¿Cómo se entra?')}</legend>
      ${MODOS.map(([valor, nombre, ayuda]) => `
      <label class="acceso__modo">
        <input type="radio" name="${esc(p)}-acceso" value="${valor}"${valor === acceso ? ' checked' : ''}>
        <span><b>${esc(nombre)}</b><small>${esc(ayuda)}</small></span>
      </label>`).join('')}
    </fieldset>

    <div class="acceso__cupo" data-solo-boleto>
      <div class="campo">
        <label for="${esc(p)}-cupo">Boletos a emitir</label>
        <input type="number" id="${esc(p)}-cupo" min="1" step="1" inputmode="numeric"
               value="${v.cupo ?? ''}" placeholder="Por ejemplo, 40">
        <span class="pista">Incluye el sobrecupo: si la sala tiene 30 lugares y esperas
          que falte gente, pon un poco más. Es lo que se reparte, no lo que cabe.
          ${op.capacidad ? `<br><b>Capacidad registrada de la sede: ${esc(op.capacidad)}.</b>` : ''}</span>
        <span class="error-campo" id="${esc(p)}-e-cupo" hidden></span>
      </div>

      ${op.lugares ? `
      <div class="campo">
        <label for="${esc(p)}-lugares">Lugares por boleto</label>
        <select id="${esc(p)}-lugares">
          ${Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
            `<option value="${n}"${n === (v.lugares_max || 4) ? ' selected' : ''}>${n === 1 ? '1 · solo quien lo pide' : `Hasta ${n}`}</option>`).join('')}
        </select>
        <span class="pista">Cuántas personas caben en un solo boleto (quien lo pide y sus
          acompañantes). Para un taller con material individual conviene 1.</span>
      </div>` : ''}
    </div>

    ${op.ventana ? `
    <details class="acceso__ventana" data-sin-libre${v.boletos_desde || v.boletos_hasta ? ' open' : ''}>
      <summary>Cuándo se abren y se cierran los boletos</summary>
      <p class="pista">Si los dejas vacíos, se abren al publicar la actividad y se
        cierran a la hora en que empieza. Horas de Ensenada.</p>
      <div class="campos campos--2">
        <div class="campo">
          <label for="${esc(p)}-desde">Se abren</label>
          <input type="datetime-local" id="${esc(p)}-desde" value="${esc(aLocalEnsenada(v.boletos_desde))}">
        </div>
        <div class="campo">
          <label for="${esc(p)}-hasta">Se cierran</label>
          <input type="datetime-local" id="${esc(p)}-hasta" value="${esc(aLocalEnsenada(v.boletos_hasta))}">
          <span class="error-campo" id="${esc(p)}-e-hasta" hidden></span>
        </div>
      </div>
    </details>` : ''}
  </div>`;
}

export function conectar(raiz, p) {
  const caja = raiz.querySelector(`[data-acceso="${p}"]`);
  if (!caja) return;
  const actualizar = () => {
    const modo = modoElegido(caja, p);
    caja.querySelectorAll('[data-solo-boleto]').forEach(e => { e.hidden = modo !== 'boleto'; });
    caja.querySelectorAll('[data-sin-libre]').forEach(e => { e.hidden = modo === 'libre'; });
  };
  caja.querySelectorAll(`input[name="${p}-acceso"]`).forEach(r => r.addEventListener('change', actualizar));
  actualizar();
}

function modoElegido(caja, p) {
  return caja.querySelector(`input[name="${p}-acceso"]:checked`)?.value || 'libre';
}

function marcar(raiz, p, campo, texto) {
  const c = raiz.querySelector(`#${p}-${campo}`);
  const e = raiz.querySelector(`#${p}-e-${campo}`);
  if (c) c.setAttribute('aria-invalid', texto ? 'true' : 'false');
  if (e) { e.textContent = texto || ''; e.hidden = !texto; }
}

/**
 * Lee y valida. Devuelve los campos listos para mandar a «actividades».
 * Con modo «libre» el cupo se conserva tal cual: puede servir de referencia y
 * volver a usarse si la actividad cambia de modo.
 */
export function leer(raiz, p) {
  const caja = raiz.querySelector(`[data-acceso="${p}"]`);
  if (!caja) return { cambios: {} };     // la pantalla no llegó a pintarlo
  const acceso = modoElegido(caja, p);
  const cambios = { acceso };

  const cupoTx = (raiz.querySelector(`#${p}-cupo`)?.value || '').trim();
  marcar(raiz, p, 'cupo', '');
  marcar(raiz, p, 'hasta', '');
  if (cupoTx && !/^\d+$/.test(cupoTx)) {
    marcar(raiz, p, 'cupo', 'Escribe un número entero.');
    return { error: { campo: `${p}-cupo` } };
  }
  const cupo = cupoTx === '' ? null : parseInt(cupoTx, 10);
  if (acceso === 'boleto' && !(cupo > 0)) {
    marcar(raiz, p, 'cupo', 'Con boleto hace falta saber cuántos boletos emitir.');
    return { error: { campo: `${p}-cupo` } };
  }
  cambios.cupo = cupo;

  const lugares = raiz.querySelector(`#${p}-lugares`);
  if (lugares) cambios.lugares_max = parseInt(lugares.value, 10);

  const desde = raiz.querySelector(`#${p}-desde`);
  const hasta = raiz.querySelector(`#${p}-hasta`);
  if (desde && hasta) {
    cambios.boletos_desde = deLocalEnsenada(desde.value);
    cambios.boletos_hasta = deLocalEnsenada(hasta.value);
    if (cambios.boletos_desde && cambios.boletos_hasta && cambios.boletos_hasta <= cambios.boletos_desde) {
      marcar(raiz, p, 'hasta', 'El cierre tiene que ser después de la apertura.');
      return { error: { campo: `${p}-hasta` } };
    }
  }
  return { cambios };
}
