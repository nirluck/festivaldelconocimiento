/* ============================================================================
   REGISTRO DE MÓDULOS · Festival del Conocimiento
   ----------------------------------------------------------------------------
   El panel de actividad (/actividad/) no sabe qué módulos existen: solo recorre
   esta lista. Agregar un módulo es un archivo y un renglón aquí.

   Cada módulo exporta esta forma:

     export default {
       id:     'resumen',                       // único, va en la URL: #resumen
       nombre: 'Resumen',                       // lo que se lee en la pestaña
       aplica: (actividad, perfil) => true,     // ¿esta pestaña se muestra?
       montar: async (contenedor, actividad, perfil, ctx) => { … },
     };

   «ctx» trae utilidades del panel:
     ctx.recargar()  vuelve a leer la actividad y repinta el módulo activo.
                     Lo usa Resumen después de guardar.
   ========================================================================== */

import resumen from './resumen.js';
import avance  from './avance.js';

export const MODULOS = [resumen, avance];
