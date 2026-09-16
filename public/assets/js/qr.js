/* ============================================================================
   CÓDIGOS QR · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Codificador propio, sin dependencias. Sigue la norma ISO/IEC 18004:
   modo byte (UTF-8), corrección de errores nivel M (resiste ~15 % de daño,
   suficiente para una pantalla o un cartel) y versiones 1 a 40.

   Por qué propio y no una biblioteca: el proyecto no tiene paso de
   compilación ni gestor de paquetes, y un codificador es un algoritmo cerrado
   de un par de cientos de líneas. Leer QR —la puerta, fase F4— es otra
   historia: eso sí es visión por computadora y va con biblioteca.

   Uso:
     import { crearQR, qrSVG, dibujarQR } from '/assets/js/qr.js';
     qrSVG('https://…')                     → '<svg …>' listo para innerHTML
     dibujarQR(ctx, crearQR('…'), x, y, 300) → pinta en un <canvas>

   Las pruebas están en pruebas/boletos/qr.test.mjs (node).
   ========================================================================== */

// El color de los módulos es el oscuro de la marca (marca.css). marca.js no
// depende de nada y responde también sin navegador, así que la prueba de Node
// sigue funcionando.
import { colorOscuro } from './marca.js';

/* Nivel M: codewords de corrección por bloque y número de bloques, por versión.
   El índice 0 no se usa. */
const ECC_POR_BLOQUE = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
  26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const BLOQUES = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14,
  16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];

/* Los dos bits que identifican el nivel M en la información de formato. */
const BITS_NIVEL_M = 0;

/* ------------------------------------------------------- aritmética GF(256) */
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xFF;
}

/** Polinomio generador de Reed-Solomon de grado «grado», sin el término líder. */
export function rsDivisor(grado) {
  const r = new Array(grado).fill(0);
  r[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = gfMul(raiz, 0x02);
  }
  return r;
}

/** Codewords de corrección para un bloque de datos. */
export function rsResto(datos, divisor) {
  const r = divisor.map(() => 0);
  for (const b of datos) {
    const factor = b ^ r.shift();
    r.push(0);
    divisor.forEach((coef, i) => { r[i] ^= gfMul(coef, factor); });
  }
  return r;
}

/* ------------------------------------------------------------- capacidades */
function modulosDeDatos(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const alin = Math.floor(ver / 7) + 2;
    n -= (25 * alin - 10) * alin - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

function codewordsDeDatos(ver) {
  return Math.floor(modulosDeDatos(ver) / 8) - ECC_POR_BLOQUE[ver] * BLOQUES[ver];
}

function posicionesAlineacion(ver, tam) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const paso = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
  const r = [6];
  for (let pos = tam - 7; r.length < n; pos -= paso) r.splice(1, 0, pos);
  return r;
}

/* ------------------------------------------------------------ codificación */
function bitsDelTexto(bytes, ver) {
  const bits = [];
  const poner = (valor, largo) => {
    for (let i = largo - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  poner(0b0100, 4);                              // modo byte
  poner(bytes.length, ver <= 9 ? 8 : 16);         // cuántos bytes
  bytes.forEach(b => poner(b, 8));

  const capacidad = codewordsDeDatos(ver) * 8;
  poner(0, Math.min(4, capacidad - bits.length)); // terminador
  poner(0, (8 - bits.length % 8) % 8);            // completar el byte
  for (let relleno = 0xEC; bits.length < capacidad; relleno ^= 0xEC ^ 0x11) {
    poner(relleno, 8);                            // 0xEC, 0x11, 0xEC, …
  }

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    codewords.push(b);
  }
  return codewords;
}

function agregarCorreccion(datos, ver) {
  const nBloques = BLOQUES[ver];
  const eccLen   = ECC_POR_BLOQUE[ver];
  const total    = Math.floor(modulosDeDatos(ver) / 8);
  const cortos   = nBloques - total % nBloques;
  const largoCorto = Math.floor(total / nBloques);
  const divisor  = rsDivisor(eccLen);

  const bloques = [];
  for (let i = 0, k = 0; i < nBloques; i++) {
    const dat = datos.slice(k, k + largoCorto - eccLen + (i < cortos ? 0 : 1));
    k += dat.length;
    const ecc = rsResto(dat, divisor);
    if (i < cortos) dat.push(0);        // hueco para intercalar parejo
    bloques.push(dat.concat(ecc));
  }

  const r = [];
  for (let i = 0; i < bloques[0].length; i++) {
    bloques.forEach((b, j) => {
      // El hueco de los bloques cortos no se transmite.
      if (i !== largoCorto - eccLen || j >= cortos) r.push(b[i]);
    });
  }
  return r;
}

/* ------------------------------------------------------------- la matriz */
const MASCARAS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => x * y % 2 + x * y % 3 === 0,
  (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
];

function matrizBase(ver) {
  const tam = ver * 4 + 17;
  const m = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const fija = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const poner = (x, y, oscuro) => { m[y][x] = oscuro; fija[y][x] = true; };

  // Líneas de sincronía
  for (let i = 0; i < tam; i++) { poner(6, i, i % 2 === 0); poner(i, 6, i % 2 === 0); }

  // Los tres ojos, con su margen claro
  const ojo = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= tam || y >= tam) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      poner(x, y, d !== 2 && d !== 4);
    }
  };
  ojo(3, 3); ojo(tam - 4, 3); ojo(3, tam - 4);

  // Patrones de alineación, salvo donde chocan con los ojos
  const pos = posicionesAlineacion(ver, tam);
  const u = pos.length - 1;
  pos.forEach((py, i) => pos.forEach((px, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === u) || (i === u && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      poner(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }));

  // Reservar el formato (se escribe al final) y la información de versión
  ponerFormato(m, fija, tam, 0, poner);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = ver << 12 | rem;
    for (let i = 0; i < 18; i++) {
      const oscuro = ((bits >>> i) & 1) === 1;
      const a = tam - 11 + i % 3, b = Math.floor(i / 3);
      poner(a, b, oscuro); poner(b, a, oscuro);
    }
  }
  return { tam, m, fija };
}

/** 15 bits: nivel y máscara, con su código BCH y la máscara fija 0x5412. */
export function bitsFormato(mascara) {
  const dato = BITS_NIVEL_M << 3 | mascara;
  let rem = dato;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return (dato << 10 | rem) ^ 0x5412;
}

function ponerFormato(m, fija, tam, mascara, poner) {
  const bits = bitsFormato(mascara);
  const b = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) poner(8, i, b(i));
  poner(8, 7, b(6));
  poner(8, 8, b(7));
  poner(7, 8, b(8));
  for (let i = 9; i < 15; i++) poner(14 - i, 8, b(i));
  for (let i = 0; i < 8; i++) poner(tam - 1 - i, 8, b(i));
  for (let i = 8; i < 15; i++) poner(8, tam - 15 + i, b(i));
  poner(8, tam - 8, true);            // el módulo oscuro fijo
}

function colocarDatos(m, fija, tam, codewords) {
  let i = 0;
  const total = codewords.length * 8;
  for (let der = tam - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5;           // la columna de sincronía se salta
    for (let v = 0; v < tam; v++) {
      for (let j = 0; j < 2; j++) {
        const x = der - j;
        const subiendo = ((der + 1) & 2) === 0;
        const y = subiendo ? tam - 1 - v : v;
        if (!fija[y][x] && i < total) {
          m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
}

function aplicarMascara(m, fija, tam, k) {
  const f = MASCARAS[k];
  for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
    if (!fija[y][x] && f(x, y)) m[y][x] = !m[y][x];
  }
}

/* Penalización de la norma: elige la máscara que deja el código más legible.
   Cualquier máscara produce un QR válido; esto solo mejora la lectura. */
function penalizacion(m, tam) {
  let p = 0;
  const lineas = [];
  for (let i = 0; i < tam; i++) {
    lineas.push(m[i]);
    lineas.push(m.map(fila => fila[i]));
  }
  const patron = [1, 0, 1, 1, 1, 0, 1];
  for (const l of lineas) {
    // Rachas de cinco o más del mismo color
    let racha = 1;
    for (let i = 1; i <= tam; i++) {
      if (i < tam && l[i] === l[i - 1]) racha++;
      else { if (racha >= 5) p += 3 + racha - 5; racha = 1; }
    }
    // Figuras que parecen un ojo: 1011101 con cuatro claros de un lado
    for (let i = 0; i + 7 <= tam; i++) {
      if (!patron.every((v, k) => (l[i + k] ? 1 : 0) === v)) continue;
      const claroAntes   = i >= 4 && [1, 2, 3, 4].every(k => !l[i - k]);
      const claroDespues = i + 11 <= tam && [0, 1, 2, 3].every(k => !l[i + 7 + k]);
      if (claroAntes) p += 40;
      if (claroDespues) p += 40;
    }
  }
  // Bloques de 2×2 del mismo color
  for (let y = 0; y + 1 < tam; y++) for (let x = 0; x + 1 < tam; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  // Proporción de oscuros lejos del 50 %
  let oscuros = 0;
  m.forEach(fila => fila.forEach(v => { if (v) oscuros++; }));
  const total = tam * tam;
  p += (Math.ceil(Math.abs(oscuros * 20 - total * 10) / total) - 1) * 10;
  return p;
}

/**
 * Codifica un texto.
 * @returns {{version:number, tam:number, mascara:number, modulos:boolean[][]}}
 */
export function crearQR(texto) {
  const bytes = Array.from(new TextEncoder().encode(String(texto)));

  let ver = 1;
  for (; ver <= 40; ver++) {
    const bitsNecesarios = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
    if (bitsNecesarios <= codewordsDeDatos(ver) * 8) break;
  }
  if (ver > 40) throw new Error('Texto demasiado largo para un código QR.');

  const codewords = agregarCorreccion(bitsDelTexto(bytes, ver), ver);

  let mejor = null;
  for (let k = 0; k < 8; k++) {
    const { tam, m, fija } = matrizBase(ver);
    colocarDatos(m, fija, tam, codewords);
    aplicarMascara(m, fija, tam, k);
    ponerFormato(m, fija, tam, k, (x, y, v) => { m[y][x] = v; });
    const p = penalizacion(m, tam);
    if (!mejor || p < mejor.p) mejor = { p, tam, m, k };
  }
  return { version: ver, tam: mejor.tam, mascara: mejor.k, modulos: mejor.m };
}

/* ------------------------------------------------------------- dibujo */

/**
 * SVG del código. Un solo <path> con los módulos oscuros agrupados por
 * renglón: ligero, nítido a cualquier tamaño e imprimible.
 * @param {string} texto
 * @param {{borde?:number, oscuro?:string, claro?:string, titulo?:string}} op
 *        borde: margen en módulos. La norma pide 4; menos falla en algunos lectores.
 */
export function qrSVG(texto, op = {}) {
  const { borde = 4, oscuro = colorOscuro(), claro = '#FFFFFF', titulo = '' } = op;
  const qr = crearQR(texto);
  const lado = qr.tam + borde * 2;
  let d = '';
  qr.modulos.forEach((fila, y) => {
    for (let x = 0; x < qr.tam; x++) {
      if (!fila[x]) continue;
      let largo = 1;
      while (x + largo < qr.tam && fila[x + largo]) largo++;
      d += `M${x + borde} ${y + borde}h${largo}v1h-${largo}z`;
      x += largo - 1;
    }
  });
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges"`
    + (titulo ? ` role="img" aria-label="${esc(titulo)}"` : ' aria-hidden="true"') + '>'
    + (titulo ? `<title>${esc(titulo)}</title>` : '')
    + `<rect width="${lado}" height="${lado}" fill="${claro}"/>`
    + `<path d="${d}" fill="${oscuro}"/></svg>`;
}

/**
 * Pinta un QR ya creado en un canvas. «tam» incluye el margen de 4 módulos.
 * Redondea el tamaño del módulo a píxeles enteros para que no salga borroso.
 */
export function dibujarQR(ctx, qr, x, y, tam, op = {}) {
  const { oscuro = colorOscuro(), claro = '#FFFFFF', borde = 4 } = op;
  const lado = qr.tam + borde * 2;
  const mod = Math.max(1, Math.floor(tam / lado));
  const real = mod * lado;
  const x0 = Math.round(x + (tam - real) / 2), y0 = Math.round(y + (tam - real) / 2);
  ctx.fillStyle = claro;
  ctx.fillRect(x0, y0, real, real);
  ctx.fillStyle = oscuro;
  qr.modulos.forEach((fila, fy) => fila.forEach((v, fx) => {
    if (v) ctx.fillRect(x0 + (fx + borde) * mod, y0 + (fy + borde) * mod, mod, mod);
  }));
}
