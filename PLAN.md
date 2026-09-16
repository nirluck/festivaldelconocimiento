# Plan de trabajo · Sistema del Festival del Conocimiento

> **Para quien retome este proyecto.** Aquí está el estado real, las decisiones
> ya tomadas y por qué, el modelo de datos completo y la ruta módulo por módulo.
> Léelo antes de escribir código: varias decisiones costaron discusión y no
> conviene volver a abrirlas sin motivo.

Última actualización: **16 de septiembre de 2026**

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
- Página del coordinador: la lista de sus actividades
- **Panel de actividad `/actividad/?id=…` con módulos: Resumen (ver y editar
  todos los datos) y Avance (el reporte y su historial).** Cierra el hueco de
  edición que existía desde el principio
- Tablero de administración con semáforo, filtros y exportación CSV
- **Programa público `/programa/`**: cartelera por día, filtrable, con ficha
  por actividad en `/programa/<slug>/`. La landing muestra las tres próximas
- **`/panel/programa/`**: la administración arma el programa arrastrando de la
  bandeja a los ocho días. Publicar exige día, hora y sede, y avisa de empalmes
- Cabecera unificada en el sitio
- **Base de boletos (F1)** aplicada en Supabase el 16 de septiembre de 2026
- **Conseguir boleto (F2)** escrito y probado contra la base de prueba; **por
  publicar**: `/b/<slug>`, `/boleto/`, `/mis-boletos/` y el recuadro en la
  ficha del programa

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
| `sql/08-cupo.sql` | **Captura primero.** Agrega `cupo` a las actividades |
| `sql/09-programa.sql` | **Fase D.** Abre el programa a quien no tiene cuenta |
| `sql/10-poster.sql` | **Adelanto de C.** Póster de la actividad y el bucket `actividades` de Storage |
| `sql/11-boletos.sql` | **Fase F1.** Boletos, aforo, puerta y panel |
| `sql/00-verificar.sql` | No crea nada: comprueba que todo quedó bien |

**03 y 06 ya no se vuelven a ejecutar.** Describen el esquema anterior a 07 y
volver a aplicarlos lo haría retroceder en silencio: 03 reinstala
`es_coordinacion()` y un `proteger_estado()` que lee la columna `estado`, que ya
no existe; 06 reconstruye la vista vieja. Los dos llevan un candado al principio
que se detiene y lo explica.

`sql/05-coordinador.local.sql` lleva contraseña y está en `.gitignore`.

### Huecos conocidos

- **Edición resuelta (fase B).** Coordinador y administración editan una
  actividad desde el módulo Resumen del panel.
- **El póster ya se captura; los ponentes y la galería todavía no.** El póster
  se adelantó de la fase C (14 de septiembre) y sale en la cartelera, la ficha
  y la landing. Faltan ponentes, galería y cupos de voluntariado (fase C y las
  mitades de captura de E y G).
- **Las vistas previas al compartir una actividad son genéricas.** Sin paso de
  compilación, `/programa/<slug>/` es la misma página para todas y las redes no
  ejecutan JavaScript. Explicado en la fase D.
- **Las sedes no tienen dirección.** La columna existe desde
  `09-programa.sql` pero está vacía; llenarla mejora la ficha de cada actividad.
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
- **Boletos (16 de septiembre de 2026):** hasta 4 lugares por boleto; se pide
  rango de edad y ocupación, y la procedencia es opcional; en la puerta hay
  voluntarios sin cuenta, que entran con una clave de puerta; el sobrecupo va
  incluido en el `cupo` que captura el coordinador. Detalle en la fase F.

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
                  fecha · hora_inicio · hora_fin · cupo · poster
                  publica · archivada · publicada_en · creado · actualizado
                  ↑ «poster» es la RUTA en Storage, no la URL. Ver fase C
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

### Módulo · Boletos y asistencia

El detalle y sus razones están en la fase F. `registros` se renombró a
`boletos` antes de crearse.

```
aforos            actividad_id (PK) · emitidos · en_espera · asistieron
asistentes        id · nombre · correo · telefono · edad_rango · ocupacion
                  procedencia · consentimiento_en · token · creado
                  ↑ unique(correo)
boletos           id · actividad_id · asistente_id · codigo · token
                  lugares · estado · origen · creado · cancelado_en
                  asistio_en · asistieron · marcado_por
                  ↑ unique(actividad_id, asistente_id)
puertas           id · actividad_id · token · etiqueta · activa · creado
intentos          ip · creado   ← límite por IP, se purga sola
```

`actividades` gana `acceso · boletos_desde · boletos_hasta · lugares_max`.

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
actividad_imagenes  id · actividad_id · ruta · pie · orden
                  ↑ los archivos van a Supabase Storage; aquí la referencia
                  ↑ SIN «portada»: la imagen destacada es actividades.poster.
                    Tener las dos sería tener dos verdades sobre cuál es
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

### Boletos (fase F)

18. **Supabase concede TODO a `anon` y `authenticated` sobre cada tabla y
    función nueva de `public`.** Un `revoke … from public` no lo quita: hay que
    nombrar a los dos roles. Por lo mismo, las comprobaciones de fugas por
    columna deben filtrar `privilege_type = 'SELECT'`: la de `09-programa.sql`
    marca «FUGA» por los permisos de escritura por omisión, que RLS ya
    bloqueaba. `11-boletos.sql` los retira de `actividades` de todos modos,
    porque `TRUNCATE` no pasa por RLS.

19. **Un `DEFAULT` se evalúa con los permisos de quien inserta.** La columna
    `puertas.token` tenía `default token_nuevo()`, función cerrada a
    propósito, y un coordinador no podía crear claves de puerta. La clave la
    pone ahora el disparador, que es `security definer`.

20. **`inicio_actividad(fecha, null)` es la medianoche, no nulo.** Calcular el
    fin como `coalesce(inicio_actividad(fecha, hora_fin), …)` hacía que una
    actividad sin hora de término «terminara» antes de empezar, y el empalme
    nunca se detectaba. Para el fin se usa `fin_actividad()`.

21. **Una excepción deshace también lo que la función ya escribió.** Si
    `solicitar_boleto` lanzara excepciones, el registro del intento se
    revertiría y el límite por IP no contaría los intentos fallidos. Por eso
    responde `{ok: false, error}`.

22. **Git Bash en Windows reescribe las rutas que empiezan con `/`.**
    `docker exec … -f /tmp/uno.sql` llega como `C:/Users/…/Temp/uno.sql` y
    falla. Hay que poner `export MSYS_NO_PATHCONV=1` antes del comando.

---

## 7 · Plan por fases

Cada fase es entregable por sí sola. Las dos primeras son prerrequisito de todo
lo demás.

**Orden recomendado:** A → B → D → **F** → C. A, B y D están hechas. F se
adelanta porque los boletos tienen que abrirse antes del festival y se lanza sin
correo (ver su sección); E y G sí esperan a la fase H.

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

### Fase B · Panel de actividad y registro de módulos — **hecha** (24 de agosto de 2026)

**Por qué segundo:** establece el patrón sobre el que se construye todo lo
demás, y de paso cierra el hueco de que antes **no se podía editar una actividad**.

**Frontend**

- Ruta `/actividad/?id=…` con pestañas (`public/actividad/index.html`).
- `assets/js/modulos/registro.js`: la lista de módulos. Agregar uno es un
  archivo y un renglón.
- Módulo **Resumen** (`modulos/resumen.js`): ver y **editar** los datos.
- Módulo **Avance** (`modulos/avance.js`): el reporte, movido desde `/mi-actividad`.
- `/mi-actividad` quedó solo con la lista; la tarjeta abre el panel. Las ligas
  viejas `/mi-actividad/?id=…` se redirigen a `/actividad/?id=…`.

**Cómo edita cada quien:** el módulo Resumen manda a la base solo los campos
editables —nunca `slug`, `edicion_id` ni `responsable_id`, así que la dirección
pública no se regenera ni se pierde el dueño—. El interruptor `publica` solo lo
ve y lo cambia la administración; lo respalda el disparador `proteger_estado`.

**Entregable:** el patrón de módulos, probado con dos módulos reales antes de
construir los que faltan.

---

### Fase C · Ponentes y contenido — después de F (mitad de captura)

**SQL** — `sql/11-ponentes.sql`: `ponentes`, `actividad_ponentes`,
`actividad_imagenes`. (El 09 lo tomó el programa público, el 10 el póster y el
11 los boletos, que se adelantaron; así que esta fase será `12-ponentes.sql` y
las demás corren en consecuencia: 13-voluntariado, 14-encuesta, 15-correo.)

#### Hecho por adelantado: el póster (14 de septiembre de 2026)

Lo pidió el equipo antes que el resto de la fase. Cada actividad tiene **un**
póster que funciona como imagen destacada.

- **Columna `actividades.poster`**, no fila en `actividad_imagenes`: póster hay
  uno, y la prueba de «¿puede haber más de uno?» dice columna. La galería sigue
  siendo tabla, ya sin su bandera `portada`.
- **Guarda la ruta, no la URL.** La URL lleva dentro el identificador del
  proyecto de Supabase; si algún día se migra, todas las guardadas se romperían.
  La arma `assets/js/archivos.js`.
- **La restricción `actividades_poster_en_su_carpeta`** exige que la ruta empiece
  por el id de la propia actividad. Sin ella, un coordinador podría escribir la
  ruta del póster de otra actividad en la suya.
- **Bucket `actividades`**, público en lectura, 5 MB y solo WebP o JPEG. Cuatro
  políticas en `storage.objects` —ver, subir, cambiar, borrar— que dejan tocar
  solo la carpeta `<id>/` de una actividad propia o, a la administración,
  cualquiera. La regla vive en `puede_editar_actividad(texto)`, que recibe la
  carpeta como texto para que una ruta mal formada niegue el permiso en vez de
  reventar con un error de uuid.
- **Se optimiza en el navegador** (`assets/js/subir-poster.js`): un póster de
  Canva pesa 5–15 MB y el plan gratuito de Supabase no redimensiona. Se generan
  dos archivos, `poster-<sello>.webp` (1600 px) y `poster-<sello>-mini.webp`
  (640 px). WebP si el navegador lo sabe codificar, JPEG si no. La miniatura es
  la misma ruta con `-mini`: una convención y no una segunda columna, para que
  no puedan desincronizarse.
- **El sello cambia en cada subida**, así que cada archivo es inmutable y se
  guarda en caché un año sin que nadie vea una versión vieja.
- **Orden de la subida:** subir las dos → escribir la ruta → borrar las
  anteriores. Si falla la escritura se borran las recién subidas y el póster
  anterior queda intacto; si falla el borrado final quedan huérfanos invisibles,
  que es el fallo barato.

**Dónde se sube.** Al registrar la actividad (opcional: casi nadie tiene el
póster ese día) o después, desde el módulo **Póster** del panel. Lo sube el
coordinador dueño o la administración. En el registro el póster se sube
*después* de crear la actividad, porque necesita su id; si esa subida falla la
actividad ya quedó guardada y «Mis actividades» avisa que falta.

**Dónde se ve.** Miniatura en la cartelera, en la landing, en «Mis
actividades» y en «Armar programa»; completo en la ficha de la actividad. El
diálogo de «Programar» avisa cuando una actividad no tiene póster.

**`vista_actividades` no se tocó.** Es la vista del semáforo, ciento y pico
líneas, y reconstruirla por una columna es el riesgo de las trampas 6 y 8. Las
pantallas que la usan piden el póster aparte con una consulta de una línea.

**Lo que falta para la galería:** la tabla, su módulo y reutilizar
`subir-poster.js` —la preparación de imágenes ya sirve tal cual—.

**Nota de captura primero:** capturar ponentes e imágenes NO necesita correo.
Lo que depende de fases posteriores es *mostrarlos* en el programa público
(fase D), no capturarlos. Por eso es el siguiente paso natural para que el
coordinador registre la mayor cantidad de datos.

**Supabase Storage:** el bucket `actividades` **ya existe** desde
`10-poster.sql`. Las fotos de ponentes necesitarán su propia carpeta y sus
políticas: las de hoy solo dejan escribir en `<id de actividad>/`, y un ponente
no pertenece a una sola actividad.

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

### Fase D · Programa público — **hecha** (10 de septiembre de 2026)

Se adelantó a la fase C por decisión del equipo: se quería la cartelera antes
que los ponentes. La consecuencia está asumida —las tarjetas no llevan foto ni
nombre de quien imparte— y el diseño deja el hueco para que la fase C entre sin
rehacer nada.

**SQL** — `sql/09-programa.sql`

- `sedes` gana `direccion` y `capacidad`, que el modelo de la sección 4 ya
  documentaba y 01-esquema nunca creó. Nacen vacías; llenarlas mejora la ficha
  de cada actividad, que es donde se muestra la dirección.
- `actividades` gana `publicada_en`, que llena el disparador
  `sellar_publicacion` y **nadie puede escribir a mano**: si se pudiera, el
  «Nuevo» de la cartelera se podría falsear. Al despublicar se borra, así que
  volver a publicar cuenta como novedad otra vez, que es lo que de verdad pasó.
- Política `actividades_ver_publicas` para `anon` **y `authenticated`**: sin la
  segunda, un coordinador que abriera /programa/ vería solo sus actividades y
  creería que el programa está casi vacío.
- **Permisos por columna para `anon`.** Es la pieza importante y está explicada
  más abajo.
- `vista_programa`, con `security_invoker = true`, es la única lectura del sitio
  sin sesión.
- Índice parcial `actividades_programa (edicion_id, fecha, hora_inicio)`.

**Frontend público**

- `/programa/` · cartelera en **agenda por día**: los ocho días como pastillas
  fijas, y dentro de cada uno las actividades en orden de hora, con carril de
  horas teñido del color del eje, lomo de color, resumen, sede y cupo. Filtros
  por eje, sede y tipo. En celular los filtros se pliegan tras un botón
  —desplegados dentro de una barra pegajosa se comían 350 px de 812— y el
  selector de días se queda siempre visible.
- Abre en el día de hoy si el festival está ocurriendo; si no, en «Todo».
- `/programa/<slug>/` · ficha con los datos en una tarjeta lateral pegajosa,
  descripción, botones para compartir y «ese mismo día».
- Hoja de impresión: un festival se imprime y se pega en la pared.
- La landing sustituye «Próximamente» por las tres próximas actividades
  (`assets/js/programa-portada.js`), **sin cargar supabase-js**: es un `fetch`
  contra la API REST. Si falla, o si todavía no hay nada publicado, el HTML de
  «Próximamente» se queda tal cual, que es exactamente la verdad.

**Frontend de administración**

- `/panel/programa/` · bandeja de lo no publicado y los ocho días en columnas.
- **Publicar exige día, hora y sede.** Un renglón sin sede en una cartelera no
  le sirve a nadie, así que el interruptor suelto no basta: se abre un diálogo
  donde la administración confirma las tres cosas, con la fecha que propuso el
  coordinador a la vista cuando no coincide con la que se va a publicar.
- **Los empalmes se avisan, no se bloquean:** una sede puede tener dos salas.
  Sin hora de término se supone una hora, que es lo que dura una charla; como
  es una suposición y no un dato, no puede impedir nada.
- Arrastrar es un acelerador de escritorio, no el mecanismo: todo se puede
  hacer con el botón «Programar», que funciona con el dedo. Mover algo ya
  publicado de un día a otro escribe directo —es reversible y se ve al
  instante—; sacar algo de la bandeja siempre pasa por el diálogo, porque ahí
  falta información que confirmar.

**Netlify**

```toml
[[redirects]]
  from = "/programa/*"
  to   = "/programa/index.html"
  status = 200
```

La página lee el slug de `location.pathname`. **Ojo:** esta regla tapa
cualquier archivo que se agregue bajo `/programa/`; si algún día hace falta un
`/programa/programa.pdf`, necesita una regla anterior que lo excluya.

#### Cómo se protege el programa público

Hasta ahora la única política de `actividades` era `to authenticated`. Abrirla
a `anon` con una política sola habría dejado que cualquiera pidiera

```
GET /rest/v1/actividades?select=requerimientos
```

y se llevara los requerimientos internos de cada actividad. **RLS filtra filas,
no columnas** (trampa 4 de la sección 6). El mecanismo que sí filtra columnas
son los permisos por columna de PostgreSQL, y el archivo usa los dos: la
política decide QUÉ FILAS y el permiso por columna decide QUÉ CAMPOS. Así la
vista conserva `security_invoker = true`, como manda la convención, sin que eso
abra la tabla entera.

`anon` **no** puede leer `requerimientos`, `responsable_id`, `creado` ni
`actualizado`. La comprobación 4 al final de `09-programa.sql` lo verifica y
dice «REVISAR: FUGA» si alguna vez deja de ser cierto.

`authenticated` sí puede leer esas columnas de las actividades publicadas,
porque 03-rls.sql le dio `grant select` a la tabla completa. Se acepta a
propósito: el registro es por invitación, los coordinadores son parte del
equipo y ahí no hay datos personales de terceros.

#### Limitación conocida: las vistas previas al compartir

Como no hay paso de compilación, `/programa/<slug>/` es la misma página
estática para todas las actividades. Facebook y WhatsApp leen el HTML sin
ejecutar JavaScript, así que **la vista previa de cualquier actividad muestra el
título y la imagen genéricos del programa**, no los suyos. Para un festival que
se difunde por redes esto importa y conviene tenerlo presente.

Las dos salidas, cuando se quiera resolver: una función de Netlify que sirva las
etiquetas `og:` según el slug, o un paso de compilación que genere un archivo
por actividad. Las dos rompen la regla de «sin paso de compilación» de la
sección 3, y por eso no se tomó ninguna todavía.

#### Lo que le falta cuando llegue la fase C

La imagen ya llegó: el póster (ver «Hecho por adelantado» en la fase C). Falta
una línea de ponentes bajo el título, y la galería en la columna de texto de la
ficha.

**Entregable:** la cartelera completa, pública, y armable desde el tablero.

---

### Fase E · Voluntariado

**SQL** — `sql/12-voluntariado.sql`: `vacantes`, `voluntarios`, `postulaciones`.

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

### Fase F · Boletos y asistencia — **la siguiente** (planeada el 16 de septiembre de 2026)

Se adelanta a C por decisión del equipo. El festival es gratuito, pero se pide
boleto por tres razones, y cada una exige algo distinto del sistema:

| Para qué | Qué exige |
|---|---|
| **Controlar el aforo** de cada actividad | Un conteo que nunca se pase del cupo, ni con cien personas pidiendo a la vez |
| **Medir la intención de asistencia** | Guardar también la demanda que NO cupo, y de dónde llegó cada persona |
| **Saber quién vino de verdad** | Registrar la entrada en la puerta, para comparar boletos contra asistencia real |

**Calendario.** Hoy es 16 de septiembre y el festival abre el 17 de octubre. Si
los boletos se abren el **1 de octubre**, la gente tiene dos semanas y media
para conseguirlos. La fase se parte para llegar a esa fecha con lo
indispensable y construir la puerta mientras el registro ya corre:

| Etapa | Qué entrega | Meta |
|---|---|---|
| F1 · Base | Tablas, reglas, funciones de emisión y cancelación | 19 sep |
| F2 · Conseguir boleto | Formulario, boleto en pantalla, QR de cada actividad | 25 sep |
| F3 · Panel | Módulo Boletos, tablero de aforo, exportación | 29 sep |
| — | **Apertura del registro** (requiere el aviso de privacidad, sección 8) | **1 oct** |
| F4 · Puerta | Escáner, búsqueda, entrada sin boleto, funciona sin red | 10 oct |
| F5 · Correo | Mandar el boleto, recordatorio, «libera tu lugar» | cuando exista la fase H |

#### Decisión: se lanza sin correo

El plan original hacía depender esta fase del correo (fase H), que sigue
aplazada. Esperar significaría no tener boletos este año. **El boleto se
entrega en pantalla** y la persona se lo lleva de cuatro maneras, ninguna de las
cuales necesita un proveedor:

1. Queda guardado en el navegador de su teléfono (`/mis-boletos/`).
2. Botón «Guardar imagen»: el boleto como PNG, con su QR, para la galería.
3. Botón «Agregar a mi calendario»: un `.ics` generado en el navegador.
4. La liga del boleto, para copiarla o mandársela por WhatsApp.

**Si lo pierde, no pasa nada grave:** en la puerta se busca por nombre o correo.
Cuando llegue el correo, se manda el boleto además de todo esto, no en su
lugar.

El precio de lanzar sin correo es que **no se verifica que el correo sea de
quien lo escribe**. Las defensas contra quien quiera acaparar lugares están en
«Contra el acaparamiento», más abajo.

#### Dos QR distintos

La palabra «QR» nombra dos cosas que no hay que confundir:

| | QR de la actividad | QR del boleto |
|---|---|---|
| **Qué es** | Una liga para conseguir boleto | La credencial de entrada de una persona |
| **Cuántos** | Uno por actividad (y uno general del programa) | Uno por boleto |
| **Dónde vive** | Carteles, pantallas, redes, volantes | En el teléfono de la persona |
| **Apunta a** | `/b/<slug>?o=cartel` | `/boleto/#<token>` |
| **Quién lo escanea** | El público | El personal en la puerta |
| **Es secreto** | No | Sí: quien lo tiene, entra |

El QR del boleto es una liga completa a propósito: si la persona lo escanea con
su cámara, ve su boleto; si lo escanea la puerta, extrae el token. El token va
**después del `#`**, no en `?t=`: el fragmento nunca viaja al servidor, así que
no queda en los registros de Netlify ni se filtra en el `Referer`.

#### Tres modos de acceso por actividad

No todas las actividades necesitan boleto. Un desfile no tiene aforo; un taller
de microscopía con doce microscopios, sí. Y entre los dos hay un caso que al
equipo le interesa: actividades abiertas donde se quiere saber cuánta gente
piensa ir.

| Modo | Qué ve el público | Cupo | Para qué sirve |
|---|---|---|---|
| `libre` | «Entrada libre» | No aplica | Desfile, concierto al aire libre |
| `registro` | «Confirma tu asistencia» | Sin tope | Medir intención sin limitar la entrada |
| `boleto` | «Consigue tu boleto» | Obligatorio | Aforo real |

Lo decide la administración al publicar, con lo que propuso el coordinador a la
vista. `boleto` exige cupo; el diálogo de «Programar» lo pide igual que pide
día, hora y sede.

#### Modelo de datos

**Cambia el nombre de la tabla del plan original: `registros` pasa a
`boletos`.** «Registro» ya nombra tres cosas en este proyecto —la página
`/registro`, el archivo `modulos/registro.js` y el alta del coordinador— y una
cuarta volvería ambigua cada conversación.

```
actividades       + acceso ∈ {libre, registro, boleto}   default 'libre'
                  + boletos_desde · boletos_hasta (timestamptz, nulos)
                  + lugares_max  smallint default 4   ← por boleto
                  ↑ nulos en las fechas = abre al publicar, cierra al
                    empezar la actividad

aforos            actividad_id (PK) · emitidos · en_espera · asistieron
                  · actualizado
                  ↑ contadores. Los mantiene la función de emisión, bajo
                    candado. Es la ÚNICA cosa de este módulo que lee «anon»

asistentes        id · nombre · correo · telefono
                  · edad_rango · ocupacion · procedencia
                  · consentimiento_en · token · creado
                  ↑ unique(correo). Correo en minúsculas y sin espacios,
                    como en el resto de las tablas de personas (sección 4)
                  ↑ «token» es personal: servirá para «todos mis boletos»
                    cuando exista el correo. Nunca se devuelve en pantalla

boletos           id · actividad_id · asistente_id (nulo en entradas sin boleto)
                  · codigo · token · lugares · estado · origen
                  · creado · cancelado_en · asistio_en · asistieron
                  · marcado_por → perfiles
                  ↑ unique(actividad_id, asistente_id)
                  ↑ estado ∈ {activo, espera, cancelado}
                  ↑ origen ∈ {cartel, programa, ficha, portada, redes,
                              puerta, grupo, panel, otro}
                  ↑ «codigo» es corto y legible para la puerta: 6 caracteres
                    sin letras confundibles (sin 0/O, 1/I/L). Único por edición
                  ↑ «token» es largo y secreto: 32 bytes aleatorios

puertas           id · actividad_id · token · etiqueta · activa · creado
                  ↑ una clave de puerta por actividad, revocable. Ver F4
```

**Por qué `aforos` es tabla aparte y no dos columnas en `actividades`.** Cada
boleto emitido actualizaría la actividad, y eso dispara `marcar_actualizado()`:
el semáforo leería cada boleto como si el coordinador hubiera trabajado (trampa
7). Además `aforos` se puede abrir a `anon` completa, sin permisos por columna.

**Por qué `asistio_en` y `asistieron` son dos datos.** Un boleto de cuatro
lugares puede llegar con tres personas. `asistio_en` dice cuándo se presentó;
`asistieron`, cuántos entraron. La tasa de inasistencia sale de comparar
`lugares` contra `asistieron`.

**Por qué `origen`.** Es la respuesta a «¿de dónde llega la gente?». El QR del
cartel lleva `?o=cartel`; la liga de la cartelera, `?o=programa`; una
publicación de Facebook, `?o=redes`. Cuesta un parámetro y convierte cada boleto
en un dato de promoción.

**Entradas sin boleto.** Quien llega a la puerta sin boleto y cabe, se registra
como boleto con `origen = 'puerta'` y `asistente_id` nulo —o con nombre y
correo, si da tiempo—. Así el aforo cuenta a todos los que están adentro.

#### Reglas de acceso

**Nadie sin cuenta escribe ni lee `asistentes` ni `boletos` directamente.** Ni
`insert` ni `select` para `anon`. Todo pasa por funciones `security definer`
con `set search_path = public`, que hacen las comprobaciones y devuelven solo lo
necesario:

| Función | Quién | Qué hace |
|---|---|---|
| `solicitar_boleto(slug, datos, lugares, origen)` | anon | Emite el boleto, o lo pone en espera, o explica por qué no |
| `ver_boleto(token)` | anon | Lo que muestra la pantalla del boleto, y nada más |
| `cancelar_boleto(token)` | anon | Libera los lugares |
| `buscar_en_puerta(actividad, texto)` | personal | Por código, nombre o correo |
| `marcar_entrada(actividad, token o código, asistieron)` | personal | Registra la entrada |
| `entrada_sin_boleto(actividad, cuantos, datos)` | personal | Cuenta a quien llega sin boleto |
| `lista_puerta(actividad)` | personal | La lista para trabajar sin red |

«Personal» es: el coordinador dueño de la actividad, la administración, o quien
tenga una clave de puerta vigente de **esa** actividad.

El coordinador ve en su panel los boletos de sus actividades, incluidos nombre y
correo: los necesita para su lista. **No ve los datos demográficos uno por uno**,
solo agregados. La administración ve todo.

#### Cómo se emite un boleto sin pasarse del cupo

El problema: cien personas piden el último lugar al mismo tiempo. Contar y
luego insertar deja pasar a varias.

`solicitar_boleto` hace, dentro de una sola transacción:

1. Valida el formulario y el consentimiento.
2. Busca la actividad por slug: publicada, `acceso <> 'libre'`, ventana abierta.
3. **`select … from aforos where actividad_id = … for update`**. Desde aquí,
   cualquier otra petición para la misma actividad espera su turno. Las de
   otras actividades no esperan.
4. Busca o crea a la persona por correo. **No sobrescribe** nombre ni datos de
   una persona existente: quien escribe un correo ajeno no puede cambiarle el
   nombre a nadie.
5. Si ya tiene boleto activo para esa actividad → «ya tienes boleto» (ver
   abajo por qué no se devuelve).
6. Aplica los límites de «Contra el acaparamiento».
7. Si `emitidos + lugares <= cupo` → boleto `activo`. Si no → `espera`.
   En modo `registro` no hay tope.
8. Actualiza `aforos` y devuelve `{estado, codigo, token, actividad}`.

Las respuestas de error son códigos (`agotado`, `cerrado`, `duplicado`,
`limite`, `empalme`…) que `explicar()` traduce, como el resto del sitio.

**Por qué no se devuelve el boleto existente en el paso 5.** Si se devolviera,
cualquiera que escribiera el correo de otra persona obtendría su boleto. La
pantalla dice «ese correo ya tiene boleto para esta actividad: búscalo en *Mis
boletos* de tu teléfono o pídelo en la puerta con tu nombre». Cuando exista el
correo, dirá «te lo reenviamos».

#### Lista de espera

Cuando no hay lugar, la persona puede anotarse en espera. **Sirve primero como
dato**: es la demanda que el cupo no alcanzó, y es la mejor señal para decidir
qué repetir el año siguiente.

Sin correo **no hay promoción automática**: no habría cómo avisarle a nadie que
se liberó su lugar. Mientras tanto, la lista de espera se atiende en la puerta:
son los primeros en pasar si sobran lugares. Con la fase H, al cancelarse un
boleto se promueve al primero de la lista y se le avisa.

#### Inasistencia y sobrecupo

En eventos gratuitos es normal que falte entre el 30 y el 50 % de quienes
tienen boleto.

- **El sobrecupo lo pone el coordinador dentro del `cupo`** (decidido el 16 de
  septiembre). Si la sala tiene 100 lugares y espera que falte gente, captura
  115. El sistema no calcula ningún sobrecupo: emite exactamente `cupo`. Por
  eso el formulario debe decirlo junto al campo: «boletos a emitir, contando a
  quienes suelen no llegar», y la capacidad de la sede se muestra al lado como
  referencia. La inasistencia medida este año sirve para calibrarlo en 2027.
- **Liberación en puerta**: a la hora de inicio, los lugares de quien no llegó
  se abren a la fila. La vista de puerta muestra en grande «adentro: 83 de
  100», que es el número que importa en ese momento.

#### Contra el acaparamiento

Sin verificar correos, alguien podría pedir todos los lugares de un taller con
correos inventados. Defensas, de la más barata a la más cara:

1. **Un boleto por correo por actividad.** Restricción única.
2. **`lugares_max` por actividad**, 4 por omisión (familias). Un taller con
   material individual puede bajarlo a 1.
3. **Sin empalmes**: un mismo correo no puede tener boletos activos para dos
   actividades que se traslapan. Frena el «aparto todo por si acaso» y de paso
   ayuda a la persona.
4. **Tope por correo por edición** (p. ej. 8 boletos activos).
5. **Límite por dirección IP**: la función lee `request.headers` de PostgREST y
   anota los intentos en una tabla `intentos`. Más de 10 boletos en 10 minutos
   desde la misma IP, se detiene. Holgado a propósito: una escuela entera sale
   a internet por la misma IP.
6. **Campo trampa** en el formulario, invisible para personas.
7. **Cloudflare Turnstile**, si lo anterior no basta. Necesita verificarse en
   el servidor, así que llega con la primera función de Supabase (fase H).

Y la defensa de fondo: **la administración puede cancelar boletos en bloque**
desde el panel si detecta un patrón.

#### Grupos escolares

Una escuela que trae 40 alumnos no va a llenar 40 formularios. El coordinador o
la administración emiten, desde el panel, **un boleto de grupo**: la persona
responsable del grupo como asistente, `lugares = 40`, `origen = 'grupo'`. Pasa
por el mismo conteo que los demás, así que nunca rebasa el cupo.

#### F1 · Base — `sql/11-boletos.sql` — **hecha** (aplicada el 16 de septiembre de 2026)

(Toma el número 11. Ponentes, voluntariado, encuesta y correo corren al 12–15.)

**Cómo se probó.** En un PostgreSQL 16 desechable en Docker, con una
simulación de Supabase (`pruebas/boletos/supabase-simulado.sql`) y los archivos
01 a 10 reales aplicados antes. Tres pruebas, guardadas en `pruebas/boletos/`
para repetirlas antes de cualquier cambio:

- **La migración** pasa sus nueve comprobaciones y se aplica dos veces seguidas
  sin error.
- **La funcional** (`funcional.sql`) recorre el formulario, los límites, la
  lista de espera, la cancelación, el panel, la puerta con clave y las
  lecturas prohibidas, con los roles `anon` y `authenticated` de verdad.
- **La de concurrencia** (`concurrencia.sh`): 50 personas a la vez por 10
  lugares dan exactamente 10 boletos; 450 solicitudes de 1 a 4 lugares dan
  exactamente 10 lugares; 10 cancelaciones mezcladas con 120 solicitudes
  nuevas dejan exactamente 10, sin bloqueos mutuos.

Las pruebas encontraron dos defectos antes de producción, ya corregidos
(trampas 19 y 20 de la sección 6).

**Lo que quedó, además de lo planeado:**

- **`boletos.nombre`**: el nombre escrito en ESA solicitud, además del de la
  persona. Si alguien usó antes el correo de otra persona, la puerta ve el
  nombre de quien pidió este boleto.
- **`opciones_asistencia`**: el catálogo de edad, ocupación y procedencia, como
  datos. Sin «0 a 12 años»: la edad es de quien pide, y niñas y niños van como
  acompañantes (así lo dice el aviso de privacidad).
- **`ediciones.boletos_por_persona`** (8): el tope por correo, como dato.
- **Las funciones públicas devuelven `{ok, error}` y no lanzan excepciones.**
  Códigos: `consentimiento`, `nombre`, `correo`, `edad`, `ocupacion`,
  `lugares`, `no_existe`, `sin_boleto`, `aun_no`, `cerrado`, `duplicado`,
  `tope`, `empalme`, `agotado`, `demasiados`, `ya_entro`, `sin_permiso`,
  `clave`, `clave_vencida`, `otra_actividad`, `cancelado`, `espera`. F2 los
  agrega a `explicar()`.
- **Funciones extra del panel:** `admitir_de_espera()` y `recontar_aforo()`,
  la red de seguridad si algún día un contador no cuadra.
- **La puerta recibe la huella SHA-256 del token, no el token.** Un teléfono
  de puerta perdido no sirve para cancelar boletos ajenos.
- **El modo de acceso lo puede cambiar también el coordinador**, igual que el
  cupo. No se amplió `proteger_estado`.
- **`cupo` sigue en `vista_programa`** porque la cartelera en producción lo
  lee; se retira en F2, cuando la cartelera pase a `disponibles`.
- **Se retiró a `anon` la escritura sobre `actividades`** que Supabase concede
  por omisión (trampa 18).

- Columnas nuevas en `actividades` y `ediciones`. **Desactivar los
  disparadores propios** al principio y reponerlos al final (trampas 1 y 7).
- Tablas `aforos`, `asistentes`, `boletos`, `puertas`, `intentos`, con RLS y
  políticas explícitas.
- Crear la fila de `aforos` de cada actividad existente, y un disparador que la
  cree para las nuevas.
- `grant select (acceso, boletos_desde, boletos_hasta, lugares_max)` a `anon`
  sobre `actividades`, y `select` sobre `aforos`. Actualizar la comprobación de
  fugas de `09-programa.sql` para que `anon` siga sin poder leer nada más.
- `vista_programa` gana `acceso`, `disponibles` y `estado_boletos`
  (`abierto`, `pocos`, `agotado`, `cerrado`, `espera`). Se borra y recrea,
  `security_invoker = true`.
- Las siete funciones, cada una con `revoke all … from public` y un `grant
  execute` explícito solo a quien corresponde.
- `vista_actividades` (la del semáforo) **no se toca**: el panel pide el aforo
  aparte, como ya hace con el póster.
- Comprobaciones al final, al estilo de `08-cupo.sql`, incluida una prueba de
  que `anon` no puede leer `boletos` ni `asistentes`.
- **Prueba de concurrencia** antes de abrir: un script que lance 50 peticiones
  simultáneas contra una actividad de cupo 10 y confirme que salen exactamente
  10 boletos activos.

#### F2 · Conseguir boleto — **hecha** (16 de septiembre de 2026), por publicar

**Lo que quedó:**

| Archivo | Qué es |
|---|---|
| `assets/js/qr.js` | Codificador QR propio (modo byte, nivel M, versiones 1–40). El QR de un boleto sale en versión 7, 45 módulos |
| `assets/js/boletos/api.js` | Las llamadas, **sin supabase-js**, y `mensaje()`, que traduce cada código de error |
| `assets/js/boletos/almacen.js` | Los boletos guardados en el teléfono. Nunca guarda el correo |
| `assets/js/boletos/tarjeta.js` | El boleto en pantalla, la imagen PNG, el `.ics` y la cancelación en dos pasos |
| `assets/js/boletos/formulario.js` | El formulario, compartido por `/b/` y la ficha |
| `assets/js/boletos/pagina-*.js` | Las tres páginas |
| `assets/css/boletos.css` | Todo lo visual de los boletos |

- **La cartelera ya no muestra «N lugares».** Cada tarjeta lleva su estado:
  «Boleto gratuito», «Quedan 2 lugares», «Agotado · lista de espera»,
  «Boletos muy pronto», «Confirma asistencia» o «Tienes boleto», si este
  teléfono ya tiene uno. La portada lo agrega a la línea de la fecha.
- **La ficha tiene un recuadro «Boleto gratuito»** que abre el formulario en un
  diálogo (hoja desde abajo en celular). `/programa/<slug>/#boleto` lo abre
  directo, para compartir en redes.
- **`/b/<slug>?o=cartel`** guarda el origen y lo quita de la barra, para que
  quien comparta la liga no herede el origen del cartel. Al emitir, la dirección
  pasa a `/boleto/#<token>`: si la persona recarga, ve su boleto.
- **Si los lugares se acaban mientras se llena el formulario**, se ofrece la
  lista de espera con los mismos datos, sin volver a pedirlos. Si quedan menos
  de los pedidos, se deshabilitan las opciones que ya no caben.
- **«Mis boletos»** aparece en el menú solo si el teléfono tiene boletos
  vigentes.
- **Guardar imagen**: en el teléfono abre «compartir», que ofrece guardar en la
  galería; en escritorio, descarga el archivo.
- **`cupo` sigue en `vista_programa`**, pero ninguna pantalla pública lo
  muestra ya. Retirarlo de la vista y del permiso de `anon` queda para la
  siguiente migración que toque la vista.

**Cómo se probó.** Sin tocar la base real: `pruebas/boletos/servidor.py`
sirve el sitio como Netlify y responde la API como Supabase, contra la base
desechable de Docker y con los mismos roles. Se recorrieron en el navegador:
emisión con 2 lugares desde un cartel, las cinco validaciones del formulario,
la cancelación, la lista de espera desde la ficha, la carrera por el último
lugar, el correo repetido, un boleto ya usado, una liga incompleta, los estados
«libre», «pronto» y «registro», «Mis boletos» y la portada. El codificador
QR tiene su propia prueba (`pruebas/boletos/qr.test.mjs`): Reed-Solomon contra
el ejemplo publicado, formato y versión contra las tablas de la norma, y un
lector que recupera 294 textos.

**Falta antes de abrir:** escanear un QR real con teléfonos (Android y
iPhone), publicar (commit y push) y el aviso de privacidad aprobado.

**El diseño original de esta etapa, como referencia:**

**Rutas nuevas** (reescrituras en `netlify.toml`, como la del programa):

| Ruta | Qué es |
|---|---|
| `/b/<slug>` | Página enfocada para conseguir el boleto de una actividad. A donde apuntan los QR |
| `/boleto/#<token>` | El boleto: QR grande, código, datos, guardar, calendario, cancelar |
| `/mis-boletos/` | Los boletos guardados en este teléfono |
| `/privacidad/` | El aviso (sección 8) |

**Por qué `/b/<slug>` es página aparte y no un ancla de la ficha.** Quien
escanea un cartel está de pie en un pasillo con el teléfono en una mano. Tiene
que ver el título, la fecha, cuántos lugares quedan y el formulario, sin
desplazarse por una descripción. La ficha del programa muestra el mismo
formulario en un diálogo; los dos usan el mismo componente,
`assets/js/boletos/formulario.js`.

**Dónde aparece «Consigue tu boleto»:**

- Ficha `/programa/<slug>/`: botón principal en la tarjeta lateral, con los
  lugares que quedan.
- Tarjeta de la cartelera: una etiqueta de estado (`Quedan 4`, `Agotado`,
  `Lista de espera`) y la liga.
- Portada: las tres próximas actividades muestran su estado.
- `/b/<slug>`: desde los QR.

Cada entrada pasa su `origen`.

**El formulario, lo más corto posible:** nombre, correo, lugares (de 1 a
`lugares_max`), **rango de edad y ocupación obligatorios, procedencia
opcional** (decidido el 16 de septiembre) y la casilla de consentimiento sin
marcar, con liga al aviso. Los datos demográficos son de quien pide el boleto,
no de sus acompañantes.

**Después de enviar**, la misma pantalla se convierte en el boleto. Se guarda
en `localStorage` de inmediato —antes de que la persona pueda cerrar la
pestaña— envuelto en `try/catch`, porque en modo privado puede fallar y el
boleto tiene que mostrarse igual.

**QR sin dependencias externas:** `qrcode-generator` (Kazuhiko Arase, MIT, un
solo archivo) en `assets/js/vendor/`, dibujado en `<canvas>`. La misma
biblioteca sirve para la fase G.

#### F3 · Panel

- **Módulo Boletos** (`modulos/boletos.js`), visible cuando `acceso <> 'libre'`:
  - Barra de aforo: emitidos, en espera, lugares libres.
  - Lista con código, nombre, correo, lugares, origen, estado. Buscar y
    exportar CSV (la lista impresa es el respaldo si todo falla en la puerta).
  - Cancelar un boleto, emitir uno a mano, **emitir un boleto de grupo**.
  - **Descargar el QR de la actividad**: PNG listo para imprimir, con título,
    fecha y sede, y un PNG cuadrado para redes. Cada uno con su `origen`.
  - Generar y revocar la clave de puerta.
  - Agregados: por origen, por día de emisión, demografía.
- **Tablero de aforo** en `/panel/boletos/` (administración): todas las
  actividades con boleto, ordenadas por ocupación, con las agotadas y las que
  tienen lista de espera arriba. Es la pantalla para decidir, por ejemplo, abrir
  una segunda función de un taller.
- El diálogo de «Programar» de `/panel/programa/` gana el modo de acceso y el
  cupo.
- El formulario de registro y el módulo Resumen ganan el modo de acceso
  **propuesto** por el coordinador.

#### F4 · Puerta — `/puerta/`

El día del evento, en una sede con mala señal, con fila.

- **Quién entra:** el coordinador, la administración, o cualquiera con la
  liga `/puerta/#<clave>`. La clave existe porque los voluntarios no tienen
  cuenta (sección 3) y son quienes estarán en la puerta. Es de una sola
  actividad, se revoca desde el panel y caduca al terminar el día.
- **Escanear:** `BarcodeDetector` del navegador donde exista (Chrome en
  Android); `jsQR` (Apache 2.0) en `vendor/` donde no (Safari en iPhone).
- **Respuesta enorme y de color:** verde «Adelante · 2 lugares», ámbar «Ya
  entró a las 10:42», rojo «Boleto de otra actividad» o «Cancelado».
- **Búsqueda** por código, nombre o correo, para quien perdió el boleto.
- **Entrada sin boleto:** un botón «+1» que cuenta a quien cabe.
- **Contador en grande:** adentro / **capacidad de la sala**, no / cupo. Como
  el cupo ya trae sobrecupo, puede rebasar lo que cabe físicamente; quien
  cuida la puerta necesita el tope real. Sale de `sedes.capacidad`, que hoy
  está vacía: **hay que llenarla antes del festival**. Si falta, se usa el cupo.
- **El público nunca ve el cupo**, solo «quedan N». Hoy la ficha y la
  cartelera muestran «N lugares»; con el sobrecupo incluido ese número ya no
  es la capacidad de la sala, así que se sustituye en F2.
- **Sin red:** al abrir, descarga la lista de la actividad y la guarda en
  IndexedDB. Valida contra la copia local y encola las entradas; las sube cuando
  vuelve la señal. Dos teléfonos en la misma puerta pueden dejar pasar dos veces
  el mismo boleto mientras no haya red: se acepta, y al sincronizar gana la
  primera marca.

**Hay que cambiar una cabecera.** `netlify.toml` tiene
`Permissions-Policy: camera=()` para todo el sitio: bloquea la cámara y el
escáner no funcionaría. Se abre solo para `/puerta/*` con `camera=(self)`, y
esa ruta lleva además `noindex`.

#### F5 · Correo — con la fase H

Boleto por correo al emitirlo, «reenviar mis boletos» con el token personal,
recordatorio la víspera con «si no puedes ir, libera tu lugar» (la palanca más
eficaz contra la inasistencia), promoción automática de la lista de espera, y
Turnstile.

#### Qué se podrá responder después del festival

Estas lecturas son la razón del diseño y alimentan la fase I:

- Demanda por actividad: boletos + espera, contra cupo.
- Tasa de inasistencia por actividad, por eje, por día y por hora.
- Canal que más boletos trae (`origen`), y si los del cartel faltan más que los
  de la cartelera.
- Anticipación: cuántos días antes se consigue el boleto.
- Personas distintas por edición, y cuántas actividades ve cada una.
- Público de cada actividad por edad, ocupación y procedencia.

**Aviso de privacidad:** esta fase no puede abrirse al público sin él. Ver
sección 8. Es lo que más probablemente mueva la fecha del 1 de octubre.

---

### Fase G · Encuesta

**SQL** — `sql/14-encuesta.sql`: `formularios`, `preguntas`, `respuestas`,
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

**Consecuencia que hay que tener presente:** las fases **E y G dependen del
correo** para confirmar inscripciones e invitar a la encuesta. Se pueden
construir sin él y dejar el envío desconectado, pero **no se pueden poner en
producción** hasta resolverlo. La fase **F se lanza sin correo** (el boleto se
entrega en pantalla) y lo incorpora en su etapa F5. Las fases **A, B, C y D no
lo necesitan**.

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
- `sql/15-correo.sql`: tabla `envios`.

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

**Bloquea la apertura de la fase F.** En cuanto se capturen asistentes y
voluntarios aplica la **Ley General de Protección de Datos Personales en
Posesión de Sujetos Obligados**: la UNAM es sujeto obligado. (Versiones
anteriores de este plan citaban la ley de *particulares*, que no es la que
corresponde.)

**Borrador redactado el 16 de septiembre de 2026 en `/privacidad/`**, con una
franja de «borrador», `noindex` y sin enlazar. Los datos por confirmar van
resaltados en la página. Hay que validarlos con el CNyN:

| Por confirmar | Por qué |
|---|---|
| Domicilio del CNyN | Lo exige el aviso integral |
| Correo para ejercer derechos | Hoy dice el de contacto del festival |
| Normativa universitaria aplicable | La UNAM tiene la suya; hay que citarla por su nombre |
| Unidad de Transparencia y autoridad garante | La reforma de 2025 cambió los órganos garantes; que lo diga el área jurídica |
| Plazo de conservación | Propuesta: tres años desde la última edición a la que fue la persona |
| Región del proyecto de Supabase | Si está fuera de México, el aviso ya lo advierte; si no, se quita |

Al aprobarse: quitar la franja y las marcas, quitar el `noindex`, agregar la
página a `sitemap.xml` y enlazarla desde el pie y desde el formulario.

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
| ¿Cuáles son los rangos de edad y las opciones de ocupación? | F2 | Deben servir para los reportes. Propuesta: 0–12, 13–17, 18–29, 30–59, 60+; estudiante, docente, investigación, otro empleo, hogar, otro |
| ¿Quién redacta y aprueba el aviso de privacidad? | Apertura | Sin él no se abre el 1 de octubre |
| ¿Un voluntario puede tomar turnos que se empalmen? | Fase E | Define si hay que avisar de choques de horario |
| ¿La semblanza se edita en un solo lugar? | Fase C | Como está, editarla la cambia en todas las actividades de ese ponente |
| ¿Qué proveedor de correo se contrata? | Fases E, F, G | Aplazado. Hay que resolverlo antes de poner en producción cualquier módulo que mande correo |

---

## 10 · Cómo trabajar

```bash
# servir en local (los módulos ES no funcionan con file://)
npx serve public

# validar el SQL antes de aplicarlo
python -c "import pglast,pathlib; [pglast.parse_sql(f.read_text(encoding='utf-8')) for f in pathlib.Path('sql').glob('*.sql')]; print('OK')"

# probar los boletos en una base desechable (requiere Docker)
bash pruebas/boletos/preparar.sh
docker exec -i fdc-prueba psql -U postgres -X < pruebas/boletos/funcional.sql
bash pruebas/boletos/concurrencia.sh
node pruebas/boletos/qr.test.mjs

# probar las pantallas sin tocar la base real
docker exec -i fdc-prueba psql -U postgres -q < pruebas/boletos/datos-ui.sql
python pruebas/boletos/servidor.py            # http://localhost:8802
                                              # (o «boletos-prueba» en .claude/launch.json)
docker rm -f fdc-prueba
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
