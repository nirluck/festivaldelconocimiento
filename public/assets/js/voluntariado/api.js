/* ============================================================================
   VOLUNTARIADO · LLAMADAS A LA BASE (páginas públicas)
   ----------------------------------------------------------------------------
   Sin supabase-js, a propósito, con el mismo criterio que boletos/api.js: la
   liga del voluntariado se comparte por WhatsApp a estudiantes que la abren
   en el teléfono, con datos móviles. Tres funciones no justifican descargar
   la librería completa.

   Las funciones de la base (sql/19-voluntariado.sql) no lanzan excepciones
   para decir «no»: responden { ok:false, error:'<código>' }. mensaje()
   convierte cada código en una frase que dice qué pasó y qué hacer.
   ========================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const CABECERAS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
};

/** La petición ni siquiera llegó a la función: red o servidor. */
export class ErrorRed extends Error {}

async function rpc(funcion, args = {}) {
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcion}`, {
      method: 'POST',
      headers: { ...CABECERAS, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch (e) {
    throw new ErrorRed('red');
  }
  if (!r.ok) {
    let detalle = '';
    try { detalle = (await r.json()).message || ''; } catch (e) { /* sin cuerpo */ }
    // Sin la migración aplicada, PostgREST dice que no encuentra la función.
    throw new ErrorRed(/could not find the function/i.test(detalle) ? 'sin-migracion' : 'servidor');
  }
  return r.json();
}

async function leer(tabla, consulta) {
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?${consulta}`, { headers: CABECERAS });
  } catch (e) {
    throw new ErrorRed('red');
  }
  if (!r.ok) throw new ErrorRed(r.status === 404 ? 'sin-migracion' : 'servidor');
  return r.json();
}

/* ------------------------------------------------------------------ lecturas */

/** Todos los puestos del directorio, en orden de día y hora. */
export const directorio = () => rpc('directorio_voluntariado');

/** El día de cada actividad. El directorio da el día de cada PUESTO, que puede
    ser otro (el montaje de la víspera); para agrupar actividades hace falta el
    suyo. vista_programa es pública: es la misma que lee la cartelera. */
export const fechasActividades = (ids) => ids.length
  ? leer('vista_programa', `select=id,fecha&id=in.(${ids.join(',')})`)
  : Promise.resolve([]);

/** Las instituciones del catálogo, en su orden. */
export const instituciones = () =>
  leer('instituciones', 'select=id,clave,nombre&activa=eq.true&order=orden.asc,nombre.asc');

/** El estado actual de los turnos guardados en este teléfono. */
export const verTurnos = (tokens) => rpc('ver_turnos', { p_tokens: tokens });

/* ---------------------------------------------------------------- escrituras */

export const inscribirse = (puesto, d) => rpc('inscribirse_voluntariado', {
  p_puesto:               puesto,
  p_nombre:               d.nombre,
  p_correo:               d.correo,
  p_telefono:             d.telefono,
  p_institucion:          d.institucion || null,
  p_institucion_otra:     d.institucion_otra || null,
  p_carrera:              d.carrera,
  p_matricula:            d.matricula || null,
  p_responsable:          d.responsable,
  p_responsable_contacto: d.responsable_contacto || null,
  p_mayor:                Boolean(d.mayor),
  p_consiento:            Boolean(d.consiento),
});

export const cancelar = (token) => rpc('cancelar_turno', { p_token: token });

/* ------------------------------------------------------------------ mensajes */

const CAMPOS = {
  nombre:      'Escribe tu nombre completo.',
  correo:      'Revisa tu correo: parece que le falta algo (debe verse como nombre@escuela.mx).',
  telefono:    'Escribe un teléfono de 10 dígitos donde te puedan localizar ese día.',
  institucion: 'Elige tu institución, o escríbela si no aparece en la lista.',
  carrera:     'Escribe tu carrera o programa.',
  responsable: 'Escribe el nombre de quien coordina tu servicio social en tu institución.',
};

/**
 * La frase para cada respuesta de la base. «r» es la respuesta completa: el
 * empalme trae con qué choca, y eso vale decirlo por su nombre.
 */
export function mensaje(r, formatoHora) {
  const e = r && r.error;
  switch (e) {
    case 'demasiados':     return 'Se hicieron demasiados intentos desde esta conexión. Espera unos minutos y vuelve a intentarlo.';
    case 'consentimiento': return 'Para inscribirte necesitamos que aceptes el aviso de privacidad.';
    case 'mayor_edad':     return 'El voluntariado del festival es para personas de 18 años o más.';
    case 'datos':          return CAMPOS[r.campo] || 'Revisa tus datos: alguno no se pudo guardar.';
    case 'no_existe':      return 'Ese puesto ya no existe. Vuelve al directorio para ver los que siguen abiertos.';
    case 'cerrado':        return 'Ese puesto ya no recibe inscripciones. Busca otro en el directorio.';
    case 'ya_empezo':      return 'Ese turno ya empezó. Si es un cambio de último momento, avísale a la persona de contacto.';
    case 'lleno':          return 'Alguien tomó la última vacante justo antes que tú. Busca otro puesto: el directorio ya está actualizado.';
    case 'retirado':       return 'La coordinación de esta actividad te retiró de este puesto. Si fue un error, escríbele directamente.';
    case 'ya_inscrito':    return 'Ese correo ya está inscrito en este puesto. Tu comprobante está en «Mis turnos», en el teléfono donde te inscribiste.';
    case 'empalme': {
      const c = r.choque || {};
      const cuando = formatoHora ? formatoHora(c) : `${c.hora_inicio}–${c.hora_fin}`;
      return `Ese horario se empalma con otro turno tuyo: «${c.puesto}» en «${c.actividad}», ${cuando}. ` +
             'No puedes estar en dos lugares a la vez; elige otro puesto o cancela el otro turno.';
    }
    default:               return 'Algo salió mal. Vuelve a intentarlo en un momento.';
  }
}

/** La frase para un error de red o de servidor. */
export function mensajeRed(err) {
  if (err && err.message === 'sin-migracion')
    return 'El voluntariado todavía no está listo en la base de datos (falta aplicar sql/19-voluntariado.sql).';
  if (err && err.message === 'red')
    return 'No se pudo conectar. Revisa tu conexión a internet y vuelve a intentarlo.';
  return 'El servidor no respondió. Vuelve a intentarlo en un momento.';
}
