/* ============================================================================
   PUERTA · TRABAJADOR DE SERVICIO
   ----------------------------------------------------------------------------
   Para que /puerta/ vuelva a abrir sin señal: si el teléfono cierra el
   navegador a media fila, la página se carga de esta copia. Las listas y la
   cola ya viven en localStorage (estado.js); esto guarda solo la página.

   Red primero, copia si no hay: con señal siempre se usa la versión más
   reciente del sitio. Supabase y las tipografías de Google van directo, sin
   pasar por aquí.

   Solo controla /puerta/ (su carpeta): el resto del sitio no se entera.
   Al cambiar la lista de archivos, sube el número de CACHE.
   ========================================================================== */

const CACHE = 'fdc-puerta-1';
const ARCHIVOS = [
  '/puerta/',
  '/assets/css/marca.css',
  '/assets/css/programa.css',
  '/assets/css/puerta.css',
  '/assets/js/puerta/pagina.js',
  '/assets/js/puerta/estado.js',
  '/assets/js/puerta/api.js',
  '/assets/js/puerta/escaner.js',
  '/assets/js/boletos/util.js',
  '/assets/js/lugar.js',
  '/assets/js/marca.js',
  '/assets/js/config.js',
  '/assets/js/vendor/jsQR.js',
  '/assets/img/icono-festcon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('fdc-puerta-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(redPrimero(req));
});

async function redPrimero(req) {
  const cache = await caches.open(CACHE);
  try {
    // Con mala señal una petición puede tardar un minuto: a los 4 s, la copia.
    const r = await Promise.race([
      fetch(req),
      new Promise((_, mal) => setTimeout(() => mal(new Error('lento')), 4000)),
    ]);
    if (r.ok) cache.put(req, r.clone());
    return r;
  } catch (err) {
    const copia = await cache.match(req, { ignoreSearch: true });
    if (copia) return copia;
    throw err;
  }
}
