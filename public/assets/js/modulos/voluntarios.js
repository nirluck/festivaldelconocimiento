/* ============================================================================
   MÓDULO · VOLUNTARIOS
   ----------------------------------------------------------------------------
   Lo que el coordinador y la administración hacen con el voluntariado de una
   actividad:

     · Puestos      darlos de alta: qué se hace, cuándo (horario propio, que
                    suele empezar antes y terminar después que la actividad),
                    dónde dentro de la sede, cuántas vacantes, qué llevar
     · Personas     quién se inscribió en cada puesto, con su contacto,
                    institución y responsable de servicio social
     · Asignar      dar de alta a alguien a mano (se apuntó por WhatsApp)
     · Mover/quitar pasar a alguien a otro puesto, o liberar su lugar
     · Asistencia   «cumplió» o «no llegó», y cuántas horas: las instituciones
                    las piden para acreditar el servicio social
     · Difundir     la liga de cada puesto, para mandarla directo

   Las reglas las pone la base (sql/19-voluntariado.sql): cada función vuelve
   a preguntar puede_editar_actividad(). Aquí solo se pinta.

   Decisiones del equipo (4 de octubre de 2026): la inscripción es inmediata,
   solo mayores de 18, una persona no puede tomar dos turnos que se empalmen.
   ========================================================================== */

import { db, explicar, escapar, fechaDia, hora } from '/assets/js/app.js';
import { CATEGORIAS, categoria, estiloCategoria, horario, duracion } from '/assets/js/voluntariado/util.js';

const $ = (s, r) => (r || document).querySelector(s);

/* Títulos frecuentes por categoría: sugerencias, no una lista cerrada. Así
   «Validar boletos en la puerta» se escribe igual en todas las actividades y
   el reporte de «qué se pide más» sale limpio. */
const SUGERENCIAS = {
  acceso:   ['Validar boletos en la puerta', 'Control de acceso', 'Fila y orden de entrada'],
  montaje:  ['Montaje del espacio', 'Desmontaje', 'Acomodo de sillas y mesas'],
  atencion: ['Acomodar al público', 'Informes y orientación', 'Guía de recorrido'],
  apoyo:    ['Apoyo en el taller', 'Atención a ponentes', 'Apoyo técnico (audio y proyección)'],
  registro: ['Fotografía', 'Registro de asistencia', 'Encuesta de salida'],
  difusion: ['Redes sociales en vivo', 'Volanteo e invitación'],
  otro:     [],
};

/* Las respuestas «no» de la base, dichas para el coordinador. */
function mensaje(r) {
  switch (r && r.error) {
    case 'permiso':         return 'Tu cuenta no puede cambiar el voluntariado de esta actividad.';
    case 'lleno':           return 'Ese puesto ya está lleno.';
    case 'ya_inscrito':     return 'Esa persona ya está en ese puesto.';
    case 'tiene_inscritos': return `No se puede eliminar: hay ${r.cuantos} ${r.cuantos === 1 ? 'persona inscrita' : 'personas inscritas'}. Quítalas o muévelas a otro puesto, u oculta el puesto del directorio.`;
    case 'cancelada':       return 'Esa inscripción ya estaba cancelada.';
    case 'mayor_edad':      return 'Confirma que la persona tiene 18 años o más.';
    case 'empalme': {
      const c = r.choque || {};
      return `Esa persona ya tiene otro turno a esa hora: «${c.puesto}» en «${c.actividad}», ${fechaDia(c.fecha)} de ${c.hora_inicio} a ${c.hora_fin}. No puede estar en dos lugares.`;
    }
    case 'datos': {
      const CAMPO = { nombre: 'el nombre', correo: 'el correo', telefono: 'el teléfono (10 dígitos)',
                      institucion: 'la institución', carrera: 'la carrera', responsable: 'el responsable',
                      horas: 'las horas', asistencia: 'la asistencia' };
      return `Revisa ${CAMPO[r.campo] || 'los datos'}.`;
    }
    default:                return 'Algo salió mal. Vuelve a intentarlo.';
  }
}

/* WhatsApp necesita el número con país. Diez dígitos = México. */
function whatsapp(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return 'https://wa.me/' + (d.length === 10 ? '52' + d : d);
}

/** «HH:MM» ± minutos, sin salirse del día. */
function moverHora(hhmm, min) {
  const [h, m] = String(hhmm || '').slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  const t = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + min));
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

export default {
  id: 'voluntarios',
  nombre: 'Voluntarios',
  aplica: () => true,

  async montar(contenedor, actividad, perfil) {
    const m = new Modulo(contenedor, actividad, perfil);
    await m.cargar();
  },
};

class Modulo {
  constructor(caja, actividad, perfil) {
    this.caja = caja;
    this.a = actividad;
    this.perfil = perfil;
    this.puestos = [];
    this.gente = [];
    this.inst = [];
  }

  /* ================================================================ datos */
  async cargar() {
    const [p, g, i] = await Promise.all([
      db.from('puestos').select('*').eq('actividad_id', this.a.id)
        .order('fecha', { ascending: true, nullsFirst: true })
        .order('hora_inicio').order('orden').order('titulo'),
      db.rpc('voluntarios_de_actividad', { p_actividad: this.a.id }),
      db.from('instituciones').select('id, clave, nombre').eq('activa', true).order('orden').order('nombre'),
    ]);
    // Supabase no lanza: hay que mirar .error (trampa 9).
    const fallo = [p, g, i].find(r => r.error);
    if (fallo) {
      this.caja.innerHTML = `<div class="aviso aviso--mal">${escapar(explicar(fallo.error))}</div>`;
      return;
    }
    if (g.data && g.data.ok === false) {
      this.caja.innerHTML = `<div class="aviso aviso--mal">${escapar(mensaje(g.data))}</div>`;
      return;
    }
    this.puestos = p.data || [];
    this.gente = (g.data && g.data.inscripciones) || [];
    this.inst = i.data || [];
    this.pintar();
  }

  diaDe(pu) { return pu.fecha || this.a.fecha; }
  inscritos(pu) { return this.gente.filter(x => x.puesto_id === pu.id && x.estado === 'inscrito'); }
  cancelados(pu) { return this.gente.filter(x => x.puesto_id === pu.id && x.estado === 'cancelado'); }

  /* =============================================================== pintar */
  pintar() {
    const a = this.a;
    const vacantes = this.puestos.reduce((s, p) => s + p.vacantes, 0);
    const ocupadas = this.gente.filter(x => x.estado === 'inscrito').length;
    const cumplieron = this.gente.filter(x => x.estado === 'inscrito' && x.asistencia === 'cumplio').length;
    const pct = vacantes ? Math.min(100, Math.round(ocupadas / vacantes * 100)) : 0;
    const enDirectorio = this.puestos.some(p => p.en_directorio);

    this.caja.innerHTML = `
    <div class="vol">
      <div class="aviso" id="vol-aviso" role="status" hidden></div>

      <section class="tarjeta">
        <h2>Voluntariado de esta actividad</h2>
        <p class="leyenda">Da de alta los puestos que necesitas: estudiantes de las instituciones
          invitadas se inscriben desde el directorio público, y aquí ves quién viene, cómo
          localizarle y, al terminar, quién cumplió.</p>

        ${this.puestos.length ? `
        <div class="bol-cifras">
          <div class="bol-cifra bol-cifra--grande"><b>${ocupadas}<small> / ${vacantes}</small></b><span>lugares ocupados</span></div>
          <div class="bol-cifra"><b>${this.puestos.length}</b><span>${this.puestos.length === 1 ? 'puesto' : 'puestos'}</span></div>
          <div class="bol-cifra"><b>${vacantes - Math.min(vacantes, ocupadas)}</b><span>por cubrir</span></div>
          <div class="bol-cifra"><b>${cumplieron}</b><span>cumplieron</span></div>
        </div>
        <div class="bol-barra"><i style="width:${pct}%"></i></div>` : ''}

        ${!a.publica && enDirectorio ? `
        <p class="bol-nota bol-nota--aviso">La actividad todavía no está en el programa, así que sus puestos
          aún no aparecen en el directorio público. Mientras, puedes asignar gente a mano.</p>` : ''}

        <div class="vol-barra">
          <button type="button" class="btn btn--principal btn--chico" data-accion="nuevo">+ Nuevo puesto</button>
          ${ocupadas ? `
          <button type="button" class="btn btn--linea btn--chico" data-accion="correos">Copiar correos</button>
          <button type="button" class="btn btn--linea btn--chico" data-accion="csv">Descargar lista (CSV)</button>` : ''}
          <a class="bol-mini" href="/voluntariado/" target="_blank" rel="noopener">Ver el directorio público ↗</a>
        </div>
      </section>

      ${this.puestos.length ? this.puestos.map(p => this.htmlPuesto(p)).join('') : `
      <section class="tarjeta vol-vacio">
        <h3>Todavía no hay puestos</h3>
        <p>Por ejemplo: «4 personas para validar boletos en la puerta, de 18:00 a 21:30».
           Cada puesto tiene su propio horario y sus vacantes.</p>
        <button type="button" class="btn btn--principal" data-accion="nuevo">Crear el primer puesto</button>
      </section>`}

      <dialog class="vol-dlg" id="vol-dlg"><div class="vol-dlg__in" id="vol-dlg-in"></div></dialog>
    </div>`;

    // Los escuchadores van en «.vol», que se crea de nuevo en cada dibujo, y NO
    // en el contenedor: el panel lo reutiliza al cambiar de pestaña, y colgarlos
    // ahí los acumularía (un clic dispararía dos veces al volver a esta pestaña).
    this.conectar($('.vol', this.caja));
  }

  htmlPuesto(p) {
    const cat = categoria(p.categoria);
    const ins = this.inscritos(p);
    const canc = this.cancelados(p);
    const dia = this.diaDe(p);
    const otroDia = p.fecha && p.fecha !== this.a.fecha;
    const lleno = ins.length >= p.vacantes;
    const sinMarcar = ins.filter(x => !x.asistencia).length;

    return `
    <section class="tarjeta vol-puesto${p.en_directorio ? '' : ' vol-puesto--oculto'}" style="${estiloCategoria(p.categoria)}" data-puesto="${p.id}">
      <div class="vol-puesto__cab">
        <div class="vol-puesto__txt">
          <p class="vol-puesto__cat"><i></i>${escapar(cat.nombre)}
            ${p.en_directorio ? '' : '<span class="chip chip--gris">Oculto del directorio</span>'}</p>
          <h3>${escapar(p.titulo)}</h3>
          <p class="vol-puesto__cuando">
            <b>${escapar(horario(p))}</b> · ${escapar(duracion(p))}
            ${dia ? ` · ${escapar(fechaDia(dia))}` : ''}
            ${otroDia ? '<span class="chip chip--azul">Otro día que la actividad</span>' : ''}
          </p>
        </div>
        <div class="vol-puesto__cupo${lleno ? ' is-lleno' : ''}">
          <span class="vol-asientos" aria-hidden="true">${Array.from({ length: Math.min(p.vacantes, 24) },
            (_, i) => `<i class="${i < ins.length ? 'is-ocupado' : ''}"></i>`).join('')}</span>
          <b>${ins.length} de ${p.vacantes}</b>
          ${ins.length > p.vacantes ? `<small>+${ins.length - p.vacantes} sobre el cupo</small>` : ''}
        </div>
      </div>

      ${p.descripcion || p.punto_encuentro || p.requisitos || p.contacto_dia ? `
      <dl class="vol-puesto__datos">
        ${p.descripcion ? `<div><dt>Qué se hace</dt><dd>${escapar(p.descripcion)}</dd></div>` : ''}
        ${p.punto_encuentro ? `<div><dt>Punto de encuentro</dt><dd>${escapar(p.punto_encuentro)}</dd></div>` : ''}
        ${p.requisitos ? `<div><dt>Qué llevar</dt><dd>${escapar(p.requisitos)}</dd></div>` : ''}
        ${p.contacto_dia ? `<div><dt>Contacto ese día</dt><dd>${escapar(p.contacto_dia)} <small>(solo lo ven las personas inscritas)</small></dd></div>` : ''}
      </dl>` : ''}

      <div class="vol-puesto__acc">
        <button type="button" class="btn btn--linea btn--chico" data-accion="asignar" data-id="${p.id}">+ Asignar a alguien</button>
        <button type="button" class="bol-mini" data-accion="editar" data-id="${p.id}">Editar</button>
        <button type="button" class="bol-mini" data-accion="liga" data-id="${p.id}">Copiar liga para inscribirse</button>
        <button type="button" class="bol-mini" data-accion="directorio" data-id="${p.id}">${p.en_directorio ? 'Ocultar del directorio' : 'Mostrar en el directorio'}</button>
        <button type="button" class="bol-mini bol-mini--peligro" data-accion="eliminar" data-id="${p.id}">Eliminar</button>
      </div>

      ${ins.length ? `
      <div class="tabla-caja vol-gente">
        <table>
          <thead><tr><th>Persona</th><th>Contacto</th><th>Institución</th><th>Asistencia</th><th></th></tr></thead>
          <tbody>${ins.map(x => this.htmlPersona(x, p)).join('')}</tbody>
        </table>
      </div>
      ${sinMarcar > 1 ? `<p class="vol-masa"><button type="button" class="bol-mini" data-accion="todos" data-id="${p.id}">Marcar a las ${sinMarcar} personas sin marcar como «cumplió»</button></p>` : ''}`
      : `<p class="vol-nadie">Nadie se ha inscrito todavía.</p>`}

      ${canc.length ? `
      <details class="vol-historial">
        <summary>${canc.length} ${canc.length === 1 ? 'cancelación' : 'cancelaciones'}</summary>
        <ul>${canc.map(x => `<li><b>${escapar(x.voluntario.nombre)}</b> · ${escapar(x.voluntario.correo)}
          · ${x.cancelado_por === 'coordinacion' ? 'retirada por la coordinación' : 'canceló'}
          ${x.cancelado_en ? ' el ' + escapar(fechaDia(String(x.cancelado_en).slice(0, 10))) : ''}</li>`).join('')}</ul>
      </details>` : ''}
    </section>`;
  }

  htmlPersona(x, p) {
    const v = x.voluntario;
    const wa = whatsapp(v.telefono);
    const otros = this.puestos.filter(o => o.id !== p.id);
    return `
      <tr data-insc="${x.id}">
        <td><strong>${escapar(v.nombre)}</strong>
          <span class="vol-sub">${escapar(v.carrera || '')}${v.matricula ? ' · matrícula ' + escapar(v.matricula) : ''}</span>
          ${x.origen === 'panel' ? '<span class="chip chip--gris">asignada a mano</span>' : ''}</td>
        <td><a href="mailto:${escapar(v.correo)}">${escapar(v.correo)}</a>
          <span class="vol-sub"><a href="tel:${escapar(v.telefono)}">${escapar(v.telefono)}</a>
          ${wa ? ` · <a href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</span></td>
        <td>${escapar(v.institucion || '—')}
          <span class="vol-sub">Resp.: ${escapar(v.responsable || '—')}${v.responsable_contacto ? ' · ' + escapar(v.responsable_contacto) : ''}</span></td>
        <td class="vol-asist">
          <div class="vol-seg" role="group" aria-label="Asistencia de ${escapar(v.nombre)}">
            <button type="button" data-accion="cumplio" data-id="${x.id}" aria-pressed="${x.asistencia === 'cumplio'}">Cumplió</button>
            <button type="button" data-accion="falto" data-id="${x.id}" aria-pressed="${x.asistencia === 'falto'}">No llegó</button>
          </div>
          ${x.asistencia === 'cumplio' ? `
          <label class="vol-horas">Horas
            <input type="number" min="0" max="24" step="0.5" value="${Number(x.horas ?? 0)}" data-horas="${x.id}">
          </label>` : ''}
        </td>
        <td class="vol-acc">
          ${otros.length ? `
          <select class="vol-mover" data-mover="${x.id}" aria-label="Mover a ${escapar(v.nombre)} a otro puesto">
            <option value="">Mover a…</option>
            ${otros.map(o => `<option value="${o.id}">${escapar(o.titulo)} · ${escapar(horario(o))}</option>`).join('')}
          </select>` : ''}
          <button type="button" class="bol-mini bol-mini--peligro" data-accion="quitar" data-id="${x.id}">Quitar</button>
        </td>
      </tr>`;
  }

  /* ============================================================= eventos */
  conectar(raiz) {
    raiz.addEventListener('click', (e) => {
      const b = e.target.closest('[data-accion]');
      if (!b || b.disabled) return;
      const id = b.dataset.id;
      const acc = b.dataset.accion;
      if (acc === 'nuevo')      return this.formPuesto(null);
      if (acc === 'editar')     return this.formPuesto(this.puestos.find(p => p.id === id));
      if (acc === 'asignar')    return this.formAsignar(this.puestos.find(p => p.id === id));
      if (acc === 'liga')       return this.copiarLiga(id, b);
      if (acc === 'directorio') return this.alternarDirectorio(id);
      if (acc === 'eliminar')   return this.eliminar(id);
      if (acc === 'quitar')     return this.quitar(id);
      if (acc === 'cumplio' || acc === 'falto') return this.asistencia(id, acc, b);
      if (acc === 'todos')      return this.todosCumplieron(id, b);
      if (acc === 'correos')    return this.copiarCorreos(b);
      if (acc === 'csv')        return this.csv();
      if (acc === 'cerrar-dlg') return $('#vol-dlg', this.caja).close();
    });

    raiz.addEventListener('change', (e) => {
      const mov = e.target.closest('[data-mover]');
      if (mov && mov.value) return this.mover(mov.dataset.mover, mov.value, mov);
      const h = e.target.closest('[data-horas]');
      if (h) return this.horas(h.dataset.horas, h);
    });
  }

  avisar(tipo, texto) {
    const c = $('#vol-aviso', this.caja);
    if (!c) return;
    c.className = 'aviso aviso--' + tipo;
    c.textContent = texto;
    c.hidden = false;
    c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** Llama una función de la base y avisa si dijo que no. Devuelve el resultado o null. */
  async llamar(fn, args) {
    const { data, error } = await db.rpc(fn, args);
    if (error) { this.avisar('mal', explicar(error)); return null; }
    if (data && data.ok === false) return data;
    return data || { ok: true };
  }

  /* ============================================================ puestos */
  formPuesto(p) {
    const a = this.a;
    const nuevo = !p;
    const cat = p ? p.categoria : (a.acceso === 'boleto' ? 'acceso' : 'apoyo');
    // Por omisión, media hora antes y media hora después de la actividad.
    const hi = p ? hora(p.hora_inicio) : (moverHora(a.hora_inicio, -30) || '09:00');
    const hf = p ? hora(p.hora_fin) : (moverHora(a.hora_fin || moverHora(a.hora_inicio, 120), 30) || '11:00');
    const contacto = p ? (p.contacto_dia || '')
      : [a.responsable, a.telefono].filter(Boolean).join(' · ');

    const dlg = $('#vol-dlg', this.caja);
    $('#vol-dlg-in', this.caja).innerHTML = `
      <form class="vol-form" novalidate>
        <div class="vol-dlg__cab">
          <h3>${nuevo ? 'Nuevo puesto' : 'Editar puesto'}</h3>
          <button type="button" class="vol-dlg__cerrar" data-accion="cerrar-dlg" aria-label="Cerrar">×</button>
        </div>

        <div class="campos campos--2">
          <div class="campo">
            <label for="vp-cat">Tipo de apoyo</label>
            <select id="vp-cat" name="categoria">
              ${Object.entries(CATEGORIAS).map(([k, c]) => `<option value="${k}"${k === cat ? ' selected' : ''}>${escapar(c.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="campo">
            <label for="vp-vac">Vacantes</label>
            <input type="number" id="vp-vac" name="vacantes" min="1" max="200" value="${p ? p.vacantes : 2}" required>
            <span class="pista">Cuántas personas en este mismo puesto.</span>
          </div>
          <div class="campo completo">
            <label for="vp-tit">Nombre del puesto</label>
            <input type="text" id="vp-tit" name="titulo" maxlength="90" list="vp-sug" required value="${escapar(p ? p.titulo : '')}"
                   placeholder="Por ejemplo: Validar boletos en la puerta">
            <datalist id="vp-sug"></datalist>
          </div>
          <div class="campo completo">
            <label for="vp-desc">Qué se hace en este puesto</label>
            <textarea id="vp-desc" name="descripcion" rows="3" maxlength="1500"
              placeholder="Lo que la persona va a hacer, en dos o tres frases.">${escapar(p ? p.descripcion || '' : '')}</textarea>
          </div>
          <div class="campo">
            <label for="vp-hi">Empieza</label>
            <input type="time" id="vp-hi" name="hora_inicio" value="${escapar(hi)}" required>
          </div>
          <div class="campo">
            <label for="vp-hf">Termina</label>
            <input type="time" id="vp-hf" name="hora_fin" value="${escapar(hf)}" required>
          </div>
          <div class="campo completo">
            <span class="pista">La actividad es ${a.fecha ? 'el ' + escapar(fechaDia(a.fecha, true)) : 'sin fecha todavía'}${a.hora_inicio ? ', de ' + escapar(hora(a.hora_inicio)) + (a.hora_fin ? ' a ' + escapar(hora(a.hora_fin)) : '') : ''}.
              El turno puede empezar antes y terminar después.</span>
            <label class="check vol-otrodia"><input type="checkbox" name="otro_dia"${p && p.fecha ? ' checked' : ''}> Este turno es otro día (por ejemplo, montaje la víspera)</label>
            <input type="date" name="fecha" value="${escapar(p && p.fecha ? p.fecha : (a.fecha || ''))}" ${p && p.fecha ? '' : 'hidden'}>
          </div>
          <div class="campo">
            <label for="vp-pe">Punto de encuentro <span class="pista">opcional</span></label>
            <input type="text" id="vp-pe" name="punto_encuentro" maxlength="200" value="${escapar(p ? p.punto_encuentro || '' : '')}"
                   placeholder="Taquilla del teatro">
            <span class="pista">La sede es la de la actividad: ${escapar(a.sede || 'sin sede todavía')}.</span>
          </div>
          <div class="campo">
            <label for="vp-req">Qué llevar o saber <span class="pista">opcional</span></label>
            <input type="text" id="vp-req" name="requisitos" maxlength="600" value="${escapar(p ? p.requisitos || '' : '')}"
                   placeholder="Ropa negra, teléfono con batería">
          </div>
          <div class="campo completo">
            <label for="vp-con">Por quién preguntar ese día</label>
            <input type="text" id="vp-con" name="contacto_dia" maxlength="300" value="${escapar(contacto)}"
                   placeholder="Nombre y teléfono">
            <span class="pista">Solo lo ven las personas inscritas, en su comprobante.</span>
          </div>
          <div class="campo completo">
            <label class="check"><input type="checkbox" name="en_directorio"${!p || p.en_directorio ? ' checked' : ''}>
              Ofrecer este puesto en el directorio público de voluntariado</label>
          </div>
        </div>

        <p class="aviso aviso--mal" data-error hidden></p>
        <div class="acciones">
          <button type="submit" class="btn btn--principal">${nuevo ? 'Crear puesto' : 'Guardar cambios'}</button>
          <button type="button" class="btn btn--linea btn--chico" data-accion="cerrar-dlg">Cancelar</button>
        </div>
      </form>`;

    const form = $('form', dlg);
    const sug = () => {
      $('#vp-sug', dlg).innerHTML = (SUGERENCIAS[form.categoria.value] || [])
        .map(s => `<option value="${escapar(s)}">`).join('');
    };
    sug();
    form.categoria.addEventListener('change', sug);
    form.otro_dia.addEventListener('change', () => { form.fecha.hidden = !form.otro_dia.checked; });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('[data-error]', form);
      const fallar = (t, campo) => { err.textContent = t; err.hidden = false; if (campo) form[campo].focus(); };
      const datos = {
        categoria: form.categoria.value,
        titulo: form.titulo.value.trim(),
        descripcion: form.descripcion.value.trim() || null,
        hora_inicio: form.hora_inicio.value,
        hora_fin: form.hora_fin.value,
        vacantes: parseInt(form.vacantes.value, 10),
        punto_encuentro: form.punto_encuentro.value.trim() || null,
        requisitos: form.requisitos.value.trim() || null,
        contacto_dia: form.contacto_dia.value.trim() || null,
        en_directorio: form.en_directorio.checked,
        // Nulo = el día de la actividad, y lo sigue si la actividad cambia de día.
        fecha: form.otro_dia.checked && form.fecha.value && form.fecha.value !== a.fecha ? form.fecha.value : null,
      };
      if (datos.titulo.length < 3) return fallar('Ponle nombre al puesto.', 'titulo');
      if (!datos.hora_inicio || !datos.hora_fin) return fallar('Indica a qué hora empieza y termina el turno.', 'hora_inicio');
      if (datos.hora_fin <= datos.hora_inicio) return fallar('El turno tiene que terminar después de empezar.', 'hora_fin');
      if (!(datos.vacantes >= 1 && datos.vacantes <= 200)) return fallar('Las vacantes van de 1 a 200.', 'vacantes');
      if (p && datos.vacantes < this.inscritos(p).length) {
        if (!confirm(`Ya hay ${this.inscritos(p).length} personas inscritas y pones ${datos.vacantes} vacantes.\n\nNadie pierde su lugar, pero el puesto quedará sobre el cupo. ¿Continuar?`)) return;
      }

      const btn = $('[type=submit]', form);
      btn.disabled = true;
      const q = nuevo
        ? db.from('puestos').insert({ ...datos, actividad_id: a.id })
        : db.from('puestos').update(datos).eq('id', p.id);
      const { error } = await q;
      btn.disabled = false;
      if (error) return fallar(explicar(error));
      dlg.close();
      await this.cargar();
      this.avisar('ok', nuevo ? `Puesto «${datos.titulo}» creado.` : 'Cambios guardados.');
    });

    dlg.showModal();
    form.titulo.focus();
  }

  async alternarDirectorio(id) {
    const p = this.puestos.find(x => x.id === id);
    const { error } = await db.from('puestos').update({ en_directorio: !p.en_directorio }).eq('id', id);
    if (error) return this.avisar('mal', explicar(error));
    await this.cargar();
    this.avisar('ok', p.en_directorio ? 'El puesto ya no se ofrece en el directorio. Puedes seguir asignando gente a mano.'
                                      : 'El puesto ya se ofrece en el directorio público.');
  }

  async eliminar(id) {
    const p = this.puestos.find(x => x.id === id);
    if (!confirm(`¿Eliminar el puesto «${p.titulo}»?`)) return;
    const r = await this.llamar('eliminar_puesto', { p_puesto: id });
    if (!r) return;
    if (r.ok === false) return this.avisar('mal', mensaje(r));
    await this.cargar();
    this.avisar('ok', 'Puesto eliminado.');
  }

  async copiarLiga(id, b) {
    const url = `${location.origin}/voluntariado/#p=${id}`;
    try { await navigator.clipboard.writeText(url); b.textContent = 'Liga copiada'; }
    catch (e) { prompt('Copia esta liga y compártela:', url); }
  }

  /* ============================================================ personas */
  formAsignar(p) {
    const dlg = $('#vol-dlg', this.caja);
    $('#vol-dlg-in', this.caja).innerHTML = `
      <form class="vol-form" novalidate>
        <div class="vol-dlg__cab">
          <h3>Asignar a «${escapar(p.titulo)}»</h3>
          <button type="button" class="vol-dlg__cerrar" data-accion="cerrar-dlg" aria-label="Cerrar">×</button>
        </div>
        <p class="leyenda">Para quien se apuntó contigo por otro medio. Si su correo ya está en el
          voluntariado, se usa a esa persona y se respetan sus otros turnos.</p>
        <div class="campos campos--2">
          <div class="campo completo"><label for="va-nom">Nombre completo</label>
            <input type="text" id="va-nom" name="nombre" maxlength="120" required></div>
          <div class="campo"><label for="va-cor">Correo</label>
            <input type="email" id="va-cor" name="correo" maxlength="160" required></div>
          <div class="campo"><label for="va-tel">Teléfono / WhatsApp</label>
            <input type="tel" id="va-tel" name="telefono" maxlength="20" required></div>
          <div class="campo"><label for="va-ins">Institución</label>
            <select id="va-ins" name="institucion">
              <option value="">Elige…</option>
              ${this.inst.map(i => `<option value="${i.id}">${escapar(i.nombre)}</option>`).join('')}
              <option value="__otra">Otra institución…</option>
            </select></div>
          <div class="campo" data-otra hidden><label for="va-otra">¿Cuál?</label>
            <input type="text" id="va-otra" name="institucion_otra" maxlength="160"></div>
          <div class="campo"><label for="va-car">Carrera o programa</label>
            <input type="text" id="va-car" name="carrera" maxlength="120" required></div>
          <div class="campo"><label for="va-mat">Matrícula <span class="pista">opcional</span></label>
            <input type="text" id="va-mat" name="matricula" maxlength="40"></div>
          <div class="campo"><label for="va-res">Responsable de su servicio social</label>
            <input type="text" id="va-res" name="responsable" maxlength="120" required></div>
          <div class="campo"><label for="va-rc">Contacto del responsable <span class="pista">opcional</span></label>
            <input type="text" id="va-rc" name="responsable_contacto" maxlength="160"></div>
          <div class="campo completo"><label class="check"><input type="checkbox" name="mayor"> La persona tiene 18 años o más
            y está de acuerdo con que registremos sus datos para el voluntariado.</label></div>
        </div>
        <p class="aviso aviso--mal" data-error hidden></p>
        <div class="acciones">
          <button type="submit" class="btn btn--principal">Asignar</button>
          <button type="button" class="btn btn--linea btn--chico" data-accion="cerrar-dlg">Cancelar</button>
        </div>
      </form>`;

    const form = $('form', dlg);
    form.institucion.addEventListener('change', () => {
      $('[data-otra]', form).hidden = form.institucion.value !== '__otra';
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('[data-error]', form);
      const otra = form.institucion.value === '__otra';
      const args = {
        p_puesto: p.id,
        p_nombre: form.nombre.value.trim(),
        p_correo: form.correo.value.trim().toLowerCase(),
        p_telefono: form.telefono.value.trim(),
        p_institucion: otra ? null : (form.institucion.value || null),
        p_institucion_otra: otra ? form.institucion_otra.value.trim() : null,
        p_carrera: form.carrera.value.trim(),
        p_matricula: form.matricula.value.trim() || null,
        p_responsable: form.responsable.value.trim(),
        p_responsable_contacto: form.responsable_contacto.value.trim() || null,
        p_mayor: form.mayor.checked,
        p_sobrecupo: false,
      };
      if (!form.institucion.value) { err.textContent = 'Elige la institución.'; err.hidden = false; return; }
      const btn = $('[type=submit]', form);
      btn.disabled = true;
      let r = await this.llamar('asignar_voluntario', args);
      // Lleno: se pregunta antes de pasarse del cupo.
      if (r && r.error === 'lleno' &&
          confirm(`«${p.titulo}» ya tiene sus ${p.vacantes} vacantes cubiertas.\n\n¿Asignar de todos modos, por encima del cupo?`)) {
        r = await this.llamar('asignar_voluntario', { ...args, p_sobrecupo: true });
      }
      btn.disabled = false;
      if (!r) return;
      if (r.ok === false) { err.textContent = mensaje(r); err.hidden = false; return; }
      dlg.close();
      await this.cargar();
      this.avisar('ok', `${args.p_nombre} quedó en «${p.titulo}».`);
    });

    dlg.showModal();
    form.nombre.focus();
  }

  async quitar(id) {
    const x = this.gente.find(g => g.id === id);
    if (!confirm(`¿Quitar a ${x.voluntario.nombre} de este puesto?\n\nSu lugar queda libre. No podrá volver a inscribirse sola a este mismo puesto.`)) return;
    const r = await this.llamar('quitar_voluntario', { p_inscripcion: id });
    if (!r) return;
    if (r.ok === false) return this.avisar('mal', mensaje(r));
    await this.cargar();
    this.avisar('ok', `${x.voluntario.nombre} ya no está en el puesto. Avísale por correo o WhatsApp.`);
  }

  async mover(id, destino, sel) {
    const x = this.gente.find(g => g.id === id);
    const d = this.puestos.find(p => p.id === destino);
    sel.disabled = true;
    let r = await this.llamar('mover_voluntario', { p_inscripcion: id, p_puesto: destino, p_sobrecupo: false });
    if (r && r.error === 'lleno' && confirm(`«${d.titulo}» está lleno. ¿Moverla de todos modos, por encima del cupo?`)) {
      r = await this.llamar('mover_voluntario', { p_inscripcion: id, p_puesto: destino, p_sobrecupo: true });
    }
    sel.disabled = false;
    if (!r) return;
    if (r.ok === false) { sel.value = ''; return this.avisar('mal', mensaje(r)); }
    await this.cargar();
    this.avisar('ok', `${x.voluntario.nombre} pasó a «${d.titulo}». Avísale del cambio de horario.`);
  }

  /* ========================================================== asistencia */
  async asistencia(id, valor, b) {
    const x = this.gente.find(g => g.id === id);
    // Tocar el botón ya marcado lo desmarca: por si se marcó a la persona equivocada.
    const nuevo = x.asistencia === valor ? null : valor;
    b.disabled = true;
    const r = await this.llamar('marcar_asistencia', { p_inscripcion: id, p_asistencia: nuevo, p_horas: null, p_nota: null });
    b.disabled = false;
    if (!r) return;
    if (r.ok === false) return this.avisar('mal', mensaje(r));
    await this.cargar();
  }

  async horas(id, input) {
    const h = Number(input.value);
    if (!(h >= 0 && h <= 24)) { input.setAttribute('aria-invalid', 'true'); return; }
    input.removeAttribute('aria-invalid');
    const r = await this.llamar('marcar_asistencia', { p_inscripcion: id, p_asistencia: 'cumplio', p_horas: h, p_nota: null });
    if (r && r.ok === false) this.avisar('mal', mensaje(r));
  }

  async todosCumplieron(puestoId, b) {
    const p = this.puestos.find(x => x.id === puestoId);
    const pendientes = this.inscritos(p).filter(x => !x.asistencia);
    if (!confirm(`¿Marcar a las ${pendientes.length} personas sin marcar de «${p.titulo}» como «cumplió», con ${duracion(p)} cada una?`)) return;
    b.disabled = true;
    for (const x of pendientes) {
      await this.llamar('marcar_asistencia', { p_inscripcion: x.id, p_asistencia: 'cumplio', p_horas: null, p_nota: null });
    }
    await this.cargar();
    this.avisar('ok', 'Asistencia marcada.');
  }

  /* ========================================================= exportar */
  async copiarCorreos(b) {
    const correos = [...new Set(this.gente.filter(x => x.estado === 'inscrito').map(x => x.voluntario.correo))];
    const texto = correos.join(', ');
    try { await navigator.clipboard.writeText(texto); b.textContent = `${correos.length} correos copiados`; }
    catch (e) { prompt('Copia los correos:', texto); }
  }

  csv() {
    const cols = ['Puesto', 'Tipo de apoyo', 'Fecha', 'Inicio', 'Fin', 'Nombre', 'Correo', 'Teléfono',
                  'Institución', 'Carrera', 'Matrícula', 'Responsable', 'Contacto del responsable',
                  'Estado', 'Asistencia', 'Horas', 'Origen'];
    const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const filas = [cols.map(esc).join(',')];
    this.puestos.forEach(p => {
      this.gente.filter(x => x.puesto_id === p.id).forEach(x => {
        const v = x.voluntario;
        filas.push([p.titulo, categoria(p.categoria).nombre, this.diaDe(p), hora(p.hora_inicio), hora(p.hora_fin),
          v.nombre, v.correo, v.telefono, v.institucion, v.carrera, v.matricula, v.responsable, v.responsable_contacto,
          x.estado === 'inscrito' ? 'Inscrita' : 'Cancelada',
          x.asistencia === 'cumplio' ? 'Cumplió' : x.asistencia === 'falto' ? 'No llegó' : '',
          x.horas ?? '', x.origen === 'panel' ? 'Asignada a mano' : 'Directorio'].map(esc).join(','));
      });
    });
    // BOM para que Excel abra bien los acentos.
    const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `voluntarios-${this.a.slug || 'actividad'}.csv`;
    document.body.appendChild(enlace); enlace.click(); enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}
