/* ============================================================================
   NÚCLEO DE LA APLICACIÓN · Festival del Conocimiento
   Cliente de Supabase, sesión y utilidades que comparten todas las páginas.
   ========================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* ---------------------------------------------------------------- sesión -- */

export async function sesion() {
  const { data } = await db.auth.getSession();
  return data.session;
}

/** Perfil de quien entró, con su rol. null si no hay sesión. */
export async function perfil() {
  const s = await sesion();
  if (!s) return null;
  const { data, error } = await db
    .from('perfiles')
    .select('id, correo, nombre, telefono, rol')
    .eq('id', s.user.id)
    .single();
  if (error) return null;
  // La cabecera de la landing lee esto para decidir si ofrecer el Tablero,
  // sin tener que descargar Supabase en la página más visitada del sitio.
  try { localStorage.setItem('fdc_rol', data.rol); } catch (e) {}
  return data;
}

/**
 * Exige sesión para ver la página. Si no la hay, manda a /entrar recordando
 * a dónde quería ir.
 * @param {string} rol  'administrador' para exigir además ese rol.
 */
export async function exigirSesion(rol) {
  const p = await perfil();
  if (!p) {
    const vuelve = encodeURIComponent(location.pathname + location.search);
    location.replace('/entrar/?vuelve=' + vuelve);
    return null;
  }
  if (rol === 'administrador' && p.rol !== 'administrador') {
    location.replace('/mi-actividad/');
    return null;
  }
  return p;
}

export async function salir() {
  await db.auth.signOut();
  location.href = '/';
}

/* ------------------------------------------------------------- catálogos -- */

let _cat = null;

export async function catalogos() {
  if (_cat) return _cat;
  const [ejes, tipos, sedes] = await Promise.all([
    db.from('ejes').select('nombre, color').order('orden'),
    db.from('tipos').select('nombre').order('orden'),
    db.from('sedes').select('nombre').eq('activa', true).order('orden'),
  ]);

  // Supabase NO lanza excepción cuando algo falla: devuelve { data: null, error }.
  // Sin esto, un fallo de red o unas tablas vacías dejaban las listas en blanco
  // y la persona no recibía ninguna explicación.
  const fallo = [ejes, tipos, sedes].find(r => r.error);
  if (fallo) throw fallo.error;

  if (!ejes.data?.length || !tipos.data?.length) {
    throw new Error('catalogos-vacios');
  }

  _cat = {
    ejes:  ejes.data  || [],
    tipos: (tipos.data || []).map(r => r.nombre),
    sedes: (sedes.data || []).map(r => r.nombre),
  };
  return _cat;
}

/* --------------------------------------------------------------- edición -- */

let _edicion = null;

/**
 * La edición del festival que está corriendo. De aquí salen las fechas que
 * acotan el campo de fecha del registro. Se lee sin sesión a propósito: el
 * formulario tiene que armarse antes de que la persona tenga cuenta.
 */
export async function edicionActiva() {
  if (_edicion) return _edicion;
  const { data, error } = await db
    .from('ediciones')
    .select('id, anio, nombre, fecha_inicio, fecha_fin')
    .eq('activa', true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('sin-edicion');
  _edicion = data;
  return _edicion;
}

/** Llena un <select> con opciones. */
export function llenar(sel, valores, placeholder) {
  if (!sel) return;
  sel.innerHTML = '';
  if (placeholder) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = placeholder; o.disabled = true; o.selected = true;
    sel.appendChild(o);
  }
  valores.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
}

/* ----------------------------------------------------------------- avisos -- */

/** Mensaje al usuario. tipo: 'ok' | 'mal' | 'info' */
export function aviso(caja, tipo, texto) {
  if (!caja) return;
  caja.className = 'aviso aviso--' + tipo;
  caja.textContent = texto;
  caja.hidden = false;
  caja.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function limpiarAviso(caja) {
  if (caja) caja.hidden = true;
}

/**
 * Traduce los errores de Supabase a algo que una persona entienda.
 * Cada mensaje dice qué pasó y qué hacer.
 */
export function explicar(error) {
  const m = (error?.message || '').toLowerCase();
  if (m === 'catalogos-vacios')
    return 'Las listas del formulario están vacías. Falta ejecutar los archivos SQL en Supabase (ver README).';
  if (m === 'sin-edicion')
    return 'No hay ninguna edición del festival marcada como activa. Falta ejecutar sql/07-nucleo.sql en Supabase (ver README).';
  if (m.includes('invalid login credentials'))
    return 'El correo o la contraseña no coinciden. Revísalos e inténtalo de nuevo.';
  if (m.includes('email not confirmed'))
    return 'Tu cuenta todavía no está confirmada. Busca el correo de confirmación, incluida la carpeta de spam.';
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Ese correo ya tiene cuenta. Entra con tu contraseña o recupérala desde la página de acceso.';
  if (m.includes('password should be at least'))
    return 'La contraseña necesita al menos 8 caracteres.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.';
  if (m.includes('failed to fetch') || m.includes('networkerror'))
    return 'No se pudo conectar. Revisa tu conexión a internet.';
  if (m.includes('row-level security') || m.includes('violates'))
    return 'Tu cuenta no tiene permiso para hacer eso.';
  // Cuando falta una migración, Supabase contesta con el nombre de la tabla que
  // no encuentra. Dicho así no le sirve a nadie: lo que hace falta es saber que
  // el remedio está en el editor SQL.
  if (m.includes('schema cache') || m.includes('could not find the table')
      || m.includes('does not exist'))
    return 'La base de datos todavía no tiene la estructura que esta página necesita. Falta ejecutar los archivos SQL en Supabase, en orden (ver README).';
  return error?.message || 'Algo salió mal. Vuelve a intentarlo.';
}

/* ---------------------------------------------------------------- formato -- */

export function fecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX',
    { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Fechas SIN hora, como «actividades.fecha».
 *
 * No se puede usar fecha() para esto: new Date('2026-10-17') se interpreta como
 * medianoche UTC, y al imprimirla en Ensenada —siete horas atrás— sale el 16 de
 * octubre. Un día entero de corrimiento en todo el programa. Construyendo la
 * fecha con sus tres componentes se queda en la hora local y no se mueve.
 */
export function fechaDia(iso, largo) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return '—';
  // Con «largo» se cae el día de la semana: «sáb, 24 de oct de 2026» mete una
  // coma que no viene a cuento. La forma larga se lee mejor sin él.
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', largo
    ? { day: 'numeric', month: 'long', year: 'numeric' }
    : { weekday: 'short', day: 'numeric', month: 'short' });
}

/** La hora que llega de Postgres como «14:30:00» se muestra como «14:30». */
export function hora(hhmmss) {
  return hhmmss ? String(hhmmss).slice(0, 5) : '';
}

export function fechaHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX',
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function escapar(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
