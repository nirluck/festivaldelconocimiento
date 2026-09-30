/* ============================================================================
   FOTO DE PONENTE · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Preparar, subir y quitar la foto de un ponente. La usa el módulo Ponentes
   del panel de actividad. Quién puede lo deciden las políticas de
   sql/13-ponentes.sql, no esta pantalla.

   Lo pesado —abrir la imagen, reducirla por pasos, codificarla en WebP o
   JPEG— es lo mismo que ya hace subir-poster.js, y de ahí se toma. Lo que
   cambia respecto del póster:

     · NO se exige ninguna forma. Una foto de celular viene vertical, la de
       una banda viene apaisada. Se guarda en su proporción y el recorte
       redondo lo hace la página con «object-fit: cover».
     · Un solo archivo, de hasta 1000 px por el lado largo. En la ficha la
       foto se ve a unos 120 px; 1000 alcanza de sobra y deja margen para
       usarla en carteles o en redes.
     · Se aceptan originales de hasta 12 MB: una foto de celular pasa con
       facilidad de los 4 MB del póster. Lo que se sube ronda los 150 KB.

   La ruta es «<id del ponente>/foto-<sello>.webp». El sello cambia en cada
   subida, así que el archivo es inmutable y se puede guardar en caché un año.
   ========================================================================== */

import { db } from './app.js';
import { BUCKET_PONENTES } from './archivos.js';
import { decodificar, reducir, codificar, ErrorPoster } from './subir-poster.js';

const LADO_MAX = 1000;
const LADO_MINIMO_SIN_AVISO = 320;
const MB = 1024 * 1024;
export const MAXIMO_FOTO = 12 * MB;

/**
 * Lee la foto elegida y la deja lista para subir.
 * @returns {Promise<{blob:Blob, tipo:string, ext:string, ancho:number,
 *                    alto:number, avisos:string[], urlVista:string,
 *                    liberar:Function}>}
 * @throws {ErrorPoster} con un mensaje que se puede mostrar tal cual.
 */
export async function prepararFoto(archivo) {
  if (!archivo) throw new ErrorPoster('No se eligió ningún archivo.');

  if (!/^image\//.test(archivo.type) && !/\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(archivo.name)) {
    throw new ErrorPoster('Ese archivo no es una imagen. Sube la foto como JPG, PNG o WebP.');
  }
  if (archivo.size > MAXIMO_FOTO) {
    throw new ErrorPoster(
      `La foto pesa ${(archivo.size / MB).toFixed(1)} MB y el máximo es ${MAXIMO_FOTO / MB} MB. ` +
      'Guárdala a menor resolución y vuelve a intentarlo.');
  }

  const { fuente, liberar: liberarFuente } = await decodificar(archivo);
  try {
    const ancho = fuente.width, alto = fuente.height;
    if (!ancho || !alto) throw new ErrorPoster('No pudimos leer las medidas de la foto. Prueba con otro archivo.');

    const lienzo = reducir(fuente, LADO_MAX);
    const { blob, tipo, ext } = await codificar(lienzo);

    const avisos = [];
    if (Math.min(ancho, alto) < LADO_MINIMO_SIN_AVISO) {
      avisos.push(`La foto es pequeña (${ancho} × ${alto} px) y puede verse borrosa. Si tienes una más grande, mejor.`);
    }

    const urlVista = URL.createObjectURL(blob);
    return {
      blob, tipo, ext, ancho: lienzo.width, alto: lienzo.height, avisos, urlVista,
      liberar: () => URL.revokeObjectURL(urlVista),
    };
  } finally {
    liberarFuente();
  }
}

/**
 * Sube la foto, apunta al ponente a ella y borra la anterior. Devuelve la
 * ruta nueva. El orden es el mismo que el del póster, para que un ponente
 * nunca apunte a un archivo que no existe:
 *   1. subir     2. escribir la ruta (si falla, se borra lo subido)
 *   3. borrar la anterior (si falla, queda un huérfano invisible: el fallo barato)
 */
export async function subirFoto(ponenteId, preparada, rutaAnterior) {
  const sello = Date.now().toString(36);
  const ruta  = `${ponenteId}/foto-${sello}.${preparada.ext}`;
  const almacen = db.storage.from(BUCKET_PONENTES);

  // Supabase no lanza excepción: devuelve { error } (trampa 9 del plan).
  const r = await almacen.upload(ruta, preparada.blob,
    { contentType: preparada.tipo, cacheControl: '31536000', upsert: false });
  if (r.error) throw r.error;

  // «.select()» para saber si de verdad se escribió: sin permiso, un update
  // no falla, solo no toca ninguna fila.
  const { data, error } = await db.from('ponentes')
    .update({ foto: ruta }).eq('id', ponenteId).select('id');
  if (error || !data || !data.length) {
    await almacen.remove([ruta]);
    throw error || new Error('row-level security');
  }

  if (rutaAnterior && rutaAnterior !== ruta) await almacen.remove([rutaAnterior]);
  return ruta;
}

/** Quita la foto: primero el ponente, después el archivo. */
export async function quitarFoto(ponenteId, ruta) {
  const { data, error } = await db.from('ponentes')
    .update({ foto: null }).eq('id', ponenteId).select('id');
  if (error) throw error;
  if (!data || !data.length) throw new Error('row-level security');
  if (ruta) await db.storage.from(BUCKET_PONENTES).remove([ruta]);
}

export { ErrorPoster as ErrorFoto };
