/* ============================================================================
   CONFIGURACIÓN · Festival del Conocimiento
   ----------------------------------------------------------------------------
   Copia aquí los dos datos de tu proyecto de Supabase:
   Panel de Supabase ▸ Project Settings ▸ Data API

   SOBRE LA LLAVE «publishable» (antes «anon»)
   No es un secreto y va aquí a propósito: está diseñada para vivir en el
   navegador. Lo que protege los datos NO es esconderla, sino las reglas por
   fila de 03-rls.sql, que Postgres aplica antes de entregar cualquier renglón.

   La que JAMÁS debe aparecer en este archivo ni en el repositorio es la
   «secret» (antes «service_role»), que sí salta todas las reglas.
   ========================================================================== */

export const SUPABASE_URL      = 'https://pnbnwltrdaarnfhwjzci.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_boknOIZ6mcyeA8JddH4aiw_r_Op5IE2';

/* Fechas del festival, para textos del sitio. Las que manda el semáforo viven
   en la tabla «ajustes» de la base de datos. */
export const FESTIVAL = {
  inicio: '2026-10-17',
  fin:    '2026-10-24',
  texto:  'del 17 al 24 de octubre de 2026',
};

/* Opciones de alerta. Van fijas a propósito: el semáforo las reconoce por su
   texto («%apoyo%», «%puede no salir%»). Si se editaran desde un catálogo, el
   semáforo dejaría de detectarlas en silencio. Ver la nota en 04-catalogos.sql */
export const ALERTAS = [
  'No, va caminando',
  'Sí, necesito apoyo',
  'Sí, puede no salir',
];

export const SEG_CONTACTO = ['Todavía no', 'Sí, respondió', 'Le dejé recado', 'No contesta'];
export const SEG_MEDIO    = ['', 'Correo', 'Teléfono', 'WhatsApp', 'En persona'];
