# Producción — FASE 10

Cómo desplegar el proyecto en un hosting PHP compartido (probado localmente contra un
layout idéntico al de InfinityFree: `htdocs/` como único DocumentRoot, sin control sobre
la configuración de Apache, sin SSH).

## Estructura a subir

```
htdocs/                    ← raíz del hosting
├── index.html              de frontend/dist/
├── assets/                 de frontend/dist/
├── favicon.svg, ...        de frontend/dist/
├── .htaccess                de frontend/dist/ (copiado por Vite desde frontend/public/)
│
└── api/                    ← todo el contenido de backend-php/, tal cual
    ├── .htaccess
    ├── .env                 (creado a mano en el hosting, NUNCA se sube el del repo)
    ├── config/
    ├── src/
    ├── routes/
    ├── bin/
    └── public/
        ├── index.php
        └── .htaccess         (sin uso en este layout, ver nota abajo)
```

Dos comandos para generar lo que se sube:

```bash
cd frontend && npm run build      # genera frontend/dist/
# backend-php/ se sube completo tal cual, sin build
```

## Por qué esta estructura

`backend-php/public/index.php` resuelve sus rutas con `dirname(__DIR__)` (el padre de
`public/`), así que funciona igual sin importar si `public/` es el DocumentRoot real
(un VPS con Apache configurable) o si es una subcarpeta más dentro de `htdocs/api/`
(InfinityFree, que no permite fijar el DocumentRoot por subcarpeta). Por eso hay dos
`.htaccess` distintos y **solo uno de los dos hace falta según el caso**:

- **`backend-php/.htaccess`** (raíz): para cuando `backend-php/` se sube completo como
  `htdocs/api/` — reescribe todo hacia `public/index.php`. Es el que se usa en
  InfinityFree.
- **`backend-php/public/.htaccess`**: para cuando el DocumentRoot del servidor apunta
  directo a `public/` (VPS, Apache local con vhost propio). No hace falta en InfinityFree.

## Hallazgo importante: el header `Authorization` no llega a PHP en CGI/FastCGI

Verificado con una instancia real de Apache 2.4 + PHP-CGI (misma configuración que usan
muchos hostings compartidos, InfinityFree incluido): **por defecto, Apache no reenvía el
header `Authorization` a los scripts PHP que corren como CGI/FastCGI** — `$_SERVER` no
tiene ningún rastro de él aunque el cliente lo mande. Esto rompe silenciosamente toda la
autenticación Bearer (`/auth/me`, y cualquier ruta protegida, siempre devuelven 401 "No
autenticado" aunque el token sea válido).

Ambos `.htaccess` de `backend-php/` ya traen el arreglo:

```apache
RewriteCond %{HTTP:Authorization} ^(.*)
RewriteRule .* - [E=HTTP_AUTHORIZATION:%1]
CGIPassAuth On
```

Y `AuthMiddleware::obtenerEncabezadoAuthorization()` busca el header bajo cualquier
cantidad de prefijos `REDIRECT_` (Apache antepone uno por cada redirección interna —
en la prueba real, con el handler de `Action` para `.php` más la reescritura a
`public/index.php`, apareció como `REDIRECT_REDIRECT_HTTP_AUTHORIZATION`), en vez de
asumir un nombre fijo. Esto es necesario porque la cantidad de prefijos depende de cómo
esté configurado cada host.

## Verificación realizada

Se armó localmente una réplica exacta del layout de producción (`htdocs/` con el build
real de `frontend/dist/` + `backend-php/` completo como `htdocs/api/`) y se sirvió con
Apache 2.4.68 + PHP 8.3 vía CGI (mismo mecanismo que usan los hostings compartidos, a
diferencia del servidor embebido de PHP usado en desarrollo). Resultado:

- `GET /` sirve el `index.html` real generado por `npm run build`.
- `GET /assets/index-*.js` sirve el chunk real de Vite.
- `GET /reservas`, `/dashboard`, `/login` (rutas de React Router, sin archivo real en
  disco) devuelven `index.html` en vez de un 404 de Apache — confirma el fallback de SPA.
- `GET /api/health` y `/api/health/db` ejecutan PHP real con conexión PDO real a MySQL.
- `POST /api/auth/login` + `GET /api/auth/me` con el token devuelto: **200 con los datos
  correctos** (tras el arreglo del header `Authorization` de arriba; antes del arreglo
  devolvía 401 con el token completamente perdido).
- Acceso directo a `/api/config/config.php`, `/api/config/database.php`,
  `/api/src/Support/Jwt.php`, `/api/routes/api.php`, `/api/bin/crear_usuario.php` y
  `/api/.env`: **403 Forbidden** en los seis casos (protegidos por el `.htaccess` propio
  de cada carpeta con `Require all denied`, más el bloqueo de `.env` en el `.htaccess`
  raíz).
- CORS: el header `Access-Control-Allow-Origin` solo aparece cuando el `Origin` de la
  petición está en `CORS_ALLOWED_ORIGINS`.

No se pudo probar contra InfinityFree en sí (no hay una cuenta de hosting disponible en
este entorno) — la verificación de arriba es lo más cercano posible sin subir el
proyecto de verdad. Antes de dar la migración por cerrada, conviene repetir al menos el
login + `/auth/me` ya en el hosting real, por si su configuración de PHP difiere en algo
del Apache+CGI usado acá.

## Variables de entorno en producción

`htdocs/api/.env` se crea a mano en el hosting (por FTP/administrador de archivos, nunca
se commitea) a partir de `backend-php/.env.example`:

```
APP_DEBUG=false
APP_TIMEZONE=America/Lima

DB_HOST=<el que indique InfinityFree, normalmente localhost o un host tipo sqlXXX.infinityfree.com>
DB_PORT=3306
DB_NAME=<nombre real de la base en InfinityFree>
DB_USER=<usuario real>
DB_PASSWORD=<password real>

CORS_ALLOWED_ORIGINS=https://tudominio.com

JWT_SECRET=<clave larga generada, distinta a la de desarrollo>
JWT_ACCESS_TTL=64800
JWT_REFRESH_TTL=604800
```

`APP_DEBUG=false` es obligatorio en producción: con `true`, los errores 500 devuelven el
mensaje real de la excepción al cliente (útil en desarrollo, una fuga de información en
producción).

## Primer usuario admin en producción

Sin SSH no se puede correr `bin/crear_usuario.php` en el hosting. El flujo:

1. En local: `php -r "echo password_hash('la-password-real', PASSWORD_DEFAULT), PHP_EOL;"`
2. Insertar la fila a mano desde phpMyAdmin en `usuarios_internos` con ese hash (nunca la
   contraseña en texto plano) y `rol='admin'`.
3. De ahí en más, el resto de usuarios se crea desde el propio panel (`UsuarioController`,
   fase 6) — no hace falta volver a tocar la base a mano.
