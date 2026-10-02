/* ============================================================================
   LUGAR · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Cómo se dice dónde es una actividad, igual en el programa, la portada, el
   boleto y el cartel (sql/16-sedes-salas.sql).

     lugarCorto(a)  «CEART · Aula Magna»: nombre corto de la sede, si lo tiene
     lugarLargo(a)  «Centro Estatal de las Artes… · Aula Magna»
     urlMapa(a)     el enlace «Cómo llegar», o '' si no hay con qué armarlo

   «a» es una fila de vista_programa o la actividad de un boleto: sede, sala,
   sede_corta, sede_direccion, sede_mapa. Sin sala se ve igual que antes.
   ========================================================================== */

const junto = (sede, sala) => [sede, sala].filter(Boolean).join(' · ');

export const lugarCorto = (a) => junto(a?.sede_corta || a?.sede, a?.sala);
export const lugarLargo = (a) => junto(a?.sede, a?.sala);

/**
 * El enlace que puso la administración; si no hay, una búsqueda en Google
 * Maps con el nombre y la dirección. Sin dirección no se arma nada: una
 * búsqueda solo con «Escuelas» o «Por definir» mandaría a cualquier parte.
 */
export function urlMapa(a) {
  if (a?.sede_mapa) return a.sede_mapa;
  if (!a?.sede_direccion) return '';
  return 'https://www.google.com/maps/search/?api=1&query='
    + encodeURIComponent(`${a.sede}, ${a.sede_direccion}`);
}
