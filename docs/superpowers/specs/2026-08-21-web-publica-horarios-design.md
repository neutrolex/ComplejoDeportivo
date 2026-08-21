# Web pública de horarios (Componente A, Fase 2) — diseño

**Fecha:** 2026-08-21
**Estado:** aprobado, pendiente de implementación

## 1. Propósito

Fase 2, Componente A: una pantalla nueva, pública, **sin login**, donde
cualquier visitante puede consultar qué horas están libres u ocupadas en el
complejo, día por día. No permite reservar ni pagar en línea — el visitante
solo consulta, y si hay disponibilidad se comunica por WhatsApp o va
presencialmente, como ya hace hoy.

No expone información sensible: nunca muestra el nombre de un cliente
casual, montos ni métodos de pago. La única excepción es el nombre de una
**academia**, que sí se muestra cuando la academia tiene permiso explícito
de mostrarse (`permiso_mostrar=True`).

## 2. Decisión de diseño: vínculo formal reserva-academia

Hoy no hay forma confiable de saber, mirando una reserva, si es una
academia (para mostrar su nombre) o un cliente casual (para ocultarlo) —
`cliente_nombre` es texto libre. Se evaluaron dos caminos:

- **Comparar texto** (`cliente_nombre` contra `academias.nombre`): sin
  migración, pero frágil — un typo o un espacio de más rompe el match
  silenciosamente, sin ningún aviso.
- **Vínculo formal** (`academia_id` en `Reserva`, opcional): requiere
  migración y un cambio en el formulario de "nueva reserva" del panel, pero
  es confiable y no depende de que el texto coincida exactamente.

**Decisión: vínculo formal.** El campo `cliente_nombre` sigue existiendo
tal cual (nunca se elimina ni se reemplaza) — el vínculo con `academias` es
un dato **adicional**, opcional, que el personal completa solo cuando
corresponde.

## 3. Cambios al modelo de datos

### 3.1 `Reserva`: campo nuevo `academia`

```python
academia = models.ForeignKey(
    Academia, on_delete=models.SET_NULL, null=True, blank=True,
    related_name='reservas',
)
```

- Opcional. Vacío para clientes casuales, bloqueos ("Mantenimiento") y
  reservas históricas (no se hace backfill — la web pública solo importa la
  disponibilidad de hoy en adelante).
- `on_delete=SET_NULL`: si se borra una academia del catálogo, las reservas
  ya creadas no se pierden, solo pierden el vínculo.
- Se completa **solo al crear** la reserva. No hay edición posterior de
  ningún campo de una reserva ya creada (mismo patrón que ya existe hoy:
  para corregir algo, se cancela y se crea de nuevo).
- Migración simple: agrega una columna que acepta vacíos, no toca filas
  existentes.

### 3.2 Tabla `academias`: sin cambios de esquema

Ya existe (`nombre`, `horario_uso`, `permiso_mostrar`) pero está huérfana
(sin ninguna reserva vinculada). Este componente es lo que la conecta por
primera vez al resto del sistema.

## 4. Backend: endpoints

### 4.1 `GET /api/academias/` (nuevo, requiere login)

Lista las academias del catálogo, para que el panel las ofrezca como
opción al crear una reserva.

Response: `[{"id": 1, "nombre": "Talentos FC"}, ...]`

### 4.2 `POST /api/reservas/` (cambio sobre el endpoint existente)

Se agrega un campo opcional al body: `"academia": 1` (id de una academia).
Si se manda, la reserva creada queda vinculada. Si no se manda (o es
`null`), se comporta exactamente igual que hoy.

`NuevaReservaSerializer` gana un campo
`academia = serializers.PrimaryKeyRelatedField(queryset=Academia.objects.all(), required=False, allow_null=True)`.

### 4.3 `GET /api/publico/disponibilidad/?fecha=YYYY-MM-DD` (nuevo, sin login)

El endpoint que consume la web pública. Reutiliza `fecha_valida()` para
validar el parámetro (mismo criterio que `/reservas/` y `/resumen-pagos/`:
`400` si falta o tiene formato inválido).

Por cada hora operativa del día (mismo rango que ya usa el panel: desde la
hora de inicio de la tarifa `individual` más temprana hasta las 23:00),
devuelve el estado de cada cancha y del campo completo:

```json
{
  "fecha": "2026-08-24",
  "horas": [
    {
      "hora": "08:00",
      "canchas": {
        "1": {"estado": "libre"},
        "2": {"estado": "ocupado", "academia": null},
        "3": {"estado": "ocupado", "academia": "Talentos FC"},
        "4": {"estado": "libre"}
      },
      "campo_completo": {"estado": "libre"}
    }
  ]
}
```

Reglas:
- `"estado": "ocupado"` sin `"academia"` (o con `academia: null`) = cliente
  casual, bloqueo, o academia sin `permiso_mostrar` — nunca se manda
  `cliente_nombre` real.
- `"academia": "<nombre>"` solo aparece si la reserva tiene `academia`
  vinculada **y** esa academia tiene `permiso_mostrar=True`.
- Si a esa hora hay una reserva de campo completo, las 4 canchas y
  `campo_completo` aparecen todas `"ocupado"` (con el mismo nombre de
  academia si corresponde) — igual criterio visual que ya usa el panel
  interno para esas celdas.
- No se expone `/tarifas/` ni ningún precio: la web pública es solo
  disponibilidad.

Sin autenticación (`permission_classes = [AllowAny]`).

## 5. Frontend

### 5.1 Ruteo

Se agrega `react-router-dom` (primera vez que el proyecto usa un router).

- `/horarios` → pantalla pública nueva, sin login.
- `/` → el panel actual (login + `PanelDisponibilidad`), sin ningún cambio
  de comportamiento — solo se mueve detrás de su propia ruta.

### 5.2 Cambios al panel existente

- `PanelDisponibilidad.jsx`: al crear una reserva (`reservarCelda` /
  `reservarCampoCompleto`), después de pedir `cliente_nombre`, se ofrece
  elegir una academia de una lista (cargada desde `GET /api/academias/`),
  opcional. Se manda `academia: <id o null>` en el `POST /api/reservas/`.
  El resto del panel no cambia.

### 5.3 Pantalla nueva: `HorariosPublicos.jsx`

- Misma tabla hora × cancha que el panel (filas = horas, columnas = las 4
  canchas + "Campo completo"), pero de solo lectura: sin `onClick`, cada
  celda muestra "Libre" u "Ocupado" (+ nombre de la academia si viene en la
  respuesta). Sin `ReservaDetalle`, sin `Observaciones`, sin `ResumenPagos`
  — esas son herramientas internas.
- Fetch a `GET /api/publico/disponibilidad/?fecha=...` (vía `apiFetch`, que
  funciona igual sin sesión activa — el header `Authorization` simplemente
  no se manda si no hay token guardado).
- Navegación de fecha (más dinámica que el selector simple del panel):
  - Fila de 7 botones (Lun a Dom) con la semana visible — clic en uno
    selecciona ese día exacto.
  - Flechas "◀ / ▶" que mueven la semana completa ±7 días (cambian qué
    7 días muestran los botones, no seleccionan un día por sí solas).
  - El helper `formatearFecha` (hoy solo en `PanelDisponibilidad.jsx`) se
    mueve a un archivo compartido (`frontend/src/utils/fecha.js`) para que
    ambos componentes lo usen sin duplicar código.

## 6. Fuera de alcance

- Reservar o pagar en línea desde la web pública.
- Editar la academia de una reserva ya creada.
- Mostrar tarifas/precios en la web pública.
- Vista de semana completa (los 7 días a la vez en una sola grilla) — se
  eligió navegación de "un día a la vez" igual que el panel.
- Backfill de `academia` en reservas históricas.
- Tests automáticos de frontend (el proyecto no tiene suite todavía).

## 7. Orden de construcción

1. Migración (`academia` en `Reserva`) + `GET /api/academias/` + selector
   de academia al crear una reserva en el panel. Se prueba en el navegador
   que el panel sigue funcionando y ya permite vincular academias.
2. `GET /api/publico/disponibilidad/`. Se prueba directo (sin frontend
   público todavía).
3. `react-router-dom` + `HorariosPublicos.jsx`. Se prueba en el navegador
   de punta a punta.

## 8. Plan de pruebas

- Backend: tests con `APITestCase` de DRF — migración no rompe nada,
  `POST /api/reservas/` acepta `academia` opcional y la vincula bien,
  `GET /api/academias/` requiere login, `GET /api/publico/disponibilidad/`
  no requiere login y valida la fecha igual que los demás endpoints,
  devuelve libre/ocupado correctamente, muestra el nombre de la academia
  solo cuando corresponde (vinculada y con `permiso_mostrar=True`), oculta
  el nombre en los demás casos, y trata bien las reservas de campo
  completo (4 canchas + `campo_completo` ocupadas a la vez).
- Frontend: prueba manual guiada en el navegador, paso por paso según el
  orden de construcción de la sección 7 (el usuario prueba el paso 1 antes
  de continuar con el 2).
