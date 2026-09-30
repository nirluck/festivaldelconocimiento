/* ============================================================================
   MÓDULO · PONENTES
   ----------------------------------------------------------------------------
   Quién imparte, presenta o toca en la actividad: nombre, papel, institución,
   sitio, semblanza y foto. Es la parte de ponentes de la fase C del plan; el
   modelo y sus razones están en sql/13-ponentes.sql.

   Dos cosas que esta pantalla tiene que dejar claras, porque el modelo las
   separa a propósito:

     · La PERSONA (nombre, semblanza, foto…) es una sola para todas sus
       actividades. Editarla aquí la cambia en todas, y el formulario lo dice.
     · Su PARTICIPACIÓN (papel y orden) es solo de esta actividad. Quitar a
       alguien de aquí no lo borra: su semblanza queda para la siguiente vez.

   Antes de dar de alta a alguien se busca entre los ya registrados, mientras
   se escribe el nombre. Es lo único que evita duplicados: no se pide correo
   (ver «POR QUÉ NO HAY CORREO» en el SQL).
   ========================================================================== */

import { db, aviso, limpiarAviso, explicar, escapar } from '/assets/js/app.js';
import { urlFotoPonente } from '/assets/js/archivos.js';
import { prepararFoto, subirFoto, quitarFoto, ErrorFoto, MAXIMO_FOTO } from '/assets/js/foto-ponente.js';

const $ = (sel, raiz) => raiz.querySelector(sel);

/* Los topes de la base (sql/13-ponentes.sql), repetidos aquí para avisar
   antes de mandar y no con el error de la restricción. */
const NOMBRE_MAX = 160;
const SEMBLANZA_MAX = 2000;
const INSTITUCION_MAX = 160;
const PAPEL_MAX = 60;

/* Sugerencias, no catálogo: el papel es texto libre. */
const PAPELES = ['Ponente', 'Conferencista', 'Tallerista', 'Moderadora', 'Moderador',
  'Presentadora', 'Presentador', 'Artista invitada', 'Artista invitado',
  'Banda invitada', 'Directora', 'Director', 'Comentarista'];

const RESULTADOS_MAX = 6;

/* ------------------------------------------------------------ utilidades -- */

/** Sin acentos, minúsculas y solo letras y números: «Dra. José» → «dra jose». */
function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const GRADOS = /^(dr|dra|mtro|mtra|m|lic|ing|arq|prof|profa|mc|phd)$/;

/** Dos iniciales, sin contar el grado: «Dra. Ana Ruiz» → «AR». */
function iniciales(nombre) {
  const palabras = normalizar(nombre).split(' ').filter(p => p && !GRADOS.test(p));
  const letras = palabras.slice(0, 2).map(p => p[0]).join('');
  return (letras || '?').toUpperCase();
}

/**
 * «www.sitio.mx» → «https://www.sitio.mx». Devuelve null si no parece una
 * dirección: la base solo acepta http(s), porque se pinta como enlace en el
 * programa público.
 */
function normalizarSitio(s) {
  let v = String(s || '').trim();
  if (!v) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
  if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v)) return null;
  return v;
}

/** Retrato redondo, con las iniciales debajo por si la foto no carga. */
function avatar(p, clase) {
  const foto = p.foto
    ? `<img src="${escapar(urlFotoPonente(p.foto))}" alt="" loading="lazy" decoding="async"
            onerror="this.remove()">`
    : '';
  return `<span class="${clase}" aria-hidden="true"><i>${escapar(iniciales(p.nombre))}</i>${foto}</span>`;
}


/* ================================================================ módulo == */
export default {
  id: 'ponentes',
  nombre: 'Ponentes',
  aplica: () => true,

  async montar(contenedor, actividad) {
    let lista = [];      // participaciones de esta actividad, con su ponente
    let todos = [];      // todos los ponentes del equipo, para el buscador
    let forma = null;    // lo que se está editando, o null

    async function cargar() {
      const [part, gente] = await Promise.all([
        db.from('actividad_ponentes')
          .select('id, papel, orden, ponente:ponentes(id, nombre, semblanza, foto, institucion, sitio)')
          .eq('actividad_id', actividad.id)
          .order('orden').order('creado'),
        db.from('ponentes').select('id, nombre, institucion, foto').order('nombre'),
      ]);
      // Supabase no lanza excepción: hay que mirar .error (trampa 9).
      if (part.error) throw part.error;
      if (gente.error) throw gente.error;
      lista = (part.data || []).filter(l => l.ponente);
      todos = gente.data || [];
    }

    try {
      await cargar();
    } catch (e) {
      contenedor.innerHTML = `<div class="aviso aviso--mal">${escapar(explicar(e))}</div>`;
      return;
    }

    contenedor.innerHTML = `
    <div class="pon-modulo">
      <div class="aviso" id="p-aviso" hidden></div>

      <div class="tarjeta">
        <fieldset>
          <legend>Quién participa</legend>
          <p class="leyenda">
            Las personas que imparten, presentan o tocan en esta actividad. Su
            foto y su semblanza salen en la página de la actividad; sus nombres,
            también en la cartelera.
            ${actividad.publica
              ? '<strong>Esta actividad ya está en el programa: los cambios se ven de inmediato.</strong>'
              : 'Se verán en cuanto la administración la publique en el programa.'}
          </p>

          <ol class="pon-lista" id="p-lista"></ol>

          <div class="pon-buscar" id="p-buscar">
            <div class="campo">
              <label for="p-q">Agregar a alguien</label>
              <input type="search" id="p-q" autocomplete="off" spellcheck="false"
                     placeholder="Escribe su nombre" aria-describedby="p-q-pista"
                     aria-controls="p-res">
              <span class="pista" id="p-q-pista">Primero se busca entre quienes ya
                participaron en el festival, para reutilizar su semblanza y su foto.</span>
            </div>
            <ul class="pon-res" id="p-res" hidden></ul>
          </div>

          <div id="p-forma"></div>
        </fieldset>
      </div>
    </div>`;

    const caja   = $('#p-aviso', contenedor);
    const ulLista = $('#p-lista', contenedor);
    const entrada = $('#p-q', contenedor);
    const ulRes  = $('#p-res', contenedor);
    const bloqueBuscar = $('#p-buscar', contenedor);
    const cajaForma = $('#p-forma', contenedor);

    /* ------------------------------------------------------------ lista -- */
    function pintarLista() {
      if (!lista.length) {
        ulLista.innerHTML = `<li class="pon-vacio">Todavía no hay nadie. Búscalo abajo por su nombre.</li>`;
        return;
      }
      ulLista.innerHTML = lista.map((l, i) => {
        const p = l.ponente;
        const sub = [l.papel, p.institucion].filter(Boolean).map(escapar).join(' · ');
        const faltas = [!p.semblanza && 'semblanza', !p.foto && 'foto'].filter(Boolean);
        return `
        <li class="pon-fila" data-i="${i}">
          ${avatar(p, 'pon-avatar')}
          <div class="pon-fila__txt">
            <b>${escapar(p.nombre)}</b>
            ${sub ? `<small>${sub}</small>` : ''}
            ${faltas.length ? `<span class="pon-falta">Falta ${faltas.join(' y ')}</span>` : ''}
          </div>
          <div class="pon-fila__acc">
            ${lista.length > 1 ? `
            <button type="button" class="pon-mover" data-mover="-1" ${i === 0 ? 'disabled' : ''}
                    aria-label="Subir a ${escapar(p.nombre)}" title="Subir">↑</button>
            <button type="button" class="pon-mover" data-mover="1" ${i === lista.length - 1 ? 'disabled' : ''}
                    aria-label="Bajar a ${escapar(p.nombre)}" title="Bajar">↓</button>` : ''}
            <button type="button" class="btn btn--chico btn--linea" data-editar>Editar</button>
            <button type="button" class="btn btn--chico poster__quitar" data-quitar>Quitar</button>
          </div>
        </li>`;
      }).join('');
    }

    ulLista.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button');
      const fila = ev.target.closest('.pon-fila');
      if (!b || !fila || b.disabled) return;
      const i = Number(fila.dataset.i);
      if (b.dataset.mover) return mover(i, Number(b.dataset.mover));
      if ('editar' in b.dataset) return abrirForma({ modo: 'editar', parte: lista[i] });
      if ('quitar' in b.dataset) return quitar(lista[i]);
    });

    /* El orden se reescribe completo (1, 2, 3…) y no solo se intercambia: si
       dos filas quedaron con el mismo número, intercambiarlas no movería nada. */
    async function mover(i, delta) {
      const j = i + delta;
      if (j < 0 || j >= lista.length) return;
      const nueva = lista.slice();
      [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
      limpiarAviso(caja);
      const cambios = nueva
        .map((l, k) => ({ l, orden: k + 1 }))
        .filter(({ l, orden }) => l.orden !== orden);
      const res = await Promise.all(cambios.map(({ l, orden }) =>
        db.from('actividad_ponentes').update({ orden }).eq('id', l.id)));
      const fallo = res.find(r => r.error);
      if (fallo) { aviso(caja, 'mal', explicar(fallo.error)); return; }
      cambios.forEach(({ l, orden }) => { l.orden = orden; });
      lista = nueva;
      pintarLista();
    }

    async function quitar(parte) {
      const nombre = parte.ponente.nombre;
      if (!confirm(`¿Quitar a ${nombre} de esta actividad?\n\n` +
                   'Su semblanza y su foto se quedan guardadas por si participa en otra.')) return;
      limpiarAviso(caja);
      const { data, error } = await db.from('actividad_ponentes')
        .delete().eq('id', parte.id).select('id');
      if (error || !data || !data.length) {
        aviso(caja, 'mal', explicar(error || new Error('row-level security')));
        return;
      }
      if (forma && forma.parte && forma.parte.id === parte.id) cerrarForma();
      await recargarLista();
      aviso(caja, 'ok', `${nombre} ya no aparece en esta actividad.`);
    }

    async function recargarLista() {
      try {
        await cargar();
      } catch (e) {
        aviso(caja, 'mal', explicar(e));
      }
      pintarLista();
    }

    const siguienteOrden = () => lista.reduce((m, l) => Math.max(m, l.orden || 0), 0) + 1;

    /* ---------------------------------------------------------- buscador -- */
    function pintarResultados() {
      const q = entrada.value.trim();
      const palabras = normalizar(q).split(' ').filter(Boolean);
      if (!palabras.length || normalizar(q).length < 2) { ulRes.hidden = true; ulRes.innerHTML = ''; return; }

      const ya = new Set(lista.map(l => l.ponente.id));
      const hallados = todos
        .filter(p => !ya.has(p.id))
        .filter(p => { const n = normalizar(p.nombre); return palabras.every(w => n.includes(w)); })
        .slice(0, RESULTADOS_MAX);

      // Quien ya está en ESTA actividad también se busca, para decir por qué
      // no aparece como opción en vez de dejar a la persona adivinando.
      const aqui = lista.find(l => palabras.every(w => normalizar(l.ponente.nombre).includes(w)));

      ulRes.innerHTML = `
        ${hallados.map(p => `
          <li><button type="button" class="pon-res__item" data-agregar="${escapar(p.id)}">
            ${avatar(p, 'pon-avatar pon-avatar--chico')}
            <span><b>${escapar(p.nombre)}</b>${p.institucion ? `<small>${escapar(p.institucion)}</small>` : ''}</span>
            <em>Agregar</em>
          </button></li>`).join('')}
        ${aqui && !hallados.length ? `<li class="pon-res__nota">${escapar(aqui.ponente.nombre)} ya está en esta actividad.</li>` : ''}
        <li><button type="button" class="pon-res__nuevo" data-nuevo>
          + ${hallados.length ? 'Es otra persona: registrar' : 'Registrar'} a «${escapar(q)}»
        </button></li>`;
      ulRes.hidden = false;
    }

    entrada.addEventListener('input', pintarResultados);
    entrada.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { entrada.value = ''; pintarResultados(); }
    });

    ulRes.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if ('nuevo' in b.dataset) {
        abrirForma({ modo: 'nuevo', nombre: entrada.value.trim() });
        return;
      }
      if (b.dataset.agregar) await agregarExistente(b.dataset.agregar, b);
    });

    async function agregarExistente(ponenteId, boton) {
      limpiarAviso(caja);
      boton.disabled = true;
      const { error } = await db.from('actividad_ponentes').insert({
        actividad_id: actividad.id, ponente_id: ponenteId, papel: '', orden: siguienteOrden(),
      });
      if (error) {
        boton.disabled = false;
        aviso(caja, 'mal', explicar(error));
        return;
      }
      entrada.value = '';
      pintarResultados();
      await recargarLista();
      // Se abre su ficha para ponerle papel y revisar que la semblanza siga al día.
      const parte = lista.find(l => l.ponente.id === ponenteId);
      if (parte) abrirForma({ modo: 'editar', parte, recienAgregado: true });
    }

    /* -------------------------------------------------------- formulario -- */
    function abrirForma(op) {
      if (forma && forma.foto) forma.foto.liberar();
      const p = op.parte ? op.parte.ponente : { nombre: op.nombre || '', semblanza: '', institucion: '', sitio: '', foto: null };
      forma = {
        modo: op.modo,
        parte: op.parte || null,
        fotoGuardada: p.foto || null,
        foto: null,        // la recién elegida, ya preparada
        quitarFoto: false,
      };

      const v = s => escapar(s ?? '');
      const titulo = op.modo === 'nuevo' ? 'Registrar a alguien nuevo' : `Editar a ${p.nombre}`;

      cajaForma.innerHTML = `
        <form class="pon-forma" id="p-f" novalidate>
          <h3 class="pon-forma__tit">${escapar(titulo)}</h3>
          ${op.recienAgregado ? `<div class="aviso aviso--ok">Se agregó a la actividad. Dile qué papel tiene y revisa que su semblanza siga al día.</div>` : ''}
          ${op.modo === 'editar' ? `
          <p class="pon-forma__nota">La foto, la semblanza y los demás datos son de la persona:
            si participa en otras actividades, lo que cambies también cambia ahí.
            El <b>papel</b> sí es solo de esta actividad.</p>` : ''}

          <div class="pon-forma__rejilla">
            <div class="pon-foto">
              <div class="pon-foto__marco" id="p-foto-marco"></div>
              <div class="pon-foto__acc">
                <button type="button" class="btn btn--chico btn--linea" id="p-foto-elegir">Elegir foto</button>
                <button type="button" class="btn btn--chico poster__quitar" id="p-foto-quitar" hidden>Quitar</button>
                <input type="file" accept="image/*" class="sr" tabindex="-1" aria-hidden="true" id="p-foto-archivo">
              </div>
              <p class="pon-foto__estado" id="p-foto-estado" aria-live="polite" hidden></p>
              <p class="pista">Un retrato donde se vea bien la cara, o una foto del grupo.
                Cualquier forma: se recorta en círculo al mostrarla. Hasta ${MAXIMO_FOTO / (1024 * 1024)} MB.</p>
            </div>

            <div class="campos campos--2">
              <div class="campo completo">
                <label for="p-nombre">Nombre</label>
                <input type="text" id="p-nombre" value="${v(p.nombre)}" maxlength="${NOMBRE_MAX}" required>
                <span class="pista">Como debe aparecer en el programa, con grado si lo usa: «Dra. Ana Ruiz», «Los Panchos».</span>
                <span class="error-campo" id="p-e-nombre" hidden></span>
              </div>

              <div class="campo">
                <label for="p-papel">Papel en esta actividad</label>
                <input type="text" id="p-papel" list="p-papeles" value="${v(op.parte ? op.parte.papel : '')}"
                       maxlength="${PAPEL_MAX}" placeholder="Ponente, Moderadora, Banda invitada…">
                <datalist id="p-papeles">${PAPELES.map(x => `<option value="${escapar(x)}">`).join('')}</datalist>
              </div>

              <div class="campo">
                <label for="p-institucion">Institución o agrupación</label>
                <input type="text" id="p-institucion" value="${v(p.institucion)}" maxlength="${INSTITUCION_MAX}"
                       placeholder="CNyN-UNAM, CICESE, independiente…">
              </div>

              <div class="campo completo">
                <label for="p-sitio">Sitio web o red social <span class="opcional">opcional</span></label>
                <input type="text" id="p-sitio" inputmode="url" autocomplete="url" spellcheck="false"
                       value="${v(p.sitio)}" placeholder="https://…">
                <span class="error-campo" id="p-e-sitio" hidden></span>
              </div>

              <div class="campo completo">
                <label for="p-semblanza">Semblanza</label>
                <textarea id="p-semblanza" rows="6" maxlength="${SEMBLANZA_MAX}"
                  placeholder="Quién es y por qué vale la pena escucharle.">${v(p.semblanza)}</textarea>
                <span class="pista">En tercera persona, de 80 a 150 palabras. Un renglón en blanco separa párrafos.
                  <span class="pon-cuenta" id="p-cuenta"></span></span>
              </div>
            </div>
          </div>

          <div class="acciones">
            <button type="submit" class="btn btn--principal" id="p-guardar">
              ${op.modo === 'nuevo' ? 'Agregar a la actividad' : 'Guardar cambios'}</button>
            <button type="button" class="btn btn--linea" id="p-cancelar">Cancelar</button>
          </div>
        </form>`;

      bloqueBuscar.hidden = true;
      const f = $('#p-f', cajaForma);

      /* ---- foto ---- */
      const marco = $('#p-foto-marco', f), estado = $('#p-foto-estado', f);
      const btnElegir = $('#p-foto-elegir', f), btnQuitar = $('#p-foto-quitar', f);
      const archivo = $('#p-foto-archivo', f);

      const decir = (tipo, html) => {
        if (!html) { estado.hidden = true; return; }
        estado.className = 'poster__estado pon-foto__estado poster__estado--' + tipo;
        estado.innerHTML = html;
        estado.hidden = false;
      };

      const pintarFoto = () => {
        const url = forma.foto ? forma.foto.urlVista
          : (!forma.quitarFoto && forma.fotoGuardada) ? urlFotoPonente(forma.fotoGuardada) : '';
        const nombre = $('#p-nombre', f).value;
        marco.innerHTML = `<i>${escapar(iniciales(nombre))}</i>${url ? `<img src="${escapar(url)}" alt="" onerror="this.remove()">` : ''}`;
        btnElegir.textContent = url ? 'Cambiar foto' : 'Elegir foto';
        btnQuitar.hidden = !url;
      };

      btnElegir.addEventListener('click', () => archivo.click());
      marco.addEventListener('click', () => archivo.click());
      archivo.addEventListener('change', async () => {
        const elegido = archivo.files && archivo.files[0];
        archivo.value = '';   // para que elegir el mismo archivo otra vez vuelva a avisar
        if (!elegido) return;
        btnElegir.disabled = true;
        decir('info', 'Preparando la foto…');
        try {
          const prep = await prepararFoto(elegido);
          if (forma.foto) forma.foto.liberar();
          forma.foto = prep;
          forma.quitarFoto = false;
          pintarFoto();
          const kb = Math.round(prep.blob.size / 1024);
          decir(prep.avisos.length ? 'aviso' : 'ok',
            `Lista para guardar. <small>${prep.ancho} × ${prep.alto} px · ${kb} KB</small>` +
            prep.avisos.map(a => `<br>${escapar(a)}`).join(''));
        } catch (e) {
          decir('mal', escapar(e instanceof ErrorFoto ? e.message : 'No pudimos procesar la foto. Prueba con otro archivo.'));
        } finally {
          btnElegir.disabled = false;
        }
      });
      btnQuitar.addEventListener('click', () => {
        // Sin guardar todavía, «Quitar» solo descarta lo recién elegido y
        // vuelve a la foto que ya tenía.
        if (forma.foto) { forma.foto.liberar(); forma.foto = null; decir(); }
        else { forma.quitarFoto = true; decir('info', 'La foto se quitará al guardar.'); }
        pintarFoto();
      });

      /* ---- contador de la semblanza ---- */
      const semb = $('#p-semblanza', f), cuenta = $('#p-cuenta', f);
      const contar = () => {
        const t = semb.value.trim();
        const palabras = t ? t.split(/\s+/).length : 0;
        cuenta.textContent = palabras ? `Llevas ${palabras} ${palabras === 1 ? 'palabra' : 'palabras'}.` : '';
      };
      semb.addEventListener('input', contar);
      $('#p-nombre', f).addEventListener('input', () => { if (!forma.foto && !forma.fotoGuardada) pintarFoto(); });

      $('#p-cancelar', f).addEventListener('click', cerrarForma);
      f.addEventListener('submit', (ev) => { ev.preventDefault(); guardar(f); });

      pintarFoto();
      contar();
      cajaForma.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $(op.recienAgregado ? '#p-papel' : '#p-nombre', f).focus({ preventScroll: true });
    }

    function cerrarForma() {
      if (forma && forma.foto) forma.foto.liberar();
      forma = null;
      cajaForma.innerHTML = '';
      bloqueBuscar.hidden = false;
    }

    async function guardar(f) {
      limpiarAviso(caja);
      const val = id => $('#p-' + id, f).value.trim();
      const marca = (id, msg) => {
        const c = $('#p-' + id, f), e = $('#p-e-' + id, f);
        c.setAttribute('aria-invalid', msg ? 'true' : 'false');
        if (e) { e.textContent = msg || ''; e.hidden = !msg; }
      };

      const nombre = val('nombre');
      const papel = val('papel');
      const institucion = val('institucion');
      const semblanza = $('#p-semblanza', f).value.trim();
      const sitio = normalizarSitio(val('sitio'));

      let ok = true;
      if (nombre.length < 2) { marca('nombre', 'Escribe su nombre como debe aparecer en el programa.'); ok = false; }
      else marca('nombre', '');
      if (sitio === null) {
        marca('sitio', 'Escribe la dirección completa, por ejemplo https://instagram.com/usuario');
        ok = false;
      } else marca('sitio', '');
      if (!ok) return;

      const btn = $('#p-guardar', f);
      const textoBtn = btn.textContent;
      btn.disabled = true; btn.textContent = 'Guardando…';
      const soltar = () => { btn.disabled = false; btn.textContent = textoBtn; };

      const datos = { nombre, semblanza, institucion, sitio };
      let ponenteId;

      // 1 · los datos. Un update sin permiso no falla: no toca ninguna fila.
      //     Por eso «.select()», para enterarse.
      try {
        if (forma.modo === 'nuevo') {
          const r = await db.from('ponentes').insert(datos).select('id').single();
          if (r.error) throw r.error;
          ponenteId = r.data.id;
          const r2 = await db.from('actividad_ponentes').insert({
            actividad_id: actividad.id, ponente_id: ponenteId, papel, orden: siguienteOrden(),
          });
          if (r2.error) throw r2.error;
        } else {
          ponenteId = forma.parte.ponente.id;
          const r = await db.from('ponentes').update(datos).eq('id', ponenteId).select('id');
          if (r.error) throw r.error;
          if (!r.data || !r.data.length) throw new Error('row-level security');
          if (papel !== (forma.parte.papel || '')) {
            const r2 = await db.from('actividad_ponentes').update({ papel }).eq('id', forma.parte.id).select('id');
            if (r2.error) throw r2.error;
            if (!r2.data || !r2.data.length) throw new Error('row-level security');
          }
        }
      } catch (e) {
        aviso(caja, 'mal', explicar(e));
        soltar();
        return;
      }

      // 2 · la foto, aparte: si falla, los datos ya quedaron y se dice así,
      //     en vez de dar a entender que no se guardó nada.
      let avisoFoto = '';
      try {
        if (forma.foto) await subirFoto(ponenteId, forma.foto, forma.fotoGuardada);
        else if (forma.quitarFoto && forma.fotoGuardada) await quitarFoto(ponenteId, forma.fotoGuardada);
      } catch (e) {
        avisoFoto = ` La foto no se pudo guardar: ${explicar(e)} Vuelve a intentarlo desde «Editar».`;
      }

      cerrarForma();
      await recargarLista();
      aviso(caja, avisoFoto ? 'mal' : 'ok', `${nombre}: datos guardados.${avisoFoto}`);
    }

    pintarLista();
  },
};
