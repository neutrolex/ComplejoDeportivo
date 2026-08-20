# Decisiones técnicas

Registro breve de decisiones tomadas durante el desarrollo y por qué, para no repetir la discusión después.

## PostgreSQL: instalación nativa (no Docker)

**Fecha:** 2026-08-20

Se evaluó correr PostgreSQL en un contenedor Docker vs. usar la instalación nativa (PostgreSQL 18 como servicio de Windows).

**Decisión:** se mantiene la instalación nativa mientras el proyecto está en etapa temprana (poco riesgo de pérdida de datos, un solo desarrollador).

**Cuándo reconsiderar:** si se suma otro colaborador, se cambia de máquina, o se necesita reproducir el entorno fácilmente, migrar a Docker usando `pg_dump`/`pg_restore` para mover los datos.

**Credenciales de este proyecto** (ver valores reales solo en `backend/.env`, nunca aquí):
- Base de datos: `complejo_deportivo_db`
- Usuario dedicado: `complejo_deportivo_user` (no se usa el superusuario `postgres` para la app)

## Nombres de paquetes/carpetas

- El paquete de configuración de Django se llama `config` (convención común para no confundirlo con las apps de negocio como `reservas`, `canchas`, etc.)
- Monorepo con `backend/`, `frontend/` y `docs/` en la raíz del mismo repositorio de GitHub.
