# Academias: gestión y horarios recurrentes — diseño

**Fecha:** 2026-08-25
**Estado:** aprobado, pendiente de implementación

## 1. Propósito

Hoy `Academia` existe como catálogo (`nombre`, `horario_uso` texto libre,
`permiso_mostrar`) pero no hay ninguna pantalla para crearlas/editarlas —
solo se pueden elegir en el diálogo de reserva si ya existen en la base de
datos (cargadas a mano). Este trabajo agrega:

1. Una pantalla de administración de academias (crear, editar, eliminar).
2. Un color por academia, para distinguirla visualmente en la grilla.
3. Horarios recurrentes semanales (días + hora + cancha(s)) que, sin
   ningún proceso en segundo plano, aparecen solos como reservas reales
   (con pago editable, igual que cualquier otra) en la grilla del panel
   cada vez que se mira un día que coincide con el horario de una
   academia.

## 2. Decisiones de diseño

### 2.1 Materialización perezosa, sin cron

En vez de generar reservas para semanas o meses hacia adelante (lo que
exigiría un job periódico), la generación ocurre **al pedir la grilla**:
`GET /api/reservas/?fecha=` calcula el día de la semana de `fecha`, busca
los horarios de academia que coincidan, y crea la `Reserva` real que
falte antes de devolver la lista. La primera vez que alguien navega a un
lunes en el panel, las reservas de las academias con horario los lunes
quedan creadas; si nadie mira ese lunes, no se crea nada — no hay
proceso corriendo solo, no hay tablas de reservas "fantasma" para fechas
que nadie visitó.

No se materializa hacia fechas pasadas (`fecha < hoy`): si una academia
agrega un horario nuevo, no aparece retroactivamente en días que ya
pasaron.

Si la cancha ya está ocupada a esa hora (por lo que sea — otra reserva
manual, otro horario superpuesto), esa ocurrencia puntual simplemente no
se crea; no hay error, no se pisan reservas entre sí.

### 2.2 Varias canchas = varias reservas individuales, no un tipo nuevo

El modelo `Reserva` ya distingue `individual` (1 cancha) de `completo`
(las 4). Para no tocar esa regla ni la validación existente, un horario
de academia que usa 2 o 3 canchas sueltas se materializa como **una
`Reserva` individual por cada cancha elegida** (mismo horario, mismo
nombre de academia, cada una con su propia franja bloqueada). Si el
horario usa las 4 canchas, se materializa como **una sola** `Reserva`
`completo` — igual que ya se ve hoy con la celda fusionada de campo
completo. La grilla no necesita ningún cambio de renderizado nuevo para
esto: ya sabe dibujar reservas individuales y reservas de campo completo.

### 2.3 Con pago, como cualquier reserva

La reserva materializada de una academia es una `Reserva` real: tiene
`Pago` editable (Yape/Efectivo) desde el mismo diálogo que ya existe, se
puede cancelar, y suma al total del día y al dashboard financiero — sin
ningún camino especial. El único comportamiento distinto es *cómo* nace
(automático, no por un clic en "Libre") y *cómo se ve* (su color).

### 2.4 Duración libre para horarios de academia

Las reservas de clientes están limitadas a 1h o 1h30 (spec anterior). Un
horario de academia no tiene ese límite — puede durar lo que haga falta
(en incrementos de 30 minutos, alineado a la grilla), porque lo define
el administrador una sola vez, no un cliente en el momento.

### 2.5 `horario_uso` (texto libre) se elimina

Ya no tiene sentido mantenerlo: los horarios estructurados (`AcademiaHorario`)
cubren lo que ese campo intentaba describir, y `horario_uso` nunca se
exponía por API (no lo usaba ninguna pantalla). Se borra en la misma
migración que agrega los campos nuevos.

## 3. Cambios al modelo de datos

### 3.1 `Academia`: gana `color`, pierde `horario_uso`

```python
class Academia(models.Model):
    nombre = models.CharField(max_length=150)
    permiso_mostrar = models.BooleanField(default=True)
    color = models.CharField(max_length=7, default='#7c3aed')  # nuevo, hex
```

### 3.2 Tabla nueva: `AcademiaHorario`

```python
class AcademiaHorario(models.Model):
    class Dia(models.IntegerChoices):
        # Mismo criterio que date.weekday() de Python (Lunes=0), para que
        # la materializacion pueda comparar directo sin conversion.
        LUNES = 0, 'Lunes'
        MARTES = 1, 'Martes'
        MIERCOLES = 2, 'Miercoles'
        JUEVES = 3, 'Jueves'
        VIERNES = 4, 'Viernes'
        SABADO = 5, 'Sabado'
        DOMINGO = 6, 'Domingo'

    academia = models.ForeignKey(Academia, on_delete=models.CASCADE, related_name='horarios')
    dia_semana = models.IntegerField(choices=Dia.choices)
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()
    canchas = models.ManyToManyField(Cancha, related_name='horarios_academia')

    class Meta:
        db_table = 'academia_horarios'
        ordering = ['dia_semana', 'hora_inicio']
```

Un mismo formulario "Lunes, Miércoles y Viernes, 21:00–22:00, Cancha 2"
crea **3 filas** de `AcademiaHorario` (una por día) — el modelo queda
simple (un día por fila) aunque la pantalla agrupe la carga con
checkboxes de días.

### 3.3 `Reserva`: sin cambios de esquema

Ya tiene `academia` (FK opcional, `SET_NULL`). Si se borra una academia,
sus reservas ya materializadas quedan sin el vínculo, igual que hoy pasa
si se borra una academia vinculada manualmente — comportamiento ya
existente, no hay que tocar nada.

## 4. Backend: materialización

Nueva función en `servicios.py`, `materializar_horarios_academia(fecha, usuario)`,
llamada desde `ReservaViewSet.list()` antes de armar la respuesta (solo
si `fecha >= hoy`). Por cada `AcademiaHorario` cuyo `dia_semana` coincide
con el día de la semana de `fecha`:

1. Si ya existe una `Reserva` no cancelada de esa academia en esa fecha y
   hora, no hace nada (ya está materializada).
2. Si el horario usa las 4 canchas, arma un solo grupo con las 4; si no,
   un grupo por cancha (ver 2.2).
3. Por cada grupo: busca la tarifa (`obtener_tarifa`, misma función que ya
   usa la creación manual), revisa que las canchas del grupo estén libres
   en ese rango (`canchas_ocupadas`, ya extendida para solapamiento en el
   trabajo anterior) y, si todo está OK, crea la `Reserva` con
   `cliente_nombre=academia.nombre`, `academia=academia`,
   `asignada_por=usuario` (el admin que disparó la materialización al
   mirar ese día) y su `ReservaCancha` correspondiente. Si no hay tarifa
   o la cancha está ocupada, esa ocurrencia puntual se salta sin error.

## 5. Backend: endpoints

- `GET /api/academias/` — se extiende: cada academia devuelve también
  `color` y `horarios` (anidados: `id`, `dia_semana`, `hora_inicio`,
  `hora_fin`, `canchas`).
- `POST /api/academias/` — crea una academia con sus horarios. Body:
  `{"nombre", "color", "permiso_mostrar", "horarios": [{"dias": [0,2,4], "hora_inicio", "hora_fin", "canchas": [id,...]}, ...]}`.
  `"dias"` es una lista — el backend crea una fila de `AcademiaHorario`
  por cada día.
- `PATCH /api/academias/{id}/` — actualiza nombre/color/permiso_mostrar y
  **reemplaza** todos los horarios (borra los existentes, crea los del
  body) — más simple y predecible que calcular un diff.
- `DELETE /api/academias/{id}/` — elimina (cascada a `AcademiaHorario`).

`ReservaSerializer` gana un campo `academia` anidado, de solo lectura
(`{"id", "nombre", "color"}` o `null`), para que el panel sepa con qué
color pintar la celda sin pedir la lista completa de academias aparte.

## 6. Frontend

### 6.1 Nueva página `Academias.jsx`

Ruta `/academias`, agregada al `NAV` de `PanelLayout.jsx`. Lista de
tarjetas: círculo de color, nombre, sus horarios en texto ("Lu, Mi, Vi ·
21:00–22:00 · Cancha 2, Cancha 3"), botones Editar/Eliminar. Botón
"+ Agregar academia" arriba, mismo estilo que "+ Agregar" del panel de
comentarios.

### 6.2 `AcademiaDialogo.jsx` (crear/editar)

- Nombre (texto).
- Color: fila de swatches (paleta fija ~10 colores), no un input de color
  libre.
- Mostrar en la web pública (checkbox, `permiso_mostrar`).
- Horarios: lista repetible. Cada fila: checkboxes Lu-Do, hora inicio,
  hora fin (selects alineados a la grilla de 30 min, sin límite de
  duración), checkboxes de cancha 1-4 + atajo "Campo completo" que marca
  las 4. Botón "+ Agregar horario" para sumar otra franja distinta.
- Guardar / Cancelar.

### 6.3 Eliminar

Reusa `ConfirmDialogo` ya existente.

### 6.4 Color en la grilla

`PanelDisponibilidad.jsx`: cuando `reserva.academia` está presente, la
celda usa el color de la academia (vía `color-mix()` inline, ej. fondo
`color-mix(in srgb, {color} 12%, white)`, borde
`color-mix(in srgb, {color} 40%, white)`, texto el color sólido) en vez
de las clases fijas `border-rose-200 bg-rose-50 text-rose-700`. Sin
academia vinculada, la celda se ve exactamente igual que hoy.

## 7. Fuera de alcance

- Cancelación retroactiva automática de ocurrencias ya materializadas al
  borrar o editar un horario — se cancelan a mano (ya se puede, con el
  diálogo de reserva existente) si hiciera falta.
- Reportes o filtros específicos por academia en el dashboard (sus
  reservas ya suman al total general, como cualquier otra).
- Detectar y avisar si dos horarios de la misma academia (u horarios de
  dos academias distintas) se superponen entre sí al crearlos — la
  materialización ya evita el doble bloqueo de una cancha (2.1), pero no
  hay validación proactiva en el formulario de horarios.
- Selector de color libre (paleta abierta / picker RGB) — se usa una
  paleta fija.

## 8. Orden de construcción

1. Migración (`Academia.color`, quita `horario_uso`, crea
   `AcademiaHorario`) + `materializar_horarios_academia()` + se conecta a
   `ReservaViewSet.list()`. Tests de materialización antes de tocar
   frontend.
2. `POST/PATCH/DELETE /api/academias/` con horarios anidados. Tests.
3. `ReservaSerializer.academia` anidado (id, nombre, color).
4. Frontend: página `Academias.jsx` + `AcademiaDialogo.jsx`, probado en
   el navegador de punta a punta (crear una academia con horario para
   hoy, navegar a esa hora en el panel, confirmar que aparece con su
   color).
5. Frontend: color de academia en `PanelDisponibilidad.jsx`.

## 9. Plan de pruebas

- Backend: `materializar_horarios_academia` crea la reserva correcta
  (individual por cancha, o completo si son las 4), no duplica si ya
  existe, no materializa hacia el pasado, no pisa una cancha ya ocupada,
  usa la tarifa correcta según duración. Endpoints de academias:
  crear con horarios anidados (una fila de `AcademiaHorario` por día
  elegido), editar reemplaza los horarios, eliminar hace cascada y dejar
  el `academia_id` en `NULL` en las reservas ya materializadas.
- Frontend: prueba manual guiada en el navegador siguiendo el orden de
  construcción de la sección 8.
