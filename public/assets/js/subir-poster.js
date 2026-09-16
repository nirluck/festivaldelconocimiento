/* ============================================================================
   SUBIR PÓSTER · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Todo lo que hace falta para poner el póster de una actividad, en un solo
   lugar, porque se usa en dos: al registrar la actividad (/registro/) y
   después, desde su panel (módulo Póster). Lo sube el coordinador dueño o la
   administración; quién puede lo deciden las políticas de sql/10-poster.sql,
   no esta pantalla.

   Tres piezas:

     prepararPoster(archivo)   lee la imagen y genera, EN EL NAVEGADOR, las dos
                               versiones que se suben: grande y miniatura.
     subirPoster(id, …)        las sube, apunta la actividad a ellas y borra
                               las del póster anterior.
     quitarPoster(id, ruta)    lo contrario.
     montarSelector(caja, …)   el cuadro para elegir, arrastrar y ver la
                               imagen. No sube nada por sí mismo: avisa a quien
                               lo usa, que decide si subir ya o esperar.

   POR QUÉ SE OPTIMIZA AQUÍ Y NO EN EL SERVIDOR
   Aun con el tope de 4 MB, un póster exportado de Canva en PNG llega pegado a
   ese límite, y el plan gratuito de Supabase no redimensiona imágenes. Sin
   esto, la cartelera cargaría cuarenta imágenes de 4 MB por datos móviles;
   con esto, cuarenta miniaturas de unos 60 KB.

   EL PÓSTER ES CUADRADO
   Decisión del equipo (16 de septiembre de 2026). Se exige aquí, al elegir la
   imagen: Storage no sabe de medidas, así que la base no lo puede vigilar.
   ========================================================================== */

import { db } from './app.js';
import { BUCKET, urlPoster, urlPosterMini, rutaMini } from './archivos.js';

/* Tamaños del lado, en píxeles. El póster es CUADRADO (decisión del equipo,
   16 de septiembre de 2026), así que los dos lados miden lo mismo.
   · 1600 alcanza para la página de la actividad en una pantalla retina.
   · 640 para la miniatura: en la cartelera se ve a 120 px, y así sigue nítida
     incluso a densidad 3x. */
const LADO_GRANDE = 1600;
const LADO_MINI   = 640;
const CALIDAD     = 0.86;

/* Lo que se acepta ELEGIR: 4 MB, por decisión del equipo. Lo que se SUBE
   siempre es WebP o JPEG vuelto a codificar y pesa bastante menos; el bucket
   repite el mismo tope del lado del servidor (sql/10-poster.sql). */
const MB = 1024 * 1024;
export const MAXIMO_ORIGINAL = 4 * MB;

/* Cuánto puede alejarse del cuadrado y aun así aceptarse.
   Los pósters reales llegan «casi» cuadrados: el primero que se subió al sitio
   medía 1538 × 1600, un 4 % fuera. Exigir igualdad exacta rechazaría justo
   esos. Hasta un 5 % se recorta al centro —en ese caso, 31 px por lado, que
   no se notan—; más allá ya es otra forma y el recorte se comería el
   contenido, así que se rechaza y se explica cómo exportarlo. */
const TOLERANCIA_CUADRADO = 0.05;

/* El tamaño que se recomienda: el de una publicación de Instagram, que es
   como casi todos los hacen en Canva. Por debajo se avisa que puede verse
   borrosa, pero no se impide: un póster pequeño es mejor que ninguno. */
const LADO_RECOMENDADO = 1080;
const LADO_MINIMO_SIN_AVISO = 1000;

/** Error con un mensaje ya pensado para la persona, no para el programador. */
export class ErrorPoster extends Error {}


/* ============================================================================
   1 · PREPARAR
   ========================================================================== */

/**
 * Lee la imagen elegida y produce las dos versiones listas para subir.
 *
 * @returns {Promise<{grande:Blob, mini:Blob, ext:string, tipo:string,
 *                    ancho:number, alto:number, avisos:string[],
 *                    urlVista:string, liberar:Function}>}
 * @throws {ErrorPoster} con un mensaje que se puede mostrar tal cual.
 */
export async function prepararPoster(archivo) {
  if (!archivo) throw new ErrorPoster('No se eligió ningún archivo.');

  if (!/^image\//.test(archivo.type) && !/\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(archivo.name)) {
    throw new ErrorPoster('Ese archivo no es una imagen. Sube el póster como JPG, PNG o WebP.');
  }
  if (archivo.size > MAXIMO_ORIGINAL) {
    // Con un decimal: con el tope en 4 MB, un archivo de 4.3 MB redondeado
    // diría «pesa 4 MB y el máximo es 4 MB».
    throw new ErrorPoster(
      `La imagen pesa ${(archivo.size / MB).toFixed(1)} MB y el máximo es ${MAXIMO_ORIGINAL / MB} MB. ` +
      `Expórtala de nuevo en ${LADO_RECOMENDADO} × ${LADO_RECOMENDADO} px, o como JPG en lugar de PNG: ` +
      'así pesa bastante menos.');
  }

  const { fuente, liberar: liberarFuente } = await decodificar(archivo);

  try {
    const ancho = fuente.width, alto = fuente.height;
    if (!ancho || !alto) throw new ErrorPoster('No pudimos leer las medidas de la imagen. Prueba con otro archivo.');

    // ¿Es cuadrado? Se compara el lado largo contra el corto, así da igual si
    // la imagen se pasa a lo ancho o a lo alto.
    const exceso = Math.max(ancho, alto) / Math.min(ancho, alto) - 1;
    if (exceso > TOLERANCIA_CUADRADO) {
      const forma = ancho > alto ? 'horizontal' : 'vertical';
      throw new ErrorPoster(
        `El póster tiene que ser cuadrado y esta imagen es ${forma} (${ancho} × ${alto} px). ` +
        `Expórtala en ${LADO_RECOMENDADO} × ${LADO_RECOMENDADO} px: en Canva es el formato ` +
        '«Publicación de Instagram (cuadrada)».');
    }

    // Casi cuadrada: se recorta al centro hasta el cuadrado exacto.
    const lado = Math.min(ancho, alto);
    const recorte = {
      sx: Math.floor((ancho - lado) / 2), sy: Math.floor((alto - lado) / 2),
      sw: lado, sh: lado,
    };

    const grande = reducir(fuente, LADO_GRANDE, recorte);
    // La miniatura sale de la grande, no del original: es mucho menos trabajo
    // y el resultado es indistinguible.
    const mini = reducir(grande, LADO_MINI);

    const g = await codificar(grande);
    const m = await codificar(mini, g.tipo);

    const avisos = [];
    if (ancho !== alto) {
      const quitado = Math.abs(ancho - alto);
      avisos.push(`Era casi cuadrada (${ancho} × ${alto} px): se recortaron ${quitado} px ` +
        `${ancho > alto ? 'de los costados' : 'entre arriba y abajo'} para dejarla exacta. ` +
        'Revisa que no se haya perdido nada.');
    }
    if (lado < LADO_MINIMO_SIN_AVISO) {
      avisos.push(`La imagen es pequeña (${lado} × ${lado} px): puede verse borrosa en la página de la actividad. ` +
        `Lo recomendable es ${LADO_RECOMENDADO} × ${LADO_RECOMENDADO} px.`);
    }

    const urlVista = URL.createObjectURL(g.blob);
    return {
      grande: g.blob, mini: m.blob, ext: g.ext, tipo: g.tipo,
      ancho, alto, lado: grande.width, avisos, urlVista,
      liberar: () => URL.revokeObjectURL(urlVista),
    };
  } finally {
    liberarFuente();
  }
}

/**
 * Abre la imagen. createImageBitmap primero: decodifica fuera del hilo
 * principal y respeta la orientación EXIF de las fotos de celular. Si el
 * navegador no lo tiene o no entiende el formato, se prueba con <img>.
 */
async function decodificar(archivo) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(archivo);
      return { fuente: bmp, liberar: () => bmp.close && bmp.close() };
    } catch (e) { /* se intenta con <img> */ }
  }

  const url = URL.createObjectURL(archivo);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    // El caso de siempre: la foto HEIC de un iPhone en un navegador de
    // escritorio. Decirlo por su nombre ahorra la llamada.
    const heic = /\.(heic|heif)$/i.test(archivo.name) || /hei[cf]/i.test(archivo.type);
    throw new ErrorPoster(heic
      ? 'Tu navegador no puede abrir imágenes HEIC (las fotos del iPhone). Expórtala o guárdala como JPG y vuelve a intentarlo.'
      : 'No pudimos abrir esa imagen. Puede estar dañada o en un formato poco común: guárdala como JPG o PNG y vuelve a intentarlo.');
  }
  // La URL se revoca después de dibujar, no antes: en algunos navegadores
  // revocarla antes deja la imagen sin datos al momento de pasarla al lienzo.
  return { fuente: img, liberar: () => URL.revokeObjectURL(url) };
}

/**
 * Reduce la imagen para que su lado largo no pase de «ladoMax».
 *
 * Por pasos, a la mitad cada vez, y no de un solo golpe. Un lienzo que baja
 * de 6000 a 1600 px en un paso se salta píxeles y deja las letras del póster
 * dentadas, justo lo que más se nota. Nunca agranda.
 *
 * El fondo se pinta de blanco: un PNG con transparencia codificado como JPEG
 * saldría con fondo negro.
 */
function reducir(fuente, ladoMax, recorte) {
  // «recorte» ({sx, sy, sw, sh}) es la parte del original que se usa. Se
  // aplica en el PRIMER dibujo y no en un lienzo aparte a tamaño completo:
  // recortar una foto de 6000 px en su propio lienzo costaría 140 MB de
  // memoria, y en un iPhone eso ya no se dibuja.
  let rect = recorte || null;
  const w0 = rect ? rect.sw : fuente.width;
  const h0 = rect ? rect.sh : fuente.height;
  const escala = Math.min(1, ladoMax / Math.max(w0, h0));
  const W = Math.max(1, Math.round(w0 * escala));
  const H = Math.max(1, Math.round(h0 * escala));

  let actual = fuente, cw = w0, ch = h0;
  while (cw / 2 >= W && ch / 2 >= H) {
    cw = Math.round(cw / 2); ch = Math.round(ch / 2);
    actual = dibujar(actual, cw, ch, rect);
    rect = null;                     // de aquí en adelante ya es lo recortado
  }
  return dibujar(actual, W, H, rect);
}

function dibujar(origen, w, h, rect) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, w, h);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  if (rect) x.drawImage(origen, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, w, h);
  else      x.drawImage(origen, 0, 0, w, h);
  return c;
}

/**
 * WebP si el navegador sabe escribirlo; si no, JPEG.
 *
 * No basta con pedir WebP: un navegador que no lo sabe codificar no falla,
 * devuelve un PNG en silencio. Y el bucket solo acepta WebP y JPEG, así que
 * ese PNG sería rechazado al subir con un error incomprensible. Por eso se
 * revisa el tipo de lo que de verdad salió.
 */
async function codificar(lienzo, tipoForzado) {
  const aBlob = (tipo) => new Promise(r => lienzo.toBlob(r, tipo, CALIDAD));

  if (tipoForzado !== 'image/jpeg') {
    const webp = await aBlob('image/webp');
    if (webp && webp.type === 'image/webp') return { blob: webp, tipo: 'image/webp', ext: 'webp' };
  }
  const jpg = await aBlob('image/jpeg');
  if (!jpg) throw new ErrorPoster('Tu navegador no pudo procesar la imagen. Prueba con otro navegador o con un archivo más pequeño.');
  return { blob: jpg, tipo: 'image/jpeg', ext: 'jpg' };
}


/* ============================================================================
   2 · SUBIR Y QUITAR
   ========================================================================== */

/**
 * Sube las dos versiones, apunta la actividad a ellas y borra el póster
 * anterior. Devuelve la ruta nueva.
 *
 * El orden importa y está pensado para que nunca quede una actividad
 * apuntando a un archivo que no existe:
 *   1. subir las dos imágenes nuevas
 *   2. escribir la ruta en la actividad
 *        si esto falla → se borran las recién subidas, y la actividad sigue
 *        con su póster anterior intacto
 *   3. borrar las del póster anterior
 *        si esto falla → quedan archivos huérfanos en Storage, que no se ven
 *        en ningún lado. Es el fallo barato, y por eso va al final.
 */
export async function subirPoster(actividadId, preparado, rutaAnterior) {
  // Sello en base 36 del instante: corto, ordenable y distinto en cada subida.
  // El nombre cambia siempre, así que el archivo es inmutable y se puede
  // guardar en caché un año sin que nadie vea un póster ya corregido.
  const sello = Date.now().toString(36);
  const ruta  = `${actividadId}/poster-${sello}.${preparado.ext}`;
  const mini  = rutaMini(ruta);
  const opciones = { contentType: preparado.tipo, cacheControl: '31536000', upsert: false };

  const almacen = db.storage.from(BUCKET);

  // Supabase no lanza excepción: devuelve { error }. Hay que mirarlo siempre.
  const r1 = await almacen.upload(ruta, preparado.grande, opciones);
  if (r1.error) throw r1.error;

  const r2 = await almacen.upload(mini, preparado.mini, opciones);
  if (r2.error) {
    await almacen.remove([ruta]);
    throw r2.error;
  }

  const { error } = await db.from('actividades').update({ poster: ruta }).eq('id', actividadId);
  if (error) {
    await almacen.remove([ruta, mini]);
    throw error;
  }

  if (rutaAnterior && rutaAnterior !== ruta) {
    await almacen.remove([rutaAnterior, rutaMini(rutaAnterior)]);   // sin revisar: ver arriba
  }
  return ruta;
}

/** Quita el póster: primero la actividad, después los archivos. */
export async function quitarPoster(actividadId, ruta) {
  const { error } = await db.from('actividades').update({ poster: null }).eq('id', actividadId);
  if (error) throw error;
  if (ruta) await db.storage.from(BUCKET).remove([ruta, rutaMini(ruta)]);
}


/* ============================================================================
   3 · EL SELECTOR
   ========================================================================== */

/**
 * Pinta el cuadro para elegir el póster dentro de «caja».
 *
 * @param {HTMLElement} caja
 * @param {object} op
 * @param {string}   [op.rutaActual]  póster que ya tiene la actividad
 * @param {string}   [op.titulo]      para el texto alternativo
 * @param {Function}  op.alElegir     async (preparado) => void. Si lanza, el
 *                                    selector muestra el error y vuelve atrás.
 * @param {Function} [op.alQuitar]    async () => void
 * @param {string}   [op.textoListo]  lo que se dice cuando alElegir termina
 * @returns {{ preparado: () => object|null, limpiar: () => void }}
 */
export function montarSelector(caja, op) {
  const estado = {
    ruta: op.rutaActual || null,   // lo que hay guardado
    prep: null,                    // lo recién elegido, preparado
    ocupado: false,
  };

  const id = 'poster-' + Math.random().toString(36).slice(2, 8);

  caja.innerHTML = `
    <div class="poster">
      <div class="poster__marco" tabindex="0" role="button"
           aria-describedby="${id}-pistas" data-marco>
      </div>

      <div class="poster__lado">
        <p class="poster__estado" aria-live="polite" data-estado hidden></p>

        <div class="poster__acciones">
          <button type="button" class="btn btn--chico btn--linea" data-elegir>Elegir imagen</button>
          <button type="button" class="btn btn--chico poster__quitar" data-quitar hidden>Quitar póster</button>
          <input type="file" accept="image/*" class="sr" tabindex="-1" aria-hidden="true" data-archivo>
        </div>

        <ul class="poster__pistas" id="${id}-pistas">
          <li><b>Cuadrado</b>, de ${LADO_RECOMENDADO} × ${LADO_RECOMENDADO} px: en Canva, «Publicación de Instagram».</li>
          <li>JPG, PNG o WebP, <b>hasta ${MAXIMO_ORIGINAL / MB} MB</b>. Se optimiza al subir.</li>
          <li>Que el título se lea en pequeño: en la cartelera sale como miniatura.</li>
        </ul>

        <div class="poster__mini" data-bloque-mini hidden>
          <img alt="" data-mini>
          <span>Así se ve en la cartelera</span>
        </div>
      </div>
    </div>`;

  const $ = s => caja.querySelector(s);
  const marco = $('[data-marco]'), entrada = $('[data-archivo]');
  const btnElegir = $('[data-elegir]'), btnQuitar = $('[data-quitar]');
  const txtEstado = $('[data-estado]');
  const bloqueMini = $('[data-bloque-mini]'), imgMini = $('[data-mini]');

  function decir(tipo, texto) {
    if (!texto) { txtEstado.hidden = true; return; }
    txtEstado.className = 'poster__estado poster__estado--' + tipo;
    txtEstado.innerHTML = texto;
    txtEstado.hidden = false;
  }

  function pintar() {
    const urlGrande = estado.prep ? estado.prep.urlVista : urlPoster(estado.ruta);
    const urlChica  = estado.prep ? estado.prep.urlVista : urlPosterMini(estado.ruta);
    const hay = Boolean(urlGrande);

    marco.classList.toggle('poster__marco--vacio', !hay);
    marco.setAttribute('aria-label', hay ? 'Cambiar la imagen del póster' : 'Elegir la imagen del póster');
    marco.innerHTML = hay
      ? `<img src="${urlGrande}" alt="Póster de «${escaparTexto(op.titulo || 'la actividad')}»">`
      : `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="5" width="30" height="38" rx="3"/><path d="M15 32l6-7 5 5 3-3 5 5"/><circle cx="29" cy="16" r="3"/></svg>
         <b>Arrastra aquí tu póster</b>
         <span>o da clic para elegirlo</span>`;

    // Si la imagen guardada ya no existe en Storage, que no quede un ícono
    // roto: se vuelve al cuadro vacío.
    const img = marco.querySelector('img');
    if (img) img.addEventListener('error', () => {
      if (estado.prep) return;
      estado.ruta = null;
      pintar();
    }, { once: true });

    imgMini.src = hay ? urlChica : '';
    bloqueMini.hidden = !hay;
    btnElegir.textContent = hay ? 'Cambiar imagen' : 'Elegir imagen';
    btnQuitar.hidden = !hay || (!op.alQuitar && !estado.prep);
  }

  function bloquear(si) {
    estado.ocupado = si;
    btnElegir.disabled = si; btnQuitar.disabled = si;
    marco.classList.toggle('poster__marco--ocupado', si);
    marco.setAttribute('aria-busy', si ? 'true' : 'false');
  }

  async function recibir(archivo) {
    if (!archivo || estado.ocupado) return;
    bloquear(true);
    decir('info', 'Optimizando la imagen…');

    let prep;
    try {
      prep = await prepararPoster(archivo);
    } catch (e) {
      bloquear(false);
      decir('mal', escaparTexto(e instanceof ErrorPoster ? e.message : 'No pudimos procesar la imagen. Prueba con otro archivo.'));
      return;
    }

    const anterior = estado.prep;
    estado.prep = prep;
    pintar();

    try {
      decir('info', 'Subiendo…');
      await op.alElegir(prep);
      if (anterior) anterior.liberar();
      const kb = Math.round(prep.grande.size / 1024);
      const listo = op.textoListo || 'Póster guardado.';
      decir(prep.avisos.length ? 'aviso' : 'ok',
        `${escaparTexto(listo)} <small>${prep.lado} × ${prep.lado} px · ${kb} KB</small>` +
        prep.avisos.map(a => `<br>${escaparTexto(a)}`).join(''));
    } catch (e) {
      // Falló la subida: se vuelve a lo que había antes, para no mostrar como
      // guardado algo que no lo está.
      prep.liberar();
      estado.prep = anterior;
      pintar();
      decir('mal', escaparTexto(op.explicar ? op.explicar(e) : (e.message || 'No se pudo subir el póster.')));
    } finally {
      bloquear(false);
    }
  }

  async function quitar() {
    if (estado.ocupado) return;
    if (!confirm('¿Quitar el póster de esta actividad?')) return;
    bloquear(true);
    try {
      if (op.alQuitar) await op.alQuitar();
      if (estado.prep) { estado.prep.liberar(); estado.prep = null; }
      estado.ruta = null;
      pintar();
      decir('ok', 'Póster quitado.');
    } catch (e) {
      decir('mal', escaparTexto(op.explicar ? op.explicar(e) : (e.message || 'No se pudo quitar el póster.')));
    } finally {
      bloquear(false);
    }
  }

  /* ---- eventos ---- */
  btnElegir.addEventListener('click', () => entrada.click());
  marco.addEventListener('click', () => !estado.ocupado && entrada.click());
  marco.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!estado.ocupado) entrada.click(); }
  });
  entrada.addEventListener('change', () => {
    const f = entrada.files && entrada.files[0];
    // Se vacía para que elegir el MISMO archivo otra vez vuelva a disparar
    // «change»: si no, corregir el póster y resubirlo con el mismo nombre no
    // haría nada.
    entrada.value = '';
    recibir(f);
  });
  btnQuitar.addEventListener('click', quitar);

  ['dragenter', 'dragover'].forEach(t => marco.addEventListener(t, (e) => {
    e.preventDefault();
    if (!estado.ocupado) marco.classList.add('poster__marco--soltar');
  }));
  ['dragleave', 'drop'].forEach(t => marco.addEventListener(t, (e) => {
    e.preventDefault();
    if (t === 'dragleave' && marco.contains(e.relatedTarget)) return;
    marco.classList.remove('poster__marco--soltar');
  }));
  marco.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    recibir(f);
  });

  pintar();

  return {
    preparado: () => estado.prep,
    decir,
    limpiar: () => { if (estado.prep) estado.prep.liberar(); },
  };
}

function escaparTexto(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
