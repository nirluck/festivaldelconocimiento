/* ============================================================================
   /boleto/#<token> · UN BOLETO
   ----------------------------------------------------------------------------
   El token va después del «#»: el fragmento no viaja al servidor, así que no
   queda en los registros de Netlify ni se filtra en el Referer.

   Si no hay red, se pinta la copia guardada en este teléfono: en una sede con
   mala señal, el boleto tiene que abrir igual.
   ========================================================================== */

import { montarCabecera } from '../cabecera.js';
import { verBoleto, mensaje } from './api.js';
import { guardarBoleto, olvidarBoleto, boletosGuardados } from './almacen.js';
import { htmlBoleto, htmlAcciones, conectarAcciones } from './tarjeta.js';
import { escapar } from './util.js';

const pagina = document.getElementById('pagina');

window.addEventListener('hashchange', cargar);
montarCabecera();
cargar();

async function cargar() {
  const token = location.hash.replace(/^#/, '').trim();
  if (!/^[0-9a-f]{64}$/.test(token)) return sinBoleto();

  const local = boletosGuardados().find(b => b.token === token);
  if (local) pintar({ ...local }, true);
  else pagina.innerHTML = '<div class="pg-cargando">Buscando tu boleto…</div>';

  let r;
  try {
    r = await verBoleto(token);
  } catch (e) {
    if (local) {
      aviso(`Sin conexión: se muestra la copia guardada en este teléfono (${new Date(local.guardado).toLocaleDateString('es-MX')}).`);
    } else {
      pagina.innerHTML = `<div class="pg-wrap bb-envoltura"><p class="pg-error">${escapar(mensaje(e))}</p></div>`;
    }
    return;
  }

  if (!r.ok) {
    // El token ya no existe: el boleto se canceló y se volvió a pedir, lo que
    // genera un token nuevo. La copia local ya no sirve para nada.
    if (local) olvidarBoleto(token);
    return sinBoleto(true);
  }

  const b = { ...r, token };
  guardarBoleto(b);
  pintar(b, false);
}

function pintar(b, esCopia) {
  document.title = 'Mi boleto · ' + (b.actividad?.titulo || 'Festival del Conocimiento');
  pagina.innerHTML = `
    <div class="pg-wrap bb-envoltura bb-envoltura--boleto">
      <p class="bb-volver"><a href="/mis-boletos/">← Mis boletos</a></p>
      <p class="bo-aviso" id="aviso-pagina" hidden></p>
      <div id="caja-boleto">
        ${htmlBoleto(b)}
        ${htmlAcciones(b)}
      </div>
      <p class="bb-mas"><a href="/programa/${encodeURIComponent(b.actividad?.slug || '')}/">Ver la actividad en el programa</a></p>
    </div>`;
  const caja = document.getElementById('caja-boleto');
  conectarAcciones(caja, b, { alCambiar: (nuevo) => pintar(nuevo, false) });
  if (esCopia) caja.setAttribute('aria-busy', 'true');
}

function aviso(texto) {
  const p = document.getElementById('aviso-pagina');
  if (!p) return;
  p.textContent = texto;
  p.className = 'bo-aviso bo-aviso--info';
  p.hidden = false;
  document.getElementById('caja-boleto')?.removeAttribute('aria-busy');
}

function sinBoleto(existio) {
  pagina.innerHTML = `
    <div class="pg-wrap bb-envoltura">
      <div class="bf-nota">
        <h1>${existio ? 'Este boleto ya no es válido' : 'No encontramos ese boleto'}</h1>
        <p>${existio
          ? 'Se canceló, o se volvió a pedir y ahora tiene otra liga. Revisa tus boletos o pide uno nuevo desde el programa.'
          : 'La liga parece incompleta. Si la copiaste de un mensaje, asegúrate de incluirla entera.'}</p>
        <div class="bf-nota__botones">
          <a class="pg-btn pg-btn--lleno" href="/mis-boletos/">Mis boletos</a>
          <a class="pg-btn" href="/programa/">Ver el programa</a>
        </div>
      </div>
    </div>`;
}
