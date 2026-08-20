# Complejo Deportivo

Sistema de digitalización para la administración de un complejo deportivo de 4 canchas (reservables como medio campo o campo completo).

## Componentes

1. **Web pública** — muestra disponibilidad de horarios (sin reservas ni pagos en línea).
2. **Bot de WhatsApp** — respuestas a preguntas frecuentes vía API oficial de Meta.
3. **Dashboard financiero** — ingresos diferenciados por efectivo y Yape.
4. **App móvil (PWA)** — mismo contenido que la web, se construye si el tiempo lo permite.

## Estructura del repositorio

```
backend/   Django + Django REST Framework (API)
frontend/  React + Vite (web pública)
docs/      Notas técnicas y decisiones de diseño
```

## Cómo levantar el entorno

Ver [docs/entorno-desarrollo.md](docs/entorno-desarrollo.md).

## Stack

- Backend: Django, Django REST Framework, JWT (`djangorestframework-simplejwt`)
- Base de datos: PostgreSQL
- Frontend: React + Vite
- Control de versiones: Git / GitHub
