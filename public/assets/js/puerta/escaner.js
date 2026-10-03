/* ============================================================================
   PUERTA · LECTOR DE QR CON LA CÁMARA
   ----------------------------------------------------------------------------
   Dos lectores, el mejor que haya:
     · BarcodeDetector, el del propio navegador (Chrome en Android). Rápido y
       sin descargar nada.
     · jsQR (vendor/jsQR.js, Apache 2.0) donde no existe: Safari en iPhone y
       Chrome en computadora. Se descarga solo la primera vez que hace falta.

   La cámara exige HTTPS (o localhost) y que el sitio la permita en
   Permissions-Policy (netlify.toml).
   ========================================================================== */

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

/** Cada cuánto se busca un código, en milisegundos. */
const PAUSA = 120;

export class Escaner {
  /**
   * @param video   el <video> donde se ve la cámara
   * @param alLeer  función que recibe el texto de cada QR leído
   */
  constructor(video, alLeer) {
    this.video = video;
    this.alLeer = alLeer;
    this.activo = false;
    this.flujo = null;
    this.luz = false;
  }

  /** Abre la cámara trasera. Lanza Error con message: sin_camara · permiso · ocupada · sin_lector. */
  async iniciar() {
    if (this.activo) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin_camara');
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw new Error('permiso');
      if (e.name === 'NotReadableError' || e.name === 'AbortError') throw new Error('ocupada');
      throw new Error('sin_camara');
    }
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    this.video.srcObject = this.flujo;
    try { await this.video.play(); } catch (e) { /* iOS a veces rechaza play() y reproduce igual */ }
    try {
      this.leer = await crearLector();
    } catch (e) {
      this.detener();
      throw new Error('sin_lector');
    }
    this.activo = true;
    this.bucle();
  }

  detener() {
    this.activo = false;
    this.luz = false;
    this.flujo?.getTracks().forEach(t => t.stop());
    this.flujo = null;
    this.video.srcObject = null;
  }

  async bucle() {
    while (this.activo) {
      const t0 = performance.now();
      if (this.video.readyState >= 2) {
        let texto = null;
        try { texto = await this.leer(this.video); } catch (e) { /* cuadro ilegible */ }
        if (texto && this.activo) this.alLeer(texto);
      }
      await esperar(Math.max(20, PAUSA - (performance.now() - t0)));
    }
  }

  /** ¿El teléfono deja prender la linterna? (Android sí; iPhone no desde el navegador.) */
  get hayLinterna() {
    const pista = this.flujo?.getVideoTracks()[0];
    try { return !!pista?.getCapabilities?.().torch; } catch (e) { return false; }
  }

  async alternarLinterna() {
    const pista = this.flujo?.getVideoTracks()[0];
    if (!pista) return false;
    try {
      await pista.applyConstraints({ advanced: [{ torch: !this.luz }] });
      this.luz = !this.luz;
    } catch (e) { /* no se pudo */ }
    return this.luz;
  }
}

/* ------------------------------------------------------------------ lector */

async function crearLector() {
  if ('BarcodeDetector' in window) {
    try {
      const formatos = await window.BarcodeDetector.getSupportedFormats();
      if (formatos.includes('qr_code')) {
        const d = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (video) => (await d.detect(video))[0]?.rawValue || null;
      }
    } catch (e) { /* se usa jsQR */ }
  }

  await cargarJsQR();
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const an = video.videoWidth, al = video.videoHeight;
    if (!an || !al) return null;
    // Solo el cuadro central, que es donde está el marco de la pantalla, y a
    // lo más 600 px de lado: jsQR va en el hilo principal y debe ser ligero.
    const lado = Math.min(an, al);
    const L = Math.min(lado, 600);
    lienzo.width = lienzo.height = L;
    ctx.drawImage(video, (an - lado) / 2, (al - lado) / 2, lado, lado, 0, 0, L, L);
    const img = ctx.getImageData(0, 0, L, L);
    return window.jsQR(img.data, L, L, { inversionAttempts: 'dontInvert' })?.data || null;
  };
}

let cargando = null;
function cargarJsQR() {
  if (window.jsQR) return Promise.resolve();
  cargando ||= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = '/assets/js/vendor/jsQR.js';
    s.onload = () => (window.jsQR ? ok() : mal(new Error('jsqr')));
    s.onerror = () => { cargando = null; mal(new Error('jsqr')); };
    document.head.appendChild(s);
  });
  return cargando;
}
