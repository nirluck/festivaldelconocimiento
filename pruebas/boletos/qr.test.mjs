// Prueba del codificador QR (public/assets/js/qr.js).
//   node pruebas/boletos/qr.test.mjs
//
// Tres comprobaciones que NO dependen de la lógica del codificador:
//   1. Reed-Solomon contra el ejemplo publicado «HELLO WORLD» 1-M.
//   2. Los 15 bits de formato contra la tabla de la norma para el nivel M.
//   3. Un lector: toma la matriz, lee el formato, quita la máscara, recorre los
//      módulos, verifica que los síndromes de cada bloque den cero (evaluando
//      el polinomio en α^i, no con el divisor del codificador) y recupera el
//      texto. Para 300 textos de todas las longitudes.
// Lo que esta prueba no cubre —la lectura óptica— se verifica escaneando.

import { crearQR, rsDivisor, rsResto, bitsFormato } from '../../public/assets/js/qr.js';

let fallas = 0;
const ok = (cond, msg) => { if (!cond) { fallas++; console.log('  FALLA:', msg); } };

// 1 · Reed-Solomon ------------------------------------------------------------
const datosHW = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
const eccHW   = [196, 35, 39, 119, 235, 215, 231, 226, 93, 23];
ok(JSON.stringify(rsResto(datosHW, rsDivisor(10))) === JSON.stringify(eccHW),
   'Reed-Solomon de HELLO WORLD 1-M');
console.log('1 · Reed-Solomon:', fallas ? 'FALLA' : 'bien');

// 2 · Formato -----------------------------------------------------------------
const TABLA_M = ['101010000010010', '101000100100101', '101111001111100', '101101101001011',
                 '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
const antes = fallas;
TABLA_M.forEach((b, k) => ok(bitsFormato(k).toString(2).padStart(15, '0') === b, `formato M máscara ${k}`));
console.log('2 · Formato:', fallas === antes ? 'bien' : 'FALLA');

// 3 · Lector ------------------------------------------------------------------
const ECC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
  26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const BLQ = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14,
  16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];

// Tablas de exponentes y logaritmos: otra forma de multiplicar, a propósito.
const EXP = new Array(512), LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

function funcionales(ver, tam) {
  const f = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const rect = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++)
    if (x >= 0 && y >= 0 && x < tam && y < tam) f[y][x] = true; };
  rect(0, 0, 9, 9); rect(tam - 8, 0, 8, 9); rect(0, tam - 8, 9, 8);   // ojos + formato
  rect(6, 0, 1, tam); rect(0, 6, tam, 1);                            // sincronía
  if (ver >= 7) { rect(tam - 11, 0, 3, 6); rect(0, tam - 11, 6, 3); } // versión
  if (ver > 1) {
    // Posiciones de alineación de la tabla E.1 de la norma para las versiones
    // que usan las pruebas (hasta la 14).
    const T = { 2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],
      10:[6,28,50],11:[6,30,54],12:[6,32,58],13:[6,34,62],14:[6,26,46,66] };
    const p = T[ver]; if (!p) throw new Error('versión fuera de la tabla de la prueba: ' + ver);
    for (const cy of p) for (const cx of p) {
      const enOjo = (cx < 9 && cy < 9) || (cx >= tam - 8 && cy < 9) || (cx < 9 && cy >= tam - 8);
      if (enOjo) continue;              // solo se omiten las que chocan con un ojo
      rect(cx - 2, cy - 2, 5, 5);
    }
  }
  return f;
}

function leer(qr) {
  const { tam, modulos: m, version: ver } = qr;
  ok(tam === ver * 4 + 17, 'tamaño');
  // Formato, primera copia, y comparación con la segunda.
  let f1 = 0, f2 = 0;
  const b = (x, y) => m[y][x] ? 1 : 0;
  const c1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  c1.forEach(([x, y], i) => { f1 |= b(x, y) << i; });
  for (let i = 0; i < 8; i++) f2 |= b(tam - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) f2 |= b(8, tam - 15 + i) << i;
  ok(f1 === f2, 'las dos copias del formato coinciden');
  const mascara = TABLA_M.indexOf(f1.toString(2).padStart(15, '0'));
  ok(mascara >= 0, 'el formato es de nivel M');
  ok(m[tam - 8][8] === true, 'módulo oscuro fijo');

  // Ojos: el anillo exterior oscuro y el blanco de dentro.
  for (const [cx, cy] of [[3, 3], [tam - 4, 3], [3, tam - 4]]) {
    ok(m[cy - 3][cx] && !m[cy - 2][cx] && m[cy][cx] && !m[cy][cx - 2], 'ojo en ' + cx + ',' + cy);
  }

  // Información de versión (v7+), contra la tabla D.1 de la norma, en sus dos copias.
  if (ver >= 7) {
    const TABLA_V = { 7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3, 11: 0x0BBF6, 12: 0x0C762, 13: 0x0D847 };
    let v1 = 0, v2 = 0;
    for (let i = 0; i < 18; i++) {
      const a = tam - 11 + i % 3, bb = Math.floor(i / 3);
      v1 |= b(a, bb) << i;      // arriba a la derecha
      v2 |= b(bb, a) << i;      // abajo a la izquierda
    }
    ok(v1 === TABLA_V[ver] && v2 === TABLA_V[ver], `información de versión ${ver}`);
  }

  const fija = funcionales(ver, tam);
  const MASK = [(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,
    (x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,
    (x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0][mascara];

  // Recorrido en zigzag, de abajo a la derecha.
  const bits = [];
  let subiendo = true;
  for (let x = tam - 1; x > 0; x -= 2) {
    if (x === 6) x--;
    for (let k = 0; k < tam; k++) {
      const y = subiendo ? tam - 1 - k : k;
      for (const xx of [x, x - 1]) {
        if (fija[y][xx]) continue;
        bits.push((m[y][xx] !== MASK(xx, y)) ? 1 : 0);
      }
    }
    subiendo = !subiendo;
  }
  const total = Math.floor(bits.length / 8);
  const cw = [];
  for (let i = 0; i < total; i++) cw.push(parseInt(bits.slice(i * 8, i * 8 + 8).join(''), 2));

  // Separar bloques (los largos van al final y tienen un byte más de datos).
  const nb = BLQ[ver], ne = ECC[ver];
  const nDatos = total - nb * ne;
  const corto = Math.floor(nDatos / nb), largos = nDatos % nb;
  const tamDatos = Array.from({ length: nb }, (_, i) => corto + (i >= nb - largos ? 1 : 0));
  const bloques = tamDatos.map(() => []);
  let p = 0;
  for (let i = 0; i < corto + 1; i++) for (let j = 0; j < nb; j++) if (i < tamDatos[j]) bloques[j].push(cw[p++]);
  for (let i = 0; i < ne; i++) for (let j = 0; j < nb; j++) bloques[j].push(cw[p++]);

  // Síndromes: c(α^i) = 0 para i = 0 … ne-1.
  bloques.forEach((bl, j) => {
    for (let i = 0; i < ne; i++) {
      let s = 0;
      for (const coef of bl) s = mul(s, EXP[i]) ^ coef;
      if (s !== 0) { ok(false, `síndrome ${i} del bloque ${j}`); break; }
    }
  });

  // Datos en modo byte.
  const datos = bloques.flatMap((bl, j) => bl.slice(0, tamDatos[j]));
  const db = datos.flatMap(x => x.toString(2).padStart(8, '0').split('').map(Number));
  const leerBits = (desde, n) => parseInt(db.slice(desde, desde + n).join(''), 2);
  ok(leerBits(0, 4) === 4, 'modo byte');
  const cc = ver <= 9 ? 8 : 16;
  const n = leerBits(4, cc);
  const bytes = [];
  for (let i = 0; i < n; i++) bytes.push(leerBits(4 + cc + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const antes3 = fallas;
const muestras = [
  'https://festivaldelconocimiento.org/boleto/#' + 'a1b2c3d4'.repeat(8),
  'https://festivaldelconocimiento.org/b/taller-de-microscopia?o=cartel',
  'Ñandú · acción · 🎟️',
];
for (let n = 0; n <= 290; n += 1) muestras.push('x'.repeat(n));
const versiones = new Set();
for (const t of muestras) {
  const qr = crearQR(t);
  versiones.add(qr.version);
  const leido = leer(qr);
  if (leido !== t) { ok(false, `texto de ${t.length} caracteres (v${qr.version}): leído distinto`); }
}
console.log('3 · Lector:', fallas === antes3 ? 'bien' : 'FALLA',
  `(${muestras.length} textos, versiones ${[...versiones].sort((a, b) => a - b).join(',')})`);
const boleto = crearQR(muestras[0]);
console.log('   El QR de un boleto es versión', boleto.version, '·', boleto.tam, 'módulos por lado · máscara', boleto.mascara);

console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO BIEN');
process.exit(fallas ? 1 : 0);
