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

let _generos = null;
/** Las opciones de género, del catálogo de la base. */
export async function generos() {
  if (_generos) return _generos;
  const filas = await leer('opciones_asistencia', 'select=valor&campo=eq.genero&activa=eq.true&order=orden');
  _generos = filas.map(f => f.valor);
  return _generos;
}

/**
 * Autocompletado del lugar. El catálogo (SEPOMEX) no se descarga entero:
 * su nota de uso prohíbe distribuirlo, así que se consulta de ocho en ocho.
 */
export const buscarMunicipios = (texto) =>
  rpc('buscar_municipios', { p_texto: texto });
export const buscarColonias = (municipio, texto) =>
  rpc('buscar_colonias', { p_municipio: municipio, p_texto: texto });

/* ------------------------------------------------------------- operaciones */

/**
 * Datos mínimos (asesoría legal, 21 de septiembre de 2026): nombre, fecha de
 * nacimiento, género y lugar. Sin correo.
 */
export function solicitarBoleto(d) {
  return rpc('solicitar_boleto', {
    p_slug:       d.slug,
    p_nombre:     d.nombre,
    p_nacimiento: d.nacimiento,          // 'AAAA-MM-DD'
    p_genero:     d.genero,
    p_municipio:  d.municipio,           // id del catálogo
    p_colonia:    d.colonia || null,     // id del catálogo, solo Baja California
    p_lugares:    d.lugares || 1,
    p_origen:     d.origen || 'otro',
    p_consiento:  !!d.consiento,
    p_espera:     !!d.espera,
  });
}

export const verBoleto      = (token) => rpc('ver_boleto',      { p_token: token });
export const cancelarBoleto = (token) => rpc('cancelar_boleto', { p_token: token });

/** Con nombre y fecha de nacimiento, los boletos vigentes de esa persona. */
export const recuperarBoletos = (nombre, nacimiento) =>
  rpc('recuperar_boletos', { p_nombre: nombre, p_nacimiento: nacimiento });

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
      return 'Para darte tu boleto necesitamos que aceptes los términos y el aviso de privacidad.';
    case 'nombre':
      return 'Escribe tu nombre para que podamos identificar tu boleto en la entrada.';
    case 'nacimiento':
      return 'Revisa tu fecha de nacimiento: elige día, mes y año.';
    case 'genero':
      return 'Elige una opción de género (puede ser «Prefiero no decir»).';
    case 'municipio':
      return 'Escribe tu ciudad o municipio y elígelo de la lista.';
    case 'colonia':
      return 'Elige tu colonia de la lista, o deja el campo vacío.';
    case 'datos':
      return 'Escribe tu nombre y tu fecha de nacimiento completa.';
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
        ? 'Ya estás en la lista de espera de esta actividad con ese nombre y fecha de nacimiento.'
        : 'Ya hay un boleto para esta actividad con ese nombre y fecha de nacimiento. Recupéralo en «Mis boletos» o da tu nombre en la entrada.';
    case 'tope':
      return `Ya tienes ${r.maximo} boletos, el máximo por persona. Si ya no vas a ir a alguna actividad, cancela ese boleto y podrás pedir otro.`;
    case 'empalme':
      return `Ya tienes boleto para «${r.con}», que coincide en horario con esta actividad.`;
    case 'agotado':
      return r.disponibles > 0
        ? `Solo ${r.disponibles === 1 ? 'queda 1 lugar' : `quedan ${r.disponibles} lugares`}. Pide ${r.disponibles === 1 ? 'uno' : r.disponibles + ' o menos'}.`
        : 'Se terminaron los lugares.';
    case 'demasiados':
      return 'Hubo muchos intentos desde esta conexión en poco tiempo. Espera unos minutos y vuelve a intentarlo.';
    default:
      return 'Algo salió mal. Vuelve a intentarlo.';
  }
}
