/* ============================================================================
   ARCHIVOS · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Arma las direcciones públicas de lo que vive en Supabase Storage.

   La base guarda RUTAS («8f3c…/poster-lx2k9.webp»), no URLs: la URL completa
   lleva dentro el identificador del proyecto, y si algún día se migra de
   proyecto todas las guardadas quedarían rotas. Ver sql/10-poster.sql.

   Módulo aparte y sin depender de app.js por la misma razón que color.js: el
   adelanto del programa en la landing lo necesita y no puede arrastrar
   supabase-js a la página más visitada del sitio.
   ========================================================================== */

import { SUPABASE_URL } from './config.js';

export const BUCKET = 'actividades';

/** Dirección pública de un archivo del bucket. Cadena vacía si no hay ruta. */
export function urlPublica(ruta) {
  if (!ruta) return '';
  // Cada tramo por separado: encodeURIComponent sobre la ruta entera
  // convertiría las diagonales en %2F y Storage no encontraría el archivo.
  const limpia = String(ruta).split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${limpia}`;
}

/**
 * La ruta de la miniatura: la misma, con «-mini» antes de la extensión.
 * «8f3c…/poster-lx2k9.webp» → «8f3c…/poster-lx2k9-mini.webp»
 *
 * Es una convención de nombres y no una segunda columna: las dos imágenes
 * nacen y mueren juntas, y guardar las dos rutas permitiría que se
 * desincronizaran.
 */
export function rutaMini(ruta) {
  if (!ruta) return '';
  return String(ruta).replace(/(\.[a-z0-9]+)$/i, '-mini$1');
}

export const urlPoster     = (ruta) => urlPublica(ruta);
export const urlPosterMini = (ruta) => urlPublica(rutaMini(ruta));
