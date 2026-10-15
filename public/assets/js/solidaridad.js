/* ============================================================================
   SOLIDARIDAD · TORMENTA RACHEL · Festival del Conocimiento
   ----------------------------------------------------------------------------
   La ventana del aviso de colecta (14 de octubre de 2026). Se abre:

     · sola, la primera vez que alguien entra a la portada. Al cerrarla se
       recuerda en este navegador y no vuelve a salir sola;
     · siempre con /#ayuda, que es el enlace que se comparte;
     · con el botón «Cómo ayudar» del cintillo.

   Si el navegador no deja guardar (ventana privada, almacenamiento
   bloqueado), se abre cada vez: es preferible a que no salga nunca.
   ========================================================================== */

const CLAVE = 'fdc_ayuda_rachel_visto';

/* El enlace que se comparte es siempre el del sitio publicado, también si
   esto corre en local. */
const ENLACE = 'https://festivaldelconocimiento.org/#ayuda';
const MENSAJE =
  'El Festival del Conocimiento recibe despensas, agua, cobijas y chamarras ' +
  'para las familias afectadas por la tormenta Rachel, en sus sedes durante ' +
  'las actividades. Más información: ' + ENLACE;

const dlg = document.getElementById('fdc-ayuda-dlg');

if (dlg && typeof dlg.showModal === 'function') {
  const abrir = () => { if (!dlg.open) dlg.showModal(); };

  document.querySelectorAll('[data-abrir-ayuda]').forEach(b => b.addEventListener('click', abrir));
  dlg.querySelectorAll('[data-cerrar-ayuda]').forEach(b => b.addEventListener('click', () => dlg.close()));
  // Un clic en el fondo oscuro cierra, como en cualquier ventana emergente.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  dlg.addEventListener('close', () => {
    try { localStorage.setItem(CLAVE, '1'); } catch (e) { /* sin almacenamiento */ }
    // Que volver a cargar la página no la abra otra vez por el #ayuda.
    if (location.hash === '#ayuda') history.replaceState(null, '', location.pathname + location.search);
  });

  // Compartir
  const wa = dlg.querySelector('[data-wa-ayuda]');
  if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent(MENSAJE);

  const copiar = dlg.querySelector('[data-copiar-ayuda]');
  if (copiar) copiar.addEventListener('click', async () => {
    const texto = copiar.textContent;
    try {
      await navigator.clipboard.writeText(ENLACE);
      copiar.textContent = 'Enlace copiado';
    } catch (e) {
      copiar.textContent = ENLACE;   // a la vista, para copiarlo a mano
    }
    setTimeout(() => { copiar.textContent = texto; }, 2500);
  });

  // Primera visita, o llegada por el enlace compartido. Un instante después
  // de cargar, para que la página se vea detrás y no parezca un muro.
  let visto = false;
  try { visto = localStorage.getItem(CLAVE) === '1'; } catch (e) { /* sin almacenamiento */ }
  if (location.hash === '#ayuda' || !visto) setTimeout(abrir, 700);
}
