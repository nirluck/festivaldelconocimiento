/* ============================================================================
   BOLETOS · LA TARJETA
   ----------------------------------------------------------------------------
   El boleto como se ve en pantalla, y lo que la persona puede hacer con él:
   guardarlo como imagen, llevarlo al calendario, compartirlo y cancelarlo.

   Lo usan el formulario (al terminar), /boleto/ y /mis-boletos/.

   El dato «b» es lo que devuelven solicitar_boleto() y ver_boleto(), más el
   token: { token, codigo, estado, lugares, nombre, asistio_en, turno,
            actividad: { titulo, slug, fecha, hora_inicio, hora_fin, sede, … } }
   ========================================================================== */

import { qrSVG, crearQR, dibujarQR } from '../qr.js';
import { estiloEje } from '../color.js';
import { colorOscuro } from '../marca.js';
import { cancelarBoleto, mensaje } from './api.js';
import { guardarBoleto } from './almacen.js';
import {
  escapar, hora, aFecha, diaLargo, rangoHoras, codigoLegible, lugaresTexto,
  urlBoleto, descargar, aLas,
} from './util.js';

const ICO = {
  imagen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v2.5h16V17"/></svg>',
  calend: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>',
  liga:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>',
  tache:  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
};

/* ================================================================ la tarjeta */

function franjaEstado(b) {
  if (b.estado === 'cancelado') {
    return `<p class="bo__franja bo__franja--mal"><b>Boleto cancelado.</b>
      Este boleto ya no es válido y su lugar quedó libre.</p>`;
  }
  if (b.asistio_en) {
    return `<p class="bo__franja bo__franja--ok"><b>Ya se usó.</b>
      Se registró tu entrada ${escapar(aLas(b.asistio_en))}. ¡Que lo disfrutes!</p>`;
  }
  if (b.estado === 'espera') {
    return `<p class="bo__franja bo__franja--espera"><b>Estás en la lista de espera${b.turno ? `, lugar ${b.turno}` : ''}.</b>
      Todavía no es un boleto confirmado. Si se liberan lugares, en la entrada
      pasan primero quienes están en esta lista: llega temprano y muestra este código.</p>`;
  }
  return '';
}

/** HTML de la tarjeta. No lleva botones; ver htmlAcciones(). */
export function htmlBoleto(b) {
  const a = b.actividad || {};
  const valido = b.estado !== 'cancelado';
  const lugarTxt = a.sede
    ? `${escapar(a.sede)}${a.sede_direccion ? `<small>${escapar(a.sede_direccion)}</small>` : ''}`
    : 'Por confirmar';

  return `
  <article class="bo${valido ? '' : ' bo--cancelado'}${b.estado === 'espera' ? ' bo--espera' : ''}"
           style="${estiloEje(a.eje_color)}" aria-label="Boleto para ${escapar(a.titulo)}">
    <header class="bo__cab">
      <p class="bo__kicker"><i></i>${b.estado === 'espera' ? 'Lista de espera' : 'Boleto gratuito'}
        ${a.eje ? `<span>· ${escapar(a.eje)}</span>` : ''}</p>
      <h2 class="bo__tit">${escapar(a.titulo)}</h2>
    </header>

    ${franjaEstado(b)}

    <div class="bo__cuerpo">
      ${valido ? `
      <div class="bo__qr">
        ${qrSVG(urlBoleto(b.token), { titulo: 'Código QR del boleto ' + codigoLegible(b.codigo) })}
      </div>` : ''}
      <p class="bo__codigo"><small>Código</small><b>${escapar(codigoLegible(b.codigo))}</b></p>

      <dl class="bo__datos">
        <div><dt>Cuándo</dt><dd>${escapar(a.fecha ? diaLargo(a.fecha) : 'Por confirmar')}
          <small>${escapar(rangoHoras(a))}</small></dd></div>
        <div><dt>Dónde</dt><dd>${lugarTxt}</dd></div>
        <div><dt>A nombre de</dt><dd>${escapar(b.nombre || '—')}</dd></div>
        <div><dt>Lugares</dt><dd>${escapar(lugaresTexto(b.lugares || 1))}</dd></div>
      </dl>
    </div>
  </article>`;
}

/** Botones de la tarjeta. Van aparte para que la imagen no los incluya. */
export function htmlAcciones(b) {
  if (b.estado === 'cancelado') {
    return `<div class="bo-acciones">
      <a class="pg-btn pg-btn--lleno" href="/b/${encodeURIComponent(b.actividad?.slug || '')}">Pedir otro boleto</a>
      <a class="pg-btn" href="/programa/">Ver el programa</a>
    </div>`;
  }
  const usado = !!b.asistio_en;
  return `
  <div class="bo-acciones">
    <button class="pg-btn pg-btn--lleno" type="button" data-bo="imagen">${ICO.imagen} Guardar imagen</button>
    ${usado ? '' : `<button class="pg-btn" type="button" data-bo="calendario">${ICO.calend} Agregar al calendario</button>`}
    <button class="pg-btn" type="button" data-bo="compartir">${ICO.liga} ${navigator.share ? 'Compartir' : 'Copiar liga'}</button>
  </div>
  ${usado ? '' : `
  <div class="bo-nota">
    <p><b>En la entrada</b> muestra este QR, o di tu código y tu nombre.
       ${b.estado === 'espera' ? '' : 'Llega unos minutos antes: a la hora de inicio los lugares sin ocupar se abren a quien espera en la fila.'}</p>
    <p><b>Quien tenga la liga de este boleto puede usarlo o cancelarlo.</b>
       Compártela solo con quien va contigo.</p>
  </div>
  <div class="bo-cancelar" data-bo-caja-cancelar>
    <button class="bo-link" type="button" data-bo="cancelar">${ICO.tache} Ya no puedo ir: cancelar y liberar ${b.lugares > 1 ? 'mis lugares' : 'mi lugar'}</button>
  </div>`}
  <p class="bo-aviso" role="status" hidden></p>`;
}

/**
 * Conecta los botones.
 * @param {HTMLElement} caja  contenedor que tiene la tarjeta y las acciones
 * @param {object} b
 * @param {{alCambiar?: (b) => void}} op  se llama cuando el boleto cambia (cancelación)
 */
export function conectarAcciones(caja, b, op = {}) {
  const avisar = (texto, tipo = 'info') => {
    const p = caja.querySelector('.bo-aviso');
    if (!p) return;
    p.textContent = texto;
    p.className = 'bo-aviso bo-aviso--' + tipo;
    p.hidden = false;
  };

  caja.querySelectorAll('[data-bo]').forEach(btn => btn.addEventListener('click', async () => {
    const que = btn.dataset.bo;
    try {
      if (que === 'imagen') {
        btn.disabled = true;
        await guardarImagen(b);
      } else if (que === 'calendario') {
        const blob = new Blob([ics(b)], { type: 'text/calendar;charset=utf-8' });
        descargar(blob, `festival-${b.codigo}.ics`);
        avisar('Se descargó el evento. Ábrelo para agregarlo a tu calendario.');
      } else if (que === 'compartir') {
        await compartir(b, avisar);
      } else if (que === 'cancelar') {
        pedirConfirmacion(caja, b, op, avisar);
      }
    } catch (e) {
      if (e?.name !== 'AbortError') avisar('No se pudo completar. ' + (e?.message || ''), 'mal');
    } finally {
      btn.disabled = false;
    }
  }));
}

/* ============================================================== cancelación */

function pedirConfirmacion(caja, b, op, avisar) {
  const hueco = caja.querySelector('[data-bo-caja-cancelar]');
  hueco.innerHTML = `
    <div class="bo-confirmar" role="group" aria-label="Confirmar cancelación">
      <p><b>¿Cancelar este boleto?</b> Tu lugar quedará libre para otra persona
         y el código dejará de servir. No se puede deshacer.</p>
      <div>
        <button class="pg-btn bo-btn-peligro" type="button" data-si>Sí, cancelar</button>
        <button class="pg-btn" type="button" data-no>No, conservarlo</button>
      </div>
    </div>`;
  const no = hueco.querySelector('[data-no]');
  const si = hueco.querySelector('[data-si]');
  // El foco va a «No»: un Enter distraído no debe cancelar nada.
  no.focus();
  no.addEventListener('click', () => {
    hueco.innerHTML = `<button class="bo-link" type="button" data-bo="cancelar">${ICO.tache} Ya no puedo ir: cancelar y liberar ${b.lugares > 1 ? 'mis lugares' : 'mi lugar'}</button>`;
    hueco.querySelector('[data-bo]').addEventListener('click', () => pedirConfirmacion(caja, b, op, avisar));
  });
  si.addEventListener('click', async () => {
    si.disabled = no.disabled = true;
    si.textContent = 'Cancelando…';
    let r;
    try {
      r = await cancelarBoleto(b.token);
    } catch (e) {
      avisar(mensaje(e), 'mal');
      si.disabled = no.disabled = false;
      si.textContent = 'Sí, cancelar';
      return;
    }
    if (!r.ok) {
      avisar(r.error === 'ya_entro'
        ? 'Este boleto ya se usó para entrar, así que no se puede cancelar.'
        : mensaje(r), 'mal');
      si.disabled = no.disabled = false;
      si.textContent = 'Sí, cancelar';
      return;
    }
    const nuevo = { ...b, estado: 'cancelado' };
    guardarBoleto(nuevo);
    if (op.alCambiar) op.alCambiar(nuevo);
  });
}

/* ================================================================ compartir */

async function compartir(b, avisar) {
  const url = urlBoleto(b.token);
  const titulo = `Boleto · ${b.actividad?.titulo || 'Festival del Conocimiento'}`;
  if (navigator.share) {
    await navigator.share({ title: titulo, text: titulo, url });
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    avisar('Liga copiada. Compártela solo con quien va contigo.', 'ok');
  } catch (e) {
    // Sin portapapeles (http:// o navegador viejo): se muestra para copiarla a mano.
    avisar('Copia esta liga: ' + url);
  }
}

/* =================================================================== imagen */

function partirTexto(ctx, texto, ancho) {
  const palabras = String(texto).split(/\s+/);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? actual + ' ' + p : p;
    if (ctx.measureText(prueba).width > ancho && actual) { lineas.push(actual); actual = p; }
    else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** El boleto como PNG de 1080 px de ancho, para la galería del teléfono. */
export async function imagenBoleto(b) {
  const a = b.actividad || {};
  const F_DISP = "'Space Grotesk', 'Inter', system-ui, sans-serif";
  const F_TXT  = "'Inter', system-ui, sans-serif";
  try {
    await Promise.all([
      document.fonts.load(`700 40px 'Space Grotesk'`),
      document.fonts.load(`500 20px 'Inter'`),
      document.fonts.load(`700 20px 'Inter'`),
    ]);
  } catch (e) { /* sin las fuentes se usa la del sistema */ }

  const W = 1080, M = 72, ANCHO = W - M * 2;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');

  // Primero se mide el título para saber cuánto crece la cabecera.
  ctx.font = `700 64px ${F_DISP}`;
  const lineasTit = partirTexto(ctx, a.titulo || '', ANCHO).slice(0, 4);
  const altoCab = 150 + lineasTit.length * 74;
  // QR y código ≈ 830 px, cuatro datos ≈ 470, pie 96 y aire.
  const H = altoCab + 1360;
  c.width = W; c.height = H;

  const eje = a.eje_color || '#10ABC4';

  // Fondo y cabecera oscura con la franja del eje
  ctx.fillStyle = '#F7F9F8'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = colorOscuro(); ctx.fillRect(0, 0, W, altoCab);
  ctx.fillStyle = eje;       ctx.fillRect(0, altoCab - 14, W, 14);

  ctx.fillStyle = '#F6D20A';
  ctx.font = `700 26px ${F_DISP}`;
  ctx.textBaseline = 'alphabetic';
  const kicker = (b.estado === 'espera' ? 'LISTA DE ESPERA' : 'BOLETO GRATUITO') + (a.eje ? '  ·  ' + a.eje.toUpperCase() : '');
  ctx.fillText(kicker, M, 96);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 64px ${F_DISP}`;
  lineasTit.forEach((l, i) => ctx.fillText(l, M, 184 + i * 74));

  // QR
  let y = altoCab + 56;
  const lado = 560;
  const x = (W - lado) / 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x - 12, y - 12, lado + 24, lado + 24);
  dibujarQR(ctx, crearQR(urlBoleto(b.token)), x, y, lado);
  y += lado + 70;

  // Código
  ctx.textAlign = 'center';
  ctx.fillStyle = '#627275';
  ctx.font = `700 24px ${F_DISP}`;
  ctx.fillText('CÓDIGO', W / 2, y);
  ctx.fillStyle = colorOscuro();
  ctx.font = `700 76px ${F_DISP}`;
  ctx.fillText(codigoLegible(b.codigo), W / 2, y + 78);
  ctx.textAlign = 'left';
  y += 140;

  // Datos
  ctx.strokeStyle = '#DCE4E4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
  y += 60;
  const fila = (etiqueta, valor, sub) => {
    ctx.fillStyle = '#627275';
    ctx.font = `700 22px ${F_DISP}`;
    ctx.fillText(etiqueta.toUpperCase(), M, y);
    ctx.fillStyle = colorOscuro();
    ctx.font = `600 36px ${F_TXT}`;
    const ls = partirTexto(ctx, valor, ANCHO).slice(0, 2);
    ls.forEach((l, i) => ctx.fillText(l, M, y + 46 + i * 44));
    let alto = 46 + (ls.length - 1) * 44;
    if (sub) {
      ctx.fillStyle = '#52676B';
      ctx.font = `400 28px ${F_TXT}`;
      ctx.fillText(sub, M, y + alto + 40);
      alto += 40;
    }
    y += alto + 50;
  };
  fila('Cuándo', a.fecha ? diaLargo(a.fecha) : 'Por confirmar', rangoHoras(a));
  fila('Dónde', a.sede || 'Por confirmar', a.sede_direccion || '');
  // Nombre y lugares en dos columnas
  const yNombre = y;
  fila('A nombre de', b.nombre || '—');
  const yFin = y;
  y = yNombre;
  ctx.fillStyle = '#627275';
  ctx.font = `700 22px ${F_DISP}`;
  ctx.textAlign = 'right';
  ctx.fillText('LUGARES', W - M, y);
  ctx.fillStyle = colorOscuro();
  ctx.font = `700 48px ${F_DISP}`;
  ctx.fillText(String(b.lugares || 1), W - M, y + 52);
  ctx.textAlign = 'left';
  y = yFin;

  // Pie
  ctx.fillStyle = colorOscuro();
  ctx.fillRect(0, H - 96, W, 96);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 26px ${F_TXT}`;
  ctx.fillText('Festival del Conocimiento · Ensenada', M, H - 38);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#F6D20A';
  ctx.fillText('festivaldelconocimiento.org', W - M, H - 38);
  ctx.textAlign = 'left';

  return new Promise((ok, mal) => c.toBlob(bl => bl ? ok(bl) : mal(new Error('No se pudo crear la imagen.')), 'image/png'));
}

async function guardarImagen(b) {
  const blob = await imagenBoleto(b);
  const nombre = `boleto-${b.codigo}.png`;
  // En el teléfono, «compartir» con archivo ofrece «Guardar imagen» en la
  // galería, que es lo que la persona quiere. En escritorio, descarga.
  const archivo = new File([blob], nombre, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [archivo] }) && matchMedia('(pointer: coarse)').matches) {
    await navigator.share({ files: [archivo], title: 'Mi boleto' });
  } else {
    descargar(blob, nombre);
  }
}

/* =============================================================== calendario */

function textoICS(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Líneas de más de 75 octetos se parten, como pide el formato. */
function doblar(linea) {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 75) return linea;
  const out = [];
  let actual = '', largo = 0;
  for (const ch of linea) {
    const n = new TextEncoder().encode(ch).length;
    if (largo + n > (out.length ? 74 : 75)) { out.push(actual); actual = ''; largo = 0; }
    actual += ch; largo += n;
  }
  out.push(actual);
  return out.join('\r\n ');
}

const sello = (f) => [f.getFullYear(), String(f.getMonth() + 1).padStart(2, '0'), String(f.getDate()).padStart(2, '0')].join('');

export function ics(b) {
  const a = b.actividad || {};
  const f = aFecha(a.fecha);
  const hi = hora(a.hora_inicio), hf = hora(a.hora_fin);
  const url = urlBoleto(b.token);
  const ahora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Festival del Conocimiento//Boletos//ES',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    // Ensenada sigue el horario de verano de EE. UU.
    'BEGIN:VTIMEZONE', 'TZID:America/Tijuana',
    'BEGIN:STANDARD', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'TZNAME:PST', 'END:STANDARD',
    'BEGIN:DAYLIGHT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'TZNAME:PDT', 'END:DAYLIGHT',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${b.codigo}@festivaldelconocimiento.org`,
    `DTSTAMP:${ahora}`,
  ];

  if (f && hi) {
    const ini = sello(f) + 'T' + hi.replace(':', '') + '00';
    let fin;
    if (hf && hf > hi) fin = sello(f) + 'T' + hf.replace(':', '') + '00';
    else {
      const [h, m] = hi.split(':').map(Number);
      fin = sello(f) + 'T' + String(Math.min(h + 1, 23)).padStart(2, '0') + String(m).padStart(2, '0') + '00';
    }
    lineas.push(`DTSTART;TZID=America/Tijuana:${ini}`, `DTEND;TZID=America/Tijuana:${fin}`);
  } else if (f) {
    const siguiente = new Date(f); siguiente.setDate(siguiente.getDate() + 1);
    lineas.push(`DTSTART;VALUE=DATE:${sello(f)}`, `DTEND;VALUE=DATE:${sello(siguiente)}`);
  }

  lineas.push(
    `SUMMARY:${textoICS(a.titulo + ' · Festival del Conocimiento')}`,
    `LOCATION:${textoICS([a.sede, a.sede_direccion].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${textoICS(`Boleto ${codigoLegible(b.codigo)} · ${lugaresTexto(b.lugares || 1)} a nombre de ${b.nombre}.\nTu boleto: ${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY',
    `DESCRIPTION:${textoICS(a.titulo)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  );
  return lineas.map(doblar).join('\r\n') + '\r\n';
}
