# Sistema de diseño · Festival del Conocimiento

> Referencia para la actualización visual del sitio (landing, programa, página
> de actividad, boletos). Escrita el 26 de septiembre de 2026 a partir de la
> dirección de arte acordada. Las decisiones de código están al final, en
> «Cómo aterriza en este repositorio».

**La regla en una línea:** la información se diseña con orden; la identidad
aparece rompiendo ese orden.

Sistema editorial contemporáneo para un festival universitario de ciencia,
arte, tecnología y humanidades. Interfaz clara y luminosa sobre una retícula
editorial, grandes titulares sans serif, fotografía documental y retratos
recortados en blanco y negro combinados con círculos y formas geométricas de
colores vivos. Rigor institucional mezclado con experimentación cultural:
collages, alguna nota manuscrita, fechas sobredimensionadas, composiciones
asimétricas. La navegación y los componentes funcionales se mantienen muy
limpios; los momentos editoriales usan cyan, magenta, amarillo, verde y
naranja como acentos. Mucho espacio negativo, tipografía contundente, tarjetas
sencillas y animaciones sutiles. La sensación: cultural, universitaria,
humana, contemporánea y curiosa. Más revista de diseño o festival internacional
que web institucional.

## Personalidad visual

Debe comunicar a la vez conocimiento, descubrimiento, cultura, universidad,
diversidad y experimentación. Composiciones asimétricas pero ordenadas,
retícula fuerte y mucho aire, con elementos que de vez en cuando se salen de
la cuadrícula: círculos, fotos recortadas, palabras a mano, líneas, formas.

## 1 · Color

Base muy neutra con colores de identidad muy vivos.

| Uso | Valor |
|---|---|
| Marfil / blanco cálido | `#F7F5F0` |
| Blanco | `#FFFFFF` |
| Gris muy claro | `#ECEBE7` |
| Azul negro (texto principal, pie) | `#172033` |
| Gris de texto secundario | `#667085` |

Identidad (los del logotipo, ver nota al final): cyan, magenta, amarillo,
verde lima, naranja.

Los cinco vivos no compiten a la vez. Cada sección elige uno dominante y usa
los demás como detalles. Asociación de partida, rompible cuando la
composición lo pida: Ciencia → cyan · Arte → magenta · Tecnología →
amarillo/naranja · Humanidades → verde.

Proporción de partida: **70 % neutro** (blancos, fotografía, azul oscuro),
**20 % color de identidad**, **10 % experimentación gráfica**.

**Ajuste del 27 de septiembre de 2026:** solo con neutros el sitio quedaba
demasiado sobrio para un festival. El color de identidad entra también como
**fondo de sección**: un color pleno del logotipo y, cuando conviene, una foto
propia detrás en blanco y negro multiplicada con el color (dos tintas). La
página alterna secciones blancas y de color para que ninguna compita con la
siguiente. Reglas: sobre magenta el texto va blanco (usar `#D4116F`, que pasa
AA); sobre turquesa, amarillo, verde y naranja va oscuro; las tarjetas dentro
siguen blancas, para que la información conserve el orden. En la landing:
portada blanca → «Esta semana» magenta con foto → ejes en tarjetas de color
pleno → sedes turquesa con foto → «Cómo asistir» amarillo → memoria blanca →
pie azul negro. Validado en la landing y propagado el 27 sep 2026: la
cartelera lleva cabecera magenta con foto y los números de día en colores por
turno; la ficha y las cabeceras de boletos se tiñen con el color del eje
(16–18 % sobre blanco, texto oscuro); el aviso de privacidad va en amarillo;
las páginas internas comparten un pie azul negro con círculos, frase grande y
«Una iniciativa de». El taller de cómic se integró al sistema el mismo día
y conserva como rasgos propios los stickers torcidos con la información, la
cinta adhesiva, la tira de cuatro viñetas y la cinta con los pasos. El
laboratorio escénico sigue con su diseño propio.

## 2 · Tipografía

Tres voces.

- **Display**, para títulos grandes y cifras de fechas: sans fuerte, compacta
  y contemporánea (Archivo Black, Anton, League Spartan o similar). Puede ir
  enorme, ocupando varias columnas.
- **Interfaz y lectura**: sans neutra y muy legible (Inter o Manrope) para
  navegación, botones, datos de eventos, descripciones, filtros y formularios.
- **Gestual**: manuscrita (Caveat, Kalam) solo como recurso gráfico, como una
  nota escrita encima de la composición. Nunca para información funcional.
  Una o dos por pantalla como mucho.

### Escala (escritorio)

| Nivel | Tamaño | Notas |
|---|---|---|
| Display XL | 88–120 px | peso 800–900, interlínea 0.9–1 |
| Display L | 64–80 px | |
| H1 | 48–64 px | |
| H2 | 36–48 px | |
| H3 | 24–32 px | |
| Cuerpo grande | 18–20 px | |
| Cuerpo | 16 px | |
| Pequeño | 14 px | |
| Metadato / eyebrow | 11–13 px | mayúsculas, tracking 0.12–0.2em |

Las etiquetas pequeñas en mayúsculas son parte del lenguaje:
`ACTIVIDADES DESTACADAS` · `CIENCIA · ARTE · TECNOLOGÍA · HUMANIDADES` ·
`SÁB 17 OCT`.

## 3 · Retícula y espaciado

Doce columnas en escritorio, contenido máximo 1280–1440 px, márgenes
laterales de 80–120 px en pantallas grandes, medianil 24–32 px. Ocho columnas
en tableta, cuatro en móvil. Elementos que pueden salirse: círculos, fotos
recortadas, palabras a mano, líneas, formas.

Escala de 8 px: `4 / 8 / 16 / 24 / 32 / 48 / 64 / 96 / 128`. Entre grandes
bloques: 96–160 px escritorio, 64–96 tableta, 48–72 móvil. Que nada quede
apretado.

## 4 · Formas y fotografía

El **círculo** es la forma principal (conecta con los aros del logotipo):
círculos llenos, arcos, semicírculos, anillos, líneas circulares,
superposiciones. Grandes superficies simples detrás de fotos. No son
decoración aleatoria: equilibran la composición.

Dos tratamientos fotográficos:

- **Documental**, para actividades, talleres y noticias: color natural,
  algo cálido, gente y actividad real.
- **Editorial**, para campañas y grandes secciones: blanco y negro, alto
  contraste, sujeto recortado, integrado con círculos, arquitectura o
  naturaleza. Es el lenguaje de collage del hero.

## 5 · Componentes

**Tarjetas.** Fondo blanco, radio 16–20 px, borde `1px solid #E4E4E0`, sombra
casi nula. Imagen en el 50–60 % superior; debajo fecha, título, dato
secundario y acción. Un pequeño código de color por tarjeta (amarillo, cyan,
magenta…). Hover: la foto se desplaza un poco o crece 1.02–1.05.

**Fechas como gráfico.** Pastilla o cuadrado redondeado de color con
`SÁB / 17 / OCT`, el número grande. Se reconoce el evento sin leer la tarjeta.

**Botones.** Cápsula, 48–56 px de alto, radio 999. Primario magenta con texto
blanco («Explora el programa →»). Secundario transparente con borde azul
oscuro. Terciario texto + flecha sin contenedor («Ver todo el programa →»).
Flechas y microiconos simples y lineales.

**Navegación.** Cabecera muy limpia: logo a la izquierda, menú centrado,
acciones a la derecha, mucho aire. Al hacer scroll: fondo blanco algo
translúcido, desenfoque suave, altura reducida. Activo con una línea cyan
debajo del texto.

**Iconografía.** Trazo de 1.5 px, geométrica, sin rellenos: flechas, más,
play, calendario, ubicación, horario, filtros, búsqueda. Pueden ir dentro de
círculos.

## 6 · Secciones y ritmo

Para que el sitio no sea una sucesión de tarjetas, alternar estructuras: gran
titular + collage · texto editorial + fotografía · retícula de eventos ·
número gigante + información · línea de tiempo · frase manuscrita · mosaico
fotográfico · sección institucional muy limpia.

**Instituciones y patrocinadores** cambian de registro: fondo blanco o gris
muy claro, logos monocromos, mucho espacio, separadores finos, sin sombras.
Presencia sin competir con el festival.

**Pie** en azul negro con texto blanco, grandes círculos de identidad
recortados por los bordes, una frase grande («El conocimiento nos une») y
debajo navegación, redes, contacto, instituciones y créditos.

## 7 · Movimiento

Editorial, no tecnológico. 200–500 ms. Fundidos, deslizamientos muy leves,
escala, revelado por máscara, paralaje mínimo. Los collages pueden construirse
al entrar en pantalla: primero la foto, luego el círculo, después la línea y
al final la nota a mano. Nada que se mueva todo el tiempo.

## 8 · Páginas

**Programa.** La parte más funcional. Explorar por fecha, tipo de actividad,
disciplina, sede y público. Arriba, filtros tipo chips (`Todos` `Ciencia`
`Arte` `Tecnología` `Humanidades`). Debajo, lista cronológica con tarjetas y
las fechas como grandes separadores editoriales (`17 OCT` y todo lo del día).

**Actividad.** Composición editorial: gran fotografía, categoría, fecha
grande, título, horario + lugar, llamada a la acción, descripción,
participantes, información práctica, actividades relacionadas. El número del
día puede ocupar el fondo como elemento gráfico (un «24» a 180 px detrás del
contenido).

---

## Cómo aterriza en este repositorio

Decisiones tomadas al pasar el sistema al código que ya existe.

**Colores de identidad: se quedan los del logotipo.** La memoria del proyecto
y `landing.css` fijan la paleta en los valores del logo (`#10ABC4`, `#E91587`,
`#F5821F`, `#99CA3C`, `#F6D20A`). Los del sistema (`#12B8D4`, `#F20A78`…) son
casi iguales; cambiarlos rompería la coincidencia con el logotipo impreso sin
ganar nada. Los **neutros nuevos** (marfil `#F7F5F0`, azul negro `#172033`,
gris `#667085`) sí son un cambio real: `marca.css` deriva todos los grises de
`--marca-oscuro` (`#26282C` hoy) y basta con ajustar ese valor y añadir el
marfil como fondo de sección. Pendiente de decidir; si se cambia el oscuro,
comprobar de nuevo los contrastes anotados en `marca.css`.

**Fuentes.** Hoy el sitio usa Inter (lectura) y Space Grotesk (display). El
sistema pide una display más compacta y pesada (Archivo Black, Anton, League
Spartan). Recomendación: **League Spartan 800/900** para titulares y cifras,
manteniendo Inter para todo lo funcional; Space Grotesk se retira al terminar
la migración. La manuscrita (Caveat) ya la carga `taller-comic.css`; en la
landing se cargará solo si se usa.

**Ancho.** El contenido editorial llega a **1440 px** (`--fdc-wrap-ancho`; se probó 1920 y se descartó)
con márgenes `clamp(20px, 5vw, 120px)`; el collage de la portada se limita a
680 px para no crecer sin sentido. Las secciones de lectura (`--fdc-wrap`,
1180 px) pueden seguir más angostas. Validado en la landing el 27 sep 2026.

**Componentes ya construidos según el sistema** (portada B de `index.html`):
tarjeta de actividad con pastilla de fecha (`.fdc-h2c`), banda institucional
monocroma (`.fdc-hero2__insti`), collage de círculos con entrada progresiva
(`.fdc-hero2__collage`), aros del logotipo girando (`.fdc-hero2__rings`).
Cuando se adopte la portada B, estos bloques pasan a ser los componentes
base y se reutilizan en `programa.css` y `boletos.css`.

**Pósters.** Son cuadrados por decisión del equipo (`subir-poster.js`). En
tarjetas apaisadas no se recortan: van completos sobre una copia suya
desenfocada (`.fdc-h2c__media`). Cualquier rediseño de tarjeta respeta eso.

**Orden de trabajo propuesto.** 1) Landing con contenido de festival activo.
2) Cabecera clara con scroll translúcido. 3) Programa con chips y separadores
por día. 4) Página de actividad editorial. 5) Boletos y registro con los
mismos componentes. 6) Pie en azul negro.
