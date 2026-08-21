# Web pública de horarios (Componente A, Fase 2) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una pantalla pública sin login donde cualquier visitante consulta disponibilidad del complejo (libre/ocupado por hora y cancha), mostrando el nombre de una academia solo cuando corresponde, vinculando por primera vez las reservas con el catálogo de academias.

**Architecture:** Backend Django/DRF: se agrega un campo opcional `academia` a `Reserva` (vínculo formal en vez de comparar texto), un endpoint autenticado para listar academias, y un endpoint público (`AllowAny`) que arma la grilla de disponibilidad del día sin exponer datos sensibles. Frontend React: se introduce `react-router-dom` (primera vez en el proyecto) para separar el panel interno (`/`, con login, sin cambios de comportamiento) de la pantalla pública nueva (`/horarios`), que reutiliza el mismo patrón visual de tabla que ya usa el panel.

**Tech Stack:** Django 6.1 + Django REST Framework + PostgreSQL (backend, ya en uso). React 19 + Vite (frontend, ya en uso). `react-router-dom` (dependencia nueva).

**Spec:** [docs/superpowers/specs/2026-08-21-web-publica-horarios-design.md](../specs/2026-08-21-web-publica-horarios-design.md)

## Global Constraints

- Todo el código, nombres de variables/funciones y mensajes de error siguen en español, igual que el resto del proyecto (`cliente_nombre`, `fecha_valida`, etc.).
- Backend: TDD con `django.test.TestCase` (lógica pura en `servicios.py`) y `rest_framework.test.APITestCase` (endpoints), siguiendo el estilo ya usado en `backend/reservas/tests/`.
- Las tablas `canchas` (4 filas, `numero` 1-4) y `tarifas` (5 franjas) ya están sembradas por una migración de datos (`0004_seed_canchas_tarifas.py`) — los tests existentes las dan por existentes vía `Cancha.objects.get(numero=X)`, sin crear canchas a mano. Seguir el mismo patrón.
- No se edita ningún campo de una reserva ya creada (ni `academia` ni ningún otro) — solo se define al crear. Coherente con que hoy tampoco existe un endpoint de edición.
- La web pública nunca debe serializar `cliente_nombre`, `monto` ni `metodo` de pago — solo libre/ocupado y, cuando corresponda, el nombre de una academia.
- Commits frecuentes y chicos, uno por tarea (o por sub-paso donde se indique), sin `--no-verify`.
- Sin tests automáticos de frontend (el proyecto no tiene suite todavía) — se verifica manualmente en el navegador donde se indique.

---

## Checkpoint tras la Tarea 4

Al terminar la Tarea 4 avisar al usuario y esperar a que pruebe el panel manualmente antes de seguir con la Tarea 5 (arranca el Paso 2 del orden de construcción de la spec).

## Checkpoint tras la Tarea 6

Al terminar la Tarea 6 avisar al usuario de que el endpoint público ya está listo para probar directo (Postman o navegador) antes de seguir con la Tarea 7 (arranca el Paso 3).

---

### Tarea 1: Modelo — campo `academia` en `Reserva`

**Files:**
- Modify: `backend/reservas/models.py`
- Modify: `backend/reservas/tests/test_models.py`
- Create: `backend/reservas/migrations/0005_reserva_academia.py` (generada con `makemigrations`, no a mano)

**Interfaces:**
- Produces: `Reserva.academia` — `ForeignKey` opcional (`null=True, blank=True, on_delete=SET_NULL`) hacia `Academia`, `related_name='reservas'`. Tareas posteriores pueden hacer `Reserva.objects.create(..., academia=<Academia|None>)` y leer `reserva.academia_id` / `reserva.academia`.

- [ ] **Paso 1: Escribir el test que falla**

En `backend/reservas/tests/test_models.py`, cambiar el import de arriba de:

```python
from reservas.models import ObservacionDia
```

a:

```python
from datetime import time

from reservas.models import Academia, Cancha, Modalidad, ObservacionDia, Reserva
```

Y agregar al final del archivo:

```python
class ReservaAcademiaTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )

    def _crear_reserva(self, academia=None):
        return Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre='Juan',
            fecha='2026-08-20',
            hora_inicio=time(10, 0),
            hora_fin=time(11, 0),
            precio_total='50.00',
            academia=academia,
            asignada_por=self.usuario,
        )

    def test_reserva_sin_academia_queda_en_none_por_defecto(self):
        reserva = self._crear_reserva()
        self.assertIsNone(reserva.academia)

    def test_reserva_se_puede_vincular_a_una_academia(self):
        academia = Academia.objects.create(
            nombre='Talentos FC', horario_uso='Martes y jueves', permiso_mostrar=True,
        )
        reserva = self._crear_reserva(academia=academia)
        self.assertEqual(reserva.academia_id, academia.id)

    def test_borrar_la_academia_no_borra_la_reserva(self):
        academia = Academia.objects.create(
            nombre='Talentos FC', horario_uso='Martes y jueves', permiso_mostrar=True,
        )
        reserva = self._crear_reserva(academia=academia)

        academia.delete()
        reserva.refresh_from_db()

        self.assertIsNone(reserva.academia)
```

(`UsuarioInterno` ya está importado arriba en el archivo original — no tocar esa línea.)

- [ ] **Paso 2: Correr los tests y confirmar que fallan**

Run: `cd backend && .\venv\Scripts\Activate.ps1 && python manage.py test reservas.tests.test_models -v 2`
Expected: FAIL — `TypeError: Reserva() got unexpected keyword arguments: 'academia'` (el campo todavía no existe).

- [ ] **Paso 3: Agregar el campo al modelo**

En `backend/reservas/models.py`, dentro de la clase `Reserva` (después de `creado_en`, antes de `asignada_por` — el orden no importa funcionalmente, pero mantiene los campos "de negocio" juntos), agregar:

```python
    # Opcional: solo se completa cuando el personal, al crear la reserva,
    # la vincula a una academia del catalogo (en vez de comparar el texto
    # libre de cliente_nombre contra academias.nombre, que se rompe con
    # cualquier typo). SET_NULL: si se borra la academia, la reserva no
    # se pierde, solo pierde el vinculo.
    academia = models.ForeignKey(
        'Academia', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reservas',
    )
```

- [ ] **Paso 4: Generar y aplicar la migración**

Run: `python manage.py makemigrations reservas`
Expected: crea `backend/reservas/migrations/0005_reserva_academia.py` (o el nombre que Django elija; renombrarlo a `0005_reserva_academia.py` si Django le pone otro nombre, para que quede claro).

Run: `python manage.py migrate`
Expected: `Applying reservas.0005_reserva_academia... OK`

- [ ] **Paso 5: Correr los tests y confirmar que pasan**

Run: `python manage.py test reservas.tests.test_models -v 2`
Expected: PASS (todas, incluidas las 3 nuevas y la de `ObservacionDia` que ya existía).

- [ ] **Paso 6: Commit**

```bash
git add backend/reservas/models.py backend/reservas/migrations/0005_reserva_academia.py backend/reservas/tests/test_models.py
git commit -m "Vincula reservas con academias mediante un campo opcional academia_id"
```

---

### Tarea 2: Backend — endpoint `GET /api/academias/`

**Files:**
- Modify: `backend/reservas/serializers.py`
- Modify: `backend/reservas/views.py`
- Modify: `backend/reservas/urls.py`
- Create: `backend/reservas/tests/test_academias_api.py`

**Interfaces:**
- Consumes: `Reserva.academia` de la Tarea 1 (no se usa acá directamente, pero valida que el modelo `Academia` ya está disponible para serializar).
- Produces: `GET /api/academias/` (requiere login) → `200` con `[{"id": <int>, "nombre": <str>}, ...]`. Lo consume la Tarea 4 (selector en el panel).

- [ ] **Paso 1: Escribir el test que falla**

Crear `backend/reservas/tests/test_academias_api.py`:

```python
from rest_framework.test import APIClient, APITestCase

from reservas.models import Academia
from usuarios.models import UsuarioInterno


class AcademiasApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()

    def test_sin_login_devuelve_401(self):
        response = self.client.get('/api/academias/')
        self.assertEqual(response.status_code, 401)

    def test_lista_las_academias_existentes(self):
        Academia.objects.create(nombre='Talentos FC', horario_uso='Martes', permiso_mostrar=True)
        Academia.objects.create(nombre='Potrillos', horario_uso='Lunes', permiso_mostrar=False)

        self.client.force_authenticate(user=self.usuario)
        response = self.client.get('/api/academias/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        nombres = {a['nombre'] for a in response.data}
        self.assertEqual(nombres, {'Talentos FC', 'Potrillos'})
```

- [ ] **Paso 2: Correr el test y confirmar que falla**

Run: `python manage.py test reservas.tests.test_academias_api -v 2`
Expected: FAIL — `404` (la URL `/api/academias/` no existe todavía).

- [ ] **Paso 3: Agregar el serializer**

En `backend/reservas/serializers.py`, cambiar el import de:

```python
from .models import Cancha, Modalidad, Pago, Reserva, Tarifa
```

a:

```python
from .models import Academia, Cancha, Modalidad, Pago, Reserva, Tarifa
```

Y agregar, junto a `CanchaSerializer`/`TarifaSerializer`:

```python
class AcademiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Academia
        fields = ['id', 'nombre']
```

- [ ] **Paso 4: Agregar la vista y la ruta**

En `backend/reservas/views.py`, cambiar el import de modelos de:

```python
from .models import Cancha, ObservacionDia, Pago, Reserva, ReservaCancha, Tarifa
```

a:

```python
from .models import Academia, Cancha, ObservacionDia, Pago, Reserva, ReservaCancha, Tarifa
```

y el de serializers de:

```python
from .serializers import (
    CanchaSerializer,
    NuevaReservaSerializer,
    PagoSerializer,
    ReservaSerializer,
    TarifaSerializer,
)
```

a:

```python
from .serializers import (
    AcademiaSerializer,
    CanchaSerializer,
    NuevaReservaSerializer,
    PagoSerializer,
    ReservaSerializer,
    TarifaSerializer,
)
```

Agregar, junto a `CanchaListView`:

```python
class AcademiaListView(ListAPIView):
    queryset = Academia.objects.all()
    serializer_class = AcademiaSerializer
    permission_classes = [IsAuthenticated]
```

En `backend/reservas/urls.py`, cambiar el import de:

```python
from .views import CanchaListView, ObservacionDiaView, ReservaViewSet, TarifaListView
```

a:

```python
from .views import AcademiaListView, CanchaListView, ObservacionDiaView, ReservaViewSet, TarifaListView
```

y agregar a `urlpatterns` (junto a `canchas/` y `tarifas/`):

```python
    path('academias/', AcademiaListView.as_view(), name='academias'),
```

- [ ] **Paso 5: Correr el test y confirmar que pasa**

Run: `python manage.py test reservas.tests.test_academias_api -v 2`
Expected: PASS.

- [ ] **Paso 6: Commit**

```bash
git add backend/reservas/serializers.py backend/reservas/views.py backend/reservas/urls.py backend/reservas/tests/test_academias_api.py
git commit -m "Agrega GET /api/academias/ para poblar el selector del panel"
```

---

### Tarea 3: Backend — `POST /api/reservas/` acepta `academia` opcional

**Files:**
- Modify: `backend/reservas/serializers.py`
- Modify: `backend/reservas/views.py`
- Modify: `backend/reservas/tests/test_reservas_api_crear.py`

**Interfaces:**
- Consumes: `Reserva.academia` (Tarea 1).
- Produces: `POST /api/reservas/` acepta un campo opcional `"academia": <id>|null` en el body. Si no se manda, se comporta exactamente igual que hoy. Lo consume la Tarea 4 (panel manda este campo al crear una reserva).

- [ ] **Paso 1: Escribir los tests que fallan**

En `backend/reservas/tests/test_reservas_api_crear.py`, cambiar el import de:

```python
from reservas.models import Cancha, Reserva, ReservaCancha
```

a:

```python
from reservas.models import Academia, Cancha, Reserva, ReservaCancha
```

Y agregar al final de la clase `CrearReservaApiTest`:

```python
    def test_crea_reserva_vinculada_a_una_academia(self):
        academia = Academia.objects.create(
            nombre='Talentos FC', horario_uso='Martes', permiso_mostrar=True,
        )
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '10:00',
            'cliente_nombre': 'Talentos FC',
            'modalidad': 'individual',
            'canchas': [cancha.id],
            'academia': academia.id,
        }, format='json')

        self.assertEqual(response.status_code, 201)
        reserva = Reserva.objects.get(id=response.data['id'])
        self.assertEqual(reserva.academia_id, academia.id)

    def test_crea_reserva_sin_academia_queda_sin_vincular(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '10:00',
            'cliente_nombre': 'Juan Perez',
            'modalidad': 'individual',
            'canchas': [cancha.id],
        }, format='json')

        self.assertEqual(response.status_code, 201)
        reserva = Reserva.objects.get(id=response.data['id'])
        self.assertIsNone(reserva.academia_id)
```

- [ ] **Paso 2: Correr los tests y confirmar que fallan**

Run: `python manage.py test reservas.tests.test_reservas_api_crear -v 2`
Expected: la primera prueba nueva falla porque el serializer rechaza el campo `academia` con un error de validación (o lo ignora sin vincular, según el caso) — cualquiera de los dos confirma que todavía no está implementado.

- [ ] **Paso 3: Implementar**

En `backend/reservas/serializers.py`, dentro de `NuevaReservaSerializer`, agregar el campo (después de `cliente_nombre`, antes de `modalidad`):

```python
    academia = serializers.PrimaryKeyRelatedField(
        queryset=Academia.objects.all(), required=False, allow_null=True, default=None,
    )
```

En `backend/reservas/views.py`, dentro de `ReservaViewSet.create()`, en el `Reserva.objects.create(...)`, agregar `academia=datos.get('academia'),` (por ejemplo, justo antes de `asignada_por=request.user,`).

- [ ] **Paso 4: Correr los tests y confirmar que pasan**

Run: `python manage.py test reservas.tests.test_reservas_api_crear -v 2`
Expected: PASS (las 9 pruebas: las 7 que ya existían más las 2 nuevas).

- [ ] **Paso 5: Commit**

```bash
git add backend/reservas/serializers.py backend/reservas/views.py backend/reservas/tests/test_reservas_api_crear.py
git commit -m "Permite vincular una academia opcional al crear una reserva"
```

---

### Tarea 4: Frontend — selector de academia en el panel

**Files:**
- Modify: `frontend/src/components/PanelDisponibilidad.jsx`

**Interfaces:**
- Consumes: `GET /api/academias/` (Tarea 2) → `[{id, nombre}, ...]`. `POST /api/reservas/` (Tarea 3) acepta `academia: <id>|null`.
- Produces: ninguna interfaz nueva para otras tareas — es la última pieza del Paso 1.

Nota de diseño: el panel hoy usa `window.prompt` para pedir `cliente_nombre` (sin ningún modal ni componente de formulario). Para no introducir un widget nuevo (select/modal) en una pantalla que ya funciona, el selector de academia sigue el mismo patrón: una lista numerada dentro de otro `window.prompt`. Es intencionalmente simple — se puede reemplazar por un `<select>` real más adelante si se vuelve incómodo de usar.

- [ ] **Paso 1: Cargar la lista de academias**

En `frontend/src/components/PanelDisponibilidad.jsx`, agregar un estado nuevo junto a los demás (`const [academias, setAcademias] = useState([])`) e incluir el pedido en el `Promise.all` existente dentro de `cargarDatos`:

```javascript
      const [canchasData, tarifasData, reservasData, academiasData] = await Promise.all([
        apiFetch('/canchas/'),
        apiFetch('/tarifas/'),
        apiFetch(`/reservas/?fecha=${fecha}`),
        apiFetch('/academias/'),
      ])
      if (!vigente) return
      setCanchas(canchasData)
      setTarifas(tarifasData)
      setReservas(reservasData)
      setAcademias(academiasData)
```

- [ ] **Paso 2: Función para preguntar la academia**

Agregar, cerca de `formatearFecha`/`horaTexto` (funciones auxiliares del archivo):

```javascript
function preguntarAcademia(academias) {
  if (academias.length === 0) return null
  const opciones = academias.map((a, i) => `${i + 1}. ${a.nombre}`).join('\n')
  const respuesta = window.prompt(
    `¿Es una academia? Escribe el numero de la lista, o dejalo vacio si es un cliente:\n${opciones}`,
  )
  if (!respuesta) return null
  const indice = Number(respuesta) - 1
  return academias[indice] ? academias[indice].id : null
}
```

- [ ] **Paso 3: Usarla en `reservarCelda` y `reservarCampoCompleto`**

En `reservarCelda`, después de la línea `if (!cliente) return`, agregar `const academiaId = preguntarAcademia(academias)`, y en el body del `apiFetch('/reservas/', ...)` agregar `academia: academiaId,` junto a `canchas: [canchaId],`.

Hacer el mismo cambio en `reservarCampoCompleto` (mismo patrón: `const academiaId = preguntarAcademia(academias)` después de `if (!cliente) return`, y `academia: academiaId,` en el body del POST).

- [ ] **Paso 4: Verificar con el linter**

Run: `cd frontend && npm run lint`
Expected: sin errores nuevos.

- [ ] **Paso 5: Prueba manual**

Con el backend (`python manage.py runserver`) y el frontend (`npm run dev`) corriendo:
1. Crear al menos una academia desde `http://localhost:8000/admin/reservas/academia/` (ej. "Talentos FC", cualquier `horario_uso`, `permiso_mostrar` tildado).
2. Entrar al panel, hacer clic en una celda libre, escribir un nombre de cliente, y en el segundo prompt escribir `1` para vincular la academia.
3. Confirmar en `http://localhost:8000/admin/reservas/reserva/` que la reserva creada tiene el campo `academia` con el valor esperado.
4. Repetir dejando el segundo prompt vacío, y confirmar que esa reserva queda con `academia` vacío.
5. Confirmar que el resto del panel (cancelar, pagos, resumen) sigue funcionando igual que antes.

- [ ] **Paso 6: Commit**

```bash
git add frontend/src/components/PanelDisponibilidad.jsx
git commit -m "Agrega selector opcional de academia al crear una reserva en el panel"
```

**⚠️ CHECKPOINT: avisar al usuario de que el Paso 1 (migración + /academias/ + selector en el panel) está terminado y esperar a que lo pruebe antes de seguir con la Tarea 5.**

---

### Tarea 5: Backend — helpers `horas_operativas()` y `nombre_academia_visible()`

**Files:**
- Modify: `backend/reservas/servicios.py`
- Modify: `backend/reservas/tests/test_servicios.py`

**Interfaces:**
- Consumes: `Reserva.academia` (Tarea 1), modelo `Tarifa` (existente).
- Produces: `horas_operativas() -> list[int]` (horas enteras, ej. `[8, 9, ..., 23]`) y `nombre_academia_visible(reserva: Reserva) -> str | None`, ambas en `reservas/servicios.py`. Las consume la Tarea 6.

- [ ] **Paso 1: Escribir los tests que fallan**

En `backend/reservas/tests/test_servicios.py`, cambiar los imports de arriba de:

```python
from reservas.models import Cancha, Modalidad, Reserva, ReservaCancha
from reservas.servicios import canchas_ocupadas, obtener_tarifa
```

a:

```python
from reservas.models import Academia, Cancha, Modalidad, Reserva, ReservaCancha
from reservas.servicios import canchas_ocupadas, horas_operativas, nombre_academia_visible, obtener_tarifa
```

Y agregar al final del archivo:

```python
class HorasOperativasTest(TestCase):
    def test_va_de_8_a_23(self):
        self.assertEqual(horas_operativas(), list(range(8, 24)))


class NombreAcademiaVisibleTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )

    def _crear_reserva(self, academia=None):
        return Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre='Cliente',
            fecha='2026-08-20',
            hora_inicio=time(10, 0),
            hora_fin=time(11, 0),
            precio_total='50.00',
            academia=academia,
            asignada_por=self.usuario,
        )

    def test_sin_academia_devuelve_none(self):
        reserva = self._crear_reserva()
        self.assertIsNone(nombre_academia_visible(reserva))

    def test_academia_con_permiso_devuelve_su_nombre(self):
        academia = Academia.objects.create(
            nombre='Talentos FC', horario_uso='Martes', permiso_mostrar=True,
        )
        reserva = self._crear_reserva(academia=academia)
        self.assertEqual(nombre_academia_visible(reserva), 'Talentos FC')

    def test_academia_sin_permiso_devuelve_none(self):
        academia = Academia.objects.create(
            nombre='Potrillos', horario_uso='Lunes', permiso_mostrar=False,
        )
        reserva = self._crear_reserva(academia=academia)
        self.assertIsNone(nombre_academia_visible(reserva))
```

(`from datetime import time` y `UsuarioInterno` ya están importados arriba en el archivo original.)

- [ ] **Paso 2: Correr los tests y confirmar que fallan**

Run: `python manage.py test reservas.tests.test_servicios -v 2`
Expected: FAIL — `ImportError: cannot import name 'horas_operativas'`.

- [ ] **Paso 3: Implementar**

En `backend/reservas/servicios.py`, cambiar el import de:

```python
from .models import Reserva, ReservaCancha, Tarifa
```

a:

```python
from .models import Reserva, ReservaCancha, Tarifa
```

(sin cambios — `Tarifa` ya está importado). Agregar al final del archivo:

```python
def horas_operativas():
    """Horas enteras (8 a 23) durante las que el complejo opera, tomando
    como referencia la tarifa mas temprana -- mismo criterio que usa el
    frontend del panel (calcularHoras) para armar la grilla."""
    primera_tarifa = Tarifa.objects.order_by('hora_inicio').first()
    if primera_tarifa is None:
        return []
    return list(range(primera_tarifa.hora_inicio.hour, 24))


def nombre_academia_visible(reserva):
    """Nombre de la academia vinculada a una reserva, solo si esa academia
    tiene permiso de mostrarse publicamente. None en cualquier otro caso
    (cliente casual, bloqueo, academia sin permiso) -- la web publica
    nunca debe exponer cliente_nombre real."""
    if reserva.academia_id and reserva.academia.permiso_mostrar:
        return reserva.academia.nombre
    return None
```

- [ ] **Paso 4: Correr los tests y confirmar que pasan**

Run: `python manage.py test reservas.tests.test_servicios -v 2`
Expected: PASS (todas, incluidas las que ya existían).

- [ ] **Paso 5: Commit**

```bash
git add backend/reservas/servicios.py backend/reservas/tests/test_servicios.py
git commit -m "Agrega helpers horas_operativas y nombre_academia_visible para la disponibilidad publica"
```

---

### Tarea 6: Backend — endpoint `GET /api/publico/disponibilidad/`

**Files:**
- Modify: `backend/reservas/views.py`
- Modify: `backend/reservas/urls.py`
- Create: `backend/reservas/tests/test_disponibilidad_publica_api.py`

**Interfaces:**
- Consumes: `horas_operativas()` y `nombre_academia_visible()` (Tarea 5), `fecha_valida()` (existente), `Reserva.academia` (Tarea 1).
- Produces: `GET /api/publico/disponibilidad/?fecha=YYYY-MM-DD` (sin login) →
  ```json
  {"fecha": "2026-08-24", "horas": [{"hora": "08:00", "canchas": {"1": {"estado": "libre"}, "2": {"estado": "ocupado", "academia": null}}, "campo_completo": {"estado": "libre"}}, ...]}
  ```
  Lo consume la Tarea 8 (`HorariosPublicos.jsx`).

- [ ] **Paso 1: Escribir los tests que fallan**

Crear `backend/reservas/tests/test_disponibilidad_publica_api.py`:

```python
from datetime import time

from rest_framework.test import APIClient, APITestCase

from reservas.models import Academia, Cancha, Modalidad, Reserva, ReservaCancha
from usuarios.models import UsuarioInterno


class DisponibilidadPublicaApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()

    def _crear_reserva(self, cancha_ids, modalidad=Modalidad.INDIVIDUAL, hora=10,
                        cliente='Cliente', academia=None, estado=Reserva.Estado.CONFIRMADA):
        reserva = Reserva.objects.create(
            modalidad=modalidad,
            cliente_nombre=cliente,
            fecha='2026-08-24',
            hora_inicio=time(hora, 0),
            hora_fin=time(hora + 1, 0),
            precio_total='50.00',
            estado=estado,
            academia=academia,
            asignada_por=self.usuario,
        )
        for cancha_id in cancha_ids:
            ReservaCancha.objects.create(reserva=reserva, cancha_id=cancha_id)
        return reserva

    def _hora(self, response, hora_texto):
        return next(h for h in response.data['horas'] if h['hora'] == hora_texto)

    def test_sin_fecha_devuelve_400(self):
        response = self.client.get('/api/publico/disponibilidad/')
        self.assertEqual(response.status_code, 400)

    def test_fecha_malformada_devuelve_400(self):
        response = self.client.get('/api/publico/disponibilidad/', {'fecha': 'no-es-fecha'})
        self.assertEqual(response.status_code, 400)

    def test_no_requiere_login(self):
        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})
        self.assertEqual(response.status_code, 200)

    def test_dia_sin_reservas_todo_libre(self):
        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})
        hora_10 = self._hora(response, '10:00')
        self.assertEqual(hora_10['canchas']['1']['estado'], 'libre')
        self.assertEqual(hora_10['campo_completo']['estado'], 'libre')

    def test_cliente_casual_no_expone_nombre(self):
        cancha = Cancha.objects.get(numero=1)
        self._crear_reserva([cancha.id], cliente='Juan Perez')

        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})

        hora_10 = self._hora(response, '10:00')
        self.assertEqual(hora_10['canchas']['1']['estado'], 'ocupado')
        self.assertIsNone(hora_10['canchas']['1']['academia'])

    def test_academia_con_permiso_muestra_nombre(self):
        academia = Academia.objects.create(
            nombre='Talentos FC', horario_uso='Martes y jueves', permiso_mostrar=True,
        )
        cancha = Cancha.objects.get(numero=2)
        self._crear_reserva([cancha.id], cliente='Talentos FC', academia=academia)

        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})

        hora_10 = self._hora(response, '10:00')
        self.assertEqual(hora_10['canchas']['2']['academia'], 'Talentos FC')

    def test_academia_sin_permiso_no_muestra_nombre(self):
        academia = Academia.objects.create(
            nombre='Potrillos', horario_uso='Lunes', permiso_mostrar=False,
        )
        cancha = Cancha.objects.get(numero=3)
        self._crear_reserva([cancha.id], cliente='Potrillos', academia=academia)

        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})

        hora_10 = self._hora(response, '10:00')
        self.assertEqual(hora_10['canchas']['3']['estado'], 'ocupado')
        self.assertIsNone(hora_10['canchas']['3']['academia'])

    def test_campo_completo_marca_las_4_canchas_y_campo_completo(self):
        ids = list(Cancha.objects.values_list('id', flat=True))
        self._crear_reserva(ids, modalidad=Modalidad.COMPLETO, cliente='Cumpleanos')

        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})

        hora_10 = self._hora(response, '10:00')
        for numero in ['1', '2', '3', '4']:
            self.assertEqual(hora_10['canchas'][numero]['estado'], 'ocupado')
        self.assertEqual(hora_10['campo_completo']['estado'], 'ocupado')

    def test_reserva_cancelada_no_cuenta_como_ocupada(self):
        cancha = Cancha.objects.get(numero=1)
        self._crear_reserva([cancha.id], cliente='Cancelado', estado=Reserva.Estado.CANCELADA)

        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})

        hora_10 = self._hora(response, '10:00')
        self.assertEqual(hora_10['canchas']['1']['estado'], 'libre')
```

- [ ] **Paso 2: Correr los tests y confirmar que fallan**

Run: `python manage.py test reservas.tests.test_disponibilidad_publica_api -v 2`
Expected: FAIL — `404` (la URL no existe todavía).

- [ ] **Paso 3: Implementar la vista**

En `backend/reservas/views.py`:

Cambiar el import de `datetime` de:

```python
from datetime import datetime, timedelta
```

a:

```python
from datetime import datetime, time, timedelta
```

Cambiar el import de permisos de:

```python
from rest_framework.permissions import IsAuthenticated
```

a:

```python
from rest_framework.permissions import AllowAny, IsAuthenticated
```

Cambiar el import de modelos (ya tocado en la Tarea 2) de:

```python
from .models import Academia, Cancha, ObservacionDia, Pago, Reserva, ReservaCancha, Tarifa
```

a:

```python
from .models import Academia, Cancha, Modalidad, ObservacionDia, Pago, Reserva, ReservaCancha, Tarifa
```

Cambiar el import de `servicios` de:

```python
from .servicios import canchas_ocupadas, fecha_valida, obtener_tarifa
```

a:

```python
from .servicios import canchas_ocupadas, fecha_valida, horas_operativas, nombre_academia_visible, obtener_tarifa
```

Agregar la vista nueva (por ejemplo, después de `ReservaViewSet`, antes de `ObservacionDiaView`):

```python
class DisponibilidadPublicaView(APIView):
    """Sin login: la usa la web publica de horarios. Nunca serializa
    cliente_nombre, montos ni metodos de pago -- solo libre/ocupado y,
    cuando corresponde, el nombre de una academia con permiso de
    mostrarse."""
    permission_classes = [AllowAny]

    def get(self, request):
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not fecha_valida(fecha):
            return Response(
                {'detail': 'Formato de fecha invalido, use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        canchas = list(Cancha.objects.filter(activa=True).order_by('numero'))
        reservas = (
            Reserva.objects.filter(fecha=fecha)
            .exclude(estado=Reserva.Estado.CANCELADA)
            .select_related('academia')
            .prefetch_related('canchas_asignadas')
        )

        horas_resultado = []
        for hora in horas_operativas():
            hora_texto = f'{hora:02d}:00'
            reservas_hora = [r for r in reservas if r.hora_inicio == time(hora, 0)]

            ocupacion_por_cancha = {}
            for r in reservas_hora:
                for rc in r.canchas_asignadas.all():
                    ocupacion_por_cancha[rc.cancha_id] = r

            canchas_estado = {}
            for cancha in canchas:
                reserva_de_la_cancha = ocupacion_por_cancha.get(cancha.id)
                if reserva_de_la_cancha:
                    canchas_estado[str(cancha.numero)] = {
                        'estado': 'ocupado',
                        'academia': nombre_academia_visible(reserva_de_la_cancha),
                    }
                else:
                    canchas_estado[str(cancha.numero)] = {'estado': 'libre'}

            completo = next(
                (r for r in reservas_hora if r.modalidad == Modalidad.COMPLETO), None,
            )
            if completo:
                campo_completo_estado = {
                    'estado': 'ocupado',
                    'academia': nombre_academia_visible(completo),
                }
            else:
                campo_completo_estado = {'estado': 'libre'}

            horas_resultado.append({
                'hora': hora_texto,
                'canchas': canchas_estado,
                'campo_completo': campo_completo_estado,
            })

        return Response({'fecha': fecha, 'horas': horas_resultado})
```

En `backend/reservas/urls.py`, cambiar el import de:

```python
from .views import AcademiaListView, CanchaListView, ObservacionDiaView, ReservaViewSet, TarifaListView
```

a:

```python
from .views import (
    AcademiaListView,
    CanchaListView,
    DisponibilidadPublicaView,
    ObservacionDiaView,
    ReservaViewSet,
    TarifaListView,
)
```

y agregar a `urlpatterns`:

```python
    path('publico/disponibilidad/', DisponibilidadPublicaView.as_view(), name='disponibilidad-publica'),
```

- [ ] **Paso 4: Correr los tests y confirmar que pasan**

Run: `python manage.py test reservas.tests.test_disponibilidad_publica_api -v 2`
Expected: PASS.

Run también la suite completa para confirmar que nada se rompió: `python manage.py test`
Expected: PASS (todas).

- [ ] **Paso 5: Commit**

```bash
git add backend/reservas/views.py backend/reservas/urls.py backend/reservas/tests/test_disponibilidad_publica_api.py
git commit -m "Agrega GET /api/publico/disponibilidad/ sin login para la web publica"
```

**⚠️ CHECKPOINT: avisar al usuario de que el endpoint público ya está listo para probar directo (Postman o navegador, ej. `http://localhost:8000/api/publico/disponibilidad/?fecha=2026-08-24`) antes de seguir con la Tarea 7.**

---

### Tarea 7: Frontend — utils/fecha.js compartido

**Files:**
- Create: `frontend/src/utils/fecha.js`
- Modify: `frontend/src/components/PanelDisponibilidad.jsx`

**Interfaces:**
- Produces: `formatearFecha(fecha: Date): string`, `parsearFecha(fechaTexto: string): Date`, `sumarDias(fechaTexto: string, dias: number): string`, `lunesDeLaSemana(fechaTexto: string): string`, `NOMBRES_DIA: string[]` (7 elementos, Lun a Dom), todos exportados desde `frontend/src/utils/fecha.js`. Los consume la Tarea 8.

- [ ] **Paso 1: Crear el archivo de utilidades**

Crear `frontend/src/utils/fecha.js`:

```javascript
export function formatearFecha(fecha) {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const day = String(fecha.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parsearFecha(fechaTexto) {
  const [year, month, day] = fechaTexto.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function sumarDias(fechaTexto, dias) {
  const fecha = parsearFecha(fechaTexto)
  fecha.setDate(fecha.getDate() + dias)
  return formatearFecha(fecha)
}

// Lunes de la semana que contiene fechaTexto. getDay() devuelve 0=domingo,
// 1=lunes, ..., 6=sabado -- el offset lleva cualquier dia de vuelta al
// lunes de esa misma semana.
export function lunesDeLaSemana(fechaTexto) {
  const fecha = parsearFecha(fechaTexto)
  const diaSemana = fecha.getDay()
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana
  fecha.setDate(fecha.getDate() + offset)
  return formatearFecha(fecha)
}

export const NOMBRES_DIA = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
```

- [ ] **Paso 2: Usarlo desde el panel**

En `frontend/src/components/PanelDisponibilidad.jsx`, quitar la función local (líneas 7-12 del archivo actual):

```javascript
function formatearFecha(fecha) {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const day = String(fecha.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
```

y agregar en su lugar, junto a los demás imports del archivo:

```javascript
import { formatearFecha } from '../utils/fecha'
```

- [ ] **Paso 3: Verificar con el linter**

Run: `cd frontend && npm run lint`
Expected: sin errores.

- [ ] **Paso 4: Prueba manual**

`npm run dev`, entrar al panel, confirmar que el selector de fecha y la grilla se ven y funcionan exactamente igual que antes (no debería notarse ningún cambio visual).

- [ ] **Paso 5: Commit**

```bash
git add frontend/src/utils/fecha.js frontend/src/components/PanelDisponibilidad.jsx
git commit -m "Extrae utilidades de fecha compartidas a utils/fecha.js"
```

---

### Tarea 8: Frontend — componente `HorariosPublicos.jsx`

**Files:**
- Create: `frontend/src/components/HorariosPublicos.jsx`

**Interfaces:**
- Consumes: `GET /api/publico/disponibilidad/?fecha=...` (Tarea 6) → `{"fecha": str, "horas": [{"hora": str, "canchas": {"1": {"estado": str, "academia"?: str|null}, ...}, "campo_completo": {"estado": str, "academia"?: str|null}}]}`. `formatearFecha`, `sumarDias`, `lunesDeLaSemana`, `NOMBRES_DIA` (Tarea 7). `apiFetch` (existente en `frontend/src/api.js`).
- Produces: `export default function HorariosPublicos()`. Lo consume la Tarea 9 (ruteo).

- [ ] **Paso 1: Crear el componente**

Crear `frontend/src/components/HorariosPublicos.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { NOMBRES_DIA, formatearFecha, lunesDeLaSemana, sumarDias } from '../utils/fecha'

export default function HorariosPublicos() {
  const [fecha, setFecha] = useState(formatearFecha(new Date()))
  const [disponibilidad, setDisponibilidad] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    async function cargarDisponibilidad() {
      setCargando(true)
      setError('')
      try {
        const data = await apiFetch(`/publico/disponibilidad/?fecha=${fecha}`)
        if (!vigente) return
        setDisponibilidad(data)
      } catch (err) {
        if (!vigente) return
        setError(err.message)
      } finally {
        if (vigente) setCargando(false)
      }
    }
    cargarDisponibilidad()
    return () => {
      vigente = false
    }
  }, [fecha])

  const lunes = lunesDeLaSemana(fecha)
  const diasSemana = NOMBRES_DIA.map((nombre, i) => {
    const fechaDia = sumarDias(lunes, i)
    return { nombre, fecha: fechaDia, dia: Number(fechaDia.slice(8, 10)) }
  })

  return (
    <div>
      <h2>Horarios disponibles</h2>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => setFecha(sumarDias(fecha, -7))}>◀</button>
        {diasSemana.map((d) => (
          <button
            key={d.fecha}
            onClick={() => setFecha(d.fecha)}
            style={{ fontWeight: d.fecha === fecha ? 'bold' : 'normal' }}
          >
            {d.nombre} {d.dia}
          </button>
        ))}
        <button onClick={() => setFecha(sumarDias(fecha, 7))}>▶</button>
      </div>

      {cargando && <p>Cargando...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!cargando && !error && disponibilidad && (
        <table border="1" cellPadding="4">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Cancha 1</th>
              <th>Cancha 2</th>
              <th>Cancha 3</th>
              <th>Cancha 4</th>
              <th>Campo completo</th>
            </tr>
          </thead>
          <tbody>
            {disponibilidad.horas.map((h) => (
              <tr key={h.hora}>
                <td>{h.hora}</td>
                {['1', '2', '3', '4'].map((numero) => (
                  <td
                    key={numero}
                    style={{
                      background: h.canchas[numero].estado === 'libre' ? '#b4f8c8' : '#f8b4b4',
                    }}
                  >
                    {h.canchas[numero].estado === 'libre'
                      ? 'Libre'
                      : h.canchas[numero].academia || 'Ocupado'}
                  </td>
                ))}
                <td
                  style={{
                    background: h.campo_completo.estado === 'libre' ? '#b4f8c8' : '#f8b4b4',
                  }}
                >
                  {h.campo_completo.estado === 'libre'
                    ? 'Libre'
                    : h.campo_completo.academia || 'Ocupado'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Paso 2: Verificar con el linter**

Run: `cd frontend && npm run lint`
Expected: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add frontend/src/components/HorariosPublicos.jsx
git commit -m "Agrega el componente de solo lectura HorariosPublicos"
```

(Todavía no hay forma de verlo en el navegador — no está conectado a ninguna ruta. Se prueba de punta a punta en la Tarea 9.)

---

### Tarea 9: Frontend — `react-router-dom` y rutas en `App.jsx`

**Files:**
- Modify: `frontend/package.json` (vía `npm install`)
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `HorariosPublicos` (Tarea 8), `Login`/`PanelDisponibilidad`/`useAuth`/`AuthProvider` (existentes, sin cambios).
- Produces: `/` → panel con login (comportamiento actual, sin cambios). `/horarios` → pantalla pública nueva. Es la última tarea del plan.

- [ ] **Paso 1: Instalar la dependencia**

Run: `cd frontend && npm install react-router-dom`
Expected: se agrega `react-router-dom` a `dependencies` en `package.json` y se actualiza `package-lock.json`.

- [ ] **Paso 2: Reestructurar `App.jsx`**

Reemplazar todo el contenido de `frontend/src/App.jsx`:

```jsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'
import PanelDisponibilidad from './components/PanelDisponibilidad'
import HorariosPublicos from './components/HorariosPublicos'

function PanelConLogin() {
  const { autenticado, cerrarSesion } = useAuth()

  if (!autenticado) {
    return <Login />
  }

  return (
    <div>
      <button onClick={cerrarSesion}>Cerrar sesion</button>
      <PanelDisponibilidad />
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/horarios" element={<HorariosPublicos />} />
          <Route path="/" element={<PanelConLogin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
```

(`PanelConLogin` es exactamente el `Contenido` que ya existía en `App.jsx`, solo renombrado para reflejar que ahora vive detrás de la ruta `/`.)

- [ ] **Paso 3: Verificar con el linter**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Paso 4: Prueba manual de punta a punta**

Con backend y frontend corriendo:
1. Visitar `http://localhost:5173/` sin sesión iniciada: debe verse el login, igual que siempre.
2. Iniciar sesión: debe verse el panel de siempre, funcionando igual.
3. Abrir `http://localhost:5173/horarios` en una ventana nueva o de incógnito (sin sesión): debe verse la tabla de disponibilidad pública, sin pedir login.
4. Desde el panel, crear una reserva para una hora del día que se está viendo en `/horarios` (con academia y sin academia, en canchas distintas) y refrescar `/horarios`: esas horas deben aparecer "Ocupado" (con el nombre de la academia en el caso que corresponda, sin nombre en el caso del cliente casual).
5. Probar los 7 botones de día y las flechas ◀/▶ en `/horarios`: los botones cambian de día dentro de la semana visible, las flechas mueven la semana completa ±7 días.
6. Visitar una URL que no exista (ej. `http://localhost:5173/lo-que-sea`): debe redirigir a `/`.

- [ ] **Paso 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/App.jsx
git commit -m "Agrega react-router-dom y separa /horarios (publico) de / (panel con login)"
```
