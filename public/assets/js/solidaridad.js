/* ============================================================================
   SOLIDARIDAD · TORMENTA RACHEL · Festival del Conocimiento
   ----------------------------------------------------------------------------
   La ventana del aviso de colecta (14 de octubre de 2026). Se abre:

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
  const abrir = () => { if (!dlg.open) dlg.showModal(); };

  document.querySelectorAll('[data-abrir-ayuda]').forEach(b => b.addEventListener('click', abrir));
  dlg.querySelectorAll('[data-cerrar-ayuda]').forEach(b => b.addEventListener('click', () => dlg.close()));
  // Un clic en el fondo oscuro cierra, como en cualquier ventana emergente.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  dlg.addEventListener('close', () => {
    // Quitar el #ayuda de la dirección al cerrar, para que no quede pegado si
    // la persona copia el enlace de la portada.
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

  // En cada visita a la portada. Un instante después de cargar, para que la
  // página se vea detrás y no parezca un muro.
  setTimeout(abrir, 700);
}
