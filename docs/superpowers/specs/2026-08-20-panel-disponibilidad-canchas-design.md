# Panel de disponibilidad y reservas (staff) — diseño

**Fecha:** 2026-08-20
**Estado:** aprobado, pendiente de implementación

## 1. Propósito

Primera pantalla real del frontend: un panel interno, protegido por login JWT,
donde el personal del complejo (dueños/recepción) puede:

- Ver, para un día elegido, qué horas están libres u ocupadas en cada una de
  las 4 canchas (y en campo completo).
- Marcar una hora como ocupada (crea una reserva) o liberarla (cancela una
  reserva existente).
- Registrar a mano los pagos reales de cada reserva (monto + método), pudiendo
  dividir un cobro entre Yape y efectivo.
- Ver un resumen de totales del día (efectivo / Yape / general), bajo pedido.
- Anotar observaciones de texto libre por día (ej. deudas de academias),
  sin ningún cálculo automático.

No es la web pública (que solo mostrará disponibilidad, sin login) ni el
dashboard financiero completo — es la herramienta de trabajo diario del
staff para registrar lo que hoy anotan en papel.

## 2. Cambios al modelo de datos

### 2.1 Tabla nueva: `observaciones_dia`

No estaba en el diseño original de 7 tablas; se agrega a pedido explícito
durante esta conversación.

```python
class ObservacionDia(models.Model):
    fecha = models.DateField(unique=True)
    texto = models.TextField(blank=True, default='')
    actualizado_en = models.DateTimeField(auto_now=True)
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
    )

    class Meta:
        db_table = 'observaciones_dia'
```

Un texto libre por día, sin relación formal con `academias` ni `pagos`. El
staff escribe lo que necesite anotar, tal como en la hoja de papel.

### 2.2 Tablas existentes: se usan tal cual, sin cambios de esquema

- **`reservas`**: cada "hora marcada como ocupada" es 1 fila (1 hora exacta:
  `hora_fin = hora_inicio + 1h`). Al liberar una hora, no se borra la fila:
  pasa a `estado='cancelada'` (conserva el historial).
  `precio_total` se calcula solo desde `tarifas` — es un valor de
  **referencia**, no lo que se cobró.
- **Bloqueos sin cliente real** (ej. mantenimiento futuro): no necesitan
  campo nuevo. El staff escribe algo como `"Mantenimiento"` en
  `cliente_nombre`. Mismo mecanismo que una reserva normal.
- **Academias** (Talentos, Potrillos, etc.): se registran igual que
  cualquier cliente, usando el nombre de la academia como `cliente_nombre`.
  Sin vínculo formal con la tabla `academias` todavía (fuera de alcance).
- **`reserva_canchas`**: 1 fila si la reserva es individual, 4 filas si es
  campo completo (una reserva, cuatro canchas vinculadas).
- **`pagos`**: cada pago que el staff registra a mano es 1 fila
  (`tipo`, `monto`, `metodo`, `registrado_por`). Una reserva puede tener
  varios pagos (ej. adelanto en Yape + saldo en efectivo). El sistema
  **nunca** calcula ni asume montos — todo lo escribe el staff.

### 2.3 Datos semilla (vía migración de datos)

Se cargan mediante una migración de datos de Django (no a mano), para que
cualquiera que clone el repo y corra `migrate` los tenga automáticamente.

**Canchas:** 4 filas, `numero` 1 a 4, `activa=True`.

**Tarifas:**

| Modalidad  | Hora inicio | Hora fin | Precio/hora |
|------------|-------------|----------|-------------|
| individual | 08:00       | 17:30    | S/ 50.00    |
| individual | 17:30       | 18:00    | S/ 60.00    |
| individual | 18:00       | 00:00*   | S/ 70.00    |
| completo   | 08:00       | 18:00    | S/ 160.00   |
| completo   | 18:00       | 00:00*   | S/ 180.00   |

\* `00:00` representa medianoche = fin del día operativo (el complejo cierra
a las 12am). PostgreSQL no tiene un "24:00", así que `00:00` como
`hora_fin` se trata como caso especial ("sin límite superior") en la
función que busca la tarifa correcta, usada al crear una reserva —
ver sección 3.4.

`precio_por_hora` para `completo` es el precio del campo completo por hora
(no se multiplica por 4 canchas).

## 3. Backend: endpoints nuevos (todos protegidos, `IsAuthenticated`)

Todos viven bajo `/api/`. Los de `reservas` se implementan como un
`ReservaViewSet` (DRF) con acciones extra; canchas/tarifas son listas de
solo lectura; observaciones es una vista aparte (se indexa por fecha, no
por id).

### 3.1 `GET /api/canchas/`
Lista las 4 canchas. Response: `[{"id":1,"numero":1,"activa":true}, ...]`

### 3.2 `GET /api/tarifas/`
Lista las 5 franjas de tarifa. El frontend la usa para saber el rango de
horas del día (8:00 a 24:00) sin tenerlo escrito a mano en el código.

### 3.3 `GET /api/reservas/?fecha=YYYY-MM-DD`
Reservas **no canceladas** de ese día, con sus canchas y pagos ya incluidos
(para que el frontend arme la grilla y el detalle con un solo pedido).

```json
[
  {
    "id": 12,
    "modalidad": "individual",
    "cliente_nombre": "Juan Perez",
    "fecha": "2026-08-20",
    "hora_inicio": "18:00:00",
    "hora_fin": "19:00:00",
    "estado": "confirmada",
    "precio_total": "70.00",
    "canchas": [2],
    "pagos": [
      {"id": 5, "tipo": "adelanto", "monto": "30.00", "metodo": "yape", "fecha_hora": "2026-08-20T15:03:00Z"}
    ]
  }
]
```

### 3.4 `POST /api/reservas/`
Crea una reserva de 1 hora.

Body: `{"fecha": "2026-08-20", "hora_inicio": "18:00", "cliente_nombre": "Juan Perez", "modalidad": "individual", "canchas": [2]}`
(`canchas` es `[n]` para individual, `[1,2,3,4]` para completo — el
frontend arma esa lista, el backend no adivina).

Lógica del servidor (no del frontend):
- `hora_fin = hora_inicio + 1 hora`.
- Busca la `Tarifa` que cubre `(modalidad, hora_inicio)` → si no hay
  ninguna, `400` ("fuera de horario de atención").
- **Valida que ninguna de las canchas pedidas ya esté ocupada** esa
  fecha/hora por una reserva no cancelada (revisa `reserva_canchas`,
  sin importar si la reserva existente es individual o completo — así
  se evita que una reserva de campo completo choque con una individual
  ya tomada en una de esas 4 canchas). Si choca, `400` con el detalle.
- `precio_total = tarifa.precio_por_hora`.
- `asignada_por = request.user`.
- Crea 1 `Reserva` + 1 o 4 `ReservaCancha`, todo en una transacción.

Response: `201` con el mismo formato que 3.3.

### 3.5 `POST /api/reservas/{id}/cancelar/`
Sin body. Pone `estado='cancelada'`. Response: `200` con la reserva
actualizada. No se puede "descancelar" desde acá (si se necesita, se crea
una reserva nueva).

### 3.6 `POST /api/reservas/{id}/pagos/`
Agrega un pago a una reserva existente.

Body: `{"tipo": "adelanto", "monto": "30.00", "metodo": "yape"}`
(`tipo`: `adelanto`/`saldo`, `metodo`: `efectivo`/`yape` — tal como en la
tabla `pagos`). `registrado_por = request.user`, `fecha_hora` automática.

Response: `201` con el pago creado.

### 3.7 `GET /api/reservas/resumen-pagos/?fecha=YYYY-MM-DD`
Suma **todos** los pagos de reservas de ese día, sin importar si la reserva
terminó cancelada (un adelanto cobrado no se devuelve solo porque la
reserva se cancele después — así se confirmó explícitamente).

Response: `{"total_efectivo": "320.00", "total_yape": "150.00", "total_general": "470.00"}`

### 3.8 `GET /api/observaciones/<fecha>/` y `PUT /api/observaciones/<fecha>/`
`GET` devuelve `{"fecha": "2026-08-20", "texto": ""}` si todavía no existe
nada ese día (no da 404 — más simple para el frontend). `PUT` con
`{"texto": "..."}` crea o actualiza (upsert) la fila, guardando
`actualizado_por = request.user`.

## 4. Frontend

Primera pantalla real — se aprovecha para introducir el patrón base que
usarán las pantallas futuras.

### 4.1 Estructura de archivos

```
frontend/src/
  api.js                    cliente HTTP: agrega el header Authorization
                             a cada pedido, usando el token guardado
  auth.js                   guardar/leer/borrar tokens en localStorage
  context/AuthContext.jsx   estado global: ¿hay sesión activa?
  components/Login.jsx
  components/PanelDisponibilidad.jsx   la grilla del día
  components/NuevaReservaForm.jsx      modal: nombre de cliente al ocupar
  components/ReservaDetalle.jsx        modal: pagos + cancelar, al abrir
                                        una celda ya ocupada
  components/Observaciones.jsx         textarea + botón guardar
  components/ResumenPagos.jsx          botón + totales del día
  App.jsx                   sin login -> <Login/>, con login -> <PanelDisponibilidad/>
```

Todavía **sin React Router**: solo hay una pantalla interna por ahora.
Se agrega Router cuando exista más de una página (web pública, etc.).

### 4.2 Sesión (login)

- `Login.jsx` llama a `POST /api/token/`, guarda `access`/`refresh` en
  `localStorage` vía `auth.js`.
- `api.js` agrega `Authorization: Bearer <access>` a cada pedido. Si un
  pedido responde `401`, se borra la sesión guardada y se vuelve a mostrar
  el login (por ahora sin refresco automático del token — con 18 horas de
  vida alcanza de sobra para un turno completo, incluso con margen; se
  revisa más adelante si hace falta acortarlo).
- Nota de seguridad para tu aprendizaje: guardar el token en `localStorage`
  es simple y suficiente para una herramienta interna, pero es legible por
  cualquier script que corra en la página (riesgo de XSS). Para esta app,
  con pocos usuarios de confianza, es un trade-off aceptable.

### 4.3 La grilla (`PanelDisponibilidad.jsx`)

- Selector de fecha arriba (por defecto, hoy).
- Al cargar/cambiar la fecha: pide en paralelo `tarifas`, `canchas`,
  `reservas?fecha=...` y `observaciones/<fecha>/`.
- Filas = horas del día (derivadas de las tarifas: 08:00 a 24:00, en
  bloques de 1 hora). Columnas = las 4 canchas + una columna extra
  "Campo completo".
- Celda de una cancha individual libre → clic abre `NuevaReservaForm`
  (pide `cliente_nombre`) → `POST /api/reservas/` con `modalidad=
  "individual"`, `canchas=[n]`.
- Columna "Campo completo" en una hora libre en las 4 canchas → mismo
  formulario, pero `modalidad="completo"`, `canchas=[1,2,3,4]`. Si alguna
  de las 4 ya está ocupada, el botón aparece deshabilitado (no se intenta
  siquiera — el backend igual lo validaría por las dudas).
- Celda ocupada (individual o parte de un campo completo) → clic abre
  `ReservaDetalle` con los datos de esa reserva (todas las canchas
  vinculadas a una reserva de campo completo abren el mismo detalle,
  porque es la misma fila de `reservas`).

### 4.4 Detalle de reserva (`ReservaDetalle.jsx`)

- Muestra cliente, hora, y `precio_total` como texto de referencia (algo
  como *"Tarifa: S/ 70.00 (referencia, no es lo cobrado)"*).
- Lista de pagos ya registrados, cada fila con fondo/borde de color:
  **azul = efectivo, rojo = Yape**.
- Formulario para agregar un pago: monto, método (radio/select
  efectivo/Yape), tipo (radio/select adelanto/saldo) → `POST
  /api/reservas/{id}/pagos/`, y la fila nueva se agrega a la lista sin
  recargar todo.
- Botón "Cancelar reserva" (con `confirm()` antes de mandar la petición).

### 4.5 Observaciones y resumen (debajo de la grilla)

- `Observaciones.jsx`: textarea con el texto del día + botón "Guardar" →
  `PUT /api/observaciones/<fecha>/`.
- `ResumenPagos.jsx`: botón "Ver totales del día" → `GET
  /api/reservas/resumen-pagos/?fecha=...` → muestra los 3 totales. No se
  recalcula solo; el staff lo pide cuando quiere verlo.

## 5. Reglas de negocio (resumen)

- 1 clic = 1 hora exacta. Una reserva de 2 horas seguidas son 2 filas de
  `reservas` (simplificación consciente para la primera versión).
- `precio_total` es siempre calculado por el servidor desde `tarifas`;
  nunca lo escribe el staff ni lo manda el frontend.
- Los pagos (`pagos`) son siempre escritos a mano por el staff; el sistema
  no calcula ni asume cuánto se cobró.
- Liberar una hora cancela la reserva (`estado='cancelada'`); no la borra.
- El resumen de pagos del día suma todo lo cobrado ese día, sin excluir
  reservas canceladas después del cobro.
- El servidor valida disponibilidad real al crear una reserva (no confía
  solo en lo que el frontend muestra), para evitar dobles reservas si dos
  personas usan el panel al mismo tiempo.

## 6. Fuera de alcance (por ahora)

- El estado `completada` de `Reserva` no lo usa esta funcionalidad (una
  reserva creada acá solo puede terminar en `confirmada` o `cancelada`).
  Marcar reservas pasadas como `completada` queda para más adelante.
- Reservas de más de 1 hora en una sola fila.
- Vínculo formal entre `academias` y sus reservas recurrentes.
- Cálculo o seguimiento automático de deudas.
- Refrescar el token JWT automáticamente antes de que expire.
- Cualquier estilo visual más allá de "que funcione" (tabla HTML simple).
- React Router / múltiples páginas.

## 7. Plan de pruebas

- Backend: tests con `APITestCase` de DRF para cada endpoint (crear
  reserva calcula bien el precio, choque de disponibilidad da 400,
  cancelar cambia el estado, resumen de pagos suma correcto incluyendo
  reservas canceladas, observaciones hace upsert).
- Frontend: prueba manual guiada (no hay suite automatizada todavía) —
  se define un checklist paso a paso al momento de implementar.
