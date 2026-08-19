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
  const [ejes, tipos, sedes, dias] = await Promise.all([
    db.from('ejes').select('nombre, color').order('orden'),
    db.from('tipos').select('nombre').order('orden'),
    db.from('sedes').select('nombre').eq('activa', true).order('orden'),
    db.from('dias').select('etiqueta').order('orden'),
  ]);

  // Supabase NO lanza excepción cuando algo falla: devuelve { data: null, error }.
  // Sin esto, un fallo de red o unas tablas vacías dejaban las listas en blanco
  // y la persona no recibía ninguna explicación.
  const fallo = [ejes, tipos, sedes, dias].find(r => r.error);
  if (fallo) throw fallo.error;

  if (!ejes.data?.length || !tipos.data?.length) {
    throw new Error('catalogos-vacios');
  }

  _cat = {
    ejes:  ejes.data  || [],
    tipos: (tipos.data || []).map(r => r.nombre),
    sedes: (sedes.data || []).map(r => r.nombre),
    dias:  (dias.data  || []).map(r => r.etiqueta),
  };
  return _cat;
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
  return error?.message || 'Algo salió mal. Vuelve a intentarlo.';
}

/* ---------------------------------------------------------------- formato -- */

export function fecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX',
    { day: 'numeric', month: 'short', year: 'numeric' });
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
