# Plan de conversión — FASE 2

Basado en la auditoría (`01-auditoria.md`). Define la estructura PHP definitiva, el mapeo
archivo por archivo Django→PHP, y qué pasa con cada archivo existente.

## Decisión de carpetas durante la migración

Django sigue viviendo en `backend/` mientras se construye el reemplazo, para poder comparar y
verificar en paralelo. El backend PHP se construye en una carpeta nueva, **`backend-php/`**, y
recién en la FASE 10 (limpieza) se borra `backend/` (Django) y se renombra `backend-php/` →
`backend/` en un commit separado. Así `master`/la app en desarrollo nunca queda sin backend
funcional, y el swap final es un cambio chico y reversible.

Sin Composer ni librerías externas: JWT, router y helpers HTTP se implementan a mano (son pocas
líneas cada uno) para minimizar dependencias en un hosting compartido sin SSH.

## Estructura PHP (`backend-php/`)

```
backend-php/
├── config/
│   ├── config.php          lee .env: JWT secret, lifetimes, CORS origins, TZ America/Lima
│   └── database.php        conexión PDO (mysql:charset=utf8mb4)
├── src/
│   ├── Support/
│   │   ├── autoload.php     spl_autoload_register (mapea Namespace\Clase → src/.../Clase.php)
│   │   ├── Router.php        matchea metodo+ruta contra routes/api.php
│   │   ├── Response.php      helpers json($data,$status), error($detail,$status)
│   │   └── Jwt.php           encode/decode HS256, sin librerias externas
│   ├── Middleware/
│   │   ├── AuthMiddleware.php   valida Bearer token, cuelga el usuario autenticado del Request
│   │   └── CorsMiddleware.php   equivalente a django-cors-headers (origins desde config)
│   ├── Models/
│   │   ├── UsuarioInterno.php
│   │   ├── Cancha.php
│   │   ├── Tarifa.php
│   │   ├── Academia.php
│   │   ├── AcademiaHorario.php
│   │   ├── Reserva.php
│   │   ├── ReservaCancha.php
│   │   ├── Pago.php
│   │   └── ComentarioDia.php
│   ├── Services/
│   │   ├── ReservaService.php       reglas de horario/tarifa, pagos, adelantos pendientes
│   │   ├── AcademiaService.php      conflictos de horario, materializacion, sincronizacion
│   │   ├── DashboardService.php     resumen financiero, series 30 dias, ingresos por cancha
│   │   └── DisponibilidadService.php  grilla publica de horas libres/ocupadas
│   └── Controllers/
│       ├── AuthController.php
│       ├── UsuarioController.php
│       ├── CanchaController.php
│       ├── TarifaController.php
│       ├── AcademiaController.php
│       ├── ReservaController.php
│       ├── ComentarioDiaController.php
│       └── DisponibilidadPublicaController.php
├── routes/
│   └── api.php              tabla [metodo, ruta, controlador@accion, protegida?]
├── public/
│   ├── index.php            front controller (unico archivo servido directamente)
│   └── .htaccess            reescribe todo a index.php
├── .env / .env.example
```

## Mapa de conversión

```
Django Model                       PHP Model + tabla MySQL
────────────────────────────────── ──────────────────────────────────────────
usuarios.UsuarioInterno         →  Models/UsuarioInterno.php + usuarios_internos
reservas.Cancha                 →  Models/Cancha.php + canchas
reservas.Tarifa                 →  Models/Tarifa.php + tarifas
reservas.Reserva                →  Models/Reserva.php + reservas
reservas.ReservaCancha          →  Models/ReservaCancha.php + reserva_canchas
reservas.Pago                   →  Models/Pago.php + pagos
reservas.Academia               →  Models/Academia.php + academias
reservas.AcademiaHorario        →  Models/AcademiaHorario.php + academia_horarios
                                    (+ tabla M2M academia_horario_canchas)
reservas.ComentarioDia          →  Models/ComentarioDia.php + comentarios_dia

Serializer                          Validación PHP + JSON
────────────────────────────────── ──────────────────────────────────────────
UsuarioInternoSerializer         →  UsuarioInterno::toArray() (sin password)
AcademiaSerializer + anidados    →  Academia::toArray() / toArrayConHorarios()
HorarioEntradaSerializer         →  AcademiaService::validarHorarios()
AcademiaEntradaSerializer        →  AcademiaService::validarEntrada()
                                    (usa conflicto_de_horario internamente)
CanchaSerializer / TarifaSerializer → Cancha::toArray() / Tarifa::toArray()
PagoSerializer                   →  Pago::toArray()
ReservaSerializer                →  Reserva::toArray() (incluye canchas[], pagos[], academia)
NuevaReservaSerializer           →  ReservaService::validarNuevaReserva()
ComentarioDiaSerializer          →  ComentarioDia::toArray()

ViewSet / View                      Controller PHP
────────────────────────────────── ──────────────────────────────────────────
usuarios.PerfilView              →  AuthController::me()
                                     (+ UsuarioController: CRUD nuevo, ver decisión FASE 1 §6.3)
reservas.AcademiaViewSet         →  AcademiaController (list/create/update/destroy)
reservas.CanchaListView          →  CanchaController::list()
reservas.TarifaListView          →  TarifaController::list()
reservas.ReservaViewSet          →  ReservaController
  .list()                       →    ->list()
  .create()                     →    ->create()
  .cancelar()                   →    ->cancelar($id)
  .ausente()                    →    ->ausente($id)
  .adelantos_pendientes()       →    ->adelantosPendientes()
  .pagos()                      →    ->pagos($id)
  .resumen_pagos()              →    ->resumenPagos()
  .dashboard_financiero()       →    ->dashboardFinanciero()
reservas.DisponibilidadPublicaView → DisponibilidadPublicaController::get()
reservas.ComentarioDiaListCreateView → ComentarioDiaController::list() / ::create()
reservas.ComentarioDiaDestroyView →  ComentarioDiaController::destroy($id)

urls.py (config + usuarios + reservas)  →  routes/api.php + Support/Router.php + public/.htaccess

Django ORM (filter/select_related/       →  Métodos explícitos por Model con PDO prepared
  prefetch_related/aggregate)                statements (sin ORM genérico: cada Model expone
                                              solo los métodos que su Service/Controller usa)

SimpleJWT (TokenObtainPairView,          →  Support/Jwt.php (HS256 propio) +
  TokenRefreshView, SIMPLE_JWT)              AuthController::login()/refresh()
                                              mismas duraciones: access 18h, refresh 7d,
                                              rotación stateless (sin blacklist, igual que hoy)

reservas/servicios.py                     →  Services/*.php
  fecha_valida, horarios_se_solapan,          Support compartido usado por ReservaService,
  obtener_tarifa, segmentos_de_una_hora,      AcademiaService y DisponibilidadService
  horas_operativas, _minutos_desde_medianoche
  canchas_ocupadas, guardar_pago,          →  ReservaService.php
  listar_adelantos_pendientes
  conflicto_de_horario,                    →  AcademiaService.php
  materializar_horarios_academia,
  sincronizar_horarios_academia,
  cancelar_reservas_futuras_*
  resumen_financiero_dashboard,            →  DashboardService.php
  _monto_y_conteo, _ingresos_diarios,
  _ingresos_por_cancha
  nombre_academia_visible                  →  DisponibilidadService.php

django-cors-headers                       →  Middleware/CorsMiddleware.php
DEFAULT_PERMISSION_CLASSES=IsAuthenticated →  Middleware/AuthMiddleware.php (por ruta, según
  (+ AllowAny en DisponibilidadPublicaView)   bandera "protegida" en routes/api.php)
settings.py (DB, TZ, ALLOWED_HOSTS)       →  config/config.php + config/database.php
```

## Qué pasa con cada archivo

**Se conservan sin cambios (frontend):** `App.jsx`, `context/AuthContext.jsx`,
`context/ThemeContext.jsx`, todos los `components/*.jsx` y `components/ui/*.jsx`, `lib/utils.js`,
`utils/duracion.js`, `utils/fecha.js`, `utils/paletaColores.js`, `main.jsx`, `index.html`,
`vite.config.js`, configuración de Tailwind/shadcn, `package.json`/`package-lock.json` del
frontend.

**Se modifican (frontend):**
- `frontend/src/api.js` — apuntará a la nueva API PHP; se mantiene la misma forma de respuesta
  (`{access, refresh}` en login, `{detail: "..."}` en errores) para no tocar `AuthContext.jsx` ni
  el manejo de errores existente.
- `frontend/.env` / `.env.example` — `VITE_API_URL` apunta al nuevo backend.
- `frontend/src/auth.js` — sin cambios previstos (nombres de tokens no cambian).

**Se crean:**
- `database/schema.sql`
- Todo `backend-php/` (estructura de arriba)
- `docs/migracion/03-…` en adelante, a medida que avancen las fases
- Actualización del `package.json` raíz (`dev:backend` pasa de `python manage.py runserver` a
  `php -S localhost:8000 -t backend-php/public`)

**Dejan de utilizarse (se eliminan recién en FASE 10, tras verificar el reemplazo):**
- Todo `backend/` (Django): `config/`, `usuarios/`, `reservas/`, `venv/`, `requirements.txt`,
  `.env`, `manage.py`, `db.sqlite3` si existiera
- Secciones Python del `.gitignore` raíz
- `package.json` raíz: referencia a `backend/venv/Scripts/python.exe`

**Se reemplazan:** ver el mapa de conversión completo arriba.

## Orden de commits de aquí en adelante

1. `docs: add php conversion plan` (este documento)
2. `chore: prepare php backend structure` — carpetas + `index.php`/`.htaccess`/autoload vacíos, sin lógica
3. `feat: add mysql database schema` — `database/schema.sql`
4. `feat: add pdo database connection` — `config/database.php` + prueba de conexión
5. `feat: implement php api router` — `Router.php`, `Response.php`, `CorsMiddleware.php`, rutas base
6. `feat: implement jwt authentication` — `Jwt.php`, `AuthController`, `AuthMiddleware`
7. `feat: migrate user management to php` — `UsuarioInterno` model + `UsuarioController` (CRUD)
8. `feat: migrate reservation endpoints` — Models + Services + `ReservaController`,
   `AcademiaController`, `CanchaController`, `TarifaController`, `ComentarioDiaController`,
   `DisponibilidadPublicaController` (posiblemente varios commits, uno por bloque)
9. `feat: add financial dashboard endpoints` — `DashboardService` + acción `dashboard-financiero`
10. `refactor: connect react frontend to php api` — `api.js` + `.env`
11. `fix: support react router with htaccess` + configuración de producción (`frontend/dist` +
    `backend-php/public`)
12. `chore: remove replaced django backend` (FASE 10, commit separado tras verificar todo)
13. `docs: update setup and deployment instructions` (README/STACK finales)
