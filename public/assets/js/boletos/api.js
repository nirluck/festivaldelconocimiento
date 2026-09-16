/* ============================================================================
   BOLETOS · LLAMADAS A LA BASE
   ----------------------------------------------------------------------------
   Sin supabase-js, a propósito: /b/<slug> se abre desde un QR en la calle, con
   datos móviles, y no tiene por qué descargar la librería completa para hacer
   tres peticiones. Es el mismo criterio de programa-portada.js.

   Las funciones de la base (sql/11-boletos.sql) no lanzan excepciones para
   decir «no»: responden { ok:false, error:'<código>' }. mensaje() convierte
   cada código en una frase que dice qué pasó y qué hacer.
   ========================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { fechaHoraTexto } from './util.js';

const CABECERAS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
};

/** Error de red o de servidor: la petición ni siquiera llegó a la función. */
class ErrorRed extends Error {}

async function rpc(funcion, args) {
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
    // Si la migración no está aplicada, PostgREST dice que no encuentra la
    // función. Se distingue para que el mensaje apunte al remedio.
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
  if (!r.ok) throw new ErrorRed('servidor');
  return r.json();
}

/* ------------------------------------------------------------------ lecturas */

/**
 * La actividad publicada con ese slug, de la edición activa. El slug es único
 * dentro de una edición, no en toda la base (ver programa.js).
 */
export async function actividadPorSlug(slug) {
  const [filas, ediciones] = await Promise.all([
    leer('vista_programa', 'select=*&slug=eq.' + encodeURIComponent(slug)),
    leer('ediciones', 'select=id&activa=eq.true&limit=1').catch(() => []),
  ]);
  if (!filas.length) return null;
  const activa = ediciones[0]?.id;
  return filas.find(f => f.edicion_id === activa) || filas[0];
}

let _opciones = null;
/** Las listas del formulario: { edad:[], ocupacion:[], procedencia:[] }. */
export async function opcionesFormulario() {
  if (_opciones) return _opciones;
  const filas = await leer('opciones_asistencia', 'select=campo,valor&activa=eq.true&order=campo,orden');
  const o = { edad: [], ocupacion: [], procedencia: [] };
  filas.forEach(f => { if (o[f.campo]) o[f.campo].push(f.valor); });
  _opciones = o;
  return o;
}

/* ------------------------------------------------------------- operaciones */

export function solicitarBoleto(d) {
  return rpc('solicitar_boleto', {
    p_slug:        d.slug,
    p_nombre:      d.nombre,
    p_correo:      d.correo,
    p_edad:        d.edad,
    p_ocupacion:   d.ocupacion,
    p_procedencia: d.procedencia || null,
    p_lugares:     d.lugares || 1,
    p_origen:      d.origen || 'otro',
    p_consiento:   !!d.consiento,
    p_espera:      !!d.espera,
  });
}

export const verBoleto      = (token) => rpc('ver_boleto',      { p_token: token });
export const cancelarBoleto = (token) => rpc('cancelar_boleto', { p_token: token });

/* ---------------------------------------------------------------- mensajes */

/**
 * Frase para una respuesta con ok:false, o para un error lanzado.
 * @param {object|Error} r
 */
export function mensaje(r) {
  if (r instanceof ErrorRed || r instanceof Error) {
    if (r.message === 'red')
      return 'No se pudo conectar. Revisa tu conexión a internet e inténtalo de nuevo.';
    if (r.message === 'sin-migracion')
      return 'El sistema de boletos todavía no está listo. Inténtalo más tarde.';
    return 'El servidor no respondió como esperábamos. Inténtalo de nuevo en un momento.';
  }
  switch (r?.error) {
    case 'consentimiento':
      return 'Para darte tu boleto necesitamos que aceptes el aviso de privacidad.';
    case 'nombre':
      return 'Escribe tu nombre para que podamos identificar tu boleto en la entrada.';
    case 'correo':
      return 'Revisa tu correo: parece que le falta algo.';
    case 'edad':
      return 'Elige tu rango de edad.';
    case 'ocupacion':
      return 'Elige tu ocupación.';
    case 'lugares':
      return `En un boleto caben hasta ${r.maximo} ${r.maximo === 1 ? 'lugar' : 'lugares'}.`;
    case 'no_existe':
      return 'No encontramos esta actividad en el programa. Puede que se haya retirado o que la liga esté incompleta.';
    case 'sin_boleto':
      return 'Esta actividad es de entrada libre: no necesitas boleto.';
    case 'aun_no':
      return `Los boletos para esta actividad se abren el ${fechaHoraTexto(r.desde)}.`;
    case 'cerrado':
      return 'Ya no se entregan boletos para esta actividad. Si sobran lugares, se ocupan en la entrada por orden de llegada.';
    case 'duplicado':
      return r.estado === 'espera'
        ? 'Ese correo ya está en la lista de espera de esta actividad.'
        : 'Ese correo ya tiene boleto para esta actividad. Búscalo en «Mis boletos» del teléfono donde lo pediste, o da tu nombre en la entrada.';
    case 'tope':
      return `Ese correo ya tiene ${r.maximo} boletos, el máximo por persona. Si ya no vas a ir a alguna actividad, cancela ese boleto y podrás pedir otro.`;
    case 'empalme':
      return `Ese correo ya tiene boleto para «${r.con}», que coincide en horario con esta actividad.`;
    case 'agotado':
      return r.disponibles > 0
        ? `Solo ${r.disponibles === 1 ? 'queda 1 lugar' : `quedan ${r.disponibles} lugares`}. Pide ${r.disponibles === 1 ? 'uno' : r.disponibles + ' o menos'}.`
        : 'Se terminaron los lugares.';
    case 'demasiados':
      return 'Se han pedido muchos boletos desde esta conexión en poco tiempo. Espera unos minutos y vuelve a intentarlo.';
    default:
      return 'Algo salió mal. Vuelve a intentarlo.';
  }
}
