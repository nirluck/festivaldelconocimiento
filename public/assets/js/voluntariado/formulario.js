/* ============================================================================
   VOLUNTARIADO · FORMULARIO DE INSCRIPCIÓN
   ----------------------------------------------------------------------------
   Se pinta dentro del diálogo del directorio, para un puesto concreto.

   Los datos los decidió el equipo el 4 de octubre de 2026: nombre, correo,
   teléfono (WhatsApp), institución, carrera, matrícula (opcional) y quién
   coordina su servicio social. Solo mayores de 18: una casilla, sin pedir la
   edad.

   Para quien toma varios turnos en una sentada, los datos se recuerdan en
   sessionStorage —solo esta pestaña, se olvidan al cerrarla— y el segundo
   formulario sale ya lleno. No en localStorage: en una computadora de
   laboratorio el siguiente estudiante vería los datos del anterior.
   ========================================================================== */

import { inscribirse, mensaje, mensajeRed, ErrorRed } from './api.js';
import { guardarTurno } from './almacen.js';
import { escapar, diaCorto } from './util.js';

const RECORDAR = 'fdc_vol_datos';
const OTRA = '__otra';

function recordados() {
  try { return JSON.parse(sessionStorage.getItem(RECORDAR) || '{}') || {}; } catch (e) { return {}; }
}
function recordar(d) {
  // Sin las casillas de aceptación: cada inscripción las vuelve a pedir.
  const { mayor, consiento, ...resto } = d;
  try { sessionStorage.setItem(RECORDAR, JSON.stringify(resto)); } catch (e) { /* modo privado */ }
}

/** «a las 18:00» para el aviso de empalme. */
const cuandoChoque = (c) => `${diaCorto(c.fecha)}, ${c.hora_inicio}–${c.hora_fin}`;

/**
 * @param {HTMLElement} caja
 * @param {object} puesto           fila del directorio
 * @param {Array}  instituciones    [{id, clave, nombre}]
 * @param {object} op
 * @param {string}   [op.institucion]   clave preelegida (de ?i=uabc)
 * @param {Function}  op.alInscribir    (turno) => void
 * @param {Function} [op.alCambiar]     () => void · el puesto cambió (lleno, cerrado): refrescar
 */
export function montarFormulario(caja, puesto, instituciones, op) {
  const id = 'vf-' + Math.random().toString(36).slice(2, 7);
  const r = recordados();
  const preInst = instituciones.find(i => i.clave === op.institucion) || null;
  const instElegida = r.institucion || (preInst ? preInst.id : '');
  const esOtra = r.institucion === OTRA || (!r.institucion && r.institucion_otra);

  caja.innerHTML = `
  <form class="bf vf" novalidate>
    <div class="bf__campo">
      <label for="${id}-nombre">Nombre completo</label>
      <input id="${id}-nombre" name="nombre" autocomplete="name" maxlength="120" required value="${escapar(r.nombre || '')}">
      <small>Como aparece en tu credencial: así lo verá tu institución en la constancia.</small>
    </div>

    <div class="bf__dos">
      <div class="bf__campo">
        <label for="${id}-correo">Correo</label>
        <input id="${id}-correo" name="correo" type="email" autocomplete="email" inputmode="email" maxlength="160" required value="${escapar(r.correo || '')}">
      </div>
      <div class="bf__campo">
        <label for="${id}-telefono">Teléfono / WhatsApp</label>
        <input id="${id}-telefono" name="telefono" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" required value="${escapar(r.telefono || '')}">
      </div>
    </div>
    <small class="vf__nota">El correo es tu identidad en el voluntariado: usa el mismo en cada turno. Por teléfono te buscará la persona de contacto si algo cambia ese día.</small>

    <div class="bf__campo">
      <label for="${id}-inst">Institución</label>
      <select id="${id}-inst" name="institucion" required>
        <option value="">Elige tu institución</option>
        ${instituciones.map(i => `<option value="${i.id}"${i.id === instElegida ? ' selected' : ''}>${escapar(i.nombre)}</option>`).join('')}
        <option value="${OTRA}"${esOtra ? ' selected' : ''}>Otra institución…</option>
      </select>
    </div>
    <div class="bf__campo" data-otra ${esOtra ? '' : 'hidden'}>
      <label for="${id}-otra">¿Cuál?</label>
      <input id="${id}-otra" name="institucion_otra" maxlength="160" value="${escapar(r.institucion_otra || '')}">
    </div>

    <div class="bf__dos">
      <div class="bf__campo">
        <label for="${id}-carrera">Carrera o programa</label>
        <input id="${id}-carrera" name="carrera" maxlength="120" required value="${escapar(r.carrera || '')}">
      </div>
      <div class="bf__campo">
        <label for="${id}-matricula">Matrícula <span class="bf__opcional">opcional</span></label>
        <input id="${id}-matricula" name="matricula" maxlength="40" autocomplete="off" value="${escapar(r.matricula || '')}">
      </div>
    </div>
    <small class="vf__nota">La matrícula la piden muchas oficinas de servicio social para acreditar tus horas.</small>

    <fieldset class="vf__grupo">
      <legend>Responsable de tu servicio social</legend>
      <small>La persona de tu institución que coordina a su grupo de estudiantes. A ella le reportamos tus horas.</small>
      <div class="bf__dos">
        <div class="bf__campo">
          <label for="${id}-resp">Nombre</label>
          <input id="${id}-resp" name="responsable" maxlength="120" required value="${escapar(r.responsable || '')}">
        </div>
        <div class="bf__campo">
          <label for="${id}-respc">Correo o teléfono <span class="bf__opcional">opcional</span></label>
          <input id="${id}-respc" name="responsable_contacto" maxlength="160" value="${escapar(r.responsable_contacto || '')}">
        </div>
      </div>
    </fieldset>

    <!-- Campo trampa: invisible para personas, irresistible para robots. -->
    <div class="bf__trampa" aria-hidden="true">
      <label>Sitio web <input name="sitio" tabindex="-1" autocomplete="off"></label>
    </div>

    <label class="bf__consent">
      <input type="checkbox" name="mayor" required>
      <span>Tengo 18 años o más.</span>
    </label>

    <div class="bf__aviso" id="${id}-aviso">
      <b>Aviso de privacidad simplificado.</b> Festival del Conocimiento usa tu nombre,
      correo, teléfono, institución, carrera, matrícula y los datos de tu responsable
      solo para organizar el voluntariado: asignarte un turno, localizarte ese día y
      reportar tus horas a tu institución. Los ve la coordinación de la actividad y del
      festival. Aviso integral:
      <a href="/privacidad/#voluntariado" target="_blank" rel="noopener">festivaldelconocimiento.org/privacidad</a>.
    </div>

    <label class="bf__consent">
      <input type="checkbox" name="consiento" required aria-describedby="${id}-aviso">
      <span>Acepto el aviso de privacidad y me comprometo a cumplir el turno o a cancelarlo con tiempo si no puedo asistir.</span>
    </label>

    <p class="bf__error" role="alert" hidden></p>

    <button class="pg-btn pg-btn--lleno bf__enviar" type="submit">Inscribirme a este turno</button>
  </form>`;

  const form = caja.querySelector('form');
  const errorCaja = form.querySelector('.bf__error');
  const boton = form.querySelector('.bf__enviar');
  const textoBoton = boton.textContent;
  const cajaOtra = form.querySelector('[data-otra]');

  form.elements.institucion.addEventListener('change', () => {
    const otra = form.elements.institucion.value === OTRA;
    cajaOtra.hidden = !otra;
    if (otra) form.elements.institucion_otra.focus();
  });

  const error = (texto, campo) => {
    errorCaja.textContent = texto;
    errorCaja.hidden = false;
    form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    const el = campo && form.elements[campo];
    if (el && el.focus) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
    else errorCaja.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  form.addEventListener('input', () => { errorCaja.hidden = true; });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = form.elements;
    // Un robot llenó el campo invisible: se le contesta como si nada.
    if (f.sitio.value) return;

    const otra = f.institucion.value === OTRA;
    const d = {
      nombre: f.nombre.value.trim(),
      correo: f.correo.value.trim().toLowerCase(),
      telefono: f.telefono.value.trim(),
      institucion: otra ? '' : f.institucion.value,
      institucion_otra: otra ? f.institucion_otra.value.trim() : '',
      carrera: f.carrera.value.trim(),
      matricula: f.matricula.value.trim(),
      responsable: f.responsable.value.trim(),
      responsable_contacto: f.responsable_contacto.value.trim(),
      mayor: f.mayor.checked,
      consiento: f.consiento.checked,
    };

    // Las mismas reglas que la base, para avisar antes de enviar.
    if (d.nombre.length < 3) return error('Escribe tu nombre completo.', 'nombre');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo)) return error('Revisa tu correo: debe verse como nombre@escuela.mx.', 'correo');
    if (d.telefono.replace(/\D/g, '').length < 10) return error('Escribe un teléfono de 10 dígitos.', 'telefono');
    if (!f.institucion.value) return error('Elige tu institución.', 'institucion');
    if (otra && d.institucion_otra.length < 2) return error('Escribe el nombre de tu institución.', 'institucion_otra');
    if (d.carrera.length < 2) return error('Escribe tu carrera o programa.', 'carrera');
    if (d.responsable.length < 3) return error('Escribe el nombre de quien coordina tu servicio social.', 'responsable');
    if (!d.mayor) return error('El voluntariado del festival es para personas de 18 años o más.', 'mayor');
    if (!d.consiento) return error('Para inscribirte necesitamos que aceptes el aviso de privacidad.', 'consiento');

    boton.disabled = true;
    boton.textContent = 'Inscribiendo…';
    let res;
    try {
      res = await inscribirse(puesto.id, d);
    } catch (e) {
      boton.disabled = false; boton.textContent = textoBoton;
      return error(e instanceof ErrorRed ? mensajeRed(e) : 'Algo salió mal. Vuelve a intentarlo.');
    }
    boton.disabled = false; boton.textContent = textoBoton;

    recordar({ ...d, institucion: otra ? OTRA : d.institucion });

    if (!res || !res.ok) {
      const CAMPO = { nombre: 'nombre', correo: 'correo', telefono: 'telefono', institucion: 'institucion',
                      carrera: 'carrera', responsable: 'responsable' };
      error(mensaje(res, cuandoChoque), res && res.error === 'datos' ? CAMPO[res.campo] : null);
      // El puesto cambió mientras la persona llenaba: el directorio se refresca.
      if (res && ['lleno', 'cerrado', 'no_existe', 'ya_empezo'].includes(res.error) && op.alCambiar) op.alCambiar();
      return;
    }

    guardarTurno(res.turno);
    op.alInscribir(res.turno);
  });
  // Sin poner el foco en un campo: en el teléfono abriría el teclado encima del
  // resumen del puesto, que es lo primero que hay que leer. El diálogo enfoca
  // su botón de cerrar, como debe.
}
