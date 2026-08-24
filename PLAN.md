# Plan de trabajo · Sistema del Festival del Conocimiento

> **Para quien retome este proyecto.** Aquí está el estado real, las decisiones
> ya tomadas y por qué, el modelo de datos completo y la ruta módulo por módulo.
> Léelo antes de escribir código: varias decisiones costaron discusión y no
> conviene volver a abrirlas sin motivo.

Última actualización: **22 de agosto de 2026**

---

## 1 · Qué es esto

Sitio público y sistema interno del Festival del Conocimiento
(Ensenada, Baja California · **17 al 24 de octubre de 2026**).

| | |
|---|---|
| **Sitio** | https://festivaldelconocimiento.org |
| **Repositorio** | https://github.com/nirluck/festivaldelconocimiento |
| **Publicación** | Netlify, automática en cada push a `main` |
| **Base de datos** | Supabase · proyecto `pnbnwltrdaarnfhwjzci` |
| **Stack** | HTML, CSS y JavaScript a mano. **Sin framework ni paso de compilación.** |

---

## 2 · Estado actual

### Funcionando en producción

- Landing pública con carrusel, cuenta regresiva, memoria 2025 y galería
- Registro que crea cuenta y da de alta una actividad en un paso
- Acceso con correo y contraseña, con recuperación
- Página del coordinador: sus actividades, historial y reporte de avances
- Tablero de administración con semáforo, filtros y exportación CSV
- Cabecera unificada en las cinco páginas

### Tablas que existen hoy

```
perfiles · ediciones · actividades · reportes · seguimiento
ejes · tipos · sedes
```

`ajustes` y `dias` desaparecieron en la fase A: la primera la absorbió
`ediciones`, la segunda la sustituyó `actividades.fecha`.

### Archivos SQL aplicados, en orden

| Archivo | Qué hace |
|---|---|
| `sql/01-esquema.sql` | Tablas base y el disparador que crea el perfil al registrarse |
| `sql/02-semaforo.sql` | Cálculo del semáforo y `vista_actividades` |
| `sql/03-rls.sql` | Reglas de acceso por fila |
| `sql/04-catalogos.sql` | Ejes, tipos, sedes y días |
| `sql/06-cambios.sql` | Roles renombrados, hora y requerimientos, sin aprobación |
| `sql/07-nucleo.sql` | **Fase A.** Ediciones, fecha real, slug y resumen |
| `sql/00-verificar.sql` | No crea nada: comprueba que todo quedó bien |

**03 y 06 ya no se vuelven a ejecutar.** Describen el esquema anterior a 07 y
volver a aplicarlos lo haría retroceder en silencio: 03 reinstala
`es_coordinacion()` y un `proteger_estado()` que lee la columna `estado`, que ya
no existe; 06 reconstruye la vista vieja. Los dos llevan un candado al principio
que se detiene y lo explica.

`sql/05-coordinador.local.sql` lleva contraseña y está en `.gitignore`.

### Huecos conocidos

- **No se puede editar una actividad** una vez creada. Ni el coordinador ni la
  administración. Se resuelve en la fase B.
- **Nada se ha probado con volumen real.** Hay un par de actividades de prueba.

---

## 3 · Decisiones tomadas

Estas ya se discutieron con el equipo. Cambiar alguna implica volver a abrir la
conversación, no solo el código.

### Roles y acceso

- **Solo dos roles con cuenta:** `coordinador` (inscribe, organiza y reporta sus
  actividades; puede tener varias) y `administrador` (ve y da seguimiento a
  todo; puede haber varios).
- **El registro es por invitación.** No se anuncia en el menú; a `/registro` se
  llega por liga directa. Por eso **las actividades no requieren aprobación**.
- **Asistentes, voluntarios y ponentes NO tienen cuenta.** Pedir contraseña para
  una charla gratuita es fricción que hunde la conversión.
- **El acceso sin cuenta es por token**, uno por fila, de un solo propósito.

### Modelo

- **Cada actividad ocurre una sola vez.** No hay sesiones. Si un taller se
  repite, se registra como otra actividad: puede tener otro coordinador y otros
  voluntarios, así que operativamente ya es otra cosa.
- **Todo se organiza por ediciones.** El festival es anual.
- **Cada tipo de persona tiene su propia tabla.** Ponentes, voluntarios y
  asistentes están separados: interesan datos distintos, requieren niveles
  distintos de protección y cada módulo trabaja con la suya.
- **Dentro de cada módulo se separa la persona de su participación.** Un
  asistente que va a cinco actividades es un asistente con cinco registros, no
  cinco filas repitiendo su nombre.
- **Los catálogos son datos, no código**, salvo las opciones de `alerta`, que el
  semáforo reconoce por su texto.

### Arquitectura

- **Sin framework, por ahora.** La señal para reconsiderarlo: cuando se copie la
  misma pantalla por cuarta vez o se pase de doce páginas.
- **La actividad es un panel con módulos.** Un módulo no es una pestaña: son sus
  tablas, su pantalla y sus reglas de acceso.
- **El correo es infraestructura crítica**, no un adorno: por ahí llegan pases,
  confirmaciones e itinerarios.

### Por qué las tablas van separadas

El razonamiento del equipo, que conviene conservar porque justifica el diseño:

> Analizando la tabla de puestos se entiende qué roles se solicitan más.
> Cruzándola con voluntarios, qué preferencias de actividad tienen personas de
> tal edad y tal carrera. Cruzando asistentes con ponentes, quién atrae más
> público y qué conviene potenciar el año siguiente. Manteniendo las preguntas
> de encuesta como elemento separado, cuáles miden mejor el rendimiento.

Cada tabla separada es **una dimensión de análisis**. Ese es el criterio cuando
haya dudas sobre si algo merece tabla propia.

---

## 4 · Modelo de datos completo

18 tablas: 3 de núcleo, 3 de catálogos y 12 en seis módulos.

### Cuentas — sin cambios

```
perfiles          id (= auth.users.id) · correo · nombre · telefono
                  rol ∈ {coordinador, administrador} · creado
```

### Núcleo

```
ediciones         id · anio · nombre · fecha_inicio · fecha_fin
                  cal_inicio · cal_lista · dias_ambar · dias_rojo · activa
                  ↑ absorbe la tabla «ajustes»: ese calendario es de cada año

actividades       id · edicion_id · responsable_id → perfiles
                  titulo · slug · resumen · descripcion · requerimientos
                  eje · tipo · sede
                  fecha · hora_inicio · hora_fin · cupo
                  publica · archivada · creado · actualizado
```

### Catálogos

```
ejes              nombre · color · orden
tipos             nombre · orden
sedes             nombre · direccion · capacidad · orden · activa
```

La tabla `dias` desaparece: la sustituye `actividades.fecha`, acotada por las
fechas de la edición.

### Módulo · Seguimiento — ya existe

```
reportes          id · actividad_id · avance · avances · necesidades
                  problematica · siguiente · alerta · creado
                  ↑ historial de solo agregar: sin UPDATE ni DELETE

seguimiento       actividad_id (PK) · contactado · fecha · medio
                  respuesta · proximo · notas · actualizado
                  ↑ privado de la administración
```

### Módulo · Ponentes

```
ponentes          id · nombre · correo · semblanza · foto_url
                  institucion · sitio · creado
                  ↑ unique(correo) donde no sea nulo. La semblanza se escribe
                    una vez y sirve para todas sus actividades y años

actividad_ponentes  id · actividad_id · ponente_id · papel · orden
                  ↑ «papel» en texto libre: Ponente, Tallerista, Moderadora…
```

### Módulo · Voluntariado

```
vacantes          id · actividad_id · rol · descripcion · cupo
                  hora_inicio · hora_fin · abierta
                  ↑ una fila por puesto. «2 de montaje 8–12» y «3 de registro
                    10–14» son dos vacantes distintas

voluntarios       id · nombre · correo · telefono · escuela · carrera
                  semestre · consentimiento · consentimiento_en · creado
                  ↑ unique(correo). Acumula entre ediciones: esa es la base de
                    datos de voluntarios

postulaciones     id · vacante_id · voluntario_id · estado · token · creado
                  ↑ unique(vacante_id, voluntario_id)
                    estado ∈ {inscrito, confirmado, cancelado}
```

### Módulo · Asistencia

```
asistentes        id · nombre · correo · telefono
                  edad_rango · ocupacion · procedencia
                  consentimiento · consentimiento_en · creado
                  ↑ unique(correo). Permite responder «¿cuántas personas
                    distintas vinieron?»

registros         id · actividad_id · asistente_id · codigo · token
                  estado · creado · asistio_en
                  ↑ unique(actividad_id, asistente_id)
                    «codigo» es corto y legible, para la puerta
                    «asistio_en» se llena al escanear: registrados vs reales
```

### Módulo · Encuesta

```
formularios       id · actividad_id · titulo · token_publico · activo · creado
                  ↑ el QR apunta a /encuesta/?t=<token_publico>

preguntas         id · formulario_id · texto · tipo · opciones (jsonb)
                  obligatoria · orden
                  ↑ tipo ∈ {texto, escala, opcion, si_no}

respuestas        id · formulario_id · creado
                  ↑ sin persona: la encuesta es anónima

respuesta_valores id · respuesta_id · pregunta_id · valor
```

### Módulo · Contenido

```
actividad_imagenes  id · actividad_id · url · pie · portada · orden
                  ↑ los archivos van a Supabase Storage; aquí la referencia
```

### Módulo · Correo

```
envios            id · destinatario · tipo · asunto · estado
                  referencia_id · proveedor_id · creado · entregado_en
                  ↑ tipo ∈ {pase, confirmacion_voluntario, recordatorio, encuesta}
                    Sin esto no se puede responder «¿se envió mi boleto?»
```

### Cómo se cruzan las tablas de personas

Están separadas a propósito y **no se sincronizan**. Para cruzarlas en un
reporte se une por `correo`, siempre normalizado en minúsculas y sin espacios.
Guardar el correo así en las tres tablas es la única convención que hace falta.

---

## 5 · Convenciones del proyecto

### SQL

- Archivos numerados en `sql/`, **idempotentes**: se pueden volver a ejecutar.
- Nombres en español, `snake_case`, tablas en plural.
- **Toda tabla nueva lleva RLS activado y políticas explícitas.** Sin excepción.
- **Toda vista lleva `security_invoker = true`.** Sin eso ignora las reglas por
  fila y entrega todo a cualquiera.
- Validar sin servidor antes de aplicar:
  ```bash
  pip install pglast
  python -c "import pglast,pathlib; [pglast.parse_sql(f.read_text(encoding='utf-8')) for f in pathlib.Path('sql').glob('*.sql')]; print('OK')"
  ```

### Frontend

- Módulos ES nativos. **No funciona abriendo el archivo con doble clic**: hay
  que servir por HTTP (`npx serve public`).
- `assets/js/app.js` concentra el cliente de Supabase, la sesión, los catálogos
  y la traducción de errores. Las páginas solo describen su pantalla.
- `assets/js/cabecera.js` monta la cabecera en todas las páginas.
- Los errores se traducen con `explicar()`: cada mensaje dice qué pasó y qué
  hacer, nunca el error crudo de Supabase.
- CSS con variables en `:root`; la landing va encapsulada bajo `.fdc` porque
  nació para incrustarse en WordPress.

### Interfaz de un módulo

Cada módulo del panel de actividad exporta esta forma:

```js
// assets/js/modulos/voluntarios.js
export default {
  id: 'voluntarios',
  nombre: 'Voluntarios',
  // ¿aplica a esta actividad y a quien la mira?
  aplica: (actividad, perfil) => true,
  // pinta su contenido dentro del contenedor
  montar: async (contenedor, actividad, perfil) => { … },
};
```

Y se registra en `assets/js/modulos/registro.js`:

```js
import avance from './avance.js';
import voluntarios from './voluntarios.js';
export const MODULOS = [resumen, avance, ponentes, voluntarios, cupo, encuesta];
```

**Agregar un módulo = un archivo y un renglón.** El panel solo recorre el
registro. Si añadir el módulo número ocho cuesta más que el tres, algo se rompió.

---

## 6 · Trampas ya encontradas

Todas estas costaron tiempo. Están resueltas, pero vuelven a morder si se
repiten los patrones.

### Base de datos

1. **Un disparador puede bloquear la migración que lo modifica.**
   `proteger_rol` y `proteger_estado` exigen ser administrador, y el editor SQL
   de Supabase no actúa como ningún usuario. Solución: levantar los disparadores
   al principio del archivo y reponerlos al final.

2. **Las vistas ignoran RLS por defecto.** `vista_actividades` habría entregado
   todas las actividades a cualquiera. Se cierra con
   `alter view … set (security_invoker = true)`.

3. **`es_administrador()` debe ser `SECURITY DEFINER`.** Si consultara
   `perfiles` con las reglas del usuario, la política de perfiles la volvería a
   llamar: recursión infinita.

4. **RLS filtra filas, no columnas.** Para impedir que alguien se ascienda solo
   hace falta un disparador aparte.

5. **`format('%I_leer', t)` es un error sutil.** `%I` cita el identificador y el
   sufijo queda fuera de las comillas. Lo correcto: `format('%I', t || '_leer')`.

6. **Una vista bloquea el `drop column` de lo que nombra.** `vista_actividades`
   mencionaba `a.dia`, `a.estado` y `ajuste_int()`, así que la fase A se habría
   detenido a la mitad con «other objects depend on it». Hay que **borrar la
   vista al principio** de la migración y reconstruirla al final, no dejar el
   `drop view` junto al `create view`. Los renombres sí pasan —una vista sigue a
   la columna que cambia de nombre—, pero las eliminaciones no.

7. **Un `update` masivo de migración dispara `marcar_actualizado()`.** Llenar
   una columna nueva en todas las filas pone `actualizado = now()` en todas, y
   el semáforo lee ese dato: la migración falsearía el historial justo antes de
   calcular el color. `alter table … disable trigger user` levanta los
   disparadores propios y deja intactos los internos de las llaves foráneas.

8. **Los archivos SQL viejos no siempre deben poder re-ejecutarse.** La
   convención de idempotencia vale dentro de una misma versión del esquema.
   Entre versiones es al revés: volver a correr 03 o 06 después de 07
   retrocedería el esquema en silencio, y el error aparecería mucho después,
   lejos de su causa. Vale más un candado que se detenga y lo explique.

### Supabase

9. **El cliente JS no lanza excepción en error de red:** devuelve
   `{ data: null, error }`. Un `try/catch` alrededor de `.select()` nunca se
   dispara y la interfaz se queda en blanco sin explicar nada. Hay que revisar
   `.error` explícitamente.

10. **La confirmación de correo debe quedar DESACTIVADA**
   (Authentication ▸ Sign In / Providers ▸ Email ▸ *Confirm email*). Con ella
   activa, `signUp()` no devuelve sesión, la actividad no se puede guardar, y
   cada intento manda un correo que consume la cuota.

11. **El servicio de correo incluido es de desarrollo.** Está fuertemente
   limitado: en la demostración, el segundo registro en pocos minutos falló con
   «demasiados intentos». No sirve para producción.

### Frontend

12. **Cuidado con la especificidad del reset.** `.fdc p` es (0,1,1) y le gana a
   `.fdc-hero__lede` (0,1,0), llevándose por delante colores y tipografías. Se
   usa `.fdc :where(p)`, que queda en (0,1,0): vence a los selectores de
   etiqueta del tema pero nunca a los componentes.

13. **`flex-wrap` en una barra de altura variable la hace crecer sin control.**
    La cabecera lleva altura fija y sin `flex-wrap`: antes de que el contenido
    no quepa, entra el menú plegable.

14. **`--cab-alto` va en `:root`, no en `.cab`.** Las secciones ancladas no son
    descendientes de la cabecera, así que la variable no les llegaría. Se mide
    en vivo con `ResizeObserver`.

15. **El panel de vista previa no renderiza:** no dispara `scroll` ni
    `requestAnimationFrame`, y las transiciones no avanzan. Varios «bugs» eran
    eso. Para verificar, disparar los eventos a mano y leer con la transición
    desactivada.

### Empaquetado

16. **`new Date('2026-10-17')` retrocede un día en Ensenada.** Una fecha sin
    hora se interpreta como medianoche **UTC**, y al imprimirla en un huso
    negativo sale el día anterior: el festival entero corrido. Se comprobó en el
    navegador con la zona real, `America/Tijuana`. Para `actividades.fecha` hay
    que construir la fecha con sus tres componentes —`new Date(a, m-1, d)`— que
    es lo que hace `fechaDia()` en `app.js`. `fecha()` y `fechaHora()` siguen
    sirviendo para los `timestamptz`, que sí traen huso.

17. **`Compress-Archive` de Windows escribe rutas con barra invertida**, lo que
    incumple el formato ZIP y rompe la instalación en servidores Linux. Usar el
    `zipfile` de Python.

---

## 7 · Plan por fases

Cada fase es entregable por sí sola. Las dos primeras son prerrequisito de todo
lo demás.

**Orden recomendado:** A → B → C → D. A partir de la E hace falta resolver el
correo (fase H), que está aplazado por decisión del equipo.

---

### Fase A · Núcleo — **hecha** (22 de agosto de 2026)

**Por qué primero:** es lo único que rompe lo existente. Hacerlo ahora, con dos
actividades de prueba, cuesta una migración; con datos reales encima, cuesta
riesgo.

**Lo que quedó, además de lo planeado:**

- `hora` se renombró a `hora_inicio`, para que la base y el modelo de la
  sección 4 dijeran lo mismo.
- `publica` nace en `false` y solo la administración puede encenderla: hereda el
  papel que tenía `estado`. Lo vigila el disparador `proteger_estado`.
- El `slug` lo genera un disparador a partir del título, y **no se regenera** al
  editarlo: si se regenerara, cada corrección de redacción rompería una
  dirección ya compartida. Es único dentro de la edición, no en toda la base.
- `edicion_id` tiene por omisión `edicion_activa()`, así que el formulario no
  necesita saber en qué año estamos.
- Los días viejos se tradujeron por el `orden` del catálogo, no interpretando
  «Sáb 17 oct»: el número no depende del idioma. «Varios días» y «Por definir»
  quedaron sin fecha, que es lo que significan.

**SQL** — `sql/07-nucleo.sql`

- Crear `ediciones` y sembrar la de 2026 con los valores que hoy están en
  `ajustes` (`cal_inicio` 2026-08-13, `cal_lista` 2026-09-17, festival
  17–24 oct).
- `actividades`: agregar `edicion_id`, `slug`, `resumen`, `publica`.
- Renombrar `actividad` → `titulo` y `dia` (texto) → `fecha` (date).
- Eliminar `estado`: quedó sin uso al retirar la aprobación.
- Eliminar la tabla `dias` y la tabla `ajustes`.
- Reescribir `avance_esperado()` para que lea de la edición activa.
- Reconstruir `vista_actividades` (hay que **borrarla y recrearla**:
  `create or replace view` no admite insertar columnas en medio).

**Frontend**

- `assets/js/app.js`: quitar `dias` de `catalogos()` — hoy se consulta ahí.
- `/registro`: el selector `#dia` pasa a campo de fecha, acotado con `min` y
  `max` desde la edición activa. Ajustar el objeto que se inserta.
- Ajustar `titulo` (hoy `actividad`) y `fecha` en `/mi-actividad` y `/panel`,
  incluidas las columnas del CSV.

**Entregable:** el sistema hace lo mismo que hoy, pero con ediciones y con
fecha real, que es lo que permite ordenar el programa.

---

### Fase B · Panel de actividad y registro de módulos

**Por qué segundo:** establece el patrón sobre el que se construye todo lo
demás, y de paso cierra el hueco de que **hoy no se puede editar una actividad**.

**Frontend**

- Nueva ruta `/actividad/?id=…` con pestañas.
- `assets/js/modulos/registro.js` con la lista de módulos.
- Módulo **Resumen**: ver y **editar** los datos de la actividad. Cierra el hueco.
- Módulo **Avance**: mover aquí el reporte que hoy vive en `/mi-actividad`.
- `/mi-actividad` se queda solo con la lista y el botón de registrar otra.

**Entregable:** el patrón de módulos probado con dos módulos reales antes de
construir los cinco que faltan.

---

### Fase C · Ponentes y contenido

**SQL** — `sql/08-ponentes.sql`: `ponentes`, `actividad_ponentes`,
`actividad_imagenes`.

**Supabase Storage:** crear el bucket `actividades` (público en lectura,
escritura solo autenticados) para fotos de ponentes e imágenes de actividad.

**Frontend:** módulo **Ponentes** (alta, búsqueda entre ponentes existentes para
reutilizar semblanza, asignación con papel) y módulo **Galería**.

**Regla de acceso importante:** un coordinador puede buscar entre **ponentes ya
registrados** —son semipúblicos, van al programa— pero nunca entre voluntarios
ni asistentes.

**Pendiente sin solución automática:** si dos coordinadores capturan al mismo
ponente sin correo, quedan dos filas. Mitigar pidiendo correo cuando exista,
avisando de nombres parecidos y dando a la administración una herramienta para
fusionar.

---

### Fase D · Programa público

**Frontend**

- `/programa/` con las actividades donde `publica = true`, ordenadas por fecha
  y hora, filtrables por día y por eje.
- `/programa/<slug>/` para cada actividad, con ponentes, galería y descripción.

**Netlify:** para que las direcciones con slug funcionen en un sitio estático,
en `netlify.toml`:

```toml
[[redirects]]
  from = "/programa/*"
  to   = "/programa/index.html"
  status = 200
```

La página lee el slug de `location.pathname`.

**Entregable:** la sección «Programa · Próximamente» de la landing se sustituye
por el programa real.

---

### Fase E · Voluntariado

**SQL** — `sql/09-voluntariado.sql`: `vacantes`, `voluntarios`, `postulaciones`.

**Frontend**

- Módulo **Voluntarios** en el panel: crear vacantes (rol libre, cupo, horario),
  ver quién se inscribió, dar de alta voluntarios directamente.
- `/voluntariado/` público: bolsa de vacantes abiertas, tipo ofertas de trabajo,
  filtrable por día y por tipo de apoyo.
- `/voluntariado/?v=<id>` para inscribirse: nombre, correo, escuela, carrera,
  más la casilla de consentimiento.
- `/mi-postulacion/?t=<token>` para confirmar o cancelar sin cuenta.

**Reglas de acceso**

- El coordinador ve solo las postulaciones a vacantes de **sus** actividades.
- La administración ve todas.
- Cualquiera puede leer las vacantes abiertas; nadie puede leer `voluntarios`
  sin ser coordinador de la vacante correspondiente o administrador.

**Depende de:** el correo (fase H) para confirmar inscripciones.

---

### Fase F · Asistencia

**SQL** — `sql/10-asistencia.sql`: `asistentes`, `registros`.

**Frontend**

- `/programa/<slug>/` gana el botón de registrarse cuando hay `cupo`.
- Formulario corto: nombre, correo, datos demográficos mínimos, consentimiento.
- `/mi-pase/?t=<token>`: muestra el código y permite cancelar, lo que **devuelve
  el lugar al cupo**.
- Vista de puerta para el día del evento: buscar por código y marcar asistencia.
- Módulo **Cupo** en el panel: cuántos van, quiénes, exportar lista.

**Aviso de privacidad:** esta fase no puede publicarse sin él. Ver sección 8.

**Depende de:** el correo (fase H) para mandar el pase.

---

### Fase G · Encuesta

**SQL** — `sql/11-encuesta.sql`: `formularios`, `preguntas`, `respuestas`,
`respuesta_valores`.

**Frontend**

- Módulo **Encuesta**: constructor de preguntas (texto, escala, opción múltiple,
  sí/no), con orden y obligatoriedad.
- Generación del QR. Sin dependencias externas: incorporar una biblioteca
  pequeña de QR en `assets/js/vendor/` (licencia permisiva) y dibujar en
  `<canvas>`. Descargable en PNG para imprimir o proyectar.
- `/encuesta/?t=<token_publico>` pública y anónima.
- Concentrado de respuestas en el panel, con gráficas simples.

**Decisión de diseño:** las preguntas son filas, no un JSON dentro del
formulario. Así se puede analizar qué preguntas se repiten entre actividades y
cuáles miden mejor — que es justo lo que pidió el equipo.

---

### Fase H · Correo — aplazada por decisión del equipo

**Estado: pospuesta.** Se descartó el SMTP institucional del CNyN por la
burocracia que implica. La contratación de un proveedor se analizará más
adelante.

**Consecuencia que hay que tener presente:** las fases **E, F y G dependen del
correo** para confirmar inscripciones, mandar pases e invitar a la encuesta.
Se pueden construir sin él y dejar el envío desconectado, pero **no se pueden
poner en producción** hasta resolverlo. Las fases **A, B, C y D no lo
necesitan**: hay bastante trabajo por delante antes de que esto bloquee.

**Aclaración importante para no perder tiempo:** pagar el plan de Supabase
**no resuelve el envío de pases**. El SMTP que se configura en Supabase sirve
solo para los correos de autenticación —confirmación y recuperación de
contraseña—. Los correos de la aplicación (pase de asistencia, confirmación de
voluntariado, recordatorios) salen de una función propia que llama a la API de
un proveedor. Son dos cosas distintas y hacen falta las dos.

**Opciones cuando se retome.** Límites verificados en agosto de 2026:

| Proveedor | Gratis | Nota |
|---|---|---|
| Brevo | 300/día | El mejor gratuito para producción |
| MailerSend | ~3.000/mes | Alternativa |
| Resend | 100/día | **Se agota el primer día de registro abierto** |
| ~~SMTP del CNyN~~ | — | Descartado: demasiada burocracia |

Para un festival con cientos de pases, 100/día no alcanza. Brevo es el punto de
partida razonable; hay que estimar el pico, porque si se esperan más de 300
registros en un día hace falta plan de pago ese mes. El costo típico ronda los
20 USD mensuales y solo durante la temporada del festival.

**Configuración**

1. Verificar el dominio del remitente (registros SPF y DKIM en Cloudflare).
2. Supabase ▸ Project Settings ▸ Authentication ▸ SMTP Settings: apuntar al
   proveedor. Esto arregla de paso la recuperación de contraseña.

**Código** — primer componente del lado del servidor del proyecto

- Supabase Edge Function `enviar-correo` (Deno): recibe plantilla, destinatario
  y datos; llama al proveedor; escribe en `envios`.
- La llave del proveedor va en los secretos de la función, **nunca en el
  frontend**.
- `sql/12-correo.sql`: tabla `envios`.

**Plantillas necesarias:** pase de asistencia, confirmación de voluntariado,
recordatorio de actividad, invitación a la encuesta.

---

### Fase I · Promoción y reportes

Sin tablas nuevas: son lecturas de lo ya modelado.

- **Generador de publicaciones:** con título, resumen, ponente, fecha, sede e
  imagen de portada, arma el texto y una pieza gráfica en `<canvas>` con la
  identidad del festival. Descargable.
- **Reportes:** asistentes únicos por edición, actividades con más demanda,
  roles de voluntariado más solicitados, cruce de carrera y edad contra tipo de
  actividad, resultados de encuestas por actividad y por eje.

Estos reportes son la razón de que las tablas estén separadas. Si el modelo está
bien, son consultas; si no, son imposibles.

---

## 8 · Datos personales

**Bloquea la fase F.** En cuanto se capturen asistentes y voluntarios, el
proyecto entra en la Ley Federal de Protección de Datos Personales en Posesión
de los Particulares. Siendo un proyecto de la UNAM, conviene resolverlo antes.

Hacen falta tres cosas:

1. **Aviso de privacidad** publicado en el sitio (`/privacidad`), que diga qué se
   recoge, para qué y por cuánto tiempo.
2. **Casilla de consentimiento** en cada formulario que pida datos, **sin marcar
   por omisión**. Por eso `voluntarios` y `asistentes` llevan `consentimiento` y
   `consentimiento_en`.
3. **Forma de darse de baja** y de pedir que se borren los datos. La liga con
   token del correo sirve.

Técnicamente es poco trabajo. Lo que toma tiempo es **quién redacta y aprueba el
aviso dentro del CNyN**, y por eso hay que moverlo desde ahora.

---

## 9 · Decisiones pendientes

Preguntar antes de construir la fase correspondiente.

| Pregunta | Bloquea | Por qué importa |
|---|---|---|
| ¿El cupo se cuenta por persona o por lugares? | Fase F | Si alguien puede apartar para acompañantes, `registros` necesita un campo más y el conteo cambia |
| ¿Un voluntario puede tomar turnos que se empalmen? | Fase E | Define si hay que avisar de choques de horario |
| ¿Qué datos demográficos se piden? | Fase F | Cada campo extra baja la conversión. Fijar el mínimo que de verdad se vaya a leer |
| ¿Hay registro de entrada el día del evento? | Fase F | Define si hace falta la vista de puerta |
| ¿La semblanza se edita en un solo lugar? | Fase C | Como está, editarla la cambia en todas las actividades de ese ponente |
| ¿Qué proveedor de correo se contrata? | Fases E, F, G | Aplazado. Hay que resolverlo antes de poner en producción cualquier módulo que mande correo |

---

## 10 · Cómo trabajar

```bash
# servir en local (los módulos ES no funcionan con file://)
npx serve public

# validar el SQL antes de aplicarlo
python -c "import pglast,pathlib; [pglast.parse_sql(f.read_text(encoding='utf-8')) for f in pathlib.Path('sql').glob('*.sql')]; print('OK')"
```

Los archivos SQL se ejecutan a mano en Supabase ▸ SQL Editor, en orden numérico.
Después de cada uno, correr `sql/00-verificar.sql`.

Netlify publica solo en cada push a `main`. No hay comando de compilación:
`netlify.toml` publica `public/` tal cual.

### Documentos de apoyo

En `documentos/`, fuera del repositorio, hay cuatro páginas HTML autónomas con
el análisis que llevó a estas decisiones: arquitectura general, estado del
sistema, el razonamiento del modelo y el mapa de la base de datos.

---

## 11 · Principio que ordena las prioridades

> **La base de datos es cara de cambiar; el frontend es barato.**
> Una pantalla se rehace en una tarde. Un esquema con datos encima se migra con
> cuidado y con riesgo.

Ante la duda, invertir el esfuerzo de diseño en el modelo y dejar que la
interfaz evolucione.

Y la prueba que resuelve casi todas las dudas de modelado:

> **¿Puede haber más de uno?** Si la respuesta es sí, no es un campo: es una
> tabla. Y si ese «uno» tiene datos propios —un cupo, un horario, un orden— con
> más razón.
