/* ============================================================================
   SOLIDARIDAD · TORMENTA RACHEL · Festival del Conocimiento
   ----------------------------------------------------------------------------
   La ventana del aviso de colecta (14 de octubre de 2026): la lámina del
   aviso, con sus botones de «Ver sedes y horarios» y de compartir activos.
   Se abre:

     · sola, cada vez que se carga la portada. Al principio solo salía la
       primera vez y se recordaba en el navegador; desde el 14 de octubre sale
       en cada visita, para que nadie se quede sin verla;
     · con /#ayuda, que es el enlace que se comparte;
     · con el botón «Cómo ayudar» del cintillo.
   ========================================================================== */

/* El enlace que se comparte es siempre el del sitio publicado, también si
   esto corre en local. */
const ENLACE = 'https://festivaldelconocimiento.org/#ayuda';
const MENSAJE =
  'El Festival del Conocimiento recibe despensas, agua, cobijas y chamarras ' +
  'para las familias afectadas por la tormenta Rachel, en sus sedes durante ' +
  'las actividades. Más información: ' + ENLACE;

const dlg = document.getElementById('fdc-ayuda-dlg');

if (dlg && typeof dlg.showModal === 'function') {
  // Al abrir, el foco va a la ventana y no a su primer botón (cerrar): si no,
  // al abrirse sola al cargar, ese botón mostraba un recuadro de foco sin que
  // nadie hubiera usado el teclado.
  const abrir = () => { if (!dlg.open) { dlg.showModal(); dlg.focus(); } };

  document.querySelectorAll('[data-abrir-ayuda]').forEach(b => b.addEventListener('click', abrir));
  dlg.querySelectorAll('[data-cerrar-ayuda]').forEach(b => b.addEventListener('click', () => dlg.close()));
  // Un clic en el fondo oscuro cierra, como en cualquier ventana emergente.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  dlg.addEventListener('close', () => {
    // Quitar el #ayuda de la dirección al cerrar, para que no quede pegado si
    // la persona copia el enlace de la portada.
    if (location.hash === '#ayuda') history.replaceState(null, '', location.pathname + location.search);
  });

  // Compartir, desde la franja «Si no puedes donar…» de la lámina.
  //   · En teléfono, el menú de compartir del sistema con la lámina misma
  //     como imagen: llega a WhatsApp como foto con el texto y el enlace.
  //   · Si el sistema no comparte archivos, el mismo menú con texto y enlace.
  //   · En computadora, WhatsApp con el mensaje ya escrito.
  const IMAGEN = '/assets/img/aviso-tormenta-rachel.webp';
  const compartir = dlg.querySelector('[data-compartir-ayuda]');
  if (compartir) compartir.addEventListener('click', async () => {
    const datos = { title: 'Centros de acopio · Tormenta Rachel', text: MENSAJE };
    if (navigator.share) {
      try {
        const r = await fetch(IMAGEN);
        const archivo = new File([await r.blob()], 'aviso-tormenta-rachel.webp', { type: 'image/webp' });
        if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
          await navigator.share({ ...datos, files: [archivo] });
        } else {
          await navigator.share({ ...datos, url: ENLACE });
        }
        return;
      } catch (e) {
        // Si la persona cerró el menú, no hay nada más que hacer.
        if (e && e.name === 'AbortError') return;
      }
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(MENSAJE), '_blank', 'noopener');
  });

  // En cada visita a la portada. Un instante después de cargar, para que la
  // página se vea detrás y no parezca un muro.
  setTimeout(abrir, 700);
}
