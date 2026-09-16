/* ============================================================================
   BOLETOS · EL QR DE LA ACTIVIDAD
   ----------------------------------------------------------------------------
   Piezas descargables para difundir una actividad con boleto. Todas llevan el
   QR que abre /b/<slug>?o=<origen>, de modo que cada boleto registra por dónde
   llegó la persona.

     urlActividad(slug, origen)
     cartelPNG(act, origen, 'cartel' | 'cuadrado')   → Blob
     qrPNG(texto)                                     → Blob
     qrSVGArchivo(texto)                              → Blob

   «act» necesita titulo, slug, fecha, hora_inicio, hora_fin, sede, eje,
   eje_color y acceso.
   ========================================================================== */

import { crearQR, dibujarQR, qrSVG } from '../qr.js';
import { diaLargo, rangoHoras } from './util.js';

export function urlActividad(slug, origen) {
  return `${location.origin}/b/${encodeURIComponent(slug)}${origen ? `?o=${encodeURIComponent(origen)}` : ''}`;
}

/** Lo que se imprime bajo el QR: sin «https://» ni el origen, que no se teclean. */
function urlCorta(slug) {
  return `${location.host}/b/${slug}`;
}

const F_DISP = "'Space Grotesk', 'Inter', system-ui, sans-serif";
const F_TXT  = "'Inter', system-ui, sans-serif";

async function fuentes() {
  try {
    await Promise.all([
      document.fonts.load(`700 40px 'Space Grotesk'`),
      document.fonts.load(`400 20px 'Inter'`),
      document.fonts.load(`600 20px 'Inter'`),
    ]);
  } catch (e) { /* se usa la del sistema */ }
}

function partir(ctx, texto, ancho, maxLineas) {
  const palabras = String(texto || '').split(/\s+/);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? actual + ' ' + p : p;
    if (ctx.measureText(prueba).width > ancho && actual) { lineas.push(actual); actual = p; }
    else actual = prueba;
  }
  if (actual) lineas.push(actual);
  if (lineas.length > maxLineas) {
    const cortadas = lineas.slice(0, maxLineas);
    let ultima = cortadas[maxLineas - 1];
    while (ctx.measureText(ultima + '…').width > ancho && ultima.includes(' ')) {
      ultima = ultima.slice(0, ultima.lastIndexOf(' '));
    }
    cortadas[maxLineas - 1] = ultima + '…';
    return cortadas;
  }
  return lineas;
}

/** Título a un tamaño que quepa en «maxLineas»: baja de a poco si no cabe. */
function tituloQueQuepa(ctx, texto, ancho, maxLineas, tamMax, tamMin) {
  for (let t = tamMax; t >= tamMin; t -= 4) {
    ctx.font = `700 ${t}px ${F_DISP}`;
    const l = partir(ctx, texto, ancho, 99);
    if (l.length <= maxLineas) return { tam: t, lineas: l };
  }
  ctx.font = `700 ${tamMin}px ${F_DISP}`;
  return { tam: tamMin, lineas: partir(ctx, texto, ancho, maxLineas) };
}

function aBlob(c) {
  return new Promise((ok, mal) =>
    c.toBlob(b => b ? ok(b) : mal(new Error('No se pudo crear la imagen.')), 'image/png'));
}

/**
 * @param {'cartel'|'cuadrado'} formato
 *   cartel    1200 × 1600, para imprimir en carta o tabloide
 *   cuadrado  1080 × 1080, para publicaciones
 */
export async function cartelPNG(act, origen, formato = 'cartel') {
  await fuentes();
  const cuadrado = formato === 'cuadrado';
  const W = cuadrado ? 1080 : 1200;
  const H = cuadrado ? 1080 : 1600;
  const M = cuadrado ? 64 : 80;
  const eje = act.eje_color || '#10ABC4';
  const registro = act.acceso === 'registro';

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  /* --- Medir la cabecera antes de pintarla: crece con el título. -------- */
  const t = tituloQueQuepa(ctx, act.titulo, W - M * 2, cuadrado ? 3 : 4, cuadrado ? 72 : 92, 44);
  const tamCuando = cuadrado ? 30 : 36;
  const tamSede = cuadrado ? 26 : 30;
  const yKicker = M + 24;
  const yTitulo = yKicker + t.tam * 1.3;                     // primera línea
  const yCuando = yTitulo + (t.lineas.length - 1) * t.tam * 1.08 + tamCuando * 1.9;
  const ySede = yCuando + tamSede * 1.55;
  const altoCab = Math.round((act.sede ? ySede : yCuando) + (cuadrado ? 44 : 56));

  ctx.fillStyle = '#12343B'; ctx.fillRect(0, 0, W, altoCab);
  ctx.fillStyle = eje;       ctx.fillRect(0, altoCab - 16, W, 16);

  ctx.fillStyle = '#F6D20A';
  ctx.font = `700 ${cuadrado ? 26 : 30}px ${F_DISP}`;
  ctx.fillText('FESTIVAL DEL CONOCIMIENTO' + (act.eje ? '  ·  ' + String(act.eje).toUpperCase() : ''), M, yKicker);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 ${t.tam}px ${F_DISP}`;
  t.lineas.forEach((l, i) => ctx.fillText(l, M, yTitulo + i * t.tam * 1.08));

  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.font = `600 ${tamCuando}px ${F_TXT}`;
  ctx.fillText((act.fecha ? diaLargo(act.fecha) : 'Fecha por confirmar') + ' · ' + rangoHoras(act), M, yCuando);
  if (act.sede) {
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.font = `400 ${tamSede}px ${F_TXT}`;
    ctx.fillText(partir(ctx, act.sede, W - M * 2, 1)[0], M, ySede);
  }

  /* --- Cuerpo ----------------------------------------------------------- */
  const altoPie = cuadrado ? 70 : 90;
  ctx.fillStyle = '#F7F9F8'; ctx.fillRect(0, altoCab, W, H - altoCab - altoPie);
  const qr = crearQR(urlActividad(act.slug, origen));
  const cta = registro ? 'Confirma tu asistencia' : 'Consigue tu boleto gratuito';

  if (cuadrado) {
    // QR a la derecha, texto a la izquierda, centrados en lo que queda.
    const disponible = H - altoCab - altoPie;
    const lado = Math.min(440, disponible - 80);
    const xq = W - M - lado, yq = altoCab + (disponible - lado) / 2;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(xq - 10, yq - 10, lado + 20, lado + 20);
    dibujarQR(ctx, qr, xq, yq, lado);

    const ancho = xq - M * 2;
    ctx.font = `700 50px ${F_DISP}`;
    const lCta = partir(ctx, cta, ancho, 3);
    ctx.font = `400 26px ${F_TXT}`;
    const lSub = partir(ctx, registro ? 'Entrada libre. Escanea el código para avisarnos que vienes.'
                                      : 'Cupo limitado. Escanea el código para apartar tu lugar.', ancho, 4);
    const altoTexto = lCta.length * 56 + 18 + lSub.length * 36;
    let yt = altoCab + (disponible - altoTexto) / 2 + 44;
    ctx.fillStyle = '#12343B';
    ctx.font = `700 50px ${F_DISP}`;
    lCta.forEach(l => { ctx.fillText(l, M, yt); yt += 56; });
    yt += 18;
    ctx.fillStyle = '#52676B';
    ctx.font = `400 26px ${F_TXT}`;
    lSub.forEach(l => { ctx.fillText(l, M, yt); yt += 36; });
  } else {
    // El QR toma lo que sobra entre la cabecera y los tres renglones de abajo.
    const altoTextos = 250;
    const lado = Math.min(620, H - altoPie - altoTextos - altoCab - 70);
    const xq = (W - lado) / 2, yq = altoCab + 50;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(xq - 14, yq - 14, lado + 28, lado + 28);
    dibujarQR(ctx, qr, xq, yq, lado);

    const yBase = yq + lado + 14;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#12343B';
    ctx.font = `700 62px ${F_DISP}`;
    ctx.fillText(cta, W / 2, yBase + 86);
    ctx.fillStyle = '#52676B';
    ctx.font = `400 30px ${F_TXT}`;
    ctx.fillText(registro ? 'Entrada libre · escanea el código para avisarnos que vienes'
                          : 'Cupo limitado · escanea el código para apartar tu lugar', W / 2, yBase + 138);
    ctx.fillStyle = '#0A7285';
    // La liga no tiene espacios donde partirla: si no cabe, se achica la letra.
    let tamUrl = 28;
    do { ctx.font = `600 ${tamUrl}px ${F_TXT}`; tamUrl -= 1; }
    while (ctx.measureText(urlCorta(act.slug)).width > W - M * 2 && tamUrl > 14);
    ctx.fillText(urlCorta(act.slug), W / 2, yBase + 186);
    ctx.textAlign = 'left';
  }

  /* --- Pie -------------------------------------------------------------- */
  ctx.fillStyle = '#12343B'; ctx.fillRect(0, H - altoPie, W, altoPie);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${cuadrado ? 24 : 28}px ${F_TXT}`;
  ctx.fillText('Ensenada, Baja California', M, H - altoPie / 2 + 10);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#F6D20A';
  ctx.fillText('festivaldelconocimiento.org', W - M, H - altoPie / 2 + 10);
  ctx.textAlign = 'left';

  return aBlob(c);
}

/** Solo el código, 1200 px, para quien diseña su propia pieza. */
export async function qrPNG(texto) {
  const c = document.createElement('canvas');
  c.width = c.height = 1200;
  const ctx = c.getContext('2d');
  // Fondo blanco completo: dibujarQR redondea el módulo y podría dejar una
  // orilla transparente, que en un fondo oscuro se lee como otro color.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 1200, 1200);
  dibujarQR(ctx, crearQR(texto), 0, 0, 1200, { oscuro: '#000000' });
  return aBlob(c);
}

/** El mismo código en vector: escala a cualquier tamaño de impresión. */
export function qrSVGArchivo(texto) {
  return new Blob([qrSVG(texto, { oscuro: '#000000' })], { type: 'image/svg+xml' });
}
