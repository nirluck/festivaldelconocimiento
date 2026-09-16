/* ============================================================================
   MARCA · lectura desde JS
   ----------------------------------------------------------------------------
   El color oscuro del sitio se decide en UN solo lugar: --marca-oscuro, en
   assets/css/marca.css. Lo que se dibuja con JS —boletos, carteles, códigos
   QR— no puede usar var() directamente, así que lo lee de ahí en el momento
   de pintar.

   Uso:
     import { colorOscuro } from '/assets/js/marca.js';
     ctx.fillStyle = colorOscuro();
   ========================================================================== */

/* Solo para cuando no hay hoja de estilos que leer: las pruebas de Node
   (pruebas/boletos/qr.test.mjs) o una página que no cargó marca.css.
   NO es el sitio para cambiar el color: eso se hace en marca.css. */
const RESPALDO = '#26282C';

/** El color oscuro de la marca, tal como está escrito en marca.css. */
export function colorOscuro() {
  if (typeof document === 'undefined') return RESPALDO;
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--marca-oscuro').trim();
    return v || RESPALDO;
  } catch (e) {
    return RESPALDO;
  }
}

/**
 * Pinta la barra del navegador en el móvil con el mismo color.
 * <meta name="theme-color"> no entiende variables CSS, así que en el HTML va
 * sin valor y se rellena aquí. Solo toca las páginas que ya declaran la
 * etiqueta: no añade una nueva a las que no la tienen.
 */
export function sincronizarColorNavegador() {
  if (typeof document === 'undefined') return;
  const color = colorOscuro();
  document.querySelectorAll('meta[name="theme-color"]')
    .forEach(m => m.setAttribute('content', color));
}
