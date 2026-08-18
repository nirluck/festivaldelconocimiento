# Festival del Conocimiento · sitio y sistema de seguimiento

Sitio público y sistema interno del Festival del Conocimiento
(Ensenada, Baja California · **17 al 24 de octubre de 2026**).

Sin framework ni paso de compilación: HTML, CSS y JavaScript sobre
**Netlify** (publicación) y **Supabase** (base de datos y cuentas).

---

## Puesta en marcha

### 1 · Base de datos

En Supabase ▸ **SQL Editor** ▸ *New query*, pega y ejecuta **en este orden**:

| Archivo | Qué hace |
|---|---|
| `sql/01-esquema.sql` | Tablas, ajustes y el disparador que crea el perfil al registrarse |
| `sql/02-semaforo.sql` | Cálculo del semáforo y la vista maestra |
| `sql/03-rls.sql` | Reglas de acceso por fila. **Sin esto los datos quedan abiertos** |
| `sql/04-catalogos.sql` | Ejes, tipos, sedes y días |

El último devuelve un conteo: deberías ver 4 ejes, 14 tipos, 14 sedes,
10 días y 6 ajustes.

### 2 · Confirmación de correo

Supabase por omisión **exige confirmar el correo** antes de dejar entrar. Si
esos correos caen en spam, la gente se queda fuera justo al registrarse.

Para un registro abierto de festival conviene desactivarlo:

> Supabase ▸ **Authentication** ▸ **Sign In / Providers** ▸ Email ▸
> desactiva **Confirm email** ▸ Save

Así, al registrar una actividad la persona entra de inmediato. La recuperación
de contraseña sigue funcionando por correo para quien la necesite.

> Si prefieres dejarlo activado, el sitio ya lo contempla: guarda la actividad
> en el navegador y la da de alta sola en cuanto la persona confirma y entra.

### 3 · Llaves del proyecto

Supabase ▸ **Project Settings** ▸ **Data API**. Copia los dos valores en
`public/assets/js/config.js`:

```js
export const SUPABASE_URL      = 'https://xxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi…';
```

La llave `anon` **no es un secreto** y va en el repositorio a propósito: está
hecha para vivir en el navegador. Lo que protege los datos son las reglas de
`03-rls.sql`. La que nunca debe aparecer aquí es la `service_role`.

### 4 · Publicar en Netlify

1. Netlify ▸ **Add new site** ▸ *Import an existing project* ▸ este repositorio.
2. Netlify lee `netlify.toml`: publica `public/`, sin comando de compilación.
3. **Domain management** ▸ añade `festivaldelconocimiento.org` y sigue los DNS
   que indique.
4. En Supabase ▸ **Authentication** ▸ **URL Configuration**, pon como
   *Site URL* `https://festivaldelconocimiento.org` y añade la misma dirección
   en *Redirect URLs*. Sin esto, el enlace de recuperación de contraseña
   regresa a `localhost`.

### 5 · Darte de alta como coordinación

Da de alta la cuenta primero: desde `/registro` en el sitio, o en Supabase ▸
**Authentication ▸ Users ▸ Add user** marcando *Auto Confirm User*.

Luego, en el SQL Editor:

```sql
alter table public.perfiles disable trigger perfiles_proteger_rol;

insert into public.perfiles (id, correo, nombre, rol)
select u.id, u.email,
       coalesce(nullif(u.raw_user_meta_data ->> 'nombre', ''), 'Coordinación'),
       'coordinacion'
  from auth.users u
 where u.email = lower('tu-correo@ejemplo.mx')
on conflict (id) do update set rol = 'coordinacion';

alter table public.perfiles enable trigger perfiles_proteger_rol;
```

> El paso de desactivar el disparador **no es opcional**. `proteger_rol` rechaza
> los cambios de rol que no vengan de una cuenta de coordinación, y como al
> principio no existe ninguna, el candado se bloquearía a sí mismo.

---

## Las páginas

| Ruta | Qué es | Quién entra |
|---|---|---|
| `/` | Landing pública | Cualquiera |
| `/registro/` | Alta de actividad **y** creación de cuenta en un paso | Cualquiera |
| `/entrar/` | Acceso y recuperación de contraseña | Con cuenta |
| `/mi-actividad/` | Sus actividades, historial y reporte de avances | Responsable |
| `/panel/` | Tablero con semáforos, seguimiento y exportación | Coordinación |

---

## Cómo se decide el color del semáforo

Se compara el avance reportado contra el que debería llevarse hoy, según una
rampa que va de `cal_inicio` a `cal_lista` (tabla `ajustes`). A esa brecha se
suman los días de silencio y si hay problemática abierta.

Se evalúa **en cascada**: la primera condición que se cumple decide, y por eso
las pruebas de riesgo van antes que las de atención. Lo que declara el
responsable solo puede empeorar el color, nunca mejorarlo.

Todo está en `sql/02-semaforo.sql`, traducido del plugin de WordPress con los
mismos umbrales y mensajes. A diferencia de aquel, aquí la lógica se escribe
**una sola vez**: tablero, formulario y exportación leen de la misma vista.

Para ajustar los umbrales no hace falta tocar código:

```sql
update public.ajustes set valor = '2026-08-13' where clave = 'cal_inicio';
update public.ajustes set valor = '2026-09-17' where clave = 'cal_lista';
update public.ajustes set valor = '14'         where clave = 'dias_ambar';
update public.ajustes set valor = '25'         where clave = 'dias_rojo';
```

---

## Estructura

```
festival-web/
├── netlify.toml              Publicación, cabeceras y redirecciones
├── sql/                      Se ejecuta una vez en Supabase, en orden
└── public/                   Lo que Netlify publica
    ├── index.html            Landing
    ├── registro/  entrar/  mi-actividad/  panel/
    └── assets/
        ├── css/  landing.css · app.css
        ├── js/   landing.js · app.js · config.js
        └── img/  fotografías, carteles 2025 y logotipos
```

`app.js` concentra el cliente de Supabase, la sesión, los catálogos y los
mensajes de error. Las páginas solo describen su pantalla.

---

## Desarrollo local

```bash
npx serve public
```

Las páginas internas usan módulos de JavaScript, así que **no funcionan
abriendo el archivo con doble clic**: hace falta servirlas por HTTP.

---

## Decisiones que conviene recordar

- **Nada de tokens en URLs.** El sistema anterior protegía cada expediente con
  una llave dentro de la dirección, que no caducaba nunca: si el correo se
  reenviaba, se compartía el expediente. Ahora cada persona tiene su cuenta.
- **El historial no se reescribe.** `reportes` solo admite altas: no hay
  políticas de modificación ni de borrado. Para corregir se manda otro reporte.
  En el plugin, cada envío pisaba al anterior y esa información se perdía.
- **La vista lleva `security_invoker`.** Sin eso, una vista de Postgres ignora
  las reglas por fila y entregaría todas las actividades a cualquiera.
- **Los catálogos son datos, no código.** Sedes, tipos y días se editan en la
  base. Las opciones de *alerta* son la excepción y siguen fijas, porque el
  semáforo las reconoce por su texto.
