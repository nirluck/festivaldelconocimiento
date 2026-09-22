/* ============================================================================
   MÓDULO · BOLETOS
   ----------------------------------------------------------------------------
   Todo lo que el coordinador y la administración hacen con los boletos de una
   actividad:

     · Ocupación     emitidos contra cupo, lista de espera, entradas
     · Difundir      el QR de la actividad: cartel, imagen para redes, QR suelto
     · Personas      la lista, con búsqueda, CSV, cancelar y admitir
     · Emitir        boletos a mano y boletos de grupo
     · Puerta        claves para que un voluntario registre entradas sin cuenta
     · Quién viene   el público en agregado: origen, edad, género, municipio y colonia

   Datos mínimos (asesoría legal, 21 de septiembre de 2026): del público solo
   se guarda nombre, fecha de nacimiento, género y lugar. Aquí el nombre se ve
   uno por uno; lo demás, solo en conjunto.

   Solo aparece si la actividad pide boleto o confirmación (acceso ≠ libre).
   Las reglas las pone la base (sql/11-boletos.sql): cada función vuelve a
   preguntar puede_editar_actividad(). Aquí solo se pinta.

   El sistema no envía correos: lo que se emite a mano se entrega con la liga
   o la imagen del boleto: por eso el resultado las muestra a la vista.
   ========================================================================== */

import { db, catalogos, explicar, escapar, fechaDia, fechaHora } from '/assets/js/app.js';
import { qrSVG } from '/assets/js/qr.js';
import { urlActividad, cartelPNG, qrPNG, qrSVGArchivo } from '/assets/js/boletos/cartel.js';
import { imagenBoleto } from '/assets/js/boletos/tarjeta.js';
import { mensaje } from '/assets/js/boletos/api.js';
import { codigoLegible, descargar, urlBoleto, fechaHoraTexto, aLas } from '/assets/js/boletos/util.js';

const ORIGENES = {
  cartel:   'QR de cartel',
  programa: 'Cartelera del programa',
  ficha:    'Página de la actividad',
  portada:  'Portada del sitio',
  redes:    'Redes sociales',
  grupo:    'Boletos de grupo',
  panel:    'Emitidos desde el panel',
  puerta:   'Sin boleto, en la entrada',
  otro:     'Liga directa u otro',
};

const ESTADOS = {
  activo:    ['Activo', 'verde'],
  espera:    ['En espera', 'ambar'],
  cancelado: ['Cancelado', 'gris'],
};

export default {
  id: 'boletos',
  nombre: 'Boletos',
  aplica: (a) => a.acceso === 'boleto' || a.acceso === 'registro',

  async montar(contenedor, actividad, perfil) {
    const m = new Modulo(contenedor, actividad, perfil);
    await m.cargar();
  },
};

/* ========================================================================== */

class Modulo {
  constructor(caja, act, perfil) {
    this.caja = caja;
    this.act = act;
    this.esAdmin = perfil.rol === 'administrador';
    this.registro = act.acceso === 'registro';
    this.filtro = { texto: '', estado: 'vigentes' };
    this.seleccion = new Set();
    this.origenQR = 'cartel';
  }

  async cargar() {
    const a = this.act;
    const [res, lista, puertas, cat, sede] = await Promise.all([
      db.rpc('resumen_boletos', { p_actividad: a.id }),
      db.rpc('boletos_de_actividad', { p_actividad: a.id }),
      db.from('puertas').select('*').eq('actividad_id', a.id).order('creado', { ascending: true }),
      catalogos().catch(() => ({ ejes: [] })),
      a.sede ? db.from('sedes').select('capacidad').eq('nombre', a.sede).maybeSingle()
             : Promise.resolve({ data: null }),
    ]);
    const fallo = [res, lista, puertas].find(r => r.error);
    if (fallo) {
      this.caja.innerHTML = `<div class="aviso aviso--mal">${escapar(explicar(fallo.error))}</div>`;
      return;
    }
    this.resumen = res.data || {};
    this.boletos = lista.data || [];
    this.puertas = puertas.data || [];
    this.capacidad = sede.data?.capacidad || null;
    this.act.eje_color = (cat.ejes || []).find(e => e.nombre === a.eje)?.color || null;
    this.pintar();
  }

  /* ------------------------------------------------------------ esqueleto -- */
  pintar() {
    this.caja.innerHTML = `
      <div class="bol">
        <div class="aviso" id="bol-aviso" hidden role="status"></div>
        <section class="tarjeta" id="bol-ocupacion"></section>
        <section class="tarjeta" id="bol-difundir"></section>
        <section class="tarjeta" id="bol-personas"></section>
        <section class="tarjeta" id="bol-emitir"></section>
        <section class="tarjeta" id="bol-puerta"></section>
        <section class="tarjeta" id="bol-publico"></section>
      </div>`;
    this.pintarOcupacion();
    this.pintarDifundir();
    this.pintarPersonas();
    this.pintarEmitir();
    this.pintarPuerta();
    this.pintarPublico();
  }

  $(sel) { return this.caja.querySelector(sel); }

  avisar(tipo, texto) {
    const c = this.$('#bol-aviso');
    c.className = 'aviso aviso--' + tipo;
    c.textContent = texto;
    c.hidden = false;
    c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** Vuelve a leer todo y repinta, conservando filtros y la sección visible. */
  async refrescar(texto) {
    const y = window.scrollY;
    await this.cargar();
    window.scrollTo(0, y);
    if (texto) this.avisar('ok', texto);
  }

  /* ------------------------------------------------------------ ocupación -- */
  pintarOcupacion() {
    const a = this.act;
    const f = this.resumen.aforo || { emitidos: 0, en_espera: 0, asistieron: 0 };
    const cupo = a.cupo || 0;
    const pct = cupo ? Math.min(100, Math.round(100 * f.emitidos / cupo)) : 0;
    const libres = Math.max(cupo - f.emitidos, 0);

    // Ventana de boletos
    const abre = a.boletos_desde || a.publicada_en;
    const cierra = a.boletos_hasta || (a.fecha ? inicioActividad(a.fecha, a.hora_inicio) : null);
    const ahora = new Date();
    let ventana;
    if (!a.publica) ventana = '<b>Todavía no está en el programa:</b> nadie puede pedir boletos hasta que la administración la publique.';
    else if (abre && new Date(abre) > ahora) ventana = `Los boletos se abren el <b>${escapar(fechaHoraTexto(abre))}</b>.`;
    else if (cierra && new Date(cierra) <= ahora) ventana = 'El registro ya cerró. En la entrada se pueden admitir personas de la lista de espera o sin boleto.';
    else ventana = `<b>Registro abierto</b>${cierra ? ` hasta el ${escapar(fechaHoraTexto(cierra))}` : ''}.`;

    const liga = urlActividad(a.slug, '');

    this.$('#bol-ocupacion').innerHTML = `
      <h2>${this.registro ? 'Confirmaciones' : 'Ocupación'}</h2>
      <p class="leyenda">${ventana}</p>

      <div class="bol-cifras">
        <div class="bol-cifra bol-cifra--grande">
          <b>${f.emitidos}${this.registro ? '' : `<small> / ${cupo}</small>`}</b>
          <span>${this.registro ? 'personas confirmadas' : 'boletos emitidos (lugares)'}</span>
        </div>
        ${this.registro ? '' : `
        <div class="bol-cifra"><b>${libres}</b><span>lugares libres</span></div>`}
        <div class="bol-cifra"><b>${f.en_espera}</b><span>en lista de espera</span></div>
        <div class="bol-cifra"><b>${f.asistieron}</b><span>ya entraron</span></div>
      </div>

      ${this.registro ? '' : `
      <div class="bol-barra" role="img" aria-label="${pct} % de los boletos emitidos">
        <i style="width:${pct}%"></i>
      </div>
      <p class="bol-nota">${pct} % emitido.
        ${this.capacidad ? `La sede registra una capacidad de <b>${this.capacidad}</b>; el cupo es de <b>${cupo}</b> boletos, con el sobrecupo incluido.`
          : 'La sede no tiene capacidad registrada: en la entrada se usará el cupo como tope.'}</p>`}

      <div class="bol-liga">
        <span>Liga para pedir boleto:</span>
        <a href="${escapar(liga)}" target="_blank" rel="noopener">${escapar(liga.replace(/^https?:\/\//, ''))}</a>
        <button class="btn btn--linea btn--chico" type="button" data-copiar="${escapar(liga)}">Copiar</button>
        ${this.esAdmin ? '<button class="bol-mini" type="button" data-recontar title="Vuelve a contar desde los boletos">Recalcular contadores</button>' : ''}
      </div>`;

    this.conectarCopiar(this.$('#bol-ocupacion'));
    const rec = this.$('[data-recontar]');
    if (rec) rec.addEventListener('click', async () => {
      rec.disabled = true;
      const { data, error } = await db.rpc('recontar_aforo', { p_actividad: this.act.id });
      if (error || !data?.ok) return this.avisar('mal', error ? explicar(error) : 'No se pudo recalcular.');
      this.refrescar('Contadores recalculados desde los boletos.');
    });
  }

  conectarCopiar(raiz) {
    raiz.querySelectorAll('[data-copiar]').forEach(b => b.addEventListener('click', async () => {
      const antes = b.textContent;
      try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = '¡Copiada!'; }
      catch (e) { b.textContent = 'Cópiala de la liga'; }
      setTimeout(() => { b.textContent = antes; }, 2000);
    }));
  }

  /* ------------------------------------------------------------- difundir -- */
  pintarDifundir() {
    const a = this.act;
    const url = urlActividad(a.slug, this.origenQR);
    this.$('#bol-difundir').innerHTML = `
      <h2>Difundir con QR</h2>
      <p class="leyenda">Quien escanee el código llega directo al formulario del boleto.
        Cada pieza lleva su propio origen, para saber después de dónde vino la gente.</p>

      <div class="bol-qr">
        <div class="bol-qr__codigo">${qrSVG(url, { titulo: 'Código QR para pedir boleto' })}</div>
        <div class="bol-qr__lado">
          <div class="campo">
            <label for="bol-origen">¿Dónde se va a usar?</label>
            <select id="bol-origen">
              <option value="cartel"${this.origenQR === 'cartel' ? ' selected' : ''}>Cartel o volante impreso</option>
              <option value="redes"${this.origenQR === 'redes' ? ' selected' : ''}>Redes sociales o mensajes</option>
              <option value="otro"${this.origenQR === 'otro' ? ' selected' : ''}>Otro uso</option>
            </select>
          </div>
          <div class="bol-botones">
            <button class="btn btn--principal btn--chico" type="button" data-pieza="cartel">Cartel para imprimir</button>
            <button class="btn btn--linea btn--chico" type="button" data-pieza="cuadrado">Imagen para redes</button>
            <button class="btn btn--linea btn--chico" type="button" data-pieza="png">Solo el QR (PNG)</button>
            <button class="btn btn--linea btn--chico" type="button" data-pieza="svg">Solo el QR (SVG)</button>
          </div>
          <p class="bol-nota">Al compartir en redes también sirve la liga de la actividad
            con <code>#boleto</code> al final: abre el formulario directo.</p>
          ${a.publica ? '' : '<p class="bol-nota bol-nota--aviso">Puedes descargar las piezas desde ya, pero el formulario solo funciona cuando la actividad esté publicada.</p>'}
        </div>
      </div>`;

    this.$('#bol-origen').addEventListener('change', (ev) => {
      this.origenQR = ev.target.value;
      this.pintarDifundir();
    });

    this.$('#bol-difundir').querySelectorAll('[data-pieza]').forEach(b => b.addEventListener('click', async () => {
      const pieza = b.dataset.pieza;
      const antes = b.textContent;
      b.disabled = true; b.textContent = 'Preparando…';
      try {
        const nombre = `qr-${a.slug}-${this.origenQR}`;
        if (pieza === 'cartel' || pieza === 'cuadrado') {
          descargar(await cartelPNG(a, this.origenQR, pieza), `${nombre}-${pieza}.png`);
        } else if (pieza === 'png') {
          descargar(await qrPNG(urlActividad(a.slug, this.origenQR)), `${nombre}.png`);
        } else {
          descargar(qrSVGArchivo(urlActividad(a.slug, this.origenQR)), `${nombre}.svg`);
        }
      } catch (e) {
        this.avisar('mal', 'No se pudo crear la pieza: ' + (e.message || e));
      } finally {
        b.disabled = false; b.textContent = antes;
      }
    }));
  }

  /* ------------------------------------------------------------- personas -- */
  filtrados() {
    const t = this.filtro.texto.trim().toLowerCase();
    const cod = t.replace(/[\s·-]/g, '').toUpperCase();
    return this.boletos.filter(b => {
      const e = this.filtro.estado;
      if (e === 'vigentes' && b.estado === 'cancelado') return false;
      if (e === 'activo' && !(b.estado === 'activo' && !b.asistio_en)) return false;
      if (e === 'espera' && b.estado !== 'espera') return false;
      if (e === 'cancelado' && b.estado !== 'cancelado') return false;
      if (e === 'entraron' && !b.asistio_en) return false;
      if (!t) return true;
      return (b.nombre || '').toLowerCase().includes(t)
        || (b.codigo || '') === cod;
    });
  }

  pintarPersonas() {
    const total = this.boletos.length;
    this.$('#bol-personas').innerHTML = `
      <h2>Personas</h2>
      <p class="leyenda">${total
        ? 'Quienes pidieron boleto. La lista es para organizar la entrada: no la compartas fuera de la organización.'
        : 'Todavía nadie ha pedido boleto.'}</p>

      ${total ? `
      <div class="bol-filtros">
        <input type="search" id="bol-buscar" placeholder="Buscar por nombre o código"
               value="${escapar(this.filtro.texto)}" aria-label="Buscar">
        <select id="bol-estado" aria-label="Filtrar por estado">
          ${[['vigentes', 'Activos y en espera'], ['activo', 'Activos sin entrar'], ['espera', 'Lista de espera'],
             ['entraron', 'Ya entraron'], ['cancelado', 'Cancelados'], ['todos', 'Todos']]
            .map(([v, t]) => `<option value="${v}"${v === this.filtro.estado ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
        <button class="btn btn--linea btn--chico" type="button" id="bol-csv">Exportar CSV</button>
      </div>
      <div class="bol-masa" id="bol-masa" hidden></div>
      <div class="tabla-caja"><table class="bol-tabla">
        <thead><tr>
          <th scope="col"><input type="checkbox" id="bol-todos" aria-label="Seleccionar todos los visibles"></th>
          <th scope="col">Código</th><th scope="col">Nombre</th>
          <th scope="col" class="num">Lugares</th><th scope="col">Estado</th>
          <th scope="col">Llegó por</th><th scope="col">Pedido</th><th scope="col"><span class="sr">Acciones</span></th>
        </tr></thead>
        <tbody id="bol-filas"></tbody>
      </table></div>
      <p class="bol-nota" id="bol-cuenta"></p>` : ''}`;

    if (!total) return;
    this.pintarFilas();

    let espera;
    this.$('#bol-buscar').addEventListener('input', (ev) => {
      clearTimeout(espera);
      espera = setTimeout(() => { this.filtro.texto = ev.target.value; this.pintarFilas(); }, 120);
    });
    this.$('#bol-estado').addEventListener('change', (ev) => {
      this.filtro.estado = ev.target.value; this.pintarFilas();
    });
    this.$('#bol-csv').addEventListener('click', () => this.exportar());
    this.$('#bol-todos').addEventListener('change', (ev) => {
      this.filtrados().filter(cancelable).forEach(b =>
        ev.target.checked ? this.seleccion.add(b.id) : this.seleccion.delete(b.id));
      this.pintarFilas();
    });
  }

  pintarFilas() {
    const filas = this.filtrados();
    // La selección solo conserva lo que sigue visible y cancelable.
    const visibles = new Set(filas.filter(cancelable).map(b => b.id));
    [...this.seleccion].forEach(id => { if (!visibles.has(id)) this.seleccion.delete(id); });

    this.$('#bol-filas').innerHTML = filas.length ? filas.map(b => {
      const [etq, tono] = b.asistio_en ? ['Entró', 'azul'] : (ESTADOS[b.estado] || [b.estado, 'gris']);
      return `
      <tr data-id="${b.id}">
        <td>${cancelable(b) ? `<input type="checkbox" data-sel aria-label="Seleccionar a ${escapar(b.nombre || b.codigo)}"${this.seleccion.has(b.id) ? ' checked' : ''}>` : ''}</td>
        <td><code class="bol-codigo">${escapar(codigoLegible(b.codigo))}</code></td>
        <td><strong>${escapar(b.nombre || 'Sin nombre (entrada en puerta)')}</strong></td>
        <td class="num">${b.asistio_en && b.asistieron !== b.lugares ? `${b.asistieron} de ${b.lugares}` : b.lugares}</td>
        <td><span class="chip chip--${tono}">${etq}</span>${b.asistio_en ? `<small class="bol-hora">${escapar(aLas(b.asistio_en).replace(/^a las? /, ''))}</small>` : ''}</td>
        <td>${escapar(ORIGENES[b.origen] || b.origen)}</td>
        <td>${escapar(fechaHora(b.creado))}</td>
        <td class="bol-acc">
          ${b.estado === 'espera' && !b.asistio_en ? '<button class="btn btn--linea btn--chico" type="button" data-admitir>Admitir</button>' : ''}
          ${cancelable(b) ? '<button class="bol-mini bol-mini--peligro" type="button" data-cancelar>Cancelar</button>' : ''}
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="bol-vacio">Nada coincide con la búsqueda.</td></tr>`;

    const lugares = filas.filter(b => b.estado !== 'cancelado').reduce((s, b) => s + b.lugares, 0);
    this.$('#bol-cuenta').textContent =
      `${filas.length} ${filas.length === 1 ? 'boleto' : 'boletos'} · ${lugares} ${lugares === 1 ? 'lugar' : 'lugares'}`;

    const tbody = this.$('#bol-filas');
    tbody.querySelectorAll('[data-sel]').forEach(c => c.addEventListener('change', () => {
      const id = c.closest('tr').dataset.id;
      c.checked ? this.seleccion.add(id) : this.seleccion.delete(id);
      this.pintarMasa();
    }));
    tbody.querySelectorAll('[data-cancelar]').forEach(b => b.addEventListener('click', () => {
      // Dos pasos: el primer clic pregunta, el segundo cancela.
      if (b.dataset.confirmar) return this.cancelar([b.closest('tr').dataset.id]);
      b.dataset.confirmar = '1';
      b.textContent = '¿Seguro? Cancelar';
      setTimeout(() => { if (b.isConnected) { delete b.dataset.confirmar; b.textContent = 'Cancelar'; } }, 4000);
    }));
    tbody.querySelectorAll('[data-admitir]').forEach(b => b.addEventListener('click', () =>
      this.admitir(b.closest('tr').dataset.id, b)));
    this.pintarMasa();
  }

  pintarMasa() {
    const caja = this.$('#bol-masa');
    const n = this.seleccion.size;
    const todos = this.$('#bol-todos');
    const cancelables = this.filtrados().filter(cancelable).length;
    if (todos) {
      todos.checked = n > 0 && n === cancelables;
      todos.indeterminate = n > 0 && n < cancelables;
    }
    if (!n) { caja.hidden = true; return; }
    caja.hidden = false;
    caja.innerHTML = `
      <span>${n} ${n === 1 ? 'boleto seleccionado' : 'boletos seleccionados'}</span>
      <button class="btn btn--linea btn--chico bol-peligro" type="button" data-masa>Cancelar ${n === 1 ? 'el boleto' : `los ${n}`}</button>
      <button class="bol-mini" type="button" data-limpiar>Quitar selección</button>`;
    caja.querySelector('[data-limpiar]').addEventListener('click', () => {
      this.seleccion.clear(); this.pintarFilas();
    });
    const b = caja.querySelector('[data-masa]');
    b.addEventListener('click', () => {
      if (b.dataset.confirmar) return this.cancelar([...this.seleccion]);
      b.dataset.confirmar = '1';
      b.textContent = `Confirmar: cancelar ${n === 1 ? '1 boleto' : n + ' boletos'}`;
    });
  }

  async cancelar(ids) {
    const { data, error } = await db.rpc('cancelar_boletos_panel', { p_ids: ids });
    if (error) return this.avisar('mal', explicar(error));
    this.seleccion.clear();
    const fallidos = data.fallidos || [];
    const motivo = { ya_entro: 'ya entró', sin_permiso: 'sin permiso', no_existe: 'no existe' };
    await this.refrescar();
    this.avisar(fallidos.length ? 'info' : 'ok',
      `${data.cancelados === 1 ? 'Se canceló 1 boleto' : `Se cancelaron ${data.cancelados} boletos`}; los lugares quedaron libres.`
      + (fallidos.length ? ` ${fallidos.length} no se pudieron cancelar (${[...new Set(fallidos.map(f => motivo[f.error] || f.error))].join(', ')}).` : ''));
  }

  async admitir(id, boton) {
    boton.disabled = true;
    const { data, error } = await db.rpc('admitir_de_espera', { p_boleto: id });
    if (error) { boton.disabled = false; return this.avisar('mal', explicar(error)); }
    if (!data.ok) {
      boton.disabled = false;
      return this.avisar('mal', data.error === 'agotado'
        ? `No hay lugar: ${data.disponibles ? `quedan ${data.disponibles}` : 'no queda ninguno'} y este boleto necesita más. Cancela otro boleto o sube el cupo en Resumen.`
        : mensaje(data));
    }
    const b = this.boletos.find(x => x.id === id);
    this.refrescar(`${b?.nombre || 'La persona'} pasó de la lista de espera a tener boleto. Avísale tú: el sistema no envía correos.`);
  }

  exportar() {
    const filas = this.filtrados();
    const col = ['Código', 'Nombre', 'Lugares', 'Estado', 'Llegó por', 'Pedido', 'Entró', 'Entraron'];
    const csv = [col, ...filas.map(b => [
      codigoLegible(b.codigo), b.nombre || '', b.lugares,
      b.asistio_en ? 'Entró' : (ESTADOS[b.estado]?.[0] || b.estado),
      ORIGENES[b.origen] || b.origen, fechaCSV(b.creado),
      fechaCSV(b.asistio_en), b.asistio_en ? b.asistieron : '',
    ])].map(f => f.map(celda).join(',')).join('\r\n');
    // BOM: sin él, Excel abre los acentos como símbolos raros.
    descargar(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }),
      `boletos-${this.act.slug}.csv`);
  }

  /* --------------------------------------------------------------- emitir -- */
  pintarEmitir() {
    const reg = this.registro;
    this.$('#bol-emitir').innerHTML = `
      <h2>${reg ? 'Registrar a mano' : 'Emitir boletos a mano'}</h2>
      <p class="leyenda">Para quien no puede pedirlo en línea, o para un grupo escolar:
        un solo boleto con todos sus lugares, a nombre de quien lo acompaña.
        ${reg ? '' : 'Cuenta contra el cupo igual que los demás.'}
        Solo se pide el nombre. Asegúrate de que la persona acepta los
        <a href="/privacidad/#terminos" target="_blank" rel="noopener">términos y el aviso de privacidad</a>.</p>

      <form class="campos campos--2" id="bol-forma" novalidate>
        <div class="campo">
          <label for="bol-nombre">Nombre</label>
          <input type="text" id="bol-nombre" maxlength="120" required>
          <span class="pista">Si es un grupo, el de quien lo acompaña y su escuela u organización.</span>
        </div>
        <div class="campo">
          <label for="bol-lugares">Lugares</label>
          <input type="number" id="bol-lugares" min="1" max="1000" step="1" value="1" required>
        </div>
        <div class="campo">
          <label class="check"><input type="checkbox" id="bol-grupo"> Es un grupo (escuela, organización)</label>
          <label class="check"><input type="checkbox" id="bol-espera"> Si no hay lugar, anotarlo en la lista de espera</label>
        </div>
        <div class="campo completo">
          <div class="acciones" style="margin-top:4px">
            <button class="btn btn--principal" type="submit" id="bol-emitir-btn">${reg ? 'Registrar' : 'Emitir boleto'}</button>
          </div>
        </div>
      </form>
      <div id="bol-emitido"></div>`;

    const forma = this.$('#bol-forma');
    forma.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nombre = this.$('#bol-nombre').value.trim();
      const lugares = parseInt(this.$('#bol-lugares').value, 10);
      if (nombre.length < 2) return this.$('#bol-nombre').focus();
      if (!(lugares >= 1 && lugares <= 1000)) return this.$('#bol-lugares').focus();

      const btn = this.$('#bol-emitir-btn');
      btn.disabled = true;
      const { data, error } = await db.rpc('emitir_boleto_panel', {
        p_actividad: this.act.id, p_nombre: nombre, p_lugares: lugares,
        p_grupo: this.$('#bol-grupo').checked, p_espera: this.$('#bol-espera').checked,
      });
      btn.disabled = false;
      if (error) return this.avisar('mal', explicar(error));
      if (!data.ok) {
        const texto = data.error === 'agotado'
          ? `No hay lugar suficiente: ${data.disponibles ? `quedan ${data.disponibles}` : 'no queda ninguno'}. Pide menos lugares, marca «anotarlo en la lista de espera» o sube el cupo en Resumen.`
          : mensaje(data);
        return this.avisar('mal', texto);
      }
      forma.reset();
      const emitido = { ...data };
      await this.refrescar();
      this.mostrarEmitido(emitido);
    });
  }

  mostrarEmitido(b) {
    const url = urlBoleto(b.token);
    const caja = this.$('#bol-emitido');
    caja.innerHTML = `
      <div class="bol-emitido">
        <div class="bol-emitido__qr">${qrSVG(url)}</div>
        <div>
          <p><b>${b.estado === 'espera' ? 'Anotado en la lista de espera' : 'Boleto emitido'}</b>
            a nombre de ${escapar(b.nombre)} · ${b.lugares} ${b.lugares === 1 ? 'lugar' : 'lugares'}</p>
          <p class="bol-codigo-grande">${escapar(codigoLegible(b.codigo))}</p>
          <p class="bol-nota">El sistema no envía correos: <b>entrégale esta liga o la imagen</b>.
            Con el código y su nombre también la encuentran en la entrada.</p>
          <div class="bol-botones">
            <button class="btn btn--principal btn--chico" type="button" data-copiar="${escapar(url)}">Copiar liga del boleto</button>
            <button class="btn btn--linea btn--chico" type="button" data-imagen>Descargar imagen</button>
            <a class="btn btn--linea btn--chico" href="${escapar(url)}" target="_blank" rel="noopener">Abrir</a>
          </div>
        </div>
      </div>`;
    this.conectarCopiar(caja);
    caja.querySelector('[data-imagen]').addEventListener('click', async () => {
      descargar(await imagenBoleto(b), `boleto-${b.codigo}.png`);
    });
    this.avisar('ok', `${b.estado === 'espera' ? 'Quedó en la lista de espera' : 'Boleto emitido'}: ${codigoLegible(b.codigo)}.`);
    caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* --------------------------------------------------------------- puerta -- */
  pintarPuerta() {
    const ahora = new Date();
    const filas = this.puertas.map(p => {
      const vencida = p.vence && new Date(p.vence) <= ahora;
      const estado = !p.activa ? ['Revocada', 'gris'] : vencida ? ['Vencida', 'gris'] : ['Vigente', 'verde'];
      const url = `${location.origin}/puerta/#${p.token}`;
      return `
        <tr data-id="${p.id}">
          <td><strong>${escapar(p.etiqueta || 'Sin nombre')}</strong></td>
          <td><span class="chip chip--${estado[1]}">${estado[0]}</span></td>
          <td>${p.vence ? escapar(fechaHora(p.vence)) : 'Sin vencimiento'}</td>
          <td class="bol-acc">
            ${p.activa && !vencida ? `
              <button class="btn btn--linea btn--chico" type="button" data-copiar="${escapar(url)}">Copiar liga</button>
              <button class="btn btn--linea btn--chico" type="button" data-verqr="${escapar(url)}">Ver QR</button>
              <button class="bol-mini bol-mini--peligro" type="button" data-revocar>Revocar</button>`
            : !p.activa && !vencida ? '<button class="bol-mini" type="button" data-reactivar>Reactivar</button>' : ''}
          </td>
        </tr>`;
    }).join('');

    this.$('#bol-puerta').innerHTML = `
      <h2>Puerta</h2>
      <p class="leyenda">Una clave deja que una persona voluntaria, sin cuenta, registre
        entradas de <b>esta</b> actividad desde su teléfono. Vence sola a las 6 de la mañana
        del día siguiente a la actividad, y puedes revocarla antes.
        Quien tenga la liga puede ver los nombres de la lista: dásela solo a quien estará en la entrada.</p>

      ${this.puertas.length ? `
      <div class="tabla-caja"><table>
        <thead><tr><th scope="col">Para quién</th><th scope="col">Estado</th><th scope="col">Vence</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>` : ''}
      <div class="bol-qr-puerta" id="bol-qr-puerta" hidden></div>

      <form class="bol-nueva" id="bol-nueva" novalidate>
        <div class="campo">
          <label for="bol-etiqueta">Nueva clave para</label>
          <input type="text" id="bol-etiqueta" maxlength="60" placeholder="Por ejemplo, «Voluntaria Ana, entrada principal»">
        </div>
        <button class="btn btn--linea" type="submit">Crear clave</button>
      </form>`;

    const sec = this.$('#bol-puerta');
    this.conectarCopiar(sec);

    sec.querySelectorAll('[data-verqr]').forEach(b => b.addEventListener('click', () => {
      const caja = this.$('#bol-qr-puerta');
      const nombre = b.closest('tr').querySelector('strong').textContent;
      caja.hidden = false;
      caja.innerHTML = `
        <div class="bol-emitido">
          <div class="bol-emitido__qr">${qrSVG(b.dataset.verqr)}</div>
          <div><p><b>Clave de puerta · ${escapar(nombre)}</b></p>
            <p class="bol-nota">Que la persona voluntaria lo escanee con su teléfono. Abre la
              pantalla de entrada de esta actividad.</p>
            <button class="bol-mini" type="button" data-cerrar>Ocultar</button></div>
        </div>`;
      caja.querySelector('[data-cerrar]').addEventListener('click', () => { caja.hidden = true; });
    }));

    const cambiar = async (id, activa, texto) => {
      const { error } = await db.from('puertas').update({ activa }).eq('id', id);
      if (error) return this.avisar('mal', explicar(error));
      this.refrescar(texto);
    };
    sec.querySelectorAll('[data-revocar]').forEach(b => b.addEventListener('click', () => {
      if (!b.dataset.confirmar) { b.dataset.confirmar = '1'; b.textContent = '¿Seguro? Revocar'; return; }
      cambiar(b.closest('tr').dataset.id, false, 'Clave revocada: esa liga ya no abre la puerta.');
    }));
    sec.querySelectorAll('[data-reactivar]').forEach(b => b.addEventListener('click', () =>
      cambiar(b.closest('tr').dataset.id, true, 'Clave reactivada.')));

    this.$('#bol-nueva').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const etiqueta = this.$('#bol-etiqueta').value.trim();
      const { error } = await db.from('puertas').insert({ actividad_id: this.act.id, etiqueta });
      if (error) return this.avisar('mal', explicar(error));
      this.refrescar('Clave creada. Copia la liga o muestra el QR a quien estará en la entrada.');
    });
  }

  /* ----------------------------------------------------------- quién viene -- */
  pintarPublico() {
    const r = this.resumen;
    const personas = Object.values(r.edad || {}).reduce((s, n) => s + n, 0);
    // Pueden ser cientos de colonias: las doce con más gente y el resto junto.
    const colonias = primeras(r.colonia, 12);
    const origen = Object.fromEntries(Object.entries(r.por_origen || {})
      .map(([k, v]) => [ORIGENES[k] || k, v]));

    this.$('#bol-publico').innerHTML = `
      <h2>Quién viene</h2>
      <p class="leyenda">${personas
        ? `Datos de las ${personas} ${personas === 1 ? 'persona que pidió' : 'personas que pidieron'} boleto
           (no de sus acompañantes). Solo en conjunto: nunca por persona.`
        : 'Aquí aparecerá el perfil del público en cuanto haya boletos.'}</p>
      ${personas ? `
      <div class="bol-graficas">
        ${barras('Cómo llegaron', origen, 'lugares')}
        ${barras('Edad', r.edad, 'personas')}
        ${barras('Género', r.genero, 'personas')}
        ${barras('Municipio', r.municipio, 'personas')}
        ${barras('Colonia', colonias, 'personas')}
        ${porDia(r.por_dia)}
      </div>
      ${r.cancelados ? `<p class="bol-nota">${r.cancelados} ${r.cancelados === 1 ? 'boleto cancelado' : 'boletos cancelados'} no cuentan aquí.</p>` : ''}` : ''}`;
  }
}

/* ============================================================== utilidades */

/** Las «n» entradas con más valor; el resto suma en «Otras». «Sin dato» se respeta. */
function primeras(datos, n) {
  const filas = Object.entries(datos || {});
  const sin = filas.filter(([k]) => k === 'Sin dato');
  const con = filas.filter(([k]) => k !== 'Sin dato').sort((a, b) => b[1] - a[1]);
  if (con.length <= n) return datos || {};
  const resto = con.slice(n).reduce((s, [, v]) => s + v, 0);
  return Object.fromEntries([...con.slice(0, n), [`Otras (${con.length - n})`, resto], ...sin]);
}

function cancelable(b) {
  return b.estado !== 'cancelado' && !b.asistio_en;
}

/** «2026-10-18 09:52», en hora de Ensenada: se ordena bien en una hoja de cálculo. */
function fechaCSV(iso) {
  if (!iso) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Tijuana', hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

function celda(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Inicio de la actividad como instante, en hora de Ensenada. */
function inicioActividad(fecha, horaInicio) {
  const [a, m, d] = String(fecha).split('-').map(Number);
  const [h, mi] = String(horaInicio || '00:00').split(':').map(Number);
  // Aproximación suficiente para un texto: el desfase real lo aplica la base.
  const utc = Date.UTC(a, m - 1, d, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Tijuana', hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(utc)).map(x => [x.type, x.value]));
  const desfase = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - utc;
  return new Date(utc - desfase).toISOString();
}

/**
 * Lista de barras horizontales: una sola serie, un solo tono, el número
 * escrito al lado. No necesita leyenda ni depende del color para leerse.
 */
function barras(titulo, datos, unidad) {
  const filas = Object.entries(datos || {}).sort((a, b) =>
    (a[0] === 'Sin dato') - (b[0] === 'Sin dato') || b[1] - a[1]);
  if (!filas.length) return '';
  const max = Math.max(...filas.map(f => f[1]));
  const total = filas.reduce((s, f) => s + f[1], 0);
  return `
    <figure class="bol-graf">
      <figcaption>${escapar(titulo)} <small>· ${total} ${unidad}</small></figcaption>
      <ul>
        ${filas.map(([k, v]) => `
        <li${k === 'Sin dato' ? ' class="bol-graf__sin"' : ''} title="${escapar(k)}: ${v} ${unidad} (${Math.round(100 * v / total)} %)">
          <span class="bol-graf__et">${escapar(k)}</span>
          <span class="bol-graf__barra"><i style="width:${Math.max(2, Math.round(100 * v / max))}%"></i></span>
          <span class="bol-graf__num">${v}<small>${Math.round(100 * v / total)} %</small></span>
        </li>`).join('')}
      </ul>
    </figure>`;
}

function porDia(dias) {
  if (!dias || !dias.length) return '';
  const datos = Object.fromEntries(dias.map(d => [fechaDia(d.dia), d.lugares]));
  // Orden cronológico: aquí importa el cuándo, no el cuánto.
  const max = Math.max(...dias.map(d => d.lugares));
  const total = dias.reduce((s, d) => s + d.lugares, 0);
  return `
    <figure class="bol-graf">
      <figcaption>Cuándo se pidieron <small>· ${total} lugares</small></figcaption>
      <ul>
        ${Object.entries(datos).map(([k, v]) => `
        <li title="${escapar(k)}: ${v} lugares">
          <span class="bol-graf__et">${escapar(k)}</span>
          <span class="bol-graf__barra"><i style="width:${Math.max(2, Math.round(100 * v / max))}%"></i></span>
          <span class="bol-graf__num">${v}</span>
        </li>`).join('')}
      </ul>
    </figure>`;
}
