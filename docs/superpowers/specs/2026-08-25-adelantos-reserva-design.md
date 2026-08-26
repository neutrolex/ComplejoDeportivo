# Adelantos de reserva — diseño

**Fecha:** 2026-08-25
**Estado:** aprobado, pendiente de implementación

## 1. Propósito

El panel de "Comentarios" (notas del día, `ComentarioDia`) se renombra a
**"Observaciones del día"** y gana una segunda función: registrar que una
persona adelantó dinero hoy para jugar en una fecha/hora futura (o incluso
la misma fecha vista, en otra hora libre), sin tener que navegar hasta ese
día en la grilla para crear la reserva a mano.

Un adelanto:

1. Crea una reserva real (bloquea la cancha elegida, nadie más puede
   tomarla a esa hora).
2. Se pinta de **negro** en la grilla del día que corresponda, de forma
   permanente — aunque después se termine de pagar, la celda se sigue
   viendo negra como marca de que esa reserva nació de un adelanto.
3. Aparece en una lista de "Adelantos pendientes" dentro del mismo panel,
   para saber quién debe completar el pago sin tener que revisar día por
   día.

## 2. Decisiones de diseño

### 2.1 Reutiliza `Reserva` + `Pago`, no una tabla nueva

`POST /api/reservas/` ya acepta una `fecha` libre (no atada al día que se
está viendo) y ya tiene todo lo necesario: cliente, duración, modalidad,
canchas, Yape/Efectivo. Un adelanto es, ni más ni menos, una reserva creada
para una fecha futura con un pago parcial — no hace falta un modelo nuevo,
solo una forma de **marcarla** como tal y de encontrarla después.

`Pago` ya tiene un campo `tipo` (`ADELANTO`/`SALDO`) sin usar en la lógica
actual (`guardar_pago` siempre fija `SALDO`). Se aprovecha: el pago inicial
de una reserva creada por este flujo se guarda con `tipo=ADELANTO`.

### 2.2 Marca permanente en la `Reserva`, no en el `Pago`

Si el "negro para siempre" dependiera de que exista un `Pago` con
`tipo=ADELANTO`, se rompería en cuanto alguien complete el saldo: el pago
que falta se registra vía `PATCH /reservas/{id}/pagos/`, que llama a
`guardar_pago()` y ese siempre deja `tipo=SALDO` en el pago que toca. Por
eso la marca vive en la propia `Reserva` (`es_adelanto`), no se toca nunca
después de creada, y es independiente de qué pagos tenga la reserva en
cualquier momento posterior.

### 2.3 Los totales del día ya están resueltos, sin tocar nada

`resumen_pagos` y `resumen_financiero_dashboard` ya agrupan por
`Pago.fecha_hora` (la fecha en que se **cobró** el pago), no por
`Reserva.fecha` (la fecha en que se **juega**). Si hoy se cobra un
adelanto de S/50 para el sábado, ese monto ya cae en el total de hoy; si
el sábado se cobra el saldo restante, ese monto cae en el total del
sábado. No hay doble conteo ni conteo faltante — es el comportamiento que
ya existe (incluso está comentado en `views.py`, método `resumen_pagos`).

### 2.4 "Adelantos pendientes" no se filtra por fecha

La lista vive dentro del panel de un día concreto, pero su contenido es
global: todas las reservas con `es_adelanto=True` que todavía tienen saldo
por cobrar, sin importar la fecha de juego ni la fecha que se esté viendo
en ese momento. Así no se pierde de vista un adelanto viejo que quedó sin
completar.

### 2.5 Sin selector de academia en este flujo

El diálogo de "Agregar adelanto" no ofrece elegir una academia — es solo
para clientes sueltos. Las academias ya tienen su propio mecanismo
(horarios recurrentes materializados) y, a futuro, el sistema de deudas
(ver spec aparte). Esto evita que una misma reserva compita entre el color
de academia y el negro de adelanto: en la práctica nunca se solapan.

## 3. Cambios al modelo de datos

### 3.1 `Reserva`: gana `es_adelanto`

```python
class Reserva(models.Model):
    ...
    # True solo si esta reserva se creo con el flujo "Agregar adelanto"
    # (ver AdelantoDialogo en el frontend). No se modifica despues de
    # creada -- es lo que mantiene la celda negra en la grilla incluso
    # despues de completarse el pago. Independiente de que tipo de Pago
    # tenga la reserva en cualquier momento posterior.
    es_adelanto = models.BooleanField(default=False)
```

Migración: agrega la columna con `default=False`; las reservas existentes
quedan todas en `False`.

### 3.2 `Pago`: sin cambio de esquema

Se usa el `tipo` que ya existe. `guardar_pago()` gana un parámetro
opcional `tipo=Pago.Tipo.SALDO` (con ese default, ningún llamador
existente cambia de comportamiento):

```python
def guardar_pago(reserva, metodo, monto, usuario, tipo=Pago.Tipo.SALDO):
    ...
    return Pago.objects.create(
        reserva=reserva, metodo=metodo, monto=monto, tipo=tipo,
        registrado_por=usuario,
    )
```

El único cambio de comportamiento es en la rama de creación (upsert
todavía no encuentra un pago existente); si ya existiera un pago para ese
método (no debería pasar en una reserva recién creada), la actualización
sigue fijando `SALDO` sin cambios — eso es correcto: un pago que se edita
después de creado ya no es "el adelanto inicial".

## 4. Backend: endpoints

### 4.1 `POST /api/reservas/` — gana `es_adelanto` opcional

`NuevaReservaSerializer` gana `es_adelanto = serializers.BooleanField(required=False, default=False)`.
En `ReservaViewSet.create()`: se guarda `Reserva.es_adelanto` tal cual
viene, y si es `True`, los pagos iniciales (yape/efectivo, si vienen con
monto > 0) se guardan con `guardar_pago(..., tipo=Pago.Tipo.ADELANTO)` en
vez del `SALDO` por defecto. Todo lo demás del endpoint (validación de
tarifa, de conflicto de horario, de duración 1h/1h30) sigue igual — un
adelanto se valida exactamente como cualquier reserva nueva.

### 4.2 `GET /api/reservas/adelantos-pendientes/` (nuevo)

Nueva `@action` en `ReservaViewSet`. Devuelve, ordenadas por
`fecha`/`hora_inicio` ascendente, las reservas con `es_adelanto=True`,
`estado != cancelada`, y saldo pendiente (`precio_total > suma(pagos)`).
Cada una serializada con `ReservaSerializer` (ya trae `pagos` y
`precio_total`, suficiente para que el frontend calcule "falta S/X").

### 4.3 `ReservaSerializer` — gana `es_adelanto`

Campo de solo lectura, para que la grilla sepa cuándo pintar negro.

## 5. Frontend

### 5.1 Panel renombrado: "Observaciones del día"

`ComentariosDia.jsx`: el título cambia de "Comentarios" a "Observaciones
del día". Se agregan un segundo botón "+ Agregar adelanto" (junto al
"+ Agregar" de notas) y una sección nueva "Adelantos pendientes" debajo de
la lista de notas existente.

### 5.2 `AdelantoDialogo.jsx` (nuevo)

Diálogo modal (mismo patrón que `ReservaDialogo`), con:

- Cliente (texto, obligatorio).
- Fecha (selector de calendario, mínimo hoy).
- Hora inicio (select alineado a bloques de 30 min, mismas horas
  operativas que ya calcula el backend).
- Duración (1h / 1h30, igual que una reserva normal).
- Modalidad: radio Cancha 1–4 (individual) o Campo completo.
- Yape (S/) y Efectivo (S/), igual que el resto de la app.

Guardar → `POST /reservas/` con `es_adelanto: true` y el resto de los
campos. Los errores de conflicto de horario o falta de tarifa que ya
devuelve el backend se muestran igual que en `ReservaDialogo` (mensaje de
error debajo del formulario, sin cerrar el diálogo).

### 5.3 Sección "Adelantos pendientes"

Carga `GET /reservas/adelantos-pendientes/` al montar el panel (no
depende de la `fecha` que se esté viendo). Cada fila: cliente, fecha
formateada, hora, cancha(s), y "Adelantó S/X de S/Y — falta S/Z"
(`Z = precio_total - suma(pagos)`). Sin acciones desde acá (para completar
el pago o cancelar, se navega a esa fecha en la grilla y se abre la
reserva, como cualquier otra).

### 5.4 Color negro en la grilla (`PanelDisponibilidad.jsx`)

Nueva función `estiloAdelanto(reserva, oscuro)`, análoga a
`estiloAcademia()`, que devuelve un estilo oscuro fijo
(`bg-slate-900`/`border-slate-700` en claro, un negro un poco más
profundo en oscuro) y texto claro cuando `reserva.es_adelanto` es
`true`. Se aplica con prioridad sobre `estiloAcademia()` (en la práctica
no debería haber solapamiento, ver 2.5). `ContenidoReserva` también
ajusta el color del texto (nombre y rango horario) a un tono claro en
vez de rose cuando `es_adelanto` es `true`, para que siga siendo legible
sobre fondo oscuro.

## 6. Fuera de alcance

- Editar o "desmarcar" `es_adelanto` en una reserva ya creada.
- Cancelación o recordatorio automático de adelantos viejos sin completar.
- Elegir una academia como cliente del adelanto (ver 2.5).
- Cualquier cosa relacionada a deudas de academias o clientes — es una
  funcionalidad aparte, con su propio spec.

## 7. Orden de construcción

1. Migración (`Reserva.es_adelanto`) + `guardar_pago(tipo=...)` + `POST
   /reservas/` acepta `es_adelanto` + `ReservaSerializer.es_adelanto`.
   Tests de todo esto antes de tocar frontend.
2. Backend: `GET /reservas/adelantos-pendientes/`. Tests.
3. Frontend: rename del panel, `AdelantoDialogo.jsx`, botón "+ Agregar
   adelanto".
4. Frontend: sección "Adelantos pendientes".
5. Frontend: color negro en `PanelDisponibilidad.jsx` (`estiloAdelanto` +
   ajuste de texto en `ContenidoReserva`).
6. Prueba manual de punta a punta en el navegador.

## 8. Plan de pruebas

- Backend: crear reserva con `es_adelanto=true` guarda el pago inicial
  con `tipo=ADELANTO` y `Reserva.es_adelanto=True`; completar el saldo
  después vía `PATCH .../pagos/` dejar ese pago en `tipo=SALDO` sin tocar
  `es_adelanto`; `adelantos-pendientes` devuelve solo las que aún tienen
  saldo, sin filtrar por fecha, y no incluye una ya cancelada ni una ya
  pagada del todo; conflicto de horario o falta de tarifa devuelve el
  mismo error que una reserva normal (no hay camino especial que lo
  salte).
- Frontend: prueba manual — crear un adelanto para un día futuro,
  navegar a ese día y ver la celda negra; completar el pago desde el
  diálogo de editar existente y confirmar que la celda sigue negra;
  confirmar que la reserva desaparece de "Adelantos pendientes" al
  completarse el pago.
