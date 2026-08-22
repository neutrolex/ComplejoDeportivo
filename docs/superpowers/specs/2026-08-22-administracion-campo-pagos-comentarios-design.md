# Administración de campo: pagos por reserva y comentarios del día — diseño

**Fecha:** 2026-08-22
**Estado:** aprobado, pendiente de implementación
**Revisión:** v2 — reemplaza el enfoque de comentarios-por-reserva de v1 (ver
sección 9) tras revisar mockups concretos aportados por el usuario.

## 1. Propósito

El panel de "Reservas" pasa a llamarse "Administración de campo" y se
reconstruye visualmente sobre **Tailwind CSS + shadcn/ui** (hoy el
proyecto no usa ninguno de los dos — todo es estilos inline vía
`theme.js`), tomando como referencia exacta unos mockups que el usuario
compartió. Gana:

1. **Ancho completo** — ya corregido (ver sección 8.1).
2. **Pago editable por reserva**, con dos campos fijos Yape/Efectivo,
   completables también al momento de crear la reserva.
3. **Comentarios del día** (no por reserva): panel lateral fijo con
   varias notas por día, cada una con un monto opcional en Yape y/o
   Efectivo, que se pueden borrar.
4. **Total del día bajo demanda**: botón que revela una tarjeta con el
   total Yape, Efectivo y general, sumando reservas + comentarios.
5. **Dashboard financiero** con gráficos reales (recharts) en vez de SVG
   hecho a mano, mismos datos combinados (reservas + comentarios).

## 2. Stack visual nuevo

Se instala Tailwind CSS, shadcn/ui y recharts en `frontend/`:

```bash
npm install -D tailwindcss postcss autoprefixer
npx shadcn@latest init      # genera components.json, src/components/ui/
npm install recharts lucide-react   # lucide-react: los íconos que usa shadcn (Smartphone, Banknote, Trophy...)
```

- `tailwind.config.js` + `postcss.config.js` nuevos; `src/index.css` pasa
  a incluir las directivas de Tailwind (`@tailwind base/components/utilities`)
  además de lo que sobreviva de la limpieza ya hecha en la sección 8.1.
- Paleta: fondo `slate-50`, tarjetas blancas con `shadow-sm` y borde
  `slate-200`, acento **emerald** (botones primarios, hover de "Libre",
  borde de tarjetas de comentario), Yape en **violeta** `#7c3aed`,
  Efectivo en **verde** `#059669`, pendiente en **ámbar**.
- `theme.js` (los `TOKENS` actuales) queda obsoleto para todo lo que se
  migre en este trabajo; no se borra hasta confirmar que ningún
  componente restante lo usa (ver sección 6, qué se toca y qué no).
- Componentes shadcn a generar: `button`, `dialog`, `input`, `textarea`,
  `badge`, `card`. Se usan tal cual los genera el CLI, sin fork.

## 3. Decisiones de diseño

### 3.1 Pago: upsert por método (igual que v1)

Sigue igual que en la v1 del spec: como máximo un `Pago` por
`(reserva, metodo)`; guardar el campo Yape o Efectivo hace
`update_or_create`, no acumula una lista. El campo `tipo` deja de
pedirse en el formulario — el backend lo fija a `saldo`. Sin cambio de
esquema en `Pago`.

Diferencia sobre v1: el mismo formulario de dos campos (Yape/Efectivo)
se usa también al **crear** la reserva (antes el alta era solo
`window.prompt()` pidiendo el nombre) — ver 4.1 y 5.2.

### 3.2 Comentarios: por día, no por reserva (revierte la decisión de v1)

Los mockups muestran un panel de "Comentarios" fijo al costado de la
grilla, con notas generales del día (ej. "deportivo lima yapeo 200 de
su deuda debe 500", con badge de monto) — no ligadas a una celda
específica. Esto reemplaza tanto la idea de v1 (comentario por reserva)
como el `ObservacionDia` actual (texto único de solo lectura por día):
ambos se funden en un solo modelo nuevo, `ComentarioDia`, que admite
**varias** notas por día, cada una con montos propios y borrable.

`ObservacionDia`, su vista, su URL y `Observaciones.jsx` se eliminan.

### 3.3 Edición: diálogo modal, no panel debajo de la grilla

Se reemplaza el patrón actual (`ReservaDetalle.jsx` renderizado debajo
de la tabla) por un diálogo modal centrado (shadcn `Dialog`), reusado
tanto para crear una reserva nueva como para editar una existente —
mismo formulario, el modo "editar" agrega un botón de eliminar (ícono
de basurero) que cancela la reserva.

### 3.4 Campo completo: una sola celda fusionada

Hoy una reserva de campo completo se repite en las 4 columnas de cancha
más la columna "Campo completo" (5 celdas idénticas). Pasa a ser **una
sola celda** que ocupa las 5 columnas (`colSpan={5}`) en esa fila.

## 4. Cambios al modelo de datos

### 4.1 `Pago`: sin cambio de esquema (igual que v1)

Se agrega una función compartida en `servicios.py`,
`guardar_pago(reserva, metodo, monto, usuario)`, que hace el
`update_or_create`. La usan tanto el endpoint de creación de reserva
(4.3) como el de edición de pagos (4.4) — una sola implementación del
upsert.

### 4.2 Tabla nueva: `ComentarioDia` (reemplaza a `ObservacionDia`)

```python
class ComentarioDia(models.Model):
    # 'fecha' es la fecha del panel (la que se está viendo/editando),
    # no necesariamente hoy -- igual criterio que ObservacionDia.fecha.
    fecha = models.DateField()
    texto = models.CharField(max_length=500)
    monto_yape = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0.00'))
    monto_efectivo = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0.00'))
    creado_en = models.DateTimeField(auto_now_add=True)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='comentarios_dia',
    )

    class Meta:
        db_table = 'comentarios_dia'
        ordering = ['-creado_en']
```

Migración: crea `comentarios_dia`, borra `observaciones_dia` (se pierde
el texto libre ya escrito — es un cambio de formato, no hay forma de
mapear un texto suelto a las notas nuevas; si el usuario quiere
conservar lo ya anotado, se copia a mano como primer comentario del día
antes de aplicar la migración).

## 5. Backend: endpoints

### 5.1 `POST /api/reservas/` — gana `yape`/`efectivo` opcionales

`NuevaReservaSerializer` gana `yape` y `efectivo`
(`DecimalField(required=False, default=Decimal('0.00'))`). Si vienen
con monto > 0, después de crear la `Reserva` se llama
`guardar_pago(reserva, metodo, monto, request.user)` por cada uno. El
resto del contrato (`cliente_nombre`, `modalidad`, `canchas`, `academia`)
no cambia.

### 5.2 `PATCH /api/reservas/{id}/pagos/` (reemplaza el `POST` actual, igual que v1)

Sin cambios respecto a v1: `{"efectivo": "80.00", "yape": "0.00"}`,
usa `guardar_pago` por cada clave presente. Response: `ReservaSerializer`
completo.

### 5.3 `GET/POST /api/comentarios-dia/` (nuevo)

- `GET ?fecha=YYYY-MM-DD` (requerido): lista los `ComentarioDia` de esa
  fecha, más reciente primero.
- `POST`: body `{"fecha": "...", "texto": "...", "monto_yape": "150.00", "monto_efectivo": "0.00"}`.
  Monto de cada método opcional, default `0.00`. `creado_por=request.user`.

### 5.4 `DELETE /api/comentarios-dia/{id}/` (nuevo)

Borra el comentario. Sin confirmación server-side (la hace el frontend).

### 5.5 Se eliminan

`ObservacionDiaView` y la ruta `/observaciones/<fecha>/`.

### 5.6 `resumen_pagos` y `resumen_financiero_dashboard` — misma forma, más una fuente

Igual que v1 (sección 4.3/4.4 de esa versión), pero la fuente adicional
ahora es `ComentarioDia` (filtrando por su campo `fecha`, sumando
`monto_yape` + `monto_efectivo`) en vez de `ComentarioReserva`. El
conteo de "reservas" de cada ventana de `resumen_financiero_dashboard`
sigue contando reservas con `Pago` únicamente — un `ComentarioDia` no
está ligado a ninguna reserva, así que no aporta al conteo, solo al
monto.

## 6. Frontend

### 6.1 `PanelLayout.jsx`

- `NAV[0].label`: `'Reservas'` → `'Administración de campo'`.
- Ícono del logo: ⚽ → 🏆 (trofeo, como en el mockup), texto "Campos" se
  mantiene.
- Restyle a Tailwind: sidebar blanco, item activo con fondo
  `emerald-500`/texto blanco, header de tabla `bg-slate-800 text-white
  uppercase`.

### 6.2 `PanelDisponibilidad.jsx` → grilla + fecha en español

- Encabezado: además del selector de fecha, se muestra la fecha en
  español largo ("Sábado 22 de Agosto") — nuevo helper
  `formatearFechaLarga` en `utils/fecha.js`.
- Filas alternadas blanco/gris (`even:bg-slate-50`).
- Celda libre: texto gris tenue, `hover:bg-emerald-50` (o equivalente).
- Celda ocupada: fondo rosa suave + anillo, nombre del cliente + badges
  de pago (`Badge` de shadcn): "Yape S/XX" (violeta), "Efectivo S/XX"
  (verde), ambos si aplica, o "Pendiente" (ámbar) si los dos montos son
  0. Reserva de campo completo: una celda con `colSpan={5}` (ver 3.4).
- Click en celda libre u ocupada abre `ReservaDialogo.jsx` (ver 6.4) en
  vez de `window.prompt()` / el panel de `ReservaDetalle.jsx`.

### 6.3 `ReservaDialogo.jsx` (nuevo, reemplaza `ReservaDetalle.jsx`)

`Dialog` de shadcn, dos modos:

- **Crear** (celda libre): título "Nueva reserva — {hora} · {cancha}".
  Campos: Cliente (texto), Yape (S/), Efectivo (S/), con íconos
  `Smartphone`/`Banknote` de lucide-react. "Total" calculado en vivo
  (suma de los dos montos, solo informativo). Botón Guardar → `POST
  /reservas/` con `yape`/`efectivo` incluidos (ver 5.1).
- **Editar** (celda ocupada): título "Editar reserva — {hora} ·
  {cancha}". Mismos campos, precargados con los valores actuales
  (nombre no editable — igual que hoy, para corregirlo se cancela y se
  crea de nuevo). Botón Guardar → `PATCH .../pagos/` (5.2). Botón
  eliminar (ícono basurero, rojo) → `POST .../cancelar/` (sin cambios).

No se muestra ya la "Tarifa de referencia" en el diálogo (no está en el
mockup); `precio_total` se sigue calculando y guardando en el backend
igual que hoy, solo deja de mostrarse en este formulario.

### 6.4 `ComentariosDia.jsx` (nuevo, reemplaza `Observaciones.jsx`)

Panel lateral derecho, `sticky`. Encabezado "Comentarios" + botón
"+ Agregar". Lista de tarjetas (borde izquierdo emerald): texto,
badges de monto Yape/Efectivo (los que sean > 0), botón eliminar
(visible al hover) → `DELETE /comentarios-dia/{id}/`. "+ Agregar" abre
`ComentarioDialogo.jsx`: textarea + Yape + Efectivo (ambos opcionales) +
Guardar → `POST /comentarios-dia/`.

### 6.5 Total del día: botón bajo demanda (reemplaza `ResumenPagos.jsx` siempre visible)

Botón "Calcular total del día" debajo de la grilla; al hacer click
revela una tarjeta con gradiente `slate-800` → `slate-900` mostrando
Total Yape, Total Efectivo y "TOTAL DEL DÍA" (grande, emerald). Mismos
datos que ya devuelve `resumen_pagos` (5.6) — el cambio es solo de
presentación (oculto hasta pedirlo, en vez de siempre visible) y estilo.

### 6.6 `DashboardFinanciero.jsx` → recharts

Se reemplazan `GraficoIngresosDiarios`, `YapeVsEfectivo` e
`IngresosPorCancha` (SVG a mano) por recharts:

- `BarChart` apilado (`ingresos_diarios_30_dias`): barras Yape
  (`#7c3aed`) y Efectivo (`#059669`).
- `PieChart` Yape vs Efectivo (`total_yape_30_dias` /
  `total_efectivo_30_dias`).
- `BarChart` horizontal (`ingresos_por_cancha_30_dias`).

Las 4 tarjetas de KPI (Hoy/Ayer/Esta semana/Este mes) y las 2 de
Total Yape/Efectivo (30 días) se restylan a Tailwind/shadcn `Card`, sin
cambiar qué datos muestran.

## 7. Fuera de alcance

- Editar el texto de un comentario ya guardado (solo alta y borrado).
- Migrar el texto libre existente de `ObservacionDia` a `ComentarioDia`
  (se pierde al aplicar la migración, ver 4.2).
- Paginación de reservas/comentarios en el frontend (la mención a
  "límite 300 por página" en el prompt original es de una plataforma
  no-code distinta — acá se sigue usando Django REST normal, sin límite
  artificial de 300; las consultas ya están acotadas por fecha).
- Editar el nombre del cliente de una reserva ya creada.
- Dark mode.

## 8. Ya aplicado / verificado

### 8.1 Ancho completo

`frontend/src/index.css`: se quitó `width: 1126px; margin: 0 auto;
text-align: center; border-inline: ...` de `#root` (boilerplate de Vite
sin uso real). Verificado en el navegador: la tabla pasó de 841px a
1622px de ancho sobre un viewport de 1920px.

### 8.2 Login local

Se restableció la contraseña del usuario `admin` a `admin123` (pedido
explícito del usuario) y se agregó `http://localhost:5174` a
`CORS_ALLOWED_ORIGINS` en `backend/.env` (el `.env` original solo
permitía el puerto 5173; Vite había levantado el frontend en 5174 por
tener el 5173 ocupado).

## 9. Historial de esta decisión

La v1 de este documento (mismo archivo, antes de esta revisión) definía
comentarios ligados a cada reserva individual, con un panel de detalle
debajo de la grilla en vez de diálogos modales, y sin Tailwind/shadcn.
El usuario aportó después mockups concretos que mostraban un enfoque
distinto (panel de comentarios general por día, diálogos modales,
Tailwind/shadcn) y, preguntado explícitamente, confirmó que eso es lo
que quiere — de ahí el reemplazo descrito en 3.2 y 3.3.

## 10. Orden de construcción

1. ~~Fix de ancho (`index.css`)~~ — hecho.
2. Setup de Tailwind + shadcn/ui + recharts (sin tocar componentes
   todavía) — se verifica que el proyecto sigue compilando y que un
   componente shadcn de prueba se ve bien.
3. Backend: migración `ComentarioDia` (+ borra `ObservacionDia`),
   `guardar_pago()` compartida, endpoints de comentarios-día, `PATCH
   .../pagos/`, `yape`/`efectivo` en `POST /reservas/`. Tests de todo
   esto antes de tocar frontend.
4. Backend: `resumen_pagos` y `resumen_financiero_dashboard` sumando
   `ComentarioDia`. Tests actualizados.
5. Frontend: `PanelLayout.jsx` (rename + restyle), grilla con badges y
   celda fusionada de campo completo, `ReservaDialogo.jsx`.
6. Frontend: `ComentariosDia.jsx` + `ComentarioDialogo.jsx`, botón de
   total del día.
7. Frontend: `DashboardFinanciero.jsx` con recharts.
8. Prueba manual de punta a punta en el navegador.

## 11. Plan de pruebas

- Backend: upsert de pago (crear reserva con `yape`/`efectivo`, editar
  después vía `PATCH`, confirmar que no duplica filas); alta, listado
  por fecha y borrado de `ComentarioDia`; `resumen_pagos` y
  `dashboard_financiero` suman `Pago` + `ComentarioDia` correctamente
  por fecha en cada ventana de tiempo.
- Frontend: prueba manual guiada en el navegador, siguiendo el orden de
  construcción de la sección 10.
