/* ============================================================================
   PUERTA · ESTADO
   ----------------------------------------------------------------------------
   Todo lo que el teléfono de la puerta sabe y recuerda, sin pintar nada:

     claves   una por actividad. Se consiguen tecleando el código de puerta
              (entrar_puerta) y se guardan hasta que vencen.
     listas   la copia de cada actividad que da lista_puerta: boletos con la
              huella SHA-256 de su token, nunca el token.
     cola     lo que se hizo en la puerta y falta subir: entradas, «+1»,
              ajustes y anulaciones, en orden.

   Lo que se ve es siempre la lista MÁS la cola encima (vista()). Así una
   entrada cuenta en el momento, haya red o no, y al subirla solo cambia de
   «pendiente» a firme. Si el servidor contesta otra cosa (otro teléfono la
   marcó antes, el boleto se canceló), la lista se corrige y se avisa.

   Al escanear no se elige actividad: el boleto se busca en todas las listas
   del teléfono y la entrada va a la suya.

   Datos personales: las listas traen nombres. Se borran del teléfono cuando
   la clave vence (a las 6 de la mañana siguiente) o con «Quitar».

   No depende del DOM: pruebas/boletos/puerta.test.mjs la prueba en Node.
   ========================================================================== */

import * as apiReal from './api.js';

const K_CLAVES = 'fdc_puerta_claves';
const K_COLA = 'fdc_puerta_cola';
const kLista = (id) => 'fdc_puerta_lista_' + id;

const MIN = 60e3;

/* ============================================================== utilidades */

/**
 * Qué trae un QR o lo que se tecleó:
 *   token      el QR del boleto: /boleto/#<64 hex>, o el token solo
 *   codigo     los seis caracteres del boleto, con o sin punto o guion
 *   actividad  el QR del cartel (/b/<slug>): sirve para pedir boleto, no es uno
 *   otro       cualquier otra cosa
 */
export function leerRef(texto) {
  const t = String(texto || '').trim();
  let m = t.match(/\/boleto\/?#([0-9a-f]{64})(?![0-9a-f])/i) || t.match(/^([0-9a-f]{64})$/i);
  if (m) return { tipo: 'token', valor: m[1].toLowerCase() };
  m = t.match(/\/b\/([^/?#\s]+)/);
  if (m) return { tipo: 'actividad', valor: decodeURIComponent(m[1]) };
  const c = t.toUpperCase().replace(/[\s·.\-]/g, '');
  if (/^[2-9ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(c)) return { tipo: 'codigo', valor: c };
  return { tipo: 'otro', valor: t };
}

/** Para buscar nombres: sin acentos ni mayúsculas. */
export function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** La misma huella que calcula lista_puerta en la base. */
export async function huella(token) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Inicio y fin de la actividad en milisegundos, con el reloj del teléfono. */
export function ventana(a) {
  if (!a?.fecha) return null;
  // Varios días (sql/20): el horario es el de cada día, así que la ventana es
  // la de HOY si hoy cae en el rango; antes, la del primer día; después, la
  // del último.
  let dia = String(a.fecha).slice(0, 10);
  if (a.fecha_fin && String(a.fecha_fin) > dia) {
    const t = new Date();
    const hoy = [t.getFullYear(), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0')].join('-');
    const fin = String(a.fecha_fin).slice(0, 10);
    dia = hoy < dia ? dia : hoy > fin ? fin : hoy;
  }
  const [y, m, d] = dia.split('-').map(Number);
  const en = (t) => {
    const [h, mi] = String(t || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, h, mi).getTime();
  };
  const ini = en(a.hora_inicio);
  let fin = a.hora_fin ? en(a.hora_fin) : ini + 120 * MIN;
  if (fin <= ini) fin += 24 * 60 * MIN;            // termina pasada la medianoche
  return { ini, fin };
}

/** Una entrada sin boleto: el «+1». No tiene nombre ni código. */
export const esSinBoleto = (b) => b.origen === 'puerta' && !b.nombre;

const nuevoId = (p) => p + '-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ================================================================== estado */

export class Puerta {
  /**
   * @param api      las llamadas (./api.js); en las pruebas, una imitación
   * @param almacen  localStorage o algo con getItem/setItem/removeItem
   * @param ahora    reloj, para las pruebas
   */
  constructor({ api = apiReal, almacen = globalThis.localStorage, ahora = () => Date.now() } = {}) {
    this.api = api;
    this.almacen = almacen;
    this.ahora = ahora;
    this.claves = [];
    this.listas = {};
    this.cola = [];
    this.alias = {};            // id local de un «+1» → id que le dio la base
    this.enLinea = null;        // null mientras no se sepa
    this.fijada = null;         // actividad elegida a mano para el contador y el «+1»
    this.sincronizando = false;
    this.oyentes = {};
  }

  /* ----------------------------------------------------------- eventos -- */
  on(tipo, fn) { (this.oyentes[tipo] ||= []).push(fn); }
  emitir(tipo, detalle) { (this.oyentes[tipo] || []).forEach(fn => { try { fn(detalle); } catch (e) { console.error(e); } }); }

  /* ----------------------------------------------------------- almacén -- */
  leer(k, defecto) {
    try { const v = this.almacen?.getItem(k); return v ? JSON.parse(v) : defecto; }
    catch (e) { return defecto; }
  }
  escribir(k, v) {
    try { v == null ? this.almacen?.removeItem(k) : this.almacen?.setItem(k, JSON.stringify(v)); }
    catch (e) { /* almacenamiento lleno o bloqueado: sigue en memoria */ }
  }
  guardarClaves() { this.escribir(K_CLAVES, this.claves); }
  guardarCola() { this.escribir(K_COLA, this.cola.map(({ enviando, ...i }) => i)); }
  guardarLista(id) { this.escribir(kLista(id), this.listas[id] || null); }

  cargar() {
    this.claves = this.leer(K_CLAVES, []);
    this.cola = this.leer(K_COLA, []);
    this.listas = {};
    for (const c of this.claves) {
      const l = this.leer(kLista(c.actividad_id), null);
      if (l) this.listas[c.actividad_id] = l;
    }
    this.purgar();
  }

  /**
   * Olvida las claves vencidas y sus nombres. Lo que no se alcanzó a subir se
   * pierde: la base ya no lo aceptaría con una clave vencida.
   */
  purgar() {
    const t = this.ahora();
    const vencidas = this.claves.filter(c => c.vence && new Date(c.vence).getTime() <= t);
    if (!vencidas.length) return false;
    for (const c of vencidas) this.olvidarLista(c.actividad_id);
    const ids = new Set(vencidas.map(c => c.actividad_id));
    this.claves = this.claves.filter(c => !ids.has(c.actividad_id));
    this.cola = this.cola.filter(i => !ids.has(i.actividad) || i.enviando);
    this.guardarClaves();
    this.guardarCola();
    return true;
  }

  olvidarLista(id) {
    delete this.listas[id];
    this.escribir(kLista(id), null);
  }

  /* ------------------------------------------------------------ claves -- */
  claveDe(id) { return this.claves.find(c => c.actividad_id === id) || null; }

  /** Las actividades que se pueden atender, ordenadas por hora. */
  actividades() {
    return this.claves
      .filter(c => this.listas[c.actividad_id])
      .map(c => ({ ...c, actividad: this.listas[c.actividad_id].actividad }))
      .sort((a, b) => (ventana(a.actividad)?.ini ?? 0) - (ventana(b.actividad)?.ini ?? 0));
  }

  pendientesDe(id) { return this.cola.filter(i => i.actividad === id).length; }

  /** El código tecleado → la clave, y de una vez la lista. */
  async agregar(codigo) {
    let r;
    try { r = await this.api.entrarPuerta(codigo); }
    catch (e) { this.marcarRed(false); return { ok: false, error: e.message === 'sin-migracion' ? 'sin_migracion' : 'red' }; }
    this.marcarRed(true);
    if (!r.ok) return r;
    const c = { clave: r.clave, actividad_id: r.actividad_id, etiqueta: r.etiqueta || '', vence: r.vence || null };
    this.claves = [...this.claves.filter(x => x.actividad_id !== c.actividad_id), c];
    this.guardarClaves();
    // Si la lista no baja (mala señal), la clave ya quedó guardada y la
    // lista se reintenta sola: se entra igual.
    const d = await this.descargar(c.actividad_id);
    this.emitir('cambio');
    return { ok: true, sinLista: !d.ok, actividad: this.listas[c.actividad_id]?.actividad || null };
  }

  /** Quita una actividad del teléfono, con sus nombres y lo que no se subió. */
  quitar(id) {
    this.claves = this.claves.filter(c => c.actividad_id !== id);
    this.cola = this.cola.filter(i => i.actividad !== id || i.enviando);
    if (this.fijada === id) this.fijada = null;
    this.olvidarLista(id);
    this.guardarClaves();
    this.guardarCola();
    this.emitir('cambio');
  }

  /* ------------------------------------------------------------ listas -- */
  async descargar(id) {
    const c = this.claveDe(id);
    if (!c) return { ok: false, error: 'sin_clave' };
    // Un «+1» que va en camino podría llegar en la lista nueva Y seguir en
    // la cola: contaría doble. Se espera a que termine.
    if (this.cola.some(i => i.actividad === id && i.enviando)) return { ok: false, error: 'ocupado' };
    let r;
    try { r = await this.api.listaPuerta(id, c.clave); }
    catch (e) { this.marcarRed(false); return { ok: false, error: 'red' }; }
    this.marcarRed(true);
    if (!r.ok) {
      if (r.error === 'sin_permiso') { c.invalida = true; this.guardarClaves(); }
      return r;
    }
    delete c.invalida;
    this.guardarClaves();
    this.listas[id] = {
      actividad: r.actividad, cupo: r.cupo, capacidad: r.capacidad,
      capacidad_es_sala: r.capacidad_es_sala, generada: r.generada, boletos: r.boletos || [],
    };
    this.guardarLista(id);
    return { ok: true };
  }

  async descargarTodas() {
    const rs = await Promise.all(this.claves.map(c => this.descargar(c.actividad_id)));
    this.emitir('cambio');
    return rs;
  }

  /* ------------------------------------------------------------- vista -- */
  real(id) { return this.alias[id] || id; }

  /** La lista de una actividad con lo pendiente encima, y sus cuentas. */
  vista(id) {
    const s = this.listas[id];
    if (!s) return null;
    const boletos = s.boletos.map(b => ({ ...b }));
    for (const it of this.cola) if (it.actividad === id) this.superponer(it, boletos);

    let adentro = 0, conBoleto = 0, boletosAdentro = 0, sinBoleto = 0, porLlegar = 0, enEspera = 0;
    for (const b of boletos) {
      if (b.estado === 'cancelado') continue;
      if (b.asistio_en) {
        const n = b.asistieron ?? b.lugares;
        adentro += n;
        if (esSinBoleto(b)) sinBoleto += n; else { conBoleto += n; boletosAdentro++; }
      } else if (b.estado === 'activo') porLlegar += b.lugares;
      else if (b.estado === 'espera') enEspera += b.lugares;
    }
    const c = this.claveDe(id);
    return {
      ...s, id, boletos, adentro, conBoleto, boletosAdentro, sinBoleto, porLlegar, enEspera,
      tope: s.capacidad || s.cupo || 0,
      invalida: !!c?.invalida, pendientes: this.pendientesDe(id),
    };
  }

  superponer(it, boletos) {
    const buscar = (id) => boletos.find(b => b.id === this.real(id) || b.id === id);
    if (it.tipo === 'marcar') {
      const b = buscar(it.boleto);
      if (b) Object.assign(b, { asistio_en: it.cuando, asistieron: it.cuantos ?? b.lugares, estado: 'activo', pendiente: true });
    } else if (it.tipo === 'sin_boleto') {
      if (!boletos.some(b => b.id === this.real(it.local))) {
        boletos.push({ id: it.local, codigo: null, huella: null, nombre: null, lugares: it.cuantos,
                       estado: 'activo', origen: 'puerta', creado: it.cuando, asistio_en: it.cuando,
                       asistieron: it.cuantos, pendiente: true });
      }
    } else if (it.tipo === 'anular') {
      const b = buscar(it.boleto);
      if (b && esSinBoleto(b)) boletos.splice(boletos.indexOf(b), 1);
      else if (b) Object.assign(b, { asistio_en: null, asistieron: null, pendiente: true });
    } else if (it.tipo === 'ajustar') {
      const b = buscar(it.boleto);
      if (b) Object.assign(b, { asistieron: it.cuantos, pendiente: true }, esSinBoleto(b) ? { lugares: it.cuantos } : {});
    }
  }

  /**
   * La actividad del contador y del «+1»: la elegida a mano o, si no, la que
   * está ocurriendo (desde 45 minutos antes de empezar); si ninguna, la
   * próxima; si ya pasaron todas, la última.
   */
  actual() {
    const acts = this.actividades().filter(a => !a.invalida);
    if (!acts.length) return null;
    if (this.fijada && acts.some(a => a.actividad_id === this.fijada)) return this.fijada;
    const t = this.ahora();
    const con = acts.map(a => ({ id: a.actividad_id, w: ventana(a.actividad) }));
    const enCurso = con.filter(x => x.w && t >= x.w.ini - 45 * MIN && t <= x.w.fin);
    if (enCurso.length) return enCurso.sort((a, b) => Math.abs(t - a.w.ini) - Math.abs(t - b.w.ini))[0].id;
    const proxima = con.filter(x => x.w && x.w.ini > t).sort((a, b) => a.w.ini - b.w.ini)[0];
    if (proxima) return proxima.id;
    const ultima = con.filter(x => x.w).sort((a, b) => b.w.fin - a.w.fin)[0];
    return (ultima || con[0]).id;
  }

  fijar(id) {
    this.fijada = this.fijada === id ? null : id;
    this.emitir('cambio');
  }

  /* --------------------------------------------------------- escanear -- */

  /** El boleto que corresponde a un QR o código, en cualquiera de las listas. */
  async localizar(ref) {
    const h = ref.tipo === 'token' ? await huella(ref.valor) : null;
    for (const c of this.claves) {
      if (c.invalida) continue;
      const v = this.vista(c.actividad_id);
      if (!v) continue;
      const b = v.boletos.find(b => b.estado !== 'cancelado'
        && (ref.tipo === 'token' ? b.huella === h : b.codigo === ref.valor));
      if (b) return { v, b };
    }
    return null;
  }

  /**
   * Un QR leído o un código tecleado. Devuelve qué mostrar:
   *   { tipo: adelante | ya_entro | espera | otra_actividad | cancelado |
   *           no_existe | sin_red | qr_actividad | no_es_boleto | sin_permiso | sin_claves,
   *     actividad, boleto }
   */
  async registrar(texto) {
    const ref = leerRef(texto);
    if (ref.tipo === 'actividad') return { tipo: 'qr_actividad' };
    if (ref.tipo === 'otro') return { tipo: 'no_es_boleto' };
    const actual = this.actual();
    if (!actual) return { tipo: 'sin_claves' };

    let hallado = await this.localizar(ref);
    if (!hallado && this.enLinea !== false) {
      // Quizá lo pidió hace unos minutos: se refrescan las listas y se busca otra vez.
      await this.descargarTodas();
      hallado = await this.localizar(ref);
    }
    if (hallado) return this.entrar(hallado.v.id, hallado.b.id);

    // No está en ninguna lista. Solo la base sabe si es de otra actividad,
    // está cancelado o no existe. Cualquier clave sirve para preguntarle.
    const c = this.claveDe(actual);
    let r;
    try {
      r = await this.api.marcarEntrada({ actividad: actual, clave: c.clave, ref: ref.valor,
                                         cuando: new Date(this.ahora()).toISOString() });
    } catch (e) {
      this.marcarRed(false);
      return { tipo: 'sin_red' };
    }
    this.marcarRed(true);
    if (r.ok) {
      // Era de la actividad actual y la lista no lo tenía todavía: ya entró.
      await this.descargar(actual);
      this.emitir('cambio');
      const v = this.vista(actual);
      return { tipo: 'adelante', actividad: v.actividad, actividadId: actual,
               boleto: v.boletos.find(b => b.codigo === r.codigo) || { nombre: r.nombre, lugares: r.lugares, asistieron: r.asistieron } };
    }
    if (r.error === 'ya_entro') {
      return { tipo: 'ya_entro', actividad: this.listas[actual]?.actividad, actividadId: actual,
               boleto: { nombre: r.nombre, lugares: r.lugares, asistieron: r.asistieron, asistio_en: r.asistio_en, codigo: r.codigo } };
    }
    if (r.error === 'espera') {
      await this.descargar(actual);
      const h = await this.localizar(ref);
      if (h) return this.entrar(h.v.id, h.b.id);
    }
    // Es de otra actividad de este teléfono cuya lista no se pudo bajar: se
    // baja ahora y la entrada va a la suya.
    const otra = r.actividad?.id;
    if (r.error === 'otra_actividad' && otra && this.claveDe(otra) && !this.claveDe(otra).invalida) {
      await this.descargar(otra);
      const h = await this.localizar(ref);
      if (h) return this.entrar(h.v.id, h.b.id);
    }
    return { tipo: r.error, actividad: r.actividad || null };
  }

  /**
   * Marca la entrada de un boleto que está en la lista. Para la lista de
   * espera hace falta «admitir»: es decisión de quien está en la puerta.
   */
  entrar(actividadId, boletoId, { admitir = false } = {}) {
    const v = this.vista(actividadId);
    const b = v?.boletos.find(x => x.id === boletoId);
    if (!b) return { tipo: 'no_existe' };
    const base = { actividad: v.actividad, actividadId, boleto: b };
    if (b.asistio_en) return { tipo: 'ya_entro', ...base };
    if (b.estado === 'espera' && !admitir) return { tipo: 'espera', ...base };

    this.encolar({ tipo: 'marcar', actividad: actividadId, boleto: b.id, ref: b.codigo,
                   cuantos: null, cuando: new Date(this.ahora()).toISOString(),
                   admitir: b.estado === 'espera' });
    return { tipo: 'adelante', ...base, admitido: b.estado === 'espera',
             boleto: { ...b, asistieron: b.lugares, asistio_en: new Date(this.ahora()).toISOString(), estado: 'activo' } };
  }

  /** «+1»: alguien sin boleto que cabe. Devuelve el id local de la entrada. */
  sinBoleto(actividadId, cuantos = 1) {
    const local = nuevoId('l');
    this.encolar({ tipo: 'sin_boleto', actividad: actividadId, local, cuantos,
                   cuando: new Date(this.ahora()).toISOString() });
    return local;
  }

  /** Lo pendiente que todavía se puede corregir sin hablar con la base. */
  pendienteDe(actividadId, id) {
    const real = this.real(id);
    return this.cola.find(i => !i.enviando && i.actividad === actividadId && (
      (i.tipo === 'marcar' && this.real(i.boleto) === real) ||
      (i.tipo === 'sin_boleto' && (i.local === id || this.real(i.local) === real))));
  }

  /** Cuántas personas de esa entrada pasaron de verdad. */
  ajustar(actividadId, id, cuantos) {
    const p = this.pendienteDe(actividadId, id);
    if (p) { p.cuantos = cuantos; this.guardarCola(); this.emitir('cambio'); return; }
    const real = this.real(id);
    const a = this.cola.find(i => !i.enviando && i.tipo === 'ajustar' && this.real(i.boleto) === real);
    if (a) { a.cuantos = cuantos; this.guardarCola(); this.emitir('cambio'); this.sincronizar(); return; }
    this.encolar({ tipo: 'ajustar', actividad: actividadId, boleto: real, cuantos });
  }

  /** Deshace una entrada: el boleto vuelve a quedar sin usar; un «+1» desaparece. */
  deshacer(actividadId, id) {
    const real = this.real(id);
    const p = this.pendienteDe(actividadId, id);
    // Lo que no ha salido del teléfono simplemente se retira de la cola.
    this.cola = this.cola.filter(i => i !== p &&
      !(i.tipo === 'ajustar' && !i.enviando && this.real(i.boleto) === real));
    if (p) { this.guardarCola(); this.emitir('cambio'); return; }
    this.encolar({ tipo: 'anular', actividad: actividadId, boleto: real });
  }

  /* ------------------------------------------------------------- cola -- */
  encolar(item) {
    this.cola.push({ id: nuevoId('q'), ...item });
    this.guardarCola();
    this.emitir('cambio');
    // Sin red no se intenta en el acto: mientras una petición está en el
    // aire no se puede retocar, y sin señal tardaría segundos en fallar.
    // La reintenta el reloj de la página o el regreso de la red.
    if (this.enLinea !== false) this.sincronizar();
  }

  marcarRed(v) {
    if (this.enLinea === v) return;
    this.enLinea = v;
    this.emitir('red', v);
  }

  /** Sube la cola en orden. Si no hay red, se detiene y espera al siguiente intento. */
  async sincronizar() {
    if (this.sincronizando) return;
    this.sincronizando = true;
    try {
      while (this.cola.length) {
        const it = this.cola[0];
        const c = this.claveDe(it.actividad);
        if (!c) { this.cola.shift(); this.guardarCola(); continue; }
        it.enviando = true;
        let r;
        try {
          r = await this.enviar(it, c.clave);
        } catch (e) {
          it.enviando = false;
          this.marcarRed(false);
          break;
        }
        this.marcarRed(true);
        this.aplicar(it, r);
        this.cola = this.cola.filter(i => i !== it);
        this.guardarCola();
        this.emitir('cambio');
      }
    } finally {
      this.sincronizando = false;
    }
  }

  enviar(it, clave) {
    const actividad = it.actividad;
    switch (it.tipo) {
      case 'marcar':
        return this.api.marcarEntrada({ actividad, clave, ref: it.ref, asistieron: it.cuantos,
                                        cuando: it.cuando, admitir: !!it.admitir });
      case 'sin_boleto':
        return this.api.entradaSinBoleto({ actividad, clave, cuantos: it.cuantos, cuando: it.cuando });
      case 'anular':
        return this.api.anularEntrada({ actividad, clave, boleto: this.real(it.boleto) });
      case 'ajustar':
        return this.api.ajustarEntrada({ actividad, clave, boleto: this.real(it.boleto), cuantos: it.cuantos });
    }
    return Promise.resolve({ ok: false, error: 'desconocido' });
  }

  /** La respuesta de la base se vuelve parte de la lista guardada. */
  aplicar(it, r) {
    const id = it.actividad;
    const s = this.listas[id];
    const buscar = (bid) => s?.boletos.find(b => b.id === this.real(bid));

    if (!r?.ok && r?.error === 'sin_permiso') {
      // Revocada o vencida: lo pendiente de esa actividad ya no se puede subir.
      const c = this.claveDe(id);
      if (c) { c.invalida = true; this.guardarClaves(); }
      const perdidas = this.cola.filter(i => i.actividad === id).length;
      this.cola = this.cola.filter(i => i === it || i.actividad !== id);
      this.emitir('aviso', { tipo: 'sin_permiso', actividadId: id, perdidas });
      return;
    }

    if (it.tipo === 'marcar') {
      const b = buscar(it.boleto);
      if (r.ok) {
        if (b) Object.assign(b, { asistio_en: it.cuando, asistieron: r.asistieron, estado: 'activo' });
      } else if (r.error === 'ya_entro') {
        if (b) Object.assign(b, { asistio_en: r.asistio_en, asistieron: r.asistieron ?? b.asistieron });
        // Si la hora es la nuestra, es esta misma marca que llegó dos veces
        // (se cortó la respuesta y se reintentó). Si no, otro teléfono la hizo antes.
        const propia = Math.abs(new Date(r.asistio_en) - new Date(it.cuando)) < 2000;
        if (!propia) this.emitir('aviso', { tipo: 'ya_entro', actividadId: id, boletoId: it.boleto,
                                            nombre: r.nombre, hora: r.asistio_en });
      } else {
        if (b && r.error === 'espera') b.estado = 'espera';
        else if (b) s.boletos.splice(s.boletos.indexOf(b), 1);
        this.emitir('aviso', { tipo: r.error, actividadId: id, boletoId: it.boleto, nombre: b?.nombre, detalle: r });
      }
    } else if (it.tipo === 'sin_boleto') {
      if (r.ok) {
        this.alias[it.local] = r.id;
        for (const j of this.cola) if (j.boleto === it.local) j.boleto = r.id;
        if (s && !buscar(r.id)) {
          s.boletos.push({ id: r.id, codigo: null, huella: null, nombre: null, lugares: it.cuantos,
                           estado: 'activo', origen: 'puerta', creado: it.cuando,
                           asistio_en: it.cuando, asistieron: it.cuantos });
        }
      } else {
        this.emitir('aviso', { tipo: r.error, actividadId: id, detalle: r });
      }
    } else if (it.tipo === 'anular') {
      const b = buscar(it.boleto);
      if (r.ok && b) {
        if (esSinBoleto(b)) s.boletos.splice(s.boletos.indexOf(b), 1);
        else Object.assign(b, { asistio_en: null, asistieron: null });
      }
    } else if (it.tipo === 'ajustar') {
      const b = buscar(it.boleto);
      if (r.ok && b) Object.assign(b, { asistieron: r.asistieron, lugares: r.lugares });
    }
    if (s) this.guardarLista(id);
  }

  /* ----------------------------------------------------------- buscar -- */

  /** Por nombre o código, en todas las actividades del teléfono. Sin red también. */
  buscar(texto) {
    const t = normalizar(texto);
    const cod = String(texto || '').toUpperCase().replace(/[\s·.\-]/g, '');
    if (t.length < 2) return [];
    const res = [];
    for (const c of this.claves) {
      if (c.invalida) continue;
      const v = this.vista(c.actividad_id);
      if (!v) continue;
      for (const b of v.boletos) {
        if (b.estado === 'cancelado' || esSinBoleto(b)) continue;
        if (b.codigo === cod || normalizar(b.nombre).includes(t)) res.push({ v, b });
      }
    }
    return res
      .sort((x, y) => (!!x.b.asistio_en - !!y.b.asistio_en) || normalizar(x.b.nombre).localeCompare(normalizar(y.b.nombre)))
      .slice(0, 20);
  }
}
