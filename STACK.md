# Stack tecnológico — Complejo Deportivo

Resumen de las tecnologías, frameworks y librerías con las que se está construyendo el proyecto.

> Migrado desde Django + DRF + PostgreSQL a PHP + MySQL entre 2026-08-31 y esta fecha,
> para poder desplegar en hosting PHP compartido (InfinityFree). Historial completo de
> la migración, decisiones y verificaciones en [docs/migracion/](docs/migracion/).

## Frontend (`frontend/`)

| Categoría | Tecnología |
|---|---|
| Librería UI | [React 19](https://react.dev/) |
| Build tool / dev server | [Vite 8](https://vite.dev/) |
| Ruteo | [React Router](https://reactrouter.com/) v7 |
| Estilos | [Tailwind CSS 4](https://tailwindcss.com/) (vía `@tailwindcss/vite`) |
| Componentes UI | [shadcn/ui](https://ui.shadcn.com/) (basado en [Radix UI](https://www.radix-ui.com/) — `dialog`, `popover`, `slot`) |
| Utilidades de estilos | `class-variance-authority`, `clsx`, `tailwind-merge` |
| Iconos | [lucide-react](https://lucide.dev/) |
| Gráficos | [Recharts](https://recharts.org/) (usado en el dashboard financiero) |
| Linter | [oxlint](https://oxc.rs/docs/guide/usage/linter.html) |

No hubo que reescribir ni un componente: solo cambió la URL de login en `src/api.js`
(`/token/` → `/auth/login`) al migrar el backend.

## Backend (`backend/`)

| Categoría | Tecnología |
|---|---|
| Lenguaje | PHP 8.1+ |
| Acceso a datos | PDO con prepared statements, sin ORM |
| Autenticación | JWT propio (HS256, sin librerías externas) — access token 18h, refresh 7 días, con rotación stateless |
| Router | Router propio por regex (`src/Support/Router.php`), sin framework |
| Autoload | `spl_autoload_register` estilo PSR-4, sin Composer |
| Aritmética monetaria | `bcmath` (nunca floats, para precisión decimal exacta) |
| Modelo de usuario | Tabla `usuarios_internos` con rol (`admin`/`recepcion`), `password_hash()`/`password_verify()` |
| CORS | `Middleware/CorsMiddleware.php`, lista blanca de orígenes por `.env` |
| Configuración por entorno | Parser propio de `.env` en `config/config.php` |

## Base de datos

- **MySQL / MariaDB**, InnoDB + `utf8mb4`. Esquema en `database/schema.sql`, importable
  directo desde phpMyAdmin.
- Zona horaria: `America/Lima` (fijada tanto en PHP como en la sesión de MySQL, ver
  `config/database.php`). Localización: `es-pe`.

## Estructura del repositorio

Monorepo con estas carpetas principales en la raíz:

```
backend/            PHP + PDO (API REST)
frontend/           React + Vite (web pública / panel administrativo)
database/           schema.sql (MySQL/MariaDB)
docs/migracion/      historial de la migración Django→PHP
```

Un `package.json` en la raíz usa `concurrently` para levantar backend y frontend juntos
con `npm run dev` (backend vía el servidor embebido de PHP, `php -S`).

## Producción

Pensado para hosting PHP compartido sin SSH ni Docker (InfinityFree como referencia):
`frontend/dist/` se sube a la raíz del hosting, `backend/` completo se sube como
subcarpeta `api/`. Detalle en `docs/migracion/03-produccion.md`, incluido un hallazgo
real de compatibilidad con PHP-CGI (el header `Authorization` no llega por defecto) ya
resuelto.

## Otras herramientas

- **Control de versiones:** Git / GitHub
- **Gestor de paquetes frontend:** npm
- **Correo:** no implementado (el backend original usaba el backend de consola de
  Django solo en desarrollo; no habia envio real de correo)

## Componentes del sistema (visión general del producto)

1. **Web pública** — disponibilidad de horarios (sin reservas ni pagos en línea).
2. **Bot de WhatsApp** — respuestas automáticas vía API oficial de Meta (fuera del
   alcance de la migración; la arquitectura queda preparada para integrarlo después,
   sin webhooks ni tablas específicas todavía).
3. **Dashboard financiero** — ingresos diferenciados por efectivo y Yape.
4. **App móvil (PWA)** — mismo contenido que la web (si el tiempo lo permite).
