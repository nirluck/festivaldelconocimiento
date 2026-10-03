// Prueba de public/assets/js/puerta/estado.js con una base imitada.
//   node pruebas/boletos/puerta.test.mjs
// La base de verdad la prueba pruebas/boletos/puerta.sql; aquí se prueba lo
// que hace el teléfono: la cola sin red, el ruteo entre actividades y las
// correcciones cuando la base contesta otra cosa.

import { Puerta, leerRef, huella } from '../../public/assets/js/puerta/estado.js';
import { ErrorRed as ErrorRedDePrueba } from '../../public/assets/js/puerta/api.js';

let fallos = 0, n = 0;
function igual(real, esperado, que) {
  n++;
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) { fallos++; console.log(`✗ ${que}\n    esperaba ${JSON.stringify(esperado)}\n    obtuvo   ${JSON.stringify(real)}`); }
  else console.log(`✓ ${que}`);
}

/* ------------------------------------------------------------ la imitación */
const T = (n) => n.toString(16).padStart(64, '0');      // tokens de prueba
const hoy = new Date();
const f = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
const hh = (h) => String(h).padStart(2, '0') + ':00:00';
const ahoraH = hoy.getHours();

const base = {
  sinRed: false,
  claves: { 'AAAA2222': { clave: 'k1'.padEnd(64, '1'), act: 'A' }, 'BBBB3333': { clave: 'k2'.padEnd(64, '2'), act: 'B' } },
  acts: {
    // A ocurre ahora; B empieza en dos horas.
    A: { id: 'A', titulo: 'Taller A', fecha: f, hora_inicio: hh(ahoraH), hora_fin: hh(Math.min(ahoraH + 1, 23)) },
    B: { id: 'B', titulo: 'Charla B', fecha: f, hora_inicio: hh(Math.min(ahoraH + 2, 23)), hora_fin: null },
  },
  boletos: [
    { id: 'b1', act: 'A', codigo: 'AAA222', token: T(1), nombre: 'Familia Pérez', lugares: 3, estado: 'activo' },
    { id: 'b2', act: 'A', codigo: 'AAA333', token: T(2), nombre: 'Ana López', lugares: 1, estado: 'activo' },
    { id: 'b3', act: 'A', codigo: 'AAA444', token: T(3), nombre: 'Espera Uno', lugares: 2, estado: 'espera' },
    { id: 'b4', act: 'B', codigo: 'BBB222', token: T(4), nombre: 'Beto Charla', lugares: 1, estado: 'activo' },
    { id: 'b5', act: 'C', codigo: 'CCC222', token: T(5), nombre: 'De Otra', lugares: 1, estado: 'activo' },
    { id: 'b6', act: 'A', codigo: 'AAA555', token: T(6), nombre: 'Cancelado', lugares: 1, estado: 'cancelado' },
  ],
  llamadas: [],
  sec: 0,
};
const claveOk = (act, clave) => Object.values(base.claves).some(c => c.act === act && c.clave === clave && !c.revocada);
const red = () => { if (base.sinRed) throw new ErrorRedDePrueba('red'); };

const api = {
  async entrarPuerta(codigo) {
    red(); const c = base.claves[codigo.replace(/-/g, '').toUpperCase()];
    if (!c) return { ok: false, error: 'codigo' };
    return { ok: true, clave: c.clave, actividad_id: c.act, etiqueta: 'Eva', vence: null };
  },
  async listaPuerta(act, clave) {
    red(); if (!claveOk(act, clave)) return { ok: false, error: 'sin_permiso' };
    const bs = await Promise.all(base.boletos.filter(b => b.act === act && b.estado !== 'cancelado').map(async b => ({
      id: b.id, codigo: b.codigo, huella: b.token ? await huella(b.token) : null, nombre: b.nombre ?? null,
      lugares: b.lugares, estado: b.estado, origen: b.origen || 'cartel', asistio_en: b.asistio_en || null, asistieron: b.asistieron ?? null })));
    return { ok: true, actividad: base.acts[act], cupo: 10, capacidad: 8, capacidad_es_sala: true, boletos: bs };
  },
  async marcarEntrada({ actividad, clave, ref, asistieron, cuando, admitir }) {
    red(); base.llamadas.push('marcar ' + ref);
    if (!claveOk(actividad, clave)) return { ok: false, error: 'sin_permiso' };
    const b = base.boletos.find(b => b.token === ref || b.codigo === ref);
    if (!b) return { ok: false, error: 'no_existe' };
    if (b.act !== actividad) return { ok: false, error: 'otra_actividad', actividad: base.acts[b.act] || { id: b.act, titulo: 'Otra' } };
    if (b.estado === 'cancelado') return { ok: false, error: 'cancelado' };
    if (b.estado === 'espera' && !admitir) return { ok: false, error: 'espera', nombre: b.nombre };
    if (b.asistio_en) return { ok: false, error: 'ya_entro', nombre: b.nombre, asistio_en: b.asistio_en, asistieron: b.asistieron };
    b.asistio_en = cuando || new Date().toISOString(); b.asistieron = asistieron ?? b.lugares; b.estado = 'activo';
    return { ok: true, resultado: 'adelante', codigo: b.codigo, nombre: b.nombre, lugares: b.lugares, asistieron: b.asistieron };
  },
  async entradaSinBoleto({ actividad, clave, cuantos, cuando }) {
    red(); if (!claveOk(actividad, clave)) return { ok: false, error: 'sin_permiso' };
    const id = 'sb' + (++base.sec);
    base.boletos.push({ id, act: actividad, codigo: 'S' + base.sec, nombre: null, origen: 'puerta', lugares: cuantos, estado: 'activo', asistio_en: cuando, asistieron: cuantos });
    return { ok: true, id };
  },
  async anularEntrada({ actividad, clave, boleto }) {
    red(); base.llamadas.push('anular ' + boleto);
    if (!claveOk(actividad, clave)) return { ok: false, error: 'sin_permiso' };
    const b = base.boletos.find(b => b.id === boleto);
    if (!b) return { ok: false, error: 'no_existe' };
    if (b.origen === 'puerta' && !b.nombre) b.estado = 'cancelado';
    b.asistio_en = null; b.asistieron = null;
    return { ok: true };
  },
  async ajustarEntrada({ actividad, clave, boleto, cuantos }) {
    red(); base.llamadas.push(`ajustar ${boleto} ${cuantos}`);
    const b = base.boletos.find(b => b.id === boleto);
    if (!b?.asistio_en) return { ok: false, error: 'sin_entrada' };
    b.asistieron = cuantos; if (b.origen === 'puerta' && !b.nombre) b.lugares = cuantos;
    return { ok: true, asistieron: cuantos, lugares: b.lugares };
  },
};

const almacen = new Map();
const ls = { getItem: k => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, v), removeItem: k => almacen.delete(k) };
const esperar = () => new Promise(r => setTimeout(r, 0));
// Espera a que termine la subida que ya esté en curso y sube lo que quede.
const subir = async (q = p) => { while (q.sincronizando) await esperar(); await q.sincronizar(); };
const enBase = (id) => base.boletos.find(b => b.id === id);

/* ------------------------------------------------------------------ pruebas */
igual(leerRef('https://festivaldelconocimiento.org/boleto/#' + T(1)), { tipo: 'token', valor: T(1) }, 'lee el QR del boleto');
igual(leerRef('aaa·222'), { tipo: 'codigo', valor: 'AAA222' }, 'lee el código dictado con punto y minúsculas');
igual(leerRef('https://festivaldelconocimiento.org/b/taller-a?o=cartel').tipo, 'actividad', 'reconoce el QR de un cartel');
igual(leerRef('hola').tipo, 'otro', 'lo demás no es boleto');

const p = new Puerta({ api, almacen: ls });
p.cargar();
igual((await p.agregar('zzzz-zzzz')).error, 'codigo', 'código equivocado');
igual((await p.agregar('aaaa-2222')).ok, true, 'entra con el código de A');
igual((await p.agregar('BBBB3333')).ok, true, 'y con el de B');
igual(p.actual(), 'A', 'la actividad actual es la que ocurre ahora');

let r = await p.registrar('https://x.org/boleto/#' + T(1));
igual([r.tipo, r.boleto.nombre, r.boleto.lugares], ['adelante', 'Familia Pérez', 3], 'familia: adelante, 3 lugares');
await subir();
igual([enBase('b1').asistieron, p.cola.length], [3, 0], 'la entrada llegó a la base');
igual(p.vista('A').adentro, 3, 'adentro: 3');

p.ajustar('A', 'b1', 2); await subir();
igual([enBase('b1').asistieron, p.vista('A').adentro], [2, 2], 'entraron 2 de 3');

r = await p.registrar(T(1));
igual(r.tipo, 'ya_entro', 'el mismo boleto otra vez: ya entró');

r = await p.registrar(T(4));
igual([r.tipo, r.actividadId], ['adelante', 'B'], 'boleto de B escaneado con A al frente: va solo a B');
await subir();
igual(!!enBase('b4').asistio_en, true, 'y se marcó en B');

r = await p.registrar(T(5));
igual([r.tipo, r.actividad?.id], ['otra_actividad', 'C'], 'boleto de una actividad que no tengo: otra actividad');
r = await p.registrar(T(6));
igual(r.tipo, 'cancelado', 'boleto cancelado');
r = await p.registrar(T(99));
igual(r.tipo, 'no_existe', 'token que no existe');

r = await p.registrar('AAA444');
igual(r.tipo, 'espera', 'lista de espera: no pasa solo');
r = p.entrar('A', 'b3', { admitir: true }); await subir();
igual([r.tipo, enBase('b3').estado, !!enBase('b3').asistio_en], ['adelante', 'activo', true], 'dejar pasar de la lista de espera');

/* --- sin red ----------------------------------------------------------- */
base.sinRed = true;
r = await p.registrar('AAA333');
igual(r.tipo, 'adelante', 'sin red: Ana pasa con la copia local');
const local = p.sinBoleto('A', 1);
p.ajustar('A', local, 3);
igual([p.cola.length, p.vista('A').sinBoleto, p.enLinea], [2, 3, false], 'sin red: dos pendientes, +1 que eran 3');
r = await p.registrar(T(77));
igual(r.tipo, 'sin_red', 'sin red, un boleto que no está en la lista');

// Mientras tanto, otro teléfono ya había marcado a Ana.
enBase('b2').asistio_en = new Date(Date.now() - 5 * 60e3).toISOString(); enBase('b2').asistieron = 1;
const avisos = []; p.on('aviso', a => avisos.push(a.tipo));
base.sinRed = false;
await subir();
igual(avisos, ['ya_entro'], 'al volver la red: aviso de que otro teléfono ya la había marcado');
const sb = base.boletos.find(b => b.origen === 'puerta');
igual([p.cola.length, sb?.lugares, p.alias[local] === sb?.id], [0, 3, true], 'el +1 subió con 3 personas');

p.deshacer('A', local); await subir();
igual([sb.estado, p.vista('A').sinBoleto], ['cancelado', 0], 'deshacer el +1 después de subirlo');

// Deshacer algo que no ha salido: no llega nada a la base. (El teléfono ya
// sabe que no hay red; si creyera que sí, la petición saldría y el deshacer
// viajaría después como anulación: más tráfico, mismo resultado.)
base.sinRed = true;
p.marcarRed(false);
const antes = base.llamadas.length;
const l2 = p.sinBoleto('A', 1);
p.deshacer('A', l2);
base.sinRed = false; await subir();
igual([p.cola.length, base.llamadas.length - antes], [0, 0], 'deshacer sin red: se retira de la cola y no viaja');

/* --- buscar ------------------------------------------------------------ */
igual(p.buscar('perez').map(x => x.b.nombre), ['Familia Pérez'], 'buscar sin acentos');
igual(p.buscar('bbb-222').map(x => x.v.id), ['B'], 'buscar por código en otra actividad');

/* --- se guarda --------------------------------------------------------- */
const p2 = new Puerta({ api, almacen: ls }); p2.cargar();
igual([p2.claves.length, p2.vista('A').adentro], [2, p.vista('A').adentro], 'otra pestaña recupera claves y listas');

/* --- revocada ---------------------------------------------------------- */
base.claves.AAAA2222.revocada = true;
base.sinRed = true; p.sinBoleto('A', 1); base.sinRed = false;
const av2 = []; p.on('aviso', a => av2.push(a));
await subir();
igual([av2[0]?.tipo, av2[0]?.perdidas, p.claveDe('A').invalida], ['sin_permiso', 1, true], 'clave revocada: se avisa cuántas no subieron');
igual(p.actual(), 'B', 'y la actual pasa a ser B');

/* --- vencida ----------------------------------------------------------- */
const p3 = new Puerta({ api, almacen: ls, ahora: () => Date.now() + 3 * 864e5 });
ls.setItem('fdc_puerta_claves', JSON.stringify(p.claves.map(c => ({ ...c, vence: new Date(Date.now() + 864e5).toISOString() }))));
p3.cargar();
igual([p3.claves.length, ls.getItem('fdc_puerta_lista_A')], [0, null], 'clave vencida: se borran los nombres del teléfono');

console.log(`\n${n - fallos} de ${n} bien`);
process.exit(fallos ? 1 : 0);
