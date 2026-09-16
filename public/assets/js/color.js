/* ============================================================================
   COLOR · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Una sola cosa: dado el color de un eje, devolver la variante que sí se puede
   leer como texto sobre fondo claro.

   POR QUÉ EXISTE ESTE ARCHIVO
   Los colores del logotipo son muy luminosos y no alcanzan el 4.5:1 que pide
   AA sobre blanco: el turquesa da 2.75:1 y el naranja 2.59:1. La regla del
   proyecto es «color puro para la gráfica, variante oscura para las letras», y
   esas variantes estaban escritas a mano en el CSS para los cuatro ejes del
   logotipo.

   Pero los ejes son DATOS: la coordinación puede agregar uno nuevo desde la
   base y nadie va a acordarse de inventarle además un tono legible en tres
   hojas de estilo. Así que se calcula.

   POR QUÉ ES UN MÓDULO APARTE Y NO ESTÁ EN app.js
   Lo necesitan la cartelera, la pantalla de armado y el adelanto de la landing,
   y ese último NO puede importar app.js: arrastraría supabase-js a la página
   más visitada del sitio solo para pintar tres renglones. Este archivo solo
   depende de marca.js, que a su vez no depende de nada.
   ========================================================================== */

import { colorOscuro } from './marca.js';

/* La paleta escrita a mano del proyecto ronda el 5:1 —turquesa 5.59, magenta
   5.56, verde 4.99, naranja 4.74— y no el 4.5 justo. Apuntar al mínimo dejaba
   el magenta en #e21483, casi indistinguible del color puro y pegado al borde
   de lo aceptable. Con 5 el cálculo cae encima de los tonos elegidos a mano. */
const OBJETIVO = 5;

const _cache = new Map();

/**
 * Variante legible del color, sobre fondo blanco.
 * Oscurece los tres canales por igual, que conserva el matiz.
 * @param {string} hex  '#10ABC4'
 * @returns {string}    '#0a7688' o similar
 */
export function colorTexto(hex) {
  const clave = String(hex || '');
  if (_cache.has(clave)) return _cache.get(clave);

  const rgb = aRgb(clave);
  // Sin color reconocible, el oscuro de la marca: siempre legible.
  const salida = rgb ? aHex(rgb.map(c => c * factor(rgb))) : colorOscuro();
  _cache.set(clave, salida);
  return salida;
}

/** Las dos variables que espera el CSS de una tarjeta. */
export function estiloEje(hex) {
  const puro = hex || '#10ABC4';
  return `--eje:${puro};--eje-tx:${colorTexto(puro)}`;
}

/* -------------------------------------------------------------- interior -- */

/** El factor más alto —el color más claro, más parecido al de marca— que
    todavía cumple el contraste. Búsqueda binaria, dieciocho pasos. */
function factor(rgb) {
  let bajo = 0, alto = 1, mejor = 0;
  for (let i = 0; i < 18; i++) {
    const k = (bajo + alto) / 2;
    if (contraste(rgb.map(c => c * k)) >= OBJETIVO) { mejor = k; bajo = k; }
    else alto = k;
  }
  return mejor;
}

function aRgb(hex) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

function aHex(rgb) {
  return '#' + rgb.map(c =>
    Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')
  ).join('');
}

/** Razón de contraste contra blanco, con la fórmula de WCAG 2.1. */
function contraste(rgb) {
  const lum = rgb
    .map(c => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  return 1.05 / (lum + 0.05);
}
