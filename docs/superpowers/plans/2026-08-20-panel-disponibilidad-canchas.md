# Panel de disponibilidad y reservas (staff) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el panel interno (protegido por JWT) donde el staff marca horas libres/ocupadas por cancha, registra pagos a mano y ve totales/observaciones del día.

**Architecture:** Backend: 8 endpoints DRF nuevos sobre las tablas ya existentes (`reservas`, `reserva_canchas`, `pagos`) más una tabla nueva (`observaciones_dia`). Frontend: primera pantalla real de React — login JWT, grilla hora×cancha, y componentes chicos para pagos/observaciones/totales, sin React Router todavía.

**Tech Stack:** Django 6.1 + Django REST Framework + `djangorestframework-simplejwt`, PostgreSQL, React 19 + Vite (JavaScript, sin TypeScript), `fetch` nativo (sin librerías HTTP nuevas).

**Spec:** [docs/superpowers/specs/2026-08-20-panel-disponibilidad-canchas-design.md](../specs/2026-08-20-panel-disponibilidad-canchas-design.md)

## Global Constraints

- Todos los comandos de backend usan el Python del entorno virtual: `backend/venv/Scripts/python.exe` (nunca el `python` del sistema).
- Ningún endpoint nuevo es público: todos llevan `permission_classes = [IsAuthenticated]`.
- `precio_total` de una reserva siempre lo calcula el servidor desde `tarifas`; nunca se recibe del cliente. Es un valor de **referencia**, no lo que realmente se cobró.
- Los pagos (`pagos`: `monto`, `metodo`) siempre se registran a mano por el staff; el sistema nunca calcula ni asume montos cobrados a partir de `precio_total` ni de ninguna otra cosa.
- El resumen de pagos del día (Tarea 9) suma **todos** los pagos de reservas de esa fecha, **incluyendo los de reservas ya canceladas**. Decisión de negocio confirmada explícitamente: el dinero entró ese día (ej. un adelanto no reembolsable) sin importar qué pase después con la reserva. No restar ni excluir nada por `estado='cancelada'`.
- Bloqueos de horario sin cliente real (ej. mantenimiento futuro) **no tienen campo ni estado especial**: se registran como cualquier reserva, escribiendo un texto descriptivo como `"Mantenimiento"` en `cliente_nombre`. No crear un flag `es_bloqueo` ni nada similar.
- Las academias (ej. "Talentos", "Potrillos") se registran igual que cualquier cliente: su nombre va en `cliente_nombre` de la reserva. **No** hay vínculo formal con la tabla `academias` en este plan — eso queda fuera de alcance.
- 1 clic = 1 hora exacta (`hora_fin = hora_inicio + 1h`). No hay reservas multi-hora en una sola fila todavía.
- El frontend no agrega dependencias npm nuevas: usa `fetch` nativo.
- Sin React Router todavía: una sola pantalla interna (`App.jsx` decide Login vs Panel).
- El `ACCESS_TOKEN_LIFETIME` del JWT **ya quedó en 18 horas y ya está commiteado** (commit `6779f17`, en `backend/config/settings.py`) — esto se hizo al cerrar la spec, antes de este plan. No es una tarea pendiente; no hay que tocarlo. Tampoco hay refresco automático de token programado en este plan.

---

## Prerrequisito (una sola vez, antes de la Tarea 1)

El usuario de base de datos del proyecto (`complejo_deportivo_user`) no tiene permiso para crear bases de datos — y Django necesita crear una base de datos temporal cada vez que se corren tests (`manage.py test`). Se verificó con `SELECT rolcreatedb FROM pg_roles` que hoy es `false`, y un test de prueba falló con *"se ha denegado el permiso para crear la base de datos"*.

**Antes de empezar la Tarea 1**, correr esto una sola vez en una terminal (pide la contraseña del superusuario `postgres`):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "ALTER ROLE complejo_deportivo_user CREATEDB;"
```

Verificar que funcionó:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "SELECT rolname, rolcreatedb FROM pg_roles WHERE rolname='complejo_deportivo_user';"
```

Debe mostrar `rolcreatedb = t`.

---

# Backend

## Task 1: Modelo `ObservacionDia`

**Files:**
- Modify: `backend/reservas/models.py` (agregar clase al final)
- Modify: `backend/reservas/admin.py`
- Create: `backend/reservas/migrations/0003_observaciondia.py` (autogenerada)
- Create: `backend/reservas/tests/__init__.py`
- Create: `backend/reservas/tests/test_models.py`
- Delete: `backend/reservas/tests.py` (se reemplaza por el paquete `tests/`)

**Interfaces:**
- Produces: modelo `ObservacionDia` (campos `fecha` único, `texto`, `actualizado_en`, `actualizado_por`), tabla `observaciones_dia`. Lo usa la Tarea 10.

- [ ] **Step 1: Agregar el modelo**

Al final de `backend/reservas/models.py`, después de la clase `Academia`:

```python
class ObservacionDia(models.Model):
    """Texto libre por día (ej. deudas de academias anotadas a mano).
    Sin ningún cálculo automático — ver spec seccion 2.1."""
    fecha = models.DateField(unique=True)
    texto = models.TextField(blank=True, default='')
    actualizado_en = models.DateTimeField(auto_now=True)
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
    )

    class Meta:
        db_table = 'observaciones_dia'

    def __str__(self):
        return f'Observaciones {self.fecha}'
```

- [ ] **Step 2: Registrar en el admin**

En `backend/reservas/admin.py`, cambiar:

```python
from .models import Academia, Cancha, Pago, Reserva, ReservaCancha, Tarifa
```

por:

```python
from .models import Academia, Cancha, ObservacionDia, Pago, Reserva, ReservaCancha, Tarifa
```

y agregar al final del archivo:

```python
admin.site.register(ObservacionDia)
```

- [ ] **Step 3: Generar y aplicar la migración**

```bash
cd backend
./venv/Scripts/python.exe manage.py makemigrations reservas
./venv/Scripts/python.exe manage.py migrate
```

Expected: crea `reservas/migrations/0003_observaciondia.py` y aplica sin errores.

- [ ] **Step 4: Borrar el stub de tests y crear el paquete `tests/`**

```bash
cd backend
rm reservas/tests.py
mkdir reservas/tests
touch reservas/tests/__init__.py
```

- [ ] **Step 5: Escribir el test**

Crear `backend/reservas/tests/test_models.py`:

```python
from django.test import TestCase

from reservas.models import ObservacionDia
from usuarios.models import UsuarioInterno


class ObservacionDiaTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )

    def test_update_or_create_hace_upsert_por_fecha(self):
        ObservacionDia.objects.update_or_create(
            fecha='2026-08-20',
            defaults={'texto': 'Talentos debe 515.00', 'actualizado_por': self.usuario},
        )
        ObservacionDia.objects.update_or_create(
            fecha='2026-08-20',
            defaults={'texto': 'Talentos debe 600.00', 'actualizado_por': self.usuario},
        )

        self.assertEqual(ObservacionDia.objects.count(), 1)
        observacion = ObservacionDia.objects.get(fecha='2026-08-20')
        self.assertEqual(observacion.texto, 'Talentos debe 600.00')
```

- [ ] **Step 6: Correr el test**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_models -v 2
```

Expected: `OK`, 1 test corrido. (Si falla con "permiso denegado para crear la base de datos", volver al Prerrequisito.)

- [ ] **Step 7: Commit**

```bash
git add backend/reservas/models.py backend/reservas/admin.py backend/reservas/migrations backend/reservas/tests
git rm backend/reservas/tests.py
git commit -m "Agrega modelo ObservacionDia para notas de texto libre por dia"
```

---

## Task 2: Migración de datos — sembrar Canchas y Tarifas

**Files:**
- Create: `backend/reservas/migrations/0004_seed_canchas_tarifas.py`
- Create: `backend/reservas/tests/test_datos_semilla.py`

**Interfaces:**
- Consumes: modelos `Cancha`, `Tarifa` (Task existente, sin cambios).
- Produces: 4 filas en `canchas` (`numero` 1-4), 5 filas en `tarifas` (ver tabla en la spec sección 2.3). Estas filas quedan disponibles automáticamente en cualquier base de datos de test (Django corre las migraciones al crearla) — las Tareas 3, 6, 7, 8, 9 dependen de que existan.

- [ ] **Step 1: Crear el archivo de migración vacío**

```bash
cd backend
./venv/Scripts/python.exe manage.py makemigrations reservas --empty --name seed_canchas_tarifas
```

- [ ] **Step 2: Escribir la migración de datos**

Reemplazar el contenido generado de `backend/reservas/migrations/0004_seed_canchas_tarifas.py` por:

```python
from django.db import migrations


def crear_canchas_y_tarifas(apps, schema_editor):
    Cancha = apps.get_model('reservas', 'Cancha')
    Tarifa = apps.get_model('reservas', 'Tarifa')

    for numero in range(1, 5):
        Cancha.objects.create(numero=numero, activa=True)

    tarifas = [
        ('individual', '08:00', '17:30', '50.00'),
        ('individual', '17:30', '18:00', '60.00'),
        ('individual', '18:00', '00:00', '70.00'),
        ('completo', '08:00', '18:00', '160.00'),
        ('completo', '18:00', '00:00', '180.00'),
    ]
    for modalidad, hora_inicio, hora_fin, precio in tarifas:
        Tarifa.objects.create(
            modalidad=modalidad,
            hora_inicio=hora_inicio,
            hora_fin=hora_fin,
            precio_por_hora=precio,
        )


def eliminar_canchas_y_tarifas(apps, schema_editor):
    Cancha = apps.get_model('reservas', 'Cancha')
    Tarifa = apps.get_model('reservas', 'Tarifa')
    Cancha.objects.all().delete()
    Tarifa.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('reservas', '0003_observaciondia'),
    ]

    operations = [
        migrations.RunPython(crear_canchas_y_tarifas, eliminar_canchas_y_tarifas),
    ]
```

- [ ] **Step 3: Aplicar la migración**

```bash
cd backend
./venv/Scripts/python.exe manage.py migrate
```

Expected: aplica `0004_seed_canchas_tarifas` sin errores.

- [ ] **Step 4: Verificar a mano en la base de datos real**

```bash
PGPASSWORD=1219 "/c/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U complejo_deportivo_user -d complejo_deportivo_db -c "SELECT * FROM canchas;" -c "SELECT * FROM tarifas;"
```

Expected: 4 filas en `canchas`, 5 en `tarifas` con los precios de la tabla de la spec.

- [ ] **Step 5: Escribir el test**

Crear `backend/reservas/tests/test_datos_semilla.py`:

```python
from django.test import TestCase

from reservas.models import Cancha, Modalidad, Tarifa


class DatosSemillaTest(TestCase):
    def test_hay_4_canchas(self):
        self.assertEqual(Cancha.objects.count(), 4)
        numeros = sorted(Cancha.objects.values_list('numero', flat=True))
        self.assertEqual(numeros, [1, 2, 3, 4])

    def test_hay_5_tarifas_con_los_precios_correctos(self):
        self.assertEqual(Tarifa.objects.count(), 5)
        nocturna_individual = Tarifa.objects.get(modalidad=Modalidad.INDIVIDUAL, hora_inicio='18:00')
        self.assertEqual(str(nocturna_individual.precio_por_hora), '70.00')
        diurna_completo = Tarifa.objects.get(modalidad=Modalidad.COMPLETO, hora_inicio='08:00')
        self.assertEqual(str(diurna_completo.precio_por_hora), '160.00')
```

- [ ] **Step 6: Correr el test**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_datos_semilla -v 2
```

Expected: `OK`, 2 tests corridos.

- [ ] **Step 7: Commit**

```bash
git add backend/reservas/migrations/0004_seed_canchas_tarifas.py backend/reservas/tests/test_datos_semilla.py
git commit -m "Siembra las 4 canchas y las 5 franjas de tarifa via migracion de datos"
```

---

## Task 3: Funciones de servicio — `obtener_tarifa` y `canchas_ocupadas`

**Files:**
- Create: `backend/reservas/servicios.py`
- Create: `backend/reservas/tests/test_servicios.py`

**Interfaces:**
- Consumes: filas sembradas por la Tarea 2 (`Cancha.objects.get(numero=N)`, `Tarifa` filtrable por `modalidad`).
- Produces:
  - `obtener_tarifa(modalidad: str, hora: datetime.time) -> Tarifa | None`
  - `canchas_ocupadas(fecha, hora_inicio: datetime.time, cancha_ids: list[int]) -> set[int]`
  
  Ambas las usa la Tarea 6 (`POST /api/reservas/`).

- [ ] **Step 1: Escribir los tests (fallan porque `servicios.py` no existe)**

Crear `backend/reservas/tests/test_servicios.py`:

```python
from datetime import time

from django.test import TestCase

from reservas.models import Cancha, Modalidad, Reserva, ReservaCancha
from reservas.servicios import canchas_ocupadas, obtener_tarifa
from usuarios.models import UsuarioInterno


class ObtenerTarifaTest(TestCase):
    def test_encuentra_la_franja_de_la_manana(self):
        tarifa = obtener_tarifa(Modalidad.INDIVIDUAL, time(10, 0))
        self.assertEqual(str(tarifa.precio_por_hora), '50.00')

    def test_encuentra_la_franja_nocturna_que_termina_a_medianoche(self):
        tarifa = obtener_tarifa(Modalidad.INDIVIDUAL, time(23, 0))
        self.assertEqual(str(tarifa.precio_por_hora), '70.00')

    def test_devuelve_none_fuera_de_horario(self):
        tarifa = obtener_tarifa(Modalidad.INDIVIDUAL, time(3, 0))
        self.assertIsNone(tarifa)


class CanchasOcupadasTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.cancha_1 = Cancha.objects.get(numero=1)
        self.cancha_2 = Cancha.objects.get(numero=2)
        self.cancha_3 = Cancha.objects.get(numero=3)
        self.reserva = Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre='Juan',
            fecha='2026-08-20',
            hora_inicio=time(18, 0),
            hora_fin=time(19, 0),
            precio_total='70.00',
            asignada_por=self.usuario,
        )
        ReservaCancha.objects.create(reserva=self.reserva, cancha=self.cancha_2)

    def test_detecta_cancha_ocupada(self):
        ids = [self.cancha_1.id, self.cancha_2.id, self.cancha_3.id]
        ocupadas = canchas_ocupadas('2026-08-20', time(18, 0), ids)
        self.assertEqual(ocupadas, {self.cancha_2.id})

    def test_reserva_cancelada_no_cuenta_como_ocupada(self):
        self.reserva.estado = Reserva.Estado.CANCELADA
        self.reserva.save(update_fields=['estado'])
        ids = [self.cancha_1.id, self.cancha_2.id, self.cancha_3.id]
        ocupadas = canchas_ocupadas('2026-08-20', time(18, 0), ids)
        self.assertEqual(ocupadas, set())
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_servicios -v 2
```

Expected: FAIL (`ModuleNotFoundError: No module named 'reservas.servicios'`).

- [ ] **Step 3: Implementar `servicios.py`**

Crear `backend/reservas/servicios.py`:

```python
from datetime import time

from .models import Reserva, ReservaCancha, Tarifa


def obtener_tarifa(modalidad, hora):
    """Busca la tarifa que cubre una hora dada, para una modalidad.

    hora_fin=00:00 significa 'medianoche = fin del dia operativo': se
    trata como caso especial porque PostgreSQL no tiene un valor de hora
    para las 24:00, y una comparacion literal (hora < hora_fin) fallaria
    para la franja nocturna (ej. 23:00 no es menor que 00:00).
    """
    for tarifa in Tarifa.objects.filter(modalidad=modalidad):
        termina_a_medianoche = tarifa.hora_fin == time(0, 0)
        cubre_la_hora = tarifa.hora_inicio <= hora and (
            termina_a_medianoche or hora < tarifa.hora_fin
        )
        if cubre_la_hora:
            return tarifa
    return None


def canchas_ocupadas(fecha, hora_inicio, cancha_ids):
    """De la lista cancha_ids, devuelve las que ya tienen una reserva NO
    cancelada para esa fecha y hora_inicio exactas."""
    return set(
        ReservaCancha.objects.filter(
            cancha_id__in=cancha_ids,
            reserva__fecha=fecha,
            reserva__hora_inicio=hora_inicio,
        )
        .exclude(reserva__estado=Reserva.Estado.CANCELADA)
        .values_list('cancha_id', flat=True)
    )
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_servicios -v 2
```

Expected: `OK`, 5 tests corridos.

- [ ] **Step 5: Commit**

```bash
git add backend/reservas/servicios.py backend/reservas/tests/test_servicios.py
git commit -m "Agrega obtener_tarifa y canchas_ocupadas como funciones de servicio"
```

---

## Task 4: Endpoints de solo lectura — `GET /api/canchas/` y `GET /api/tarifas/`

**Files:**
- Create: `backend/reservas/serializers.py`
- Modify: `backend/reservas/views.py` (reemplazar el stub generado por `startapp`)
- Create: `backend/reservas/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/reservas/tests/test_canchas_tarifas_api.py`

**Interfaces:**
- Produces:
  - `CanchaSerializer`, `TarifaSerializer` en `reservas/serializers.py` (los reutiliza la Tarea 5 en adelante).
  - Rutas `/api/canchas/`, `/api/tarifas/`, ambas `IsAuthenticated`.

- [ ] **Step 1: Escribir el test (falla: las rutas no existen todavía)**

Crear `backend/reservas/tests/test_canchas_tarifas_api.py`:

```python
from rest_framework.test import APIClient, APITestCase

from usuarios.models import UsuarioInterno


class CanchasTarifasApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()

    def test_sin_login_devuelve_401(self):
        response = self.client.get('/api/canchas/')
        self.assertEqual(response.status_code, 401)

    def test_lista_las_4_canchas(self):
        self.client.force_authenticate(user=self.usuario)
        response = self.client.get('/api/canchas/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 4)

    def test_lista_las_5_tarifas(self):
        self.client.force_authenticate(user=self.usuario)
        response = self.client.get('/api/tarifas/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_canchas_tarifas_api -v 2
```

Expected: FAIL (404, la ruta `/api/canchas/` no existe).

- [ ] **Step 3: Crear los serializers**

Crear `backend/reservas/serializers.py`:

```python
from rest_framework import serializers

from .models import Cancha, Tarifa


class CanchaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cancha
        fields = ['id', 'numero', 'activa']


class TarifaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tarifa
        fields = ['id', 'modalidad', 'hora_inicio', 'hora_fin', 'precio_por_hora']
```

- [ ] **Step 4: Reemplazar `views.py`**

Reemplazar todo el contenido de `backend/reservas/views.py` por:

```python
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from .models import Cancha, Tarifa
from .serializers import CanchaSerializer, TarifaSerializer


class CanchaListView(ListAPIView):
    queryset = Cancha.objects.all()
    serializer_class = CanchaSerializer
    permission_classes = [IsAuthenticated]


class TarifaListView(ListAPIView):
    queryset = Tarifa.objects.all()
    serializer_class = TarifaSerializer
    permission_classes = [IsAuthenticated]
```

- [ ] **Step 5: Crear `reservas/urls.py`**

```python
from django.urls import path

from .views import CanchaListView, TarifaListView

urlpatterns = [
    path('canchas/', CanchaListView.as_view(), name='canchas'),
    path('tarifas/', TarifaListView.as_view(), name='tarifas'),
]
```

- [ ] **Step 6: Conectar en `config/urls.py`**

En `backend/config/urls.py`, agregar esta línea dentro de `urlpatterns`, después de la línea de `usuarios.urls`:

```python
    path('api/', include('reservas.urls')),
```

(El archivo ya importa `include` desde la Tarea de autenticación anterior; si por alguna razón no está, agregar `from django.urls import include, path` al inicio.)

- [ ] **Step 7: Correr el test y verificar que pasa**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_canchas_tarifas_api -v 2
```

Expected: `OK`, 3 tests corridos.

- [ ] **Step 8: Commit**

```bash
git add backend/reservas/serializers.py backend/reservas/views.py backend/reservas/urls.py backend/config/urls.py backend/reservas/tests/test_canchas_tarifas_api.py
git commit -m "Agrega endpoints de solo lectura para canchas y tarifas"
```

---

## Task 5: Endpoint — listar reservas del día (`GET /api/reservas/?fecha=`)

**Files:**
- Modify: `backend/reservas/serializers.py` (agregar `PagoSerializer`, `ReservaSerializer`)
- Modify: `backend/reservas/views.py` (agregar `ReservaViewSet` con `list()`)
- Modify: `backend/reservas/urls.py` (registrar el router)
- Create: `backend/reservas/tests/test_reservas_api_listar.py`

**Interfaces:**
- Produces: `ReservaSerializer` (campos `id, modalidad, cliente_nombre, fecha, hora_inicio, hora_fin, estado, precio_total, canchas, pagos`), `PagoSerializer` (campos `id, tipo, monto, metodo, fecha_hora`). `ReservaViewSet` registrado en el router como `reservas` — las Tareas 6-9 le agregan métodos.
- Ruta: `GET /api/reservas/?fecha=YYYY-MM-DD`.

- [ ] **Step 1: Escribir el test (falla: la ruta no existe)**

Crear `backend/reservas/tests/test_reservas_api_listar.py`:

```python
from datetime import time

from rest_framework.test import APIClient, APITestCase

from reservas.models import Cancha, Modalidad, Reserva, ReservaCancha
from usuarios.models import UsuarioInterno


class ListarReservasApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def test_sin_fecha_devuelve_400(self):
        response = self.client.get('/api/reservas/')
        self.assertEqual(response.status_code, 400)

    def test_lista_reservas_del_dia_con_sus_canchas(self):
        cancha = Cancha.objects.get(numero=2)
        reserva = Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre='Juan',
            fecha='2026-08-20',
            hora_inicio=time(18, 0),
            hora_fin=time(19, 0),
            precio_total='70.00',
            asignada_por=self.usuario,
        )
        ReservaCancha.objects.create(reserva=reserva, cancha=cancha)

        response = self.client.get('/api/reservas/', {'fecha': '2026-08-20'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['cliente_nombre'], 'Juan')
        self.assertEqual(response.data[0]['canchas'], [cancha.id])
        self.assertEqual(response.data[0]['pagos'], [])

    def test_no_incluye_reservas_canceladas(self):
        Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre='Cancelada',
            fecha='2026-08-20',
            hora_inicio=time(9, 0),
            hora_fin=time(10, 0),
            precio_total='50.00',
            estado=Reserva.Estado.CANCELADA,
            asignada_por=self.usuario,
        )
        response = self.client.get('/api/reservas/', {'fecha': '2026-08-20'})
        self.assertEqual(len(response.data), 0)
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_listar -v 2
```

Expected: FAIL (404).

- [ ] **Step 3: Reemplazar `serializers.py` completo**

Reemplazar todo el contenido de `backend/reservas/serializers.py` por:

```python
from rest_framework import serializers

from .models import Cancha, Pago, Reserva, Tarifa


class CanchaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cancha
        fields = ['id', 'numero', 'activa']


class TarifaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tarifa
        fields = ['id', 'modalidad', 'hora_inicio', 'hora_fin', 'precio_por_hora']


class PagoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pago
        fields = ['id', 'tipo', 'monto', 'metodo', 'fecha_hora']
        read_only_fields = ['id', 'fecha_hora']


class ReservaSerializer(serializers.ModelSerializer):
    canchas = serializers.SerializerMethodField()
    pagos = PagoSerializer(many=True, read_only=True)

    class Meta:
        model = Reserva
        fields = [
            'id', 'modalidad', 'cliente_nombre', 'fecha', 'hora_inicio',
            'hora_fin', 'estado', 'precio_total', 'canchas', 'pagos',
        ]

    def get_canchas(self, reserva):
        return list(reserva.canchas_asignadas.values_list('cancha_id', flat=True))
```

- [ ] **Step 4: Reemplazar `views.py` completo**

Reemplazar todo el contenido de `backend/reservas/views.py` por:

```python
from rest_framework import status, viewsets
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Cancha, Reserva, Tarifa
from .serializers import CanchaSerializer, ReservaSerializer, TarifaSerializer


class CanchaListView(ListAPIView):
    queryset = Cancha.objects.all()
    serializer_class = CanchaSerializer
    permission_classes = [IsAuthenticated]


class TarifaListView(ListAPIView):
    queryset = Tarifa.objects.all()
    serializer_class = TarifaSerializer
    permission_classes = [IsAuthenticated]


class ReservaViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reservas = (
            Reserva.objects.filter(fecha=fecha)
            .exclude(estado=Reserva.Estado.CANCELADA)
            .prefetch_related('canchas_asignadas', 'pagos')
        )
        return Response(ReservaSerializer(reservas, many=True).data)
```

- [ ] **Step 5: Registrar el router en `urls.py`**

Reemplazar `backend/reservas/urls.py` por:

```python
from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CanchaListView, ReservaViewSet, TarifaListView

router = DefaultRouter()
router.register('reservas', ReservaViewSet, basename='reserva')

urlpatterns = [
    path('canchas/', CanchaListView.as_view(), name='canchas'),
    path('tarifas/', TarifaListView.as_view(), name='tarifas'),
] + router.urls
```

- [ ] **Step 6: Correr el test y verificar que pasa**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_listar -v 2
```

Expected: `OK`, 3 tests corridos.

- [ ] **Step 7: Commit**

```bash
git add backend/reservas/serializers.py backend/reservas/views.py backend/reservas/urls.py backend/reservas/tests/test_reservas_api_listar.py
git commit -m "Agrega GET /api/reservas/ para listar reservas de un dia"
```

---

## Task 6: Endpoint — crear reserva (`POST /api/reservas/`)

**Files:**
- Modify: `backend/reservas/serializers.py` (agregar `NuevaReservaSerializer`)
- Modify: `backend/reservas/views.py` (agregar `create()` a `ReservaViewSet`)
- Create: `backend/reservas/tests/test_reservas_api_crear.py`

**Interfaces:**
- Consumes: `obtener_tarifa`, `canchas_ocupadas` (Tarea 3); `ReservaSerializer` (Tarea 5).
- Produces: `NuevaReservaSerializer` (input: `fecha, hora_inicio, cliente_nombre, modalidad, canchas`). Método `create()` en `ReservaViewSet`.

- [ ] **Step 1: Escribir los tests (fallan: `create` no existe, DRF devuelve 405)**

Crear `backend/reservas/tests/test_reservas_api_crear.py`:

```python
from rest_framework.test import APIClient, APITestCase

from reservas.models import Cancha, Reserva, ReservaCancha
from usuarios.models import UsuarioInterno


class CrearReservaApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def test_crea_reserva_individual_con_precio_correcto(self):
        cancha = Cancha.objects.get(numero=3)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '10:00',
            'cliente_nombre': 'Juan Perez',
            'modalidad': 'individual',
            'canchas': [cancha.id],
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['precio_total'], '50.00')
        self.assertEqual(response.data['hora_fin'], '11:00:00')
        self.assertEqual(response.data['canchas'], [cancha.id])

        reserva = Reserva.objects.get(id=response.data['id'])
        self.assertEqual(reserva.asignada_por, self.usuario)

    def test_crea_reserva_campo_completo_con_las_4_canchas(self):
        ids = list(Cancha.objects.values_list('id', flat=True))
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '19:00',
            'cliente_nombre': 'Cumpleanos',
            'modalidad': 'completo',
            'canchas': ids,
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['precio_total'], '180.00')
        self.assertEqual(
            ReservaCancha.objects.filter(reserva_id=response.data['id']).count(), 4,
        )

    def test_fuera_de_horario_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '03:00',
            'cliente_nombre': 'Nadie',
            'modalidad': 'individual',
            'canchas': [cancha.id],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_no_permite_doble_reserva_de_la_misma_cancha_y_hora(self):
        cancha = Cancha.objects.get(numero=1)
        body = {
            'fecha': '2026-08-20',
            'hora_inicio': '10:00',
            'cliente_nombre': 'Primero',
            'modalidad': 'individual',
            'canchas': [cancha.id],
        }
        primera = self.client.post('/api/reservas/', body, format='json')
        self.assertEqual(primera.status_code, 201)

        body['cliente_nombre'] = 'Segundo'
        segunda = self.client.post('/api/reservas/', body, format='json')
        self.assertEqual(segunda.status_code, 400)
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_crear -v 2
```

Expected: FAIL (405 Method Not Allowed en los 4 tests).

- [ ] **Step 3: Reemplazar `serializers.py` completo**

Reemplazar todo el contenido de `backend/reservas/serializers.py` por (agrega `NuevaReservaSerializer` al final y `Modalidad` al import):

```python
from rest_framework import serializers

from .models import Cancha, Modalidad, Pago, Reserva, Tarifa


class CanchaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cancha
        fields = ['id', 'numero', 'activa']


class TarifaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tarifa
        fields = ['id', 'modalidad', 'hora_inicio', 'hora_fin', 'precio_por_hora']


class PagoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pago
        fields = ['id', 'tipo', 'monto', 'metodo', 'fecha_hora']
        read_only_fields = ['id', 'fecha_hora']


class ReservaSerializer(serializers.ModelSerializer):
    canchas = serializers.SerializerMethodField()
    pagos = PagoSerializer(many=True, read_only=True)

    class Meta:
        model = Reserva
        fields = [
            'id', 'modalidad', 'cliente_nombre', 'fecha', 'hora_inicio',
            'hora_fin', 'estado', 'precio_total', 'canchas', 'pagos',
        ]

    def get_canchas(self, reserva):
        return list(reserva.canchas_asignadas.values_list('cancha_id', flat=True))


class NuevaReservaSerializer(serializers.Serializer):
    fecha = serializers.DateField()
    hora_inicio = serializers.TimeField()
    # Texto libre a proposito: ademas de nombres de clientes reales, el
    # mismo campo se usa para bloqueos sin cliente (ej. "Mantenimiento")
    # y para academias (ej. "Talentos") - sin campo, estado ni tabla
    # especial para ninguno de esos dos casos.
    cliente_nombre = serializers.CharField(max_length=150)
    modalidad = serializers.ChoiceField(choices=Modalidad.choices)
    canchas = serializers.ListField(
        child=serializers.IntegerField(), min_length=1, max_length=4,
    )
```

- [ ] **Step 4: Reemplazar `views.py` completo**

Reemplazar todo el contenido de `backend/reservas/views.py` por (agrega el import de `datetime`/`transaction`/`servicios`, `ReservaCancha` y `NuevaReservaSerializer`, y el método `create()`):

```python
from datetime import datetime, timedelta

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Cancha, Reserva, ReservaCancha, Tarifa
from .serializers import (
    CanchaSerializer,
    NuevaReservaSerializer,
    ReservaSerializer,
    TarifaSerializer,
)
from .servicios import canchas_ocupadas, obtener_tarifa


class CanchaListView(ListAPIView):
    queryset = Cancha.objects.all()
    serializer_class = CanchaSerializer
    permission_classes = [IsAuthenticated]


class TarifaListView(ListAPIView):
    queryset = Tarifa.objects.all()
    serializer_class = TarifaSerializer
    permission_classes = [IsAuthenticated]


class ReservaViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reservas = (
            Reserva.objects.filter(fecha=fecha)
            .exclude(estado=Reserva.Estado.CANCELADA)
            .prefetch_related('canchas_asignadas', 'pagos')
        )
        return Response(ReservaSerializer(reservas, many=True).data)

    def create(self, request):
        entrada = NuevaReservaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        tarifa = obtener_tarifa(datos['modalidad'], datos['hora_inicio'])
        if tarifa is None:
            return Response(
                {'detail': 'No hay tarifa configurada para esa modalidad y hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ocupadas = canchas_ocupadas(datos['fecha'], datos['hora_inicio'], datos['canchas'])
        if ocupadas:
            return Response(
                {'detail': f'Las canchas {sorted(ocupadas)} ya estan ocupadas a esa hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inicio_dt = datetime.combine(datos['fecha'], datos['hora_inicio'])
        hora_fin = (inicio_dt + timedelta(hours=1)).time()

        with transaction.atomic():
            reserva = Reserva.objects.create(
                modalidad=datos['modalidad'],
                cliente_nombre=datos['cliente_nombre'],
                fecha=datos['fecha'],
                hora_inicio=datos['hora_inicio'],
                hora_fin=hora_fin,
                precio_total=tarifa.precio_por_hora,
                asignada_por=request.user,
            )
            ReservaCancha.objects.bulk_create([
                ReservaCancha(reserva=reserva, cancha_id=cancha_id)
                for cancha_id in datos['canchas']
            ])

        return Response(ReservaSerializer(reserva).data, status=status.HTTP_201_CREATED)
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_crear -v 2
```

Expected: `OK`, 4 tests corridos.

- [ ] **Step 6: Commit**

```bash
git add backend/reservas/serializers.py backend/reservas/views.py backend/reservas/tests/test_reservas_api_crear.py
git commit -m "Agrega POST /api/reservas/ para crear una reserva de 1 hora"
```

---

## Task 7: Endpoint — cancelar reserva (`POST /api/reservas/{id}/cancelar/`)

**Files:**
- Modify: `backend/reservas/views.py`
- Create: `backend/reservas/tests/test_reservas_api_cancelar.py`

**Interfaces:**
- Produces: acción `cancelar` en `ReservaViewSet`, ruta `/api/reservas/{id}/cancelar/`.

- [ ] **Step 1: Escribir los tests (fallan: la ruta no existe)**

Crear `backend/reservas/tests/test_reservas_api_cancelar.py`:

```python
from datetime import time

from rest_framework.test import APIClient, APITestCase

from reservas.models import Cancha, Modalidad, Reserva
from usuarios.models import UsuarioInterno


class CancelarReservaApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)
        self.reserva = Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre='Juan',
            fecha='2026-08-20',
            hora_inicio=time(10, 0),
            hora_fin=time(11, 0),
            precio_total='50.00',
            asignada_por=self.usuario,
        )

    def test_cancela_la_reserva(self):
        response = self.client.post(f'/api/reservas/{self.reserva.id}/cancelar/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['estado'], 'cancelada')
        self.reserva.refresh_from_db()
        self.assertEqual(self.reserva.estado, Reserva.Estado.CANCELADA)

    def test_reserva_inexistente_devuelve_404(self):
        response = self.client.post('/api/reservas/99999/cancelar/')
        self.assertEqual(response.status_code, 404)
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_cancelar -v 2
```

Expected: FAIL (404, la ruta no existe).

- [ ] **Step 3: Reemplazar `views.py` completo**

Reemplazar todo el contenido de `backend/reservas/views.py` por (agrega el import de `action` y el método `cancelar()`):

```python
from datetime import datetime, timedelta

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Cancha, Reserva, ReservaCancha, Tarifa
from .serializers import (
    CanchaSerializer,
    NuevaReservaSerializer,
    ReservaSerializer,
    TarifaSerializer,
)
from .servicios import canchas_ocupadas, obtener_tarifa


class CanchaListView(ListAPIView):
    queryset = Cancha.objects.all()
    serializer_class = CanchaSerializer
    permission_classes = [IsAuthenticated]


class TarifaListView(ListAPIView):
    queryset = Tarifa.objects.all()
    serializer_class = TarifaSerializer
    permission_classes = [IsAuthenticated]


class ReservaViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reservas = (
            Reserva.objects.filter(fecha=fecha)
            .exclude(estado=Reserva.Estado.CANCELADA)
            .prefetch_related('canchas_asignadas', 'pagos')
        )
        return Response(ReservaSerializer(reservas, many=True).data)

    def create(self, request):
        entrada = NuevaReservaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        tarifa = obtener_tarifa(datos['modalidad'], datos['hora_inicio'])
        if tarifa is None:
            return Response(
                {'detail': 'No hay tarifa configurada para esa modalidad y hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ocupadas = canchas_ocupadas(datos['fecha'], datos['hora_inicio'], datos['canchas'])
        if ocupadas:
            return Response(
                {'detail': f'Las canchas {sorted(ocupadas)} ya estan ocupadas a esa hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inicio_dt = datetime.combine(datos['fecha'], datos['hora_inicio'])
        hora_fin = (inicio_dt + timedelta(hours=1)).time()

        with transaction.atomic():
            reserva = Reserva.objects.create(
                modalidad=datos['modalidad'],
                cliente_nombre=datos['cliente_nombre'],
                fecha=datos['fecha'],
                hora_inicio=datos['hora_inicio'],
                hora_fin=hora_fin,
                precio_total=tarifa.precio_por_hora,
                asignada_por=request.user,
            )
            ReservaCancha.objects.bulk_create([
                ReservaCancha(reserva=reserva, cancha_id=cancha_id)
                for cancha_id in datos['canchas']
            ])

        return Response(ReservaSerializer(reserva).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        try:
            reserva = Reserva.objects.get(pk=pk)
        except Reserva.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        reserva.estado = Reserva.Estado.CANCELADA
        reserva.save(update_fields=['estado'])
        return Response(ReservaSerializer(reserva).data)
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_cancelar -v 2
```

Expected: `OK`, 2 tests corridos.

- [ ] **Step 5: Commit**

```bash
git add backend/reservas/views.py backend/reservas/tests/test_reservas_api_cancelar.py
git commit -m "Agrega POST /api/reservas/{id}/cancelar/ para liberar una hora"
```

---

## Task 8: Endpoint — agregar pago (`POST /api/reservas/{id}/pagos/`)

**Files:**
- Modify: `backend/reservas/views.py`
- Create: `backend/reservas/tests/test_reservas_api_pagos.py`

**Interfaces:**
- Consumes: `PagoSerializer` (Tarea 5).
- Produces: acción `pagos` en `ReservaViewSet`, ruta `/api/reservas/{id}/pagos/`.

- [ ] **Step 1: Escribir los tests (fallan: la ruta no existe)**

Crear `backend/reservas/tests/test_reservas_api_pagos.py`:

```python
from datetime import time

from rest_framework.test import APIClient, APITestCase

from reservas.models import Modalidad, Reserva
from usuarios.models import UsuarioInterno


class AgregarPagoApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)
        self.reserva = Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre='Juan',
            fecha='2026-08-20',
            hora_inicio=time(10, 0),
            hora_fin=time(11, 0),
            precio_total='50.00',
            asignada_por=self.usuario,
        )

    def test_agrega_un_pago_a_la_reserva(self):
        response = self.client.post(f'/api/reservas/{self.reserva.id}/pagos/', {
            'tipo': 'adelanto',
            'monto': '20.00',
            'metodo': 'yape',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.reserva.pagos.count(), 1)
        pago = self.reserva.pagos.first()
        self.assertEqual(pago.registrado_por, self.usuario)

    def test_permite_varios_pagos_en_la_misma_reserva(self):
        self.client.post(f'/api/reservas/{self.reserva.id}/pagos/', {
            'tipo': 'adelanto', 'monto': '20.00', 'metodo': 'yape',
        }, format='json')
        self.client.post(f'/api/reservas/{self.reserva.id}/pagos/', {
            'tipo': 'saldo', 'monto': '30.00', 'metodo': 'efectivo',
        }, format='json')
        self.assertEqual(self.reserva.pagos.count(), 2)
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_pagos -v 2
```

Expected: FAIL (404).

- [ ] **Step 3: Reemplazar `views.py` completo**

Reemplazar todo el contenido de `backend/reservas/views.py` por (agrega `PagoSerializer` al import y el método `pagos()`):

```python
from datetime import datetime, timedelta

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Cancha, Reserva, ReservaCancha, Tarifa
from .serializers import (
    CanchaSerializer,
    NuevaReservaSerializer,
    PagoSerializer,
    ReservaSerializer,
    TarifaSerializer,
)
from .servicios import canchas_ocupadas, obtener_tarifa


class CanchaListView(ListAPIView):
    queryset = Cancha.objects.all()
    serializer_class = CanchaSerializer
    permission_classes = [IsAuthenticated]


class TarifaListView(ListAPIView):
    queryset = Tarifa.objects.all()
    serializer_class = TarifaSerializer
    permission_classes = [IsAuthenticated]


class ReservaViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reservas = (
            Reserva.objects.filter(fecha=fecha)
            .exclude(estado=Reserva.Estado.CANCELADA)
            .prefetch_related('canchas_asignadas', 'pagos')
        )
        return Response(ReservaSerializer(reservas, many=True).data)

    def create(self, request):
        entrada = NuevaReservaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        tarifa = obtener_tarifa(datos['modalidad'], datos['hora_inicio'])
        if tarifa is None:
            return Response(
                {'detail': 'No hay tarifa configurada para esa modalidad y hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ocupadas = canchas_ocupadas(datos['fecha'], datos['hora_inicio'], datos['canchas'])
        if ocupadas:
            return Response(
                {'detail': f'Las canchas {sorted(ocupadas)} ya estan ocupadas a esa hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inicio_dt = datetime.combine(datos['fecha'], datos['hora_inicio'])
        hora_fin = (inicio_dt + timedelta(hours=1)).time()

        with transaction.atomic():
            reserva = Reserva.objects.create(
                modalidad=datos['modalidad'],
                cliente_nombre=datos['cliente_nombre'],
                fecha=datos['fecha'],
                hora_inicio=datos['hora_inicio'],
                hora_fin=hora_fin,
                precio_total=tarifa.precio_por_hora,
                asignada_por=request.user,
            )
            ReservaCancha.objects.bulk_create([
                ReservaCancha(reserva=reserva, cancha_id=cancha_id)
                for cancha_id in datos['canchas']
            ])

        return Response(ReservaSerializer(reserva).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        try:
            reserva = Reserva.objects.get(pk=pk)
        except Reserva.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        reserva.estado = Reserva.Estado.CANCELADA
        reserva.save(update_fields=['estado'])
        return Response(ReservaSerializer(reserva).data)

    @action(detail=True, methods=['post'])
    def pagos(self, request, pk=None):
        try:
            reserva = Reserva.objects.get(pk=pk)
        except Reserva.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        entrada = PagoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        pago = entrada.save(reserva=reserva, registrado_por=request.user)
        return Response(PagoSerializer(pago).data, status=status.HTTP_201_CREATED)
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_pagos -v 2
```

Expected: `OK`, 2 tests corridos.

- [ ] **Step 5: Commit**

```bash
git add backend/reservas/views.py backend/reservas/tests/test_reservas_api_pagos.py
git commit -m "Agrega POST /api/reservas/{id}/pagos/ para registrar pagos a mano"
```

---

## Task 9: Endpoint — resumen de pagos del día (`GET /api/reservas/resumen-pagos/?fecha=`)

**Files:**
- Modify: `backend/reservas/views.py`
- Create: `backend/reservas/tests/test_reservas_api_resumen_pagos.py`

**Interfaces:**
- Produces: acción `resumen_pagos` en `ReservaViewSet`, ruta `/api/reservas/resumen-pagos/?fecha=YYYY-MM-DD`. Respuesta: `{total_efectivo, total_yape, total_general}` (strings decimales).

- [ ] **Step 1: Escribir los tests (fallan: la ruta no existe)**

Crear `backend/reservas/tests/test_reservas_api_resumen_pagos.py`:

```python
from datetime import time

from rest_framework.test import APIClient, APITestCase

from reservas.models import Modalidad, Pago, Reserva
from usuarios.models import UsuarioInterno


class ResumenPagosApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def _crear_reserva(self, cliente, estado=Reserva.Estado.CONFIRMADA):
        return Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre=cliente,
            fecha='2026-08-20',
            hora_inicio=time(10, 0),
            hora_fin=time(11, 0),
            precio_total='50.00',
            estado=estado,
            asignada_por=self.usuario,
        )

    def test_sin_fecha_devuelve_400(self):
        response = self.client.get('/api/reservas/resumen-pagos/')
        self.assertEqual(response.status_code, 400)

    def test_suma_efectivo_yape_y_general(self):
        r1 = self._crear_reserva('Juan')
        Pago.objects.create(reserva=r1, tipo='saldo', monto='50.00', metodo='efectivo', registrado_por=self.usuario)
        r2 = self._crear_reserva('Maria')
        Pago.objects.create(reserva=r2, tipo='adelanto', monto='30.00', metodo='yape', registrado_por=self.usuario)

        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-20'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_efectivo'], '50.00')
        self.assertEqual(response.data['total_yape'], '30.00')
        self.assertEqual(response.data['total_general'], '80.00')

    def test_incluye_pagos_de_reservas_canceladas(self):
        r1 = self._crear_reserva('Juan', estado=Reserva.Estado.CANCELADA)
        Pago.objects.create(reserva=r1, tipo='adelanto', monto='30.00', metodo='yape', registrado_por=self.usuario)

        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-20'})

        self.assertEqual(response.data['total_yape'], '30.00')
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_resumen_pagos -v 2
```

Expected: FAIL (404).

- [ ] **Step 3: Reemplazar `views.py` completo**

Reemplazar todo el contenido de `backend/reservas/views.py` por (agrega los imports de `Decimal`/`Sum`, `Pago` al import de modelos, y el método `resumen_pagos()`):

```python
from datetime import datetime, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Cancha, Pago, Reserva, ReservaCancha, Tarifa
from .serializers import (
    CanchaSerializer,
    NuevaReservaSerializer,
    PagoSerializer,
    ReservaSerializer,
    TarifaSerializer,
)
from .servicios import canchas_ocupadas, obtener_tarifa


class CanchaListView(ListAPIView):
    queryset = Cancha.objects.all()
    serializer_class = CanchaSerializer
    permission_classes = [IsAuthenticated]


class TarifaListView(ListAPIView):
    queryset = Tarifa.objects.all()
    serializer_class = TarifaSerializer
    permission_classes = [IsAuthenticated]


class ReservaViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reservas = (
            Reserva.objects.filter(fecha=fecha)
            .exclude(estado=Reserva.Estado.CANCELADA)
            .prefetch_related('canchas_asignadas', 'pagos')
        )
        return Response(ReservaSerializer(reservas, many=True).data)

    def create(self, request):
        entrada = NuevaReservaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        tarifa = obtener_tarifa(datos['modalidad'], datos['hora_inicio'])
        if tarifa is None:
            return Response(
                {'detail': 'No hay tarifa configurada para esa modalidad y hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ocupadas = canchas_ocupadas(datos['fecha'], datos['hora_inicio'], datos['canchas'])
        if ocupadas:
            return Response(
                {'detail': f'Las canchas {sorted(ocupadas)} ya estan ocupadas a esa hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inicio_dt = datetime.combine(datos['fecha'], datos['hora_inicio'])
        hora_fin = (inicio_dt + timedelta(hours=1)).time()

        with transaction.atomic():
            reserva = Reserva.objects.create(
                modalidad=datos['modalidad'],
                cliente_nombre=datos['cliente_nombre'],
                fecha=datos['fecha'],
                hora_inicio=datos['hora_inicio'],
                hora_fin=hora_fin,
                precio_total=tarifa.precio_por_hora,
                asignada_por=request.user,
            )
            ReservaCancha.objects.bulk_create([
                ReservaCancha(reserva=reserva, cancha_id=cancha_id)
                for cancha_id in datos['canchas']
            ])

        return Response(ReservaSerializer(reserva).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        try:
            reserva = Reserva.objects.get(pk=pk)
        except Reserva.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        reserva.estado = Reserva.Estado.CANCELADA
        reserva.save(update_fields=['estado'])
        return Response(ReservaSerializer(reserva).data)

    @action(detail=True, methods=['post'])
    def pagos(self, request, pk=None):
        try:
            reserva = Reserva.objects.get(pk=pk)
        except Reserva.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        entrada = PagoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        pago = entrada.save(reserva=reserva, registrado_por=request.user)
        return Response(PagoSerializer(pago).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='resumen-pagos')
    def resumen_pagos(self, request):
        # Suma TODOS los pagos de reservas de esta fecha, incluyendo los
        # de reservas con estado='cancelada'. Decision de negocio: el
        # dinero entro ese dia (ej. un adelanto no reembolsable) sin
        # importar que paso con la reserva despues. No filtrar por estado.
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pagos_del_dia = Pago.objects.filter(reserva__fecha=fecha)
        total_efectivo = pagos_del_dia.filter(
            metodo=Pago.Metodo.EFECTIVO,
        ).aggregate(t=Sum('monto'))['t'] or Decimal('0')
        total_yape = pagos_del_dia.filter(
            metodo=Pago.Metodo.YAPE,
        ).aggregate(t=Sum('monto'))['t'] or Decimal('0')
        return Response({
            'total_efectivo': total_efectivo,
            'total_yape': total_yape,
            'total_general': total_efectivo + total_yape,
        })
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_resumen_pagos -v 2
```

Expected: `OK`, 3 tests corridos.

- [ ] **Step 5: Commit**

```bash
git add backend/reservas/views.py backend/reservas/tests/test_reservas_api_resumen_pagos.py
git commit -m "Agrega GET /api/reservas/resumen-pagos/ con totales efectivo/yape/general"
```

---

## Task 10: Endpoint — observaciones del día (`GET`/`PUT /api/observaciones/<fecha>/`)

**Files:**
- Modify: `backend/reservas/views.py`
- Modify: `backend/reservas/urls.py`
- Create: `backend/reservas/tests/test_observaciones_api.py`

**Interfaces:**
- Produces: `ObservacionDiaView` (APIView), ruta `/api/observaciones/<fecha>/`.

- [ ] **Step 1: Escribir los tests (fallan: la ruta no existe)**

Crear `backend/reservas/tests/test_observaciones_api.py`:

```python
from rest_framework.test import APIClient, APITestCase

from reservas.models import ObservacionDia
from usuarios.models import UsuarioInterno


class ObservacionDiaApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def test_get_sin_observacion_devuelve_texto_vacio(self):
        response = self.client.get('/api/observaciones/2026-08-20/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['texto'], '')

    def test_put_crea_y_luego_actualiza_la_observacion(self):
        primera = self.client.put(
            '/api/observaciones/2026-08-20/', {'texto': 'Talentos debe 515.00'}, format='json',
        )
        self.assertEqual(primera.status_code, 200)

        segunda = self.client.put(
            '/api/observaciones/2026-08-20/', {'texto': 'Talentos debe 600.00'}, format='json',
        )
        self.assertEqual(segunda.status_code, 200)

        respuesta = self.client.get('/api/observaciones/2026-08-20/')
        self.assertEqual(respuesta.data['texto'], 'Talentos debe 600.00')
        self.assertEqual(ObservacionDia.objects.count(), 1)
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_observaciones_api -v 2
```

Expected: FAIL (404).

- [ ] **Step 3: Reemplazar `views.py` completo**

Reemplazar todo el contenido de `backend/reservas/views.py` por (agrega el import de `APIView`, `ObservacionDia` al import de modelos, y la clase `ObservacionDiaView`):

```python
from datetime import datetime, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Cancha, ObservacionDia, Pago, Reserva, ReservaCancha, Tarifa
from .serializers import (
    CanchaSerializer,
    NuevaReservaSerializer,
    PagoSerializer,
    ReservaSerializer,
    TarifaSerializer,
)
from .servicios import canchas_ocupadas, obtener_tarifa


class CanchaListView(ListAPIView):
    queryset = Cancha.objects.all()
    serializer_class = CanchaSerializer
    permission_classes = [IsAuthenticated]


class TarifaListView(ListAPIView):
    queryset = Tarifa.objects.all()
    serializer_class = TarifaSerializer
    permission_classes = [IsAuthenticated]


class ReservaViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reservas = (
            Reserva.objects.filter(fecha=fecha)
            .exclude(estado=Reserva.Estado.CANCELADA)
            .prefetch_related('canchas_asignadas', 'pagos')
        )
        return Response(ReservaSerializer(reservas, many=True).data)

    def create(self, request):
        entrada = NuevaReservaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        tarifa = obtener_tarifa(datos['modalidad'], datos['hora_inicio'])
        if tarifa is None:
            return Response(
                {'detail': 'No hay tarifa configurada para esa modalidad y hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ocupadas = canchas_ocupadas(datos['fecha'], datos['hora_inicio'], datos['canchas'])
        if ocupadas:
            return Response(
                {'detail': f'Las canchas {sorted(ocupadas)} ya estan ocupadas a esa hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inicio_dt = datetime.combine(datos['fecha'], datos['hora_inicio'])
        hora_fin = (inicio_dt + timedelta(hours=1)).time()

        with transaction.atomic():
            reserva = Reserva.objects.create(
                modalidad=datos['modalidad'],
                cliente_nombre=datos['cliente_nombre'],
                fecha=datos['fecha'],
                hora_inicio=datos['hora_inicio'],
                hora_fin=hora_fin,
                precio_total=tarifa.precio_por_hora,
                asignada_por=request.user,
            )
            ReservaCancha.objects.bulk_create([
                ReservaCancha(reserva=reserva, cancha_id=cancha_id)
                for cancha_id in datos['canchas']
            ])

        return Response(ReservaSerializer(reserva).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        try:
            reserva = Reserva.objects.get(pk=pk)
        except Reserva.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        reserva.estado = Reserva.Estado.CANCELADA
        reserva.save(update_fields=['estado'])
        return Response(ReservaSerializer(reserva).data)

    @action(detail=True, methods=['post'])
    def pagos(self, request, pk=None):
        try:
            reserva = Reserva.objects.get(pk=pk)
        except Reserva.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        entrada = PagoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        pago = entrada.save(reserva=reserva, registrado_por=request.user)
        return Response(PagoSerializer(pago).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='resumen-pagos')
    def resumen_pagos(self, request):
        # Suma TODOS los pagos de reservas de esta fecha, incluyendo los
        # de reservas con estado='cancelada'. Decision de negocio: el
        # dinero entro ese dia (ej. un adelanto no reembolsable) sin
        # importar que paso con la reserva despues. No filtrar por estado.
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pagos_del_dia = Pago.objects.filter(reserva__fecha=fecha)
        total_efectivo = pagos_del_dia.filter(
            metodo=Pago.Metodo.EFECTIVO,
        ).aggregate(t=Sum('monto'))['t'] or Decimal('0')
        total_yape = pagos_del_dia.filter(
            metodo=Pago.Metodo.YAPE,
        ).aggregate(t=Sum('monto'))['t'] or Decimal('0')
        return Response({
            'total_efectivo': total_efectivo,
            'total_yape': total_yape,
            'total_general': total_efectivo + total_yape,
        })


class ObservacionDiaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, fecha):
        observacion = ObservacionDia.objects.filter(fecha=fecha).first()
        texto = observacion.texto if observacion else ''
        return Response({'fecha': fecha, 'texto': texto})

    def put(self, request, fecha):
        texto = request.data.get('texto', '')
        observacion, _ = ObservacionDia.objects.update_or_create(
            fecha=fecha,
            defaults={'texto': texto, 'actualizado_por': request.user},
        )
        return Response({'fecha': fecha, 'texto': observacion.texto})
```

- [ ] **Step 4: Reemplazar `urls.py` completo**

Reemplazar todo el contenido de `backend/reservas/urls.py` por:

```python
from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CanchaListView, ObservacionDiaView, ReservaViewSet, TarifaListView

router = DefaultRouter()
router.register('reservas', ReservaViewSet, basename='reserva')

urlpatterns = [
    path('canchas/', CanchaListView.as_view(), name='canchas'),
    path('tarifas/', TarifaListView.as_view(), name='tarifas'),
    path('observaciones/<str:fecha>/', ObservacionDiaView.as_view(), name='observacion-dia'),
] + router.urls
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas.tests.test_observaciones_api -v 2
```

Expected: `OK`, 2 tests corridos.

- [ ] **Step 6: Correr toda la suite de backend junta**

```bash
cd backend
./venv/Scripts/python.exe manage.py test reservas usuarios -v 2
```

Expected: `OK`, todos los tests de las Tareas 1-10 pasan juntos (confirma que no hay conflictos entre ellos).

- [ ] **Step 7: Commit**

```bash
git add backend/reservas/views.py backend/reservas/urls.py backend/reservas/tests/test_observaciones_api.py
git commit -m "Agrega GET/PUT /api/observaciones/<fecha>/ para notas de texto libre"
```

---

# Frontend

## Task 11: Utilidades de sesión — `auth.js` y `api.js`

**Files:**
- Create: `frontend/src/auth.js`
- Create: `frontend/src/api.js`

**Interfaces:**
- Produces:
  - `auth.js`: `guardarTokens({access, refresh})`, `obtenerAccessToken()`, `borrarTokens()`, `haySesionActiva()`.
  - `api.js`: `login(usuario, password) -> Promise<{access, refresh}>`, `apiFetch(ruta, opciones) -> Promise<any>` (agrega el header `Authorization` solo, y sobre 401 borra la sesión y recarga la página).
  
  Los usan las Tareas 12 en adelante.

- [ ] **Step 1: Crear `auth.js`**

Crear `frontend/src/auth.js`:

```javascript
const CLAVE_ACCESS = 'complejo_access_token'
const CLAVE_REFRESH = 'complejo_refresh_token'

export function guardarTokens({ access, refresh }) {
  localStorage.setItem(CLAVE_ACCESS, access)
  localStorage.setItem(CLAVE_REFRESH, refresh)
}

export function obtenerAccessToken() {
  return localStorage.getItem(CLAVE_ACCESS)
}

export function borrarTokens() {
  localStorage.removeItem(CLAVE_ACCESS)
  localStorage.removeItem(CLAVE_REFRESH)
}

export function haySesionActiva() {
  return Boolean(obtenerAccessToken())
}
```

- [ ] **Step 2: Crear `api.js`**

Crear `frontend/src/api.js`:

```javascript
import { borrarTokens, obtenerAccessToken } from './auth'

const BASE_URL = import.meta.env.VITE_API_URL

export async function apiFetch(ruta, opciones = {}) {
  const token = obtenerAccessToken()
  const headers = {
    'Content-Type': 'application/json',
    ...opciones.headers,
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const respuesta = await fetch(`${BASE_URL}${ruta}`, { ...opciones, headers })

  if (respuesta.status === 401) {
    borrarTokens()
    window.location.reload()
    throw new Error('Sesion expirada')
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}))
    throw new Error(cuerpo.detail || `Error ${respuesta.status}`)
  }

  if (respuesta.status === 204) {
    return null
  }
  return respuesta.json()
}

export async function login(usuario, password) {
  const respuesta = await fetch(`${BASE_URL}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  })
  if (!respuesta.ok) {
    throw new Error('Usuario o contraseña incorrectos')
  }
  return respuesta.json()
}
```

- [ ] **Step 3: Verificar que compila**

```bash
cd frontend
npm run lint
npm run build
```

Expected: ambos comandos terminan sin errores. (Todavía no hay UI que use estos archivos — se conecta en la Tarea 12.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/auth.js frontend/src/api.js
git commit -m "Agrega utilidades de sesion JWT y cliente HTTP para el frontend"
```

---

## Task 12: Contexto de autenticación, Login y `App.jsx`

**Files:**
- Create: `frontend/src/context/AuthContext.jsx`
- Create: `frontend/src/components/Login.jsx`
- Modify: `frontend/src/App.jsx` (reemplazo completo del demo de Vite)

**Interfaces:**
- Consumes: `auth.js`, `api.js` (Tarea 11).
- Produces: hook `useAuth()` (`{ autenticado, iniciarSesion(usuario, password), cerrarSesion() }`). Lo usan las Tareas 13-18 para saber si hay sesión y para el botón de salir.

- [ ] **Step 1: Crear `AuthContext.jsx`**

Crear `frontend/src/context/AuthContext.jsx`:

```javascript
import { createContext, useContext, useState } from 'react'
import { borrarTokens, guardarTokens, haySesionActiva } from '../auth'
import { login as loginApi } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [autenticado, setAutenticado] = useState(haySesionActiva())

  async function iniciarSesion(usuario, password) {
    const tokens = await loginApi(usuario, password)
    guardarTokens(tokens)
    setAutenticado(true)
  }

  function cerrarSesion() {
    borrarTokens()
    setAutenticado(false)
  }

  return (
    <AuthContext.Provider value={{ autenticado, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
```

- [ ] **Step 2: Crear `Login.jsx`**

Crear `frontend/src/components/Login.jsx`:

```javascript
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { iniciarSesion } = useAuth()

  async function manejarSubmit(evento) {
    evento.preventDefault()
    setError('')
    try {
      await iniciarSesion(usuario, password)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={manejarSubmit}>
      <h1>Ingresar</h1>
      <div>
        <label htmlFor="usuario">Usuario</label>
        <input id="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
      </div>
      <div>
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit">Entrar</button>
    </form>
  )
}
```

- [ ] **Step 3: Reemplazar `App.jsx`**

Reemplazar todo el contenido de `frontend/src/App.jsx` por:

```javascript
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'

function Contenido() {
  const { autenticado, cerrarSesion } = useAuth()

  if (!autenticado) {
    return <Login />
  }

  return (
    <div>
      <button onClick={cerrarSesion}>Cerrar sesion</button>
      <p>Sesion iniciada. El panel de disponibilidad se agrega en la Tarea 13.</p>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <Contenido />
    </AuthProvider>
  )
}

export default App
```

- [ ] **Step 4: Verificar manualmente en el navegador**

```bash
cd backend
./venv/Scripts/python.exe manage.py runserver 8000
```

(en otra terminal)

```bash
cd frontend
npm run dev
```

Abrir `http://localhost:5173`. Verificar:
1. Se ve el formulario de login (no el panel).
2. Con usuario/contraseña incorrectos, aparece el mensaje de error en rojo.
3. Con `admin` / `admin1234` (la cuenta de prueba creada en la sesión anterior), pasa a mostrar "Sesion iniciada..." y el botón "Cerrar sesion".
4. Al hacer clic en "Cerrar sesion", vuelve al formulario de login.
5. Recargar la página (F5) estando logueado: sigue mostrando "Sesion iniciada" (confirma que el token persiste en `localStorage`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context frontend/src/components/Login.jsx frontend/src/App.jsx
git commit -m "Agrega login JWT y AuthContext como base del frontend"
```

---

## Task 13: Panel de disponibilidad — grilla (lectura)

**Files:**
- Create: `frontend/src/components/PanelDisponibilidad.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `apiFetch` (Tarea 11); endpoints `GET /api/canchas/`, `GET /api/tarifas/`, `GET /api/reservas/?fecha=` (Tareas 4-5).
- Produces: componente `PanelDisponibilidad` — estado `fecha`, `canchas`, `tarifas`, `reservas` que las Tareas 14-18 extienden.

- [ ] **Step 1: Crear `PanelDisponibilidad.jsx`**

Crear `frontend/src/components/PanelDisponibilidad.jsx`:

```javascript
import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

function formatearFecha(fecha) {
  return fecha.toISOString().slice(0, 10)
}

function calcularHoras(tarifas) {
  if (tarifas.length === 0) return []
  const horaInicio = Math.min(...tarifas.map((t) => Number(t.hora_inicio.slice(0, 2))))
  const horaFinal = 23 // el complejo cierra a medianoche (ver reservas/servicios.py)
  const horas = []
  for (let h = horaInicio; h <= horaFinal; h++) {
    horas.push(h)
  }
  return horas
}

function horaTexto(hora) {
  return `${String(hora).padStart(2, '0')}:00`
}

export default function PanelDisponibilidad() {
  const [fecha, setFecha] = useState(formatearFecha(new Date()))
  const [canchas, setCanchas] = useState([])
  const [tarifas, setTarifas] = useState([])
  const [reservas, setReservas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function cargarDatos() {
      setCargando(true)
      setError('')
      try {
        const [canchasData, tarifasData, reservasData] = await Promise.all([
          apiFetch('/canchas/'),
          apiFetch('/tarifas/'),
          apiFetch(`/reservas/?fecha=${fecha}`),
        ])
        setCanchas(canchasData)
        setTarifas(tarifasData)
        setReservas(reservasData)
      } catch (err) {
        setError(err.message)
      } finally {
        setCargando(false)
      }
    }
    cargarDatos()
  }, [fecha])

  function reservaEnCelda(canchaId, hora) {
    const horaComparar = `${String(hora).padStart(2, '0')}:00:00`
    return reservas.find(
      (r) => r.hora_inicio === horaComparar && r.canchas.includes(canchaId),
    )
  }

  const horas = calcularHoras(tarifas)

  return (
    <div>
      <label htmlFor="fecha">Fecha</label>
      <input
        id="fecha"
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
      />

      {cargando && <p>Cargando...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!cargando && !error && (
        <table border="1" cellPadding="4">
          <thead>
            <tr>
              <th>Hora</th>
              {canchas.map((c) => (
                <th key={c.id}>Cancha {c.numero}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horas.map((hora) => (
              <tr key={hora}>
                <td>{horaTexto(hora)}</td>
                {canchas.map((c) => {
                  const reserva = reservaEnCelda(c.id, hora)
                  return (
                    <td key={c.id} style={{ background: reserva ? '#f8b4b4' : '#b4f8c8' }}>
                      {reserva ? reserva.cliente_nombre : 'Libre'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Conectar en `App.jsx`**

En `frontend/src/App.jsx`, agregar el import:

```javascript
import PanelDisponibilidad from './components/PanelDisponibilidad'
```

y reemplazar el `<p>Sesion iniciada...</p>` dentro de `Contenido()` por:

```javascript
      <PanelDisponibilidad />
```

- [ ] **Step 3: Verificar manualmente**

Con los dos servidores corriendo (backend y `npm run dev`), loguearse y verificar:
1. Aparece un selector de fecha (por defecto, hoy) y debajo una tabla de 16 filas (08:00 a 23:00) × 4 columnas (Cancha 1-4), todas en verde con "Libre".
2. Cambiar la fecha del selector: la tabla se recarga (mientras carga, aparece "Cargando...").
3. Crear una reserva de prueba a mano en el admin (`http://localhost:8000/admin/`, sección Reservas + Reserva canchas) para la fecha de hoy a las 10:00 en la Cancha 2, y volver a seleccionar esa fecha en el panel (o recargar la página): la celda de las 10:00 / Cancha 2 debe verse roja con el nombre del cliente.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PanelDisponibilidad.jsx frontend/src/App.jsx
git commit -m "Agrega la grilla de disponibilidad (lectura) al panel"
```

---

## Task 14: Crear reserva individual desde la grilla

**Files:**
- Modify: `frontend/src/components/PanelDisponibilidad.jsx`

**Interfaces:**
- Consumes: `POST /api/reservas/` (Tarea 6).
- Produces: función `reservarCelda(canchaId, hora)`, celdas libres individuales ahora son clickeables.

Nota de diseño: se usa `window.prompt()` para pedir el nombre del cliente (un solo campo) en vez de armar un componente de modal — más simple, y suficiente para "que funcione" como se pidió. El detalle de pagos (Tarea 16), que sí necesita varios campos y mostrar una lista, se construye como componente aparte.

- [ ] **Step 1: Agregar `reservarCelda` y conectar el clic**

En `frontend/src/components/PanelDisponibilidad.jsx`, agregar esta función dentro del componente `PanelDisponibilidad`, después de `reservaEnCelda`:

```javascript
  async function reservarCelda(canchaId, hora) {
    const cliente = window.prompt('Nombre del cliente para esta hora:')
    if (!cliente) return
    try {
      const nueva = await apiFetch('/reservas/', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          hora_inicio: horaTexto(hora),
          cliente_nombre: cliente,
          modalidad: 'individual',
          canchas: [canchaId],
        }),
      })
      setReservas((anteriores) => [...anteriores, nueva])
    } catch (err) {
      window.alert(err.message)
    }
  }
```

Y reemplazar el `<td>` de cada celda de cancha (dentro del `.map` de `canchas`) por:

```javascript
                  return (
                    <td
                      key={c.id}
                      style={{
                        background: reserva ? '#f8b4b4' : '#b4f8c8',
                        cursor: reserva ? 'default' : 'pointer',
                      }}
                      onClick={() => {
                        if (!reserva) reservarCelda(c.id, hora)
                      }}
                    >
                      {reserva ? reserva.cliente_nombre : 'Libre'}
                    </td>
                  )
```

- [ ] **Step 2: Verificar manualmente**

1. Hacer clic en una celda verde (ej. Cancha 1, 14:00). Aparece el `prompt` del navegador pidiendo el nombre.
2. Escribir un nombre y aceptar: la celda cambia a roja con ese nombre, sin recargar la página.
3. Verificar en la base de datos que se creó la reserva con el precio correcto:

```bash
PGPASSWORD=1219 "/c/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U complejo_deportivo_user -d complejo_deportivo_db -c "SELECT r.cliente_nombre, r.hora_inicio, r.precio_total, rc.cancha_id FROM reservas r JOIN reserva_canchas rc ON rc.reserva_id = r.id ORDER BY r.id DESC LIMIT 1;"
```

4. Cancelar el `prompt` (botón Cancelar): no debe pasar nada (la celda sigue libre).
5. Intentar reservar una celda que ya está ocupada por otra reserva creada a mano en el admin: no debe reaccionar al clic (sigue mostrando el nombre existente).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PanelDisponibilidad.jsx
git commit -m "Permite crear una reserva individual haciendo clic en una celda libre"
```

---

## Task 15: Reservar campo completo desde la grilla

**Files:**
- Modify: `frontend/src/components/PanelDisponibilidad.jsx`

**Interfaces:**
- Consumes: `POST /api/reservas/` con `modalidad='completo'` (Tarea 6).
- Produces: columna extra "Campo completo" en la tabla; función `reservarCampoCompleto(hora)`.

- [ ] **Step 1: Agregar la lógica y la columna**

En `frontend/src/components/PanelDisponibilidad.jsx`, agregar esta función después de `reservarCelda`:

```javascript
  function reservaCompletaEnHora(hora) {
    const horaComparar = `${String(hora).padStart(2, '0')}:00:00`
    return reservas.find((r) => r.modalidad === 'completo' && r.hora_inicio === horaComparar)
  }

  async function reservarCampoCompleto(hora) {
    const cliente = window.prompt('Nombre del cliente (campo completo):')
    if (!cliente) return
    try {
      const nueva = await apiFetch('/reservas/', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          hora_inicio: horaTexto(hora),
          cliente_nombre: cliente,
          modalidad: 'completo',
          canchas: canchas.map((c) => c.id),
        }),
      })
      setReservas((anteriores) => [...anteriores, nueva])
    } catch (err) {
      window.alert(err.message)
    }
  }
```

Agregar el encabezado de la columna extra, dentro de `<thead><tr>`, después del `.map` de canchas:

```javascript
              <th>Campo completo</th>
```

Y agregar la celda extra al final de cada fila (`<tr>` dentro del `.map` de `horas`), después del `.map` de canchas:

```javascript
                {(() => {
                  const completa = reservaCompletaEnHora(hora)
                  const hayCanchaOcupada = canchas.some((c) => reservaEnCelda(c.id, hora))
                  return (
                    <td
                      style={{
                        background: completa ? '#f8b4b4' : hayCanchaOcupada ? '#dddddd' : '#b4f8c8',
                        cursor: completa || hayCanchaOcupada ? 'default' : 'pointer',
                      }}
                      onClick={() => {
                        if (!completa && !hayCanchaOcupada) reservarCampoCompleto(hora)
                      }}
                    >
                      {completa ? completa.cliente_nombre : hayCanchaOcupada ? '-' : 'Reservar todo'}
                    </td>
                  )
                })()}
```

- [ ] **Step 2: Verificar manualmente**

1. En una hora donde las 4 canchas estén libres, hacer clic en "Reservar todo" de la columna "Campo completo", escribir un nombre.
2. Verificar que las 4 columnas de cancha de esa fila Y la columna "Campo completo" quedan en rojo con el mismo nombre.
3. Verificar en la base de datos que se creó 1 reserva con `modalidad='completo'` y 4 filas en `reserva_canchas`:

```bash
PGPASSWORD=1219 "/c/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U complejo_deportivo_user -d complejo_deportivo_db -c "SELECT r.id, r.modalidad, r.precio_total, COUNT(rc.id) as canchas FROM reservas r JOIN reserva_canchas rc ON rc.reserva_id = r.id WHERE r.modalidad='completo' GROUP BY r.id ORDER BY r.id DESC LIMIT 1;"
```

(debe mostrar `canchas = 4`).

4. En una hora donde ya haya una reserva individual en 1 sola cancha, verificar que la columna "Campo completo" aparece gris con "-" (no clickeable).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PanelDisponibilidad.jsx
git commit -m "Agrega reserva de campo completo (las 4 canchas juntas) desde la grilla"
```

---

## Task 16: Detalle de reserva — pagos y cancelar

**Files:**
- Create: `frontend/src/components/ReservaDetalle.jsx`
- Modify: `frontend/src/components/PanelDisponibilidad.jsx`

**Interfaces:**
- Consumes: `POST /api/reservas/{id}/pagos/`, `POST /api/reservas/{id}/cancelar/` (Tareas 7-8).
- Produces: componente `ReservaDetalle` (props: `reserva`, `onCerrar`, `onActualizar`, `onCancelada`).

- [ ] **Step 1: Crear `ReservaDetalle.jsx`**

Crear `frontend/src/components/ReservaDetalle.jsx`:

```javascript
import { useState } from 'react'
import { apiFetch } from '../api'

const COLOR_METODO = {
  efectivo: '#cfe0ff',
  yape: '#ffd0d0',
}

export default function ReservaDetalle({ reserva, onCerrar, onActualizar, onCancelada }) {
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [tipo, setTipo] = useState('saldo')
  const [error, setError] = useState('')

  async function agregarPago(evento) {
    evento.preventDefault()
    setError('')
    try {
      const pago = await apiFetch(`/reservas/${reserva.id}/pagos/`, {
        method: 'POST',
        body: JSON.stringify({ monto, metodo, tipo }),
      })
      onActualizar({ ...reserva, pagos: [...reserva.pagos, pago] })
      setMonto('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function cancelarReserva() {
    if (!window.confirm(`¿Cancelar la reserva de ${reserva.cliente_nombre}?`)) return
    await apiFetch(`/reservas/${reserva.id}/cancelar/`, { method: 'POST' })
    onCancelada(reserva.id)
  }

  return (
    <div style={{ border: '1px solid #333', padding: 16, marginTop: 16 }}>
      <button onClick={onCerrar}>Cerrar</button>
      <h2>{reserva.cliente_nombre}</h2>
      <p>
        {reserva.fecha} - {reserva.hora_inicio.slice(0, 5)} a {reserva.hora_fin.slice(0, 5)}
      </p>
      <p>Tarifa de referencia: S/ {reserva.precio_total} (no es necesariamente lo cobrado)</p>

      <h3>Pagos</h3>
      <ul>
        {reserva.pagos.map((p) => (
          <li key={p.id} style={{ background: COLOR_METODO[p.metodo] }}>
            S/ {p.monto} - {p.metodo} - {p.tipo}
          </li>
        ))}
      </ul>

      <form onSubmit={agregarPago}>
        <input
          type="number"
          step="0.01"
          placeholder="Monto"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          required
        />
        <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          <option value="efectivo">Efectivo</option>
          <option value="yape">Yape</option>
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="adelanto">Adelanto</option>
          <option value="saldo">Saldo</option>
        </select>
        <button type="submit">Agregar pago</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button onClick={cancelarReserva} style={{ marginTop: 12 }}>
        Cancelar reserva
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Conectar en `PanelDisponibilidad.jsx`**

Agregar el import al inicio:

```javascript
import ReservaDetalle from './ReservaDetalle'
```

Agregar un nuevo estado, junto a los demás `useState`:

```javascript
  const [reservaSeleccionada, setReservaSeleccionada] = useState(null)
```

En el `onClick` de la celda de cancha individual (dentro del `.map` de `canchas`), cambiar:

```javascript
                      onClick={() => {
                        if (!reserva) reservarCelda(c.id, hora)
                      }}
```

por:

```javascript
                      onClick={() => {
                        if (reserva) {
                          setReservaSeleccionada(reserva)
                        } else {
                          reservarCelda(c.id, hora)
                        }
                      }}
```

En el `onClick` de la celda "Campo completo", cambiar:

```javascript
                      onClick={() => {
                        if (!completa && !hayCanchaOcupada) reservarCampoCompleto(hora)
                      }}
```

por:

```javascript
                      onClick={() => {
                        if (completa) {
                          setReservaSeleccionada(completa)
                        } else if (!hayCanchaOcupada) {
                          reservarCampoCompleto(hora)
                        }
                      }}
```

Y agregar, justo antes del `</div>` de cierre del componente (después de la tabla):

```javascript
      {reservaSeleccionada && (
        <ReservaDetalle
          reserva={reservaSeleccionada}
          onCerrar={() => setReservaSeleccionada(null)}
          onActualizar={(actualizada) => {
            setReservas((anteriores) =>
              anteriores.map((r) => (r.id === actualizada.id ? actualizada : r)),
            )
            setReservaSeleccionada(actualizada)
          }}
          onCancelada={(id) => {
            setReservas((anteriores) => anteriores.filter((r) => r.id !== id))
            setReservaSeleccionada(null)
          }}
        />
      )}
```

- [ ] **Step 3: Verificar manualmente**

1. Hacer clic en una celda ocupada: se abre el detalle debajo de la tabla, con nombre, hora y la tarifa de referencia.
2. Agregar un pago de S/ 30 en efectivo, tipo "saldo": aparece en la lista con fondo azul.
3. Agregar otro pago de S/ 20 en Yape, tipo "adelanto": aparece con fondo rojo, y el primero sigue en la lista.
4. Hacer clic en "Cancelar reserva", confirmar el diálogo: la celda vuelve a verde ("Libre") y el detalle se cierra.
5. Verificar en la base de datos que la reserva quedó `estado='cancelada'` pero los 2 pagos siguen existiendo (no se borran):

```bash
PGPASSWORD=1219 "/c/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U complejo_deportivo_user -d complejo_deportivo_db -c "SELECT id, estado FROM reservas ORDER BY id DESC LIMIT 1;" -c "SELECT reserva_id, monto, metodo, tipo FROM pagos ORDER BY id DESC LIMIT 2;"
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ReservaDetalle.jsx frontend/src/components/PanelDisponibilidad.jsx
git commit -m "Agrega detalle de reserva: registrar pagos y cancelar"
```

---

## Task 17: Observaciones del día

**Files:**
- Create: `frontend/src/components/Observaciones.jsx`
- Modify: `frontend/src/components/PanelDisponibilidad.jsx`

**Interfaces:**
- Consumes: `GET`/`PUT /api/observaciones/<fecha>/` (Tarea 10).
- Produces: componente `Observaciones` (prop: `fecha`).

- [ ] **Step 1: Crear `Observaciones.jsx`**

Crear `frontend/src/components/Observaciones.jsx`:

```javascript
import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

export default function Observaciones({ fecha }) {
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    apiFetch(`/observaciones/${fecha}/`).then((data) => setTexto(data.texto))
  }, [fecha])

  async function guardar() {
    setGuardando(true)
    setMensaje('')
    try {
      await apiFetch(`/observaciones/${fecha}/`, {
        method: 'PUT',
        body: JSON.stringify({ texto }),
      })
      setMensaje('Guardado.')
    } catch (err) {
      setMensaje(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Observaciones del dia</h3>
      <textarea rows={4} cols={50} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div>
        <button onClick={guardar} disabled={guardando}>
          Guardar
        </button>
        {mensaje && <span style={{ marginLeft: 8 }}>{mensaje}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Conectar en `PanelDisponibilidad.jsx`**

Agregar el import al inicio:

```javascript
import Observaciones from './Observaciones'
```

Agregar, justo antes del bloque de `{reservaSeleccionada && (...)}`:

```javascript
      <Observaciones fecha={fecha} />
```

- [ ] **Step 3: Verificar manualmente**

1. Escribir un texto (ej. "Talentos debe 515.00") en el cuadro de observaciones y hacer clic en "Guardar". Debe aparecer "Guardado." al lado del botón.
2. Recargar la página completa (F5): el texto sigue ahí (se cargó desde el backend, no es solo estado local).
3. Cambiar la fecha del panel a otro día: el cuadro de observaciones debe quedar vacío (es un texto por día).
4. Volver a la fecha original: el texto guardado reaparece.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Observaciones.jsx frontend/src/components/PanelDisponibilidad.jsx
git commit -m "Agrega observaciones de texto libre por dia"
```

---

## Task 18: Resumen de pagos del día

**Files:**
- Create: `frontend/src/components/ResumenPagos.jsx`
- Modify: `frontend/src/components/PanelDisponibilidad.jsx`

**Interfaces:**
- Consumes: `GET /api/reservas/resumen-pagos/?fecha=` (Tarea 9).
- Produces: componente `ResumenPagos` (prop: `fecha`).

- [ ] **Step 1: Crear `ResumenPagos.jsx`**

Crear `frontend/src/components/ResumenPagos.jsx`:

```javascript
import { useState } from 'react'
import { apiFetch } from '../api'

export default function ResumenPagos({ fecha }) {
  const [totales, setTotales] = useState(null)
  const [error, setError] = useState('')

  async function verTotales() {
    setError('')
    try {
      const data = await apiFetch(`/reservas/resumen-pagos/?fecha=${fecha}`)
      setTotales(data)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Totales del dia</h3>
      <button onClick={verTotales}>Ver totales del dia</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {totales && (
        <ul>
          <li>Total efectivo: S/ {totales.total_efectivo}</li>
          <li>Total Yape: S/ {totales.total_yape}</li>
          <li>Total general: S/ {totales.total_general}</li>
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Conectar en `PanelDisponibilidad.jsx`**

Agregar el import al inicio:

```javascript
import ResumenPagos from './ResumenPagos'
```

Agregar, justo después de `<Observaciones fecha={fecha} />`:

```javascript
      <ResumenPagos fecha={fecha} />
```

- [ ] **Step 3: Verificar manualmente**

1. Con al menos 2 pagos registrados hoy (uno en efectivo, uno en Yape, desde la Tarea 16), hacer clic en "Ver totales del dia".
2. Verificar que los 3 totales mostrados (efectivo, Yape, general) coinciden con la suma real de lo registrado.
3. Cancelar una de esas reservas (botón "Cancelar reserva" en su detalle) y volver a hacer clic en "Ver totales del dia": el total **no** debe bajar (los pagos de reservas canceladas siguen contando, como se definió en la spec).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ResumenPagos.jsx frontend/src/components/PanelDisponibilidad.jsx
git commit -m "Agrega resumen de pagos del dia (efectivo/yape/general)"
```

---

## Verificación manual end-to-end (después de la Tarea 18)

Con backend (`runserver`) y frontend (`npm run dev`) corriendo:

1. Abrir `http://localhost:5173`, ver el login.
2. Loguearse con una cuenta real (crear una con `createsuperuser` si no se quiere usar la de prueba `admin`).
3. Ver la grilla del día de hoy, todo libre.
4. Reservar una hora individual con un nombre de cliente.
5. Reservar campo completo en otra hora.
6. Abrir el detalle de la reserva individual, agregar un pago dividido (parte efectivo, parte Yape).
7. Ver los totales del día y confirmar que suman correctamente.
8. Escribir una observación del día y guardarla.
9. Cancelar una de las dos reservas y confirmar que la celda vuelve a "Libre" pero el total de pagos del día no cambia.
10. Recargar la página completa (F5): la sesión sigue activa, y todo lo hecho (reservas, pagos, observación) sigue presente al recargar la grilla.
