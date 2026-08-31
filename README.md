# Complejo Deportivo

Sistema de digitalización para la administración de un complejo deportivo de 4 canchas (reservables como medio campo o campo completo).

## Componentes

1. **Web pública** — muestra disponibilidad de horarios (sin reservas ni pagos en línea).
2. **Bot de WhatsApp** — respuestas a preguntas frecuentes vía API oficial de Meta (no implementado todavía).
3. **Dashboard financiero** — ingresos diferenciados por efectivo y Yape.
4. **App móvil (PWA)** — mismo contenido que la web, se construye si el tiempo lo permite.

## Estructura del repositorio

```
backend/           PHP + PDO (API REST)
frontend/          React + Vite (web pública / panel administrativo)
database/          schema.sql (MySQL/MariaDB, importable desde phpMyAdmin)
docs/migracion/     historial de la migración de Django+PostgreSQL a PHP+MySQL
```

## Cómo levantar el entorno local

1. **Base de datos**: crear una base MySQL/MariaDB e importar `database/schema.sql`
   (incluye el seed de canchas y tarifas) desde phpMyAdmin o `mysql < database/schema.sql`.
2. **Backend**: copiar `backend/.env.example` a `backend/.env` y completar las
   credenciales de MySQL. Crear el primer usuario admin con
   `php backend/bin/crear_usuario.php <usuario> <password> <nombre> admin`.
3. **Frontend**: copiar `frontend/.env.example` a `frontend/.env` (ya apunta a
   `http://localhost:8000/api`, mismo puerto que el paso siguiente).
4. **Levantar todo junto**: `npm install` en la raíz y en `frontend/`, después
   `npm run dev` — usa `concurrently` para levantar el backend PHP
   (`php -S localhost:8000`) y el frontend (Vite) al mismo tiempo.

Requiere PHP 8.1+ (con `pdo_mysql` y `bcmath`) y una base MySQL/MariaDB accesibles
localmente. Ver `docs/migracion/03-produccion.md` para el despliegue en hosting
compartido (probado contra un layout equivalente al de InfinityFree).

## Stack

- Backend: PHP + PDO, JWT propio (HS256), sin framework ni ORM
- Base de datos: MySQL / MariaDB
- Frontend: React + Vite
- Control de versiones: Git / GitHub

Detalle completo en [STACK.md](STACK.md).
