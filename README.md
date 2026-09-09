# Complejo Deportivo

Sistema de digitalización para la administración de un complejo deportivo de 4 canchas
(reservables como medio campo o campo completo): grilla de disponibilidad, cobros en
efectivo/Yape, control de academias y clientes fijos con horarios recurrentes, deudas,
inventario y un dashboard financiero.

## Componentes

1. **Panel administrativo** — grilla de reservas del día, pagos, deudas, comentarios,
   academias/horarios fijos e inventario (requiere login).
2. **Web pública** — muestra disponibilidad de horarios, sin reservas ni pagos en línea
   (`/horarios`, sin login).
3. **Dashboard financiero** — ingresos diferenciados por efectivo y Yape, series de 30 días.
4. **Bot de WhatsApp** — respuestas a preguntas frecuentes vía API oficial de Meta (no
   implementado todavía, fuera de alcance por ahora).
5. **App móvil (PWA)** — mismo contenido que la web pública (visión futura).

## Estructura del repositorio

```
backend/           PHP + PDO (API REST), sin framework ni ORM
frontend/          React + Vite (web pública / panel administrativo)
database/          schema.sql (MySQL/MariaDB) + scripts de actualización incremental
```

## Stack tecnológico

### Frontend (`frontend/`)

| Categoría | Tecnología |
|---|---|
| Librería UI | [React 19](https://react.dev/) |
| Build tool / dev server | [Vite 8](https://vite.dev/) |
| Ruteo | [React Router](https://reactrouter.com/) v7 |
| Estilos | [Tailwind CSS 4](https://tailwindcss.com/) (vía `@tailwindcss/vite`) |
| Componentes UI | [shadcn/ui](https://ui.shadcn.com/) (sobre [Radix UI](https://www.radix-ui.com/) — `dialog`, `popover`, `slot`) |
| Utilidades de estilos | `class-variance-authority`, `clsx`, `tailwind-merge` |
| Iconos | [lucide-react](https://lucide.dev/) |
| Gráficos | [Recharts](https://recharts.org/) (dashboard financiero) |
| Linter | [oxlint](https://oxc.rs/docs/guide/usage/linter.html) |

### Backend (`backend/`)

| Categoría | Tecnología |
|---|---|
| Lenguaje | PHP 8.1+ |
| Acceso a datos | PDO con prepared statements, sin ORM |
| Autenticación | JWT propio (HS256, sin librerías externas) — access token 18h, refresh 7 días, rotación stateless |
| Router | Router propio por regex (`src/Support/Router.php`), sin framework |
| Autoload | `spl_autoload_register` estilo PSR-4, sin Composer |
| Aritmética monetaria | `bcmath` (nunca floats, precisión decimal exacta) |
| Modelo de usuario | Tabla `usuarios_internos`, rol (`admin`/`recepcion`), `password_hash()`/`password_verify()` |
| CORS | `Middleware/CorsMiddleware.php`, lista blanca de orígenes por `.env` |
| Configuración por entorno | Parser propio de `.env` en `config/config.php` |

### Base de datos

MySQL / MariaDB, InnoDB + `utf8mb4`. Esquema en `database/schema.sql`, importable directo
desde phpMyAdmin. Zona horaria `America/Lima` (fijada en PHP y en la sesión de MySQL, ver
`config/database.php`).

## Cómo levantar el entorno local

1. **Base de datos**: crear una base MySQL/MariaDB e importar `database/schema.sql`
   (incluye el seed de canchas y tarifas) desde phpMyAdmin o `mysql < database/schema.sql`.
   Si ya tenés una base creada antes del 2026-09-06, corré además los scripts
   `database/actualizacion_2026-09-06_*.sql` en orden (agregan inventario, deudas de
   academia, tipo de academia y estado de pago manual — ver detalle de cada uno en su
   propio archivo).
2. **Backend**: copiar `backend/.env.example` a `backend/.env` y completar las
   credenciales de MySQL. Crear el primer usuario admin con
   `php backend/bin/crear_usuario.php <usuario> <password> <nombre> admin`.
3. **Frontend**: copiar `frontend/.env.example` a `frontend/.env` (ya apunta a
   `http://localhost:8000/api`, mismo puerto que el paso siguiente).
4. **Levantar todo junto**: `npm install` en la raíz y en `frontend/`, después
   `npm run dev` — usa `concurrently` para levantar el backend PHP
   (`php -S localhost:8000`) y el frontend (Vite) al mismo tiempo.

Requiere PHP 8.1+ (con `pdo_mysql` y `bcmath`) y una base MySQL/MariaDB accesibles
localmente.

## Despliegue en producción (hosting compartido, sin SSH)

Pensado para un hosting PHP compartido sin SSH ni Docker (probado localmente contra un
layout idéntico al de InfinityFree: `htdocs/` como único DocumentRoot).

```
htdocs/                    ← raíz del hosting
├── index.html, assets/…    de frontend/dist/ (generado con `cd frontend && npm run build`)
└── api/                    ← todo el contenido de backend/, tal cual (sin build)
    ├── .env                 creado a mano en el hosting, NUNCA se sube el del repo
    ├── config/, src/, routes/, bin/, public/
```

`backend/public/index.php` resuelve sus rutas con `dirname(__DIR__)`, así que funciona
igual si `public/` es el DocumentRoot real (VPS con Apache configurable) o si es una
subcarpeta más dentro de `htdocs/api/` (InfinityFree, que no permite fijar el
DocumentRoot por subcarpeta) — por eso hay dos `.htaccess` (`backend/.htaccess` para el
segundo caso, `backend/public/.htaccess` para el primero) y solo uno de los dos hace
falta según el hosting.

**Hallazgo importante verificado con Apache 2.4 + PHP-CGI real:** por defecto Apache no
reenvía el header `Authorization` a scripts PHP corriendo como CGI/FastCGI (`$_SERVER` no
tiene rastro de él aunque el cliente lo mande), lo que rompe silenciosamente toda la
autenticación Bearer. Se resolvió con `CGIPassAuth On` + una regla `RewriteRule` en ambos
`.htaccess`, y `AuthMiddleware::obtenerEncabezadoAuthorization()` busca el header bajo
cualquier cantidad de prefijos `REDIRECT_` (Apache antepone uno por cada redirección
interna; la cantidad exacta depende de cómo esté configurado cada host).

Variables de entorno de producción (`htdocs/api/.env`, a partir de `.env.example`):
`APP_DEBUG=false` (obligatorio: con `true` los errores 500 filtran el mensaje real de la
excepción al cliente), `APP_TIMEZONE=America/Lima`, credenciales reales de MySQL,
`CORS_ALLOWED_ORIGINS` con el dominio real, y un `JWT_SECRET` distinto al de desarrollo.

Primer usuario admin sin SSH: generar el hash localmente con
`php -r "echo password_hash('la-password-real', PASSWORD_DEFAULT), PHP_EOL;"` e
insertar la fila a mano en `usuarios_internos` desde phpMyAdmin (`rol='admin'`); el resto
de usuarios se crea después desde el propio panel.

Pendiente: la verificación de arriba se hizo contra una réplica local de Apache+CGI, no
contra una cuenta real de InfinityFree — conviene repetir al menos login + `/auth/me` ya
en el hosting real antes de darlo por cerrado del todo, por si su configuración de PHP
difiere en algo.

## Historia del proyecto

### Prototipo inicial — Django + PostgreSQL (18–25 de agosto de 2026)

El proyecto arrancó como backend Django 6 + DRF y frontend React 19 + Vite. En esta etapa
se construyó, en Django, prácticamente todo el dominio de negocio que después se migró a
PHP:

- Autenticación JWT (login, refresh con rotación) y modelo `UsuarioInterno`.
- Catálogo de canchas y tarifas (individual/campo completo), con seed de 4 canchas y 5
  franjas de tarifa.
- Grilla de disponibilidad del panel: crear reservas (individuales y de campo completo),
  cancelar, marcar ausente, reservas de duración variable (1h a 3h en incrementos de 30
  minutos), celdas estables y animadas.
- Pagos: registrar efectivo/Yape al crear una reserva, upsert de pagos por método
  (`PATCH /reservas/{id}/pagos/`), resumen de caja del día agrupado por fecha de cobro.
- Comentarios del día (reemplazaron a las primeras "Observaciones" de texto libre).
- Dashboard financiero con gráficos de Recharts (ingresos de 30 días, por cancha, por
  método de pago).
- Web pública de disponibilidad sin login ni datos personales (`/horarios`), con
  react-router-dom separando panel (con login) de la vista pública.
- Academias: horarios semanales recurrentes por cancha, materialización perezosa de
  reservas (sin cron, se dispara al pedir la grilla del día), color propio por academia
  reflejado en la celda.
- Adelantos de reserva: bandera `es_adelanto`, celda negra permanente en la grilla y
  pantalla de adelantos pendientes de cobro.
- UI: rediseño con Tailwind CSS v4 + primitivos de shadcn/ui, sidebar de navegación,
  modo oscuro, calendario, confirmaciones de borrado.

### Migración a PHP + MySQL (31 de agosto de 2026)

Con el prototipo funcional, el proyecto migró de Django+PostgreSQL a PHP+MySQL para poder
desplegarse en hosting compartido sin soporte para Python/WSGI (InfinityFree como
referencia). El trabajo se hizo en la rama `migration/php-mysql`, en fases, cada una con
su propio commit verificado antes de avanzar:

1. **Auditoría** de la estructura Django existente: modelos, endpoints, llamadas del
   frontend, partes terminadas/incompletas y riesgos de la migración.
2. **Plan de conversión**: mapeo archivo por archivo Django → PHP (modelos, serializers,
   viewsets, `servicios.py` → `Services/*.php`), estructura definitiva del backend PHP.
3. Estructura base del backend PHP: autoload PSR-4 propio, router por regex, helpers de
   respuesta HTTP, sin Composer ni dependencias externas.
4. `database/schema.sql` — esquema completo en MySQL/MariaDB (InnoDB + utf8mb4).
5. Autenticación JWT propia (HS256, sin librerías), mismas duraciones que en Django
   (access 18h, refresh 7 días).
6. Migración de la gestión de usuarios (antes solo existía por el admin de Django: se
   construyó un CRUD completo `GET/POST/PUT/DELETE /api/usuarios`, solo rol admin).
7. Migración de reservas: modelos, `ReservaService`, `AcademiaService`,
   `DashboardService`, `DisponibilidadService`, y los controladores de reservas,
   academias, canchas, tarifas, comentarios del día y disponibilidad pública.
8. Endpoints del dashboard financiero.
9. Reconexión del frontend React (sin reescribir componentes) al nuevo backend PHP,
   ajustando solo `api.js` y las variables de entorno.
10. Configuración de producción (`.htaccess`, build de `frontend/dist/`, verificación
    contra una réplica local del hosting compartido) y eliminación del backend Django ya
    reemplazado y verificado.

Un hallazgo relevante de esta fase: Apache con PHP-CGI no reenvía el header
`Authorization` por defecto, lo que rompía silenciosamente la autenticación Bearer en el
layout de hosting compartido (ver detalle en la sección de despliegue arriba).

### Control de deudas, clientes fijos e inventario (6–9 de septiembre de 2026)

Con el backend PHP ya en producción, se sumaron funcionalidades nuevas sobre la base
migrada:

- **Academias vs. clientes fijos**: nuevo campo `academias.tipo`
  (`academia` / `cliente_fijo`) — un cliente fijo usa el mismo mecanismo de horario
  recurrente que una academia, pero nunca se muestra en la web pública. La pantalla
  "Academias" del panel se renombró a **"Horarios fijos"** (`/horarios-fijos`) para
  reflejar que administra ambos tipos.
- **Deudas de academia**: `academias.deuda_actual` se ajusta a mano desde el panel y baja
  automáticamente al registrar un comentario del día marcado como pago de esa academia
  (`comentarios_dia.academia_id`), guardando además una foto del saldo resultante
  (`academia_deuda_resultante`) para mostrar "Debe S/X" junto al pago en el historial.
  Una reserva de academia sin cobrar el mismo día puede marcarse como deuda
  (`POST /reservas/{id}/marcar-deuda/`, estado `debe`) en vez de quedar pendiente para
  siempre.
- **Estado de pago manual en adelantos**: `reservas.estado_pago`
  (`pendiente`/`pagado`/`falta`), elegido a mano por la persona a cargo en vez de que la
  app calcule cuánto falta (el precio real puede variar por negociación). Completar el
  saldo de un adelanto en otro día usa `PATCH /reservas/{id}/agregar-pago/`, que nunca
  pisa el depósito original.
- **Módulo de inventario**: tabla `inventario` (materiales del complejo, nombre +
  cantidad) con CRUD propio (`InventarioController`, pantalla `/inventario`).
- Todos los cambios de esquema de esta etapa quedan también como scripts incrementales
  independientes en `database/` (`actualizacion_2026-09-06_*.sql`), pensados para
  aplicarse sin volver a importar `schema.sql` (que borraría los datos ya cargados).

## Notas conocidas

- El refresh token no se usa todavía en el frontend: ante un 401 el cliente borra los
  tokens y recarga, forzando un nuevo login cada ~18h en vez de refrescar en silencio.
- La rotación de JWT es stateless (sin tabla de blacklist): un refresh token viejo sigue
  siendo válido hasta que expira, no hay revocación explícita.
- El despliegue en hosting compartido está verificado contra una réplica local de
  Apache+CGI, no contra una cuenta real de InfinityFree (ver sección de despliegue).
