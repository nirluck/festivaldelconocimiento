/* ============================================================================
   BOLETOS · «¿DESDE DÓNDE NOS VISITAS?»
   ----------------------------------------------------------------------------
   Municipio y, si es de Baja California, colonia. Los dos con autocompletado
   contra el catálogo de SEPOMEX que vive en la base (sql/12-datos-minimos.sql):
   la persona escribe, elige de la lista y solo se aceptan valores del
   catálogo. Así los datos llegan limpios, sin «Ensenda» ni «ens.».

     htmlLugar(id)                 el marcado
     conectarLugar(raiz, id)       → { valor(), error() }

   valor() → { municipio: id|null, colonia: id|null }
   error() → null, o { campo, texto } si falta elegir el municipio

   Patrón «combobox» de ARIA: el foco se queda en el campo y la opción activa
   se anuncia con aria-activedescendant. Flechas para moverse, Enter para
   elegir, Escape para cerrar.
   ========================================================================== */

import { buscarMunicipios, buscarColonias } from './api.js';
import { escapar } from './util.js';

export function htmlLugar(id) {
  return `
    <div class="bf__campo">
      <label for="${id}-mun" id="${id}-mun-et">¿Desde dónde nos visitas?</label>
      <div class="cb">
        <input id="${id}-mun" name="municipio" type="text" role="combobox" autocomplete="off"
               aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-mun-lista"
               aria-describedby="${id}-mun-ayuda" placeholder="Escribe tu ciudad o municipio">
        <ul class="cb__lista" id="${id}-mun-lista" role="listbox" aria-labelledby="${id}-mun-et" hidden></ul>
      </div>
      <small id="${id}-mun-ayuda">Por ejemplo, «Ensenada». Elige de la lista. Si vienes de fuera del país, escribe «otro país».</small>
    </div>

    <div class="bf__campo" data-colonia hidden>
      <label for="${id}-col" id="${id}-col-et">Colonia <span class="bf__opcional">Opcional</span></label>
      <div class="cb">
        <input id="${id}-col" name="colonia" type="text" role="combobox" autocomplete="off"
               aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-col-lista"
               placeholder="Escribe tu colonia">
        <ul class="cb__lista" id="${id}-col-lista" role="listbox" aria-labelledby="${id}-col-et" hidden></ul>
      </div>
    </div>`;
}

export function conectarLugar(raiz, id) {
  const cajaColonia = raiz.querySelector('[data-colonia]');
  let municipio = null;     // { id, texto, con_colonias }
  let colonia = null;       // { id, texto }

  const mun = combobox(raiz.querySelector(`#${id}-mun`), raiz.querySelector(`#${id}-mun-lista`), {
    buscar: (t) => buscarMunicipios(t),
    etiqueta: (r) => r.estado === 'Fuera de México' ? r.municipio
                   : `${r.municipio}, ${r.estado}`,
    elegir: (r) => {
      municipio = r ? { id: r.id, texto: `${r.municipio}, ${r.estado}`, con_colonias: r.con_colonias } : null;
      // La colonia solo tiene sentido dentro del municipio elegido.
      colonia = null;
      col.limpiar();
      cajaColonia.hidden = !(municipio && municipio.con_colonias);
    },
  });

  const col = combobox(raiz.querySelector(`#${id}-col`), raiz.querySelector(`#${id}-col-lista`), {
    buscar: (t) => municipio ? buscarColonias(municipio.id, t) : Promise.resolve([]),
    etiqueta: (r) => r.colonia,
    detalle: (r) => r.tipo && r.tipo !== 'Colonia' ? r.tipo : '',
    elegir: (r) => { colonia = r ? { id: r.id, texto: r.colonia } : null; },
  });

  return {
    valor: () => ({ municipio: municipio?.id ?? null, colonia: colonia?.id ?? null }),
    error: () => {
      if (!municipio) return { campo: 'municipio', texto: 'Escribe tu ciudad o municipio y elígelo de la lista.' };
      // Texto escrito en la colonia sin elegir de la lista: se avisa en vez de
      // perderlo en silencio.
      if (!colonia && raiz.querySelector(`#${id}-col`).value.trim() && !cajaColonia.hidden) {
        return { campo: 'colonia', texto: 'Elige tu colonia de la lista, o deja el campo vacío.' };
      }
      return null;
    },
  };
}

/* ========================================================================== */

function combobox(input, lista, op) {
  let resultados = [];
  let activa = -1;
  let elegido = null;
  let turno = 0;           // descarta respuestas viejas si llegan tarde
  let espera;

  const cerrar = () => {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activa = -1;
  };

  const pintar = (mensaje) => {
    if (mensaje) {
      lista.innerHTML = `<li class="cb__nada" role="option" aria-disabled="true">${escapar(mensaje)}</li>`;
    } else {
      lista.innerHTML = resultados.map((r, i) => {
        const det = op.detalle ? op.detalle(r) : '';
        return `<li role="option" id="${input.id}-op-${i}" aria-selected="${i === activa}"
                    class="cb__op${i === activa ? ' cb__op--activa' : ''}" data-i="${i}">
                  ${escapar(op.etiqueta(r))}${det ? `<small>${escapar(det)}</small>` : ''}
                </li>`;
      }).join('');
    }
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (activa >= 0) input.setAttribute('aria-activedescendant', `${input.id}-op-${activa}`);
    else input.removeAttribute('aria-activedescendant');
  };

  const elegir = (i) => {
    const r = resultados[i];
    if (!r) return;
    elegido = r;
    input.value = op.etiqueta(r);
    input.removeAttribute('aria-invalid');
    cerrar();
    op.elegir(r);
  };

  const buscar = async () => {
    const texto = input.value.trim();
    if (texto.length < 2) { resultados = []; cerrar(); return; }
    const mio = ++turno;
    let r;
    try {
      r = await op.buscar(texto);
    } catch (e) {
      if (mio === turno) pintar('No se pudo buscar. Revisa tu conexión.');
      return;
    }
    if (mio !== turno) return;
    resultados = Array.isArray(r) ? r : [];
    activa = resultados.length ? 0 : -1;
    pintar(resultados.length ? '' : 'Sin coincidencias. Prueba con menos letras.');
  };

  input.addEventListener('input', () => {
    // Si ya había algo elegido y la persona sigue escribiendo, deja de valer.
    if (elegido) { elegido = null; op.elegir(null); }
    clearTimeout(espera);
    espera = setTimeout(buscar, 180);
  });

  input.addEventListener('keydown', (ev) => {
    if (lista.hidden || !resultados.length) {
      if (ev.key === 'ArrowDown' && input.value.trim().length >= 2) { ev.preventDefault(); buscar(); }
      return;
    }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); activa = (activa + 1) % resultados.length; pintar(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); activa = (activa - 1 + resultados.length) % resultados.length; pintar(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); elegir(activa < 0 ? 0 : activa); }
    else if (ev.key === 'Escape') { ev.preventDefault(); cerrar(); }
  });

  // mousedown y no click: con click, el blur del campo cerraría la lista
  // antes de que la elección llegue.
  lista.addEventListener('mousedown', (ev) => {
    const li = ev.target.closest('[data-i]');
    if (!li) return;
    ev.preventDefault();
    elegir(Number(li.dataset.i));
  });

  input.addEventListener('blur', () => setTimeout(cerrar, 120));

  return {
    limpiar() { elegido = null; resultados = []; input.value = ''; cerrar(); },
  };
}
