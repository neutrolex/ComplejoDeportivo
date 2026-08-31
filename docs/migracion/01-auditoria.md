# Auditoría — FASE 1 de la migración Django+PostgreSQL → PHP+MySQL

Fecha: 2026-08-31. Estado del proyecto en el momento de la auditoría: rama `migration/php-mysql`
creada desde `master` en `88a12b6` (+ `b26c7dc`), sin datos reales que preservar.

## 1. Estructura actual del proyecto

```
ComplejoDeportivo/
├── backend/                    Django 6.1 + DRF
│   ├── config/                 settings.py, urls.py (raíz)
│   ├── usuarios/                modelo UsuarioInterno + /perfil/
│   ├── reservas/                todo el dominio del negocio
│   │   ├── models.py, serializers.py, views.py, servicios.py (lógica pura)
│   │   ├── migrations/ (0001–0010, incluye seed de canchas/tarifas)
│   │   └── tests/ (13 archivos, buena cobertura)
│   ├── venv/                    (no versionado)
│   ├── requirements.txt, .env / .env.example
├── frontend/                   React 19 + Vite 8
│   └── src/
│       ├── api.js, auth.js      cliente HTTP + storage de tokens
│       ├── context/ (Auth, Theme)
│       ├── components/ (13 componentes + ui/ shadcn)
├── package.json (raíz)          concurrently: levanta backend+frontend
├── STACK.md, README.md
└── .gitignore
```

No existe carpeta `database/` ni código de WhatsApp/PWA: son solo intención en README/STACK, sin implementación.

## 2. Modelos Django encontrados

### `usuarios.UsuarioInterno` (`AbstractBaseUser` + `PermissionsMixin`, tabla `usuarios_internos`)

| Campo | Tipo | Notas |
|---|---|---|
| nombre | CharField(150) | |
| usuario | CharField(50) unique | `USERNAME_FIELD` |
| password | heredado | hash, nunca texto plano |
| rol | choices `admin` / `recepcion` | default `recepcion` |
| activo | Boolean | default `True`, alimenta `is_active` |

`is_staff` siempre `True`.

### `reservas` (8 modelos)

- **Cancha**: numero (1–4, único), activa
- **Tarifa**: modalidad (`individual`/`completo`), hora_inicio, hora_fin, precio_por_hora
- **Reserva**: modalidad, cliente_nombre, fecha, hora_inicio, hora_fin, estado (`confirmada`/`cancelada`/`completada`/`ausente`), precio_total, creado_en, academia (FK null, SET_NULL), academia_horario (FK null, SET_NULL), asignada_por (FK usuario, PROTECT), es_adelanto
- **ReservaCancha**: tabla intermedia reserva↔cancha, unique(reserva,cancha), cancha con PROTECT
- **Pago**: reserva (CASCADE), tipo (`adelanto`/`saldo`), monto, metodo (`efectivo`/`yape`), fecha_hora, registrado_por (PROTECT)
- **Academia**: nombre, permiso_mostrar, color (hex)
- **AcademiaHorario**: academia (CASCADE), dia_semana (0–6), hora_inicio, hora_fin, canchas (M2M)
- **ComentarioDia**: fecha, texto, monto_yape, monto_efectivo, creado_en, creado_por (PROTECT)

La lógica de negocio no trivial vive en `servicios.py`: solapamiento de horarios, cálculo de
tarifa por hora con el caso especial de medianoche=00:00, materialización perezosa de horarios
fijos de academia, upsert de pagos, dashboard financiero, adelantos pendientes.

## 3. Endpoints encontrados

```
POST   /api/token/                          login → {access, refresh}
POST   /api/token/refresh/                  rotación de refresh
GET    /api/perfil/                         usuario del token actual

GET    /api/canchas/
GET    /api/tarifas/
GET    /api/publico/disponibilidad/?fecha=  PÚBLICO (AllowAny), sin PII

GET    /api/reservas/?fecha=                dispara materialización perezosa
POST   /api/reservas/
POST   /api/reservas/{id}/cancelar/
POST   /api/reservas/{id}/ausente/          toggle
PATCH  /api/reservas/{id}/pagos/
GET    /api/reservas/adelantos-pendientes/
GET    /api/reservas/resumen-pagos/?fecha=
GET    /api/reservas/dashboard-financiero/

GET    /api/academias/
POST   /api/academias/
PATCH  /api/academias/{id}/
DELETE /api/academias/{id}/

GET    /api/comentarios-dia/?fecha=
POST   /api/comentarios-dia/
DELETE /api/comentarios-dia/{id}/
```

`reservas` y `academias` NO tienen `retrieve` ni `PUT/DELETE` genéricos: son `ViewSet` a medida,
no `ModelViewSet`. No fue un olvido — todo pasa por acciones específicas del negocio. El backend
PHP debe respetar exactamente este conjunto, sin "completar" un CRUD que nunca existió ahí.

## 4. Llamadas API desde React (por componente)

| Componente | Endpoints que usa |
|---|---|
| Login.jsx / AuthContext.jsx | login() → /token/ |
| PanelDisponibilidad.jsx | /canchas/, /tarifas/, /reservas/?fecha=, /academias/ |
| ReservaDialogo.jsx | crear/pagar/marcar ausente/cancelar reserva |
| AdelantoDialogo.jsx / AdelantosPendientes.jsx | crear reserva con es_adelanto, listar pendientes |
| ComentariosDia.jsx / ComentarioDialogo.jsx | CRUD de comentarios del día |
| TotalDelDia.jsx | /reservas/resumen-pagos/ |
| DashboardFinanciero.jsx | /reservas/dashboard-financiero/ |
| Academias.jsx / AcademiaDialogo.jsx | CRUD de academias |
| HorariosPublicos.jsx | fetch directo (no usa apiFetch) a /publico/disponibilidad/, sin token |

Todo pasa por `apiFetch()` en `api.js`, salvo `HorariosPublicos` y `login`. El único archivo que
debe cambiar de raíz para que el frontend hable con PHP es `api.js` (más `VITE_API_URL`).

## 5. Partes terminadas

- Autenticación JWT (login, access/refresh con rotación) — testeada.
- Módulo `reservas` completo: disponibilidad, creación con validaciones de solapamiento/tarifa/
  medianoche, pagos parciales (upsert por método), cancelar, ausente, adelantos pendientes,
  resumen de caja, dashboard financiero con series de 30 días.
- Módulo `academias`: horarios recurrentes con detección de conflictos, materialización perezosa
  idempotente, sincronización al editar sin romper reservas ya generadas.
- Web pública de disponibilidad (sin PII).
- Seed de datos (4 canchas + 5 tarifas) vía migración Django.
- Suite de tests amplia para `reservas` (13 archivos).

## 6. Partes incompletas / puntos de decisión

1. **Refresh token no se usa en el frontend.** El backend rota refresh tokens correctamente, pero
   `api.js` nunca llama a `/token/refresh/`: ante un 401 borra tokens y recarga (fuerza re-login
   cada 18h). Se mantiene igual en PHP salvo indicación contraria.
2. **`SIMPLE_JWT` sin `token_blacklist` instalado.** La rotación es stateless: el refresh viejo
   sigue válido hasta expirar, no hay revocación. Se replica igual en PHP: JWT stateless en ambos
   tokens, sin tabla de tokens en MySQL.
3. **No existía API REST de `usuarios`** más allá de `GET /perfil/` — alta/edición/borrado se
   hacía por el admin de Django. **Decisión tomada: se construye un CRUD completo
   (`GET/POST/PUT/DELETE /api/usuarios`, solo rol admin) en PHP**, ya que el admin de Django
   desaparece con la migración.
4. `usuarios/tests.py` está vacío — sin tests automatizados de login/perfil en el original.
5. Bot de WhatsApp y PWA: mencionados en README/STACK como visión futura, sin código. Fuera de
   alcance de esta migración.

## 7. Archivos Django que dejarán de usarse

Todo `backend/` (config, usuarios, reservas, venv, requirements.txt, migrations) queda obsoleto
una vez exista el equivalente PHP verificado. No se borra hasta entonces.

## 8. Archivos del frontend que se conservan sin cambios

Prácticamente todo: `App.jsx`, `context/`, todos los `components/*` y `components/ui/*`,
`lib/utils.js`, `utils/duracion.js`, `utils/fecha.js`, `utils/paletaColores.js`, configuración de
Tailwind/shadcn, `main.jsx`. Únicos archivos a tocar: `api.js` (base URL / forma de la respuesta
de login) y posiblemente `auth.js` si cambian los nombres de campo del token.

## 9. Riesgos / incompatibilidades detectadas

- `materializar_horarios_academia` corre dentro de un lock de fila (`SELECT FOR UPDATE`) para
  evitar duplicados ante requests concurrentes. Se traduce igual con InnoDB + transacción PDO;
  las tablas deben usar motor **InnoDB** (no MyISAM: sin FKs ni locks).
- `password_hash()`/`password_verify()` de PHP usan bcrypt, formato distinto al PBKDF2 de Django:
  no hay migración de contraseñas posible (tampoco hace falta, no hay datos reales).
- InfinityFree: verificar límites de conexiones simultáneas y tamaño de BD del plan gratuito.
- JWT en PHP: implementación HS256 propia y mínima, sin librerías externas pesadas.

## 10. Orden recomendado

Rama `migration/php-mysql` → estructura PHP base → `database/schema.sql` → conexión PDO/router/
CORS → autenticación → usuarios (CRUD nuevo) → reservas (incluye `servicios.py` → `ReservaService`)
→ dashboard → adaptar `api.js` del frontend → producción (`.htaccess`, build) → limpieza de Django.
Cada bloque con su propio commit, verificado antes de avanzar.
