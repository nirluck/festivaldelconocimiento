/* ============================================================================
   PUERTA · LLAMADAS A LA BASE
   ----------------------------------------------------------------------------
   Como boletos/api.js, sin supabase-js. Con una diferencia: aquí cada
   petición tiene un tiempo límite. En una sede con poca señal, una petición
   puede quedarse colgada un minuto; la puerta no espera, sigue con su copia
   local y lo vuelve a intentar después.

   Las funciones (sql/11-boletos.sql y sql/17-puerta.sql) responden
   { ok:false, error:'<código>' } para decir «no». Una excepción ErrorRed
   quiere decir que no hubo respuesta: sin red, o el servidor falló.
   ========================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export class ErrorRed extends Error {}

export async function rpc(funcion, args, espera = 8000) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), espera);
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcion}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: control.signal,
    });
  } catch (e) {
    throw new ErrorRed('red');
  } finally {
    clearTimeout(reloj);
  }
  if (!r.ok) {
    let detalle = '';
    try { detalle = (await r.json()).message || ''; } catch (e) { /* sin cuerpo */ }
    throw new ErrorRed(/could not find the function/i.test(detalle) ? 'sin-migracion' : 'servidor');
  }
  return r.json();
}

export const entrarPuerta = (codigo) =>
  rpc('entrar_puerta', { p_codigo: codigo });

export const listaPuerta = (actividad, clave) =>
  rpc('lista_puerta', { p_actividad: actividad, p_clave: clave }, 15000);

/** «ref» es el token del QR o el código de seis caracteres. */
export const marcarEntrada = ({ actividad, clave, ref, asistieron = null, cuando = null, admitir = false }) =>
  rpc('marcar_entrada', {
    p_actividad: actividad, p_ref: ref, p_clave: clave,
    p_asistieron: asistieron, p_cuando: cuando, p_admitir: admitir,
  });

export const entradaSinBoleto = ({ actividad, clave, cuantos = 1, cuando = null }) =>
  rpc('entrada_sin_boleto', { p_actividad: actividad, p_cuantos: cuantos, p_clave: clave, p_cuando: cuando });

export const anularEntrada = ({ actividad, clave, boleto }) =>
  rpc('anular_entrada', { p_actividad: actividad, p_boleto: boleto, p_clave: clave });

export const ajustarEntrada = ({ actividad, clave, boleto, cuantos }) =>
  rpc('ajustar_entrada', { p_actividad: actividad, p_boleto: boleto, p_asistieron: cuantos, p_clave: clave });
