# Academias: gestión y horarios recurrentes — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla para crear/editar/eliminar academias (nombre, color, horarios semanales recurrentes) cuyos horarios aparecen solos, como reservas reales, en la grilla del panel — sin ningún proceso en segundo plano.

**Architecture:** Backend Django: modelo `AcademiaHorario` nuevo + materialización perezosa (se dispara desde `GET /api/reservas/?fecha=`, no desde un cron). Frontend React: página nueva `Academias.jsx` con diálogo de crear/editar, y la celda de reserva en la grilla usa el color de la academia cuando corresponde.

**Tech Stack:** Django REST Framework (backend, sin librerías nuevas), React + Tailwind CSS + shadcn/ui (frontend, reutiliza los componentes `ui/` ya existentes).

**Spec:** `docs/superpowers/specs/2026-08-25-academias-horarios-recurrentes-design.md`

## Global Constraints

- Español para todo texto de interfaz y mensajes de error.
- No se materializa hacia fechas pasadas (`fecha < hoy`).
- Un horario de academia no tiene el límite de 1h/1h30 que sí tienen las reservas de clientes.
- Backend: TDD estricto (test que falla → implementación → test que pasa) en cada tarea de backend.
- Frontend: sin suite de tests automatizados en este proyecto — verificación manual en el navegador.

---

## Task 1: Modelo `AcademiaHorario` + `Academia.color` (quita `horario_uso`)

**Files:**
- Modify: `backend/reservas/models.py`
- Modify: `backend/reservas/admin.py`
- Create: `backend/reservas/migrations/0007_academia_horarios.py`
- Modify: `backend/reservas/tests/test_models.py`
- Modify: `backend/reservas/tests/test_academias_api.py`
- Modify: `backend/reservas/tests/test_disponibilidad_publica_api.py`
- Modify: `backend/reservas/tests/test_reservas_api_crear.py`
- Modify: `backend/reservas/tests/test_servicios.py`

**Interfaces:**
- Produces: `Academia.color` (`CharField`, default `'#7c3aed'`). Modelo `AcademiaHorario` — `academia` (FK), `dia_semana` (`IntegerField`, `AcademiaHorario.Dia.LUNES=0` … `DOMINGO=6`, mismo criterio que `date.weekday()` de Python), `hora_inicio`, `hora_fin` (`TimeField`), `canchas` (M2M a `Cancha`), `related_name='horarios'` en `academia`.

- [ ] **Step 1: Escribir los tests que fallan**

En `backend/reservas/tests/test_models.py`, dentro de la clase `ReservaAcademiaTest` quitar `horario_uso='Martes y jueves', ` de las 2 llamadas a `Academia.objects.create(...)` (en `test_reserva_se_puede_vincular_a_una_academia` y en `test_borrar_la_academia_no_borra_la_reserva`, quedando solo `Academia.objects.create(nombre='Talentos FC', permiso_mostrar=True)`), y agregar al final del archivo:

```python
from datetime import time as time_


class AcademiaHorarioTest(TestCase):
    def setUp(self):
        self.academia = Academia.objects.create(nombre='Talentos FC')
        self.cancha_2 = Cancha.objects.get(numero=2)
        self.cancha_3 = Cancha.objects.get(numero=3)

    def test_color_por_defecto(self):
        self.assertEqual(self.academia.color, '#7c3aed')

    def test_crea_horario_con_varias_canchas(self):
        horario = AcademiaHorario.objects.create(
            academia=self.academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time_(21, 0), hora_fin=time_(22, 0),
        )
        horario.canchas.set([self.cancha_2, self.cancha_3])

        self.assertEqual(self.academia.horarios.count(), 1)
        self.assertEqual(set(horario.canchas.values_list('numero', flat=True)), {2, 3})

    def test_borrar_academia_borra_sus_horarios(self):
        AcademiaHorario.objects.create(
            academia=self.academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time_(21, 0), hora_fin=time_(22, 0),
        )
        self.academia.delete()
        self.assertEqual(AcademiaHorario.objects.count(), 0)
```

Y cambiar el import de la línea 5 de
`from reservas.models import Academia, Cancha, ComentarioDia, Modalidad, Reserva`
a
`from reservas.models import Academia, AcademiaHorario, Cancha, ComentarioDia, Modalidad, Reserva`.

En `backend/reservas/tests/test_academias_api.py`, quitar el kwarg `horario_uso=` de las 2 llamadas a `Academia.objects.create(...)`.

En `backend/reservas/tests/test_disponibilidad_publica_api.py`, quitar el kwarg `horario_uso=` de las 2 llamadas a `Academia.objects.create(...)`.

En `backend/reservas/tests/test_reservas_api_crear.py`, quitar el kwarg `horario_uso=` de la llamada a `Academia.objects.create(...)`.

En `backend/reservas/tests/test_servicios.py`, quitar el kwarg `horario_uso=` de las 2 llamadas a `Academia.objects.create(...)`.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_models -v 2`
Expected: FAIL — `ImportError: cannot import name 'AcademiaHorario'`

- [ ] **Step 3: Editar el modelo**

En `backend/reservas/models.py`, reemplazar la clase `Academia` completa:

```python
class Academia(models.Model):
    nombre = models.CharField(max_length=150)
    permiso_mostrar = models.BooleanField(default=True)
    color = models.CharField(max_length=7, default='#7c3aed')

    class Meta:
        db_table = 'academias'
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class AcademiaHorario(models.Model):
    class Dia(models.IntegerChoices):
        # Mismo criterio que date.weekday() de Python (Lunes=0), para que
        # la materializacion compare directo sin conversion.
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

    def __str__(self):
        return f'{self.academia.nombre} - {self.get_dia_semana_display()} {self.hora_inicio}'
```

(Reemplaza la clase `Academia` que hoy tiene `horario_uso` — queda en el mismo lugar del archivo, antes de `ComentarioDia`.)

- [ ] **Step 4: Actualizar el admin de Django**

En `backend/reservas/admin.py`, agregar `AcademiaHorario` al import de `.models` y agregar `admin.site.register(AcademiaHorario)` después de `admin.site.register(Academia)`.

- [ ] **Step 5: Escribir la migración**

Create `backend/reservas/migrations/0007_academia_horarios.py`:

```python
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reservas', '0006_comentariodia'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='academia',
            name='horario_uso',
        ),
        migrations.AddField(
            model_name='academia',
            name='color',
            field=models.CharField(default='#7c3aed', max_length=7),
        ),
        migrations.CreateModel(
            name='AcademiaHorario',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('dia_semana', models.IntegerField(choices=[(0, 'Lunes'), (1, 'Martes'), (2, 'Miercoles'), (3, 'Jueves'), (4, 'Viernes'), (5, 'Sabado'), (6, 'Domingo')])),
                ('hora_inicio', models.TimeField()),
                ('hora_fin', models.TimeField()),
                ('academia', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='horarios', to='reservas.academia')),
                ('canchas', models.ManyToManyField(related_name='horarios_academia', to='reservas.cancha')),
            ],
            options={
                'db_table': 'academia_horarios',
                'ordering': ['dia_semana', 'hora_inicio'],
            },
        ),
    ]
```

- [ ] **Step 6: Verificar que la migración escrita a mano coincide con el modelo**

Run: `cd backend && venv/Scripts/python.exe manage.py makemigrations reservas --check --dry-run`
Expected: `No changes detected in app 'reservas'`

- [ ] **Step 7: Aplicar la migración**

Run: `cd backend && venv/Scripts/python.exe manage.py migrate reservas`
Expected: `Applying reservas.0007_academia_horarios... OK`

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_models reservas.tests.test_academias_api reservas.tests.test_disponibilidad_publica_api reservas.tests.test_reservas_api_crear reservas.tests.test_servicios -v 1`
Expected: OK (todos, incluyendo los que solo se les quitó `horario_uso`)

- [ ] **Step 9: Commit**

```bash
git add backend/reservas/models.py backend/reservas/admin.py backend/reservas/migrations/0007_academia_horarios.py backend/reservas/tests/test_models.py backend/reservas/tests/test_academias_api.py backend/reservas/tests/test_disponibilidad_publica_api.py backend/reservas/tests/test_reservas_api_crear.py backend/reservas/tests/test_servicios.py
git commit -m "feat: agrega Academia.color y el modelo AcademiaHorario, quita horario_uso"
```

---

## Task 2: `materializar_horarios_academia()` — la función que crea las reservas solas

**Files:**
- Modify: `backend/reservas/servicios.py`
- Modify: `backend/reservas/tests/test_servicios.py`

**Interfaces:**
- Consumes: `AcademiaHorario`, `obtener_tarifa()`, `canchas_ocupadas()`, `_minutos_desde_medianoche()` (todas ya existen o se agregaron en Task 1 / trabajo previo).
- Produces: `materializar_horarios_academia(fecha, usuario)` en `reservas/servicios.py` — `fecha` es un `date`, `usuario` una instancia de `UsuarioInterno`. No devuelve nada; su efecto es crear las `Reserva` (+ `ReservaCancha`) que falten para ese día. Idempotente: llamarla dos veces con la misma fecha no duplica nada.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/reservas/tests/test_servicios.py`: agregar `AcademiaHorario` al import de `.models` (`from reservas.models import Academia, AcademiaHorario, Cancha, ComentarioDia, Modalidad, Pago, Reserva, ReservaCancha`), agregar `materializar_horarios_academia` al import de `.servicios`, y agregar al final del archivo:

```python
class MaterializarHorariosAcademiaTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.academia = Academia.objects.create(nombre='Talentos FC', color='#059669')
        self.cancha_1 = Cancha.objects.get(numero=1)
        self.cancha_2 = Cancha.objects.get(numero=2)
        # 2026-08-24 es lunes.
        self.lunes = date(2026, 8, 24)

    def _crear_horario(self, dia_semana, canchas, hora_inicio=time(18, 0), hora_fin=time(19, 0)):
        horario = AcademiaHorario.objects.create(
            academia=self.academia, dia_semana=dia_semana,
            hora_inicio=hora_inicio, hora_fin=hora_fin,
        )
        horario.canchas.set(canchas)
        return horario

    def test_crea_reserva_individual_para_una_cancha(self):
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1])

        materializar_horarios_academia(self.lunes, self.usuario)

        reserva = Reserva.objects.get(academia=self.academia, fecha=self.lunes)
        self.assertEqual(reserva.modalidad, Modalidad.INDIVIDUAL)
        self.assertEqual(reserva.cliente_nombre, 'Talentos FC')
        self.assertEqual(reserva.hora_inicio, time(18, 0))
        self.assertEqual(reserva.hora_fin, time(19, 0))
        self.assertEqual(reserva.asignada_por, self.usuario)
        self.assertEqual([rc.cancha_id for rc in reserva.canchas_asignadas.all()], [self.cancha_1.id])

    def test_crea_una_reserva_por_cada_cancha_si_no_son_las_4(self):
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1, self.cancha_2])

        materializar_horarios_academia(self.lunes, self.usuario)

        reservas = Reserva.objects.filter(academia=self.academia, fecha=self.lunes)
        self.assertEqual(reservas.count(), 2)
        self.assertTrue(all(r.modalidad == Modalidad.INDIVIDUAL for r in reservas))

    def test_crea_una_sola_reserva_completo_si_son_las_4_canchas(self):
        todas = list(Cancha.objects.all())
        self._crear_horario(AcademiaHorario.Dia.LUNES, todas)

        materializar_horarios_academia(self.lunes, self.usuario)

        reservas = Reserva.objects.filter(academia=self.academia, fecha=self.lunes)
        self.assertEqual(reservas.count(), 1)
        self.assertEqual(reservas.first().modalidad, Modalidad.COMPLETO)
        self.assertEqual(reservas.first().canchas_asignadas.count(), 4)

    def test_precio_total_segun_tarifa_y_duracion(self):
        # Tarifa individual 18:00-00:00 es 70.00/hora (ver seed). 1.5h = 105.00
        self._crear_horario(
            AcademiaHorario.Dia.LUNES, [self.cancha_1],
            hora_inicio=time(18, 0), hora_fin=time(19, 30),
        )

        materializar_horarios_academia(self.lunes, self.usuario)

        reserva = Reserva.objects.get(academia=self.academia, fecha=self.lunes)
        self.assertEqual(reserva.precio_total, Decimal('105.00'))

    def test_no_duplica_si_se_llama_dos_veces(self):
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1])

        materializar_horarios_academia(self.lunes, self.usuario)
        materializar_horarios_academia(self.lunes, self.usuario)

        self.assertEqual(Reserva.objects.filter(academia=self.academia, fecha=self.lunes).count(), 1)

    def test_no_materializa_en_dia_de_la_semana_distinto(self):
        self._crear_horario(AcademiaHorario.Dia.MARTES, [self.cancha_1])

        materializar_horarios_academia(self.lunes, self.usuario)  # self.lunes es Lunes

        self.assertEqual(Reserva.objects.filter(academia=self.academia).count(), 0)

    def test_no_materializa_hacia_el_pasado(self):
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1])
        un_lunes_pasado = date(2020, 1, 6)  # tambien lunes, pero muy en el pasado

        materializar_horarios_academia(un_lunes_pasado, self.usuario)

        self.assertEqual(Reserva.objects.filter(academia=self.academia).count(), 0)

    def test_no_pisa_una_cancha_ya_ocupada(self):
        Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL, cliente_nombre='Cliente manual', fecha=self.lunes,
            hora_inicio=time(18, 0), hora_fin=time(19, 0), precio_total='70.00',
            asignada_por=self.usuario,
        )
        # Sin ReservaCancha para simplificar: se prueba el caso comun de
        # abajo, con la cancha si tomada, que es el que importa de verdad.
        reserva_manual = Reserva.objects.get(cliente_nombre='Cliente manual')
        ReservaCancha.objects.create(reserva=reserva_manual, cancha=self.cancha_1)
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1])

        materializar_horarios_academia(self.lunes, self.usuario)

        self.assertEqual(Reserva.objects.filter(academia=self.academia).count(), 0)
```

Y agregar `from datetime import date` si no está ya en el import del inicio del archivo (ya está: `from datetime import date, time`).

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_servicios.MaterializarHorariosAcademiaTest -v 2`
Expected: FAIL — `ImportError: cannot import name 'materializar_horarios_academia'`

- [ ] **Step 3: Implementar**

En `backend/reservas/servicios.py`:

1. Cambiar el import de `.models` (línea 7) a:
```python
from .models import AcademiaHorario, ComentarioDia, Modalidad, Pago, Reserva, ReservaCancha, Tarifa
```

2. Agregar `from django.db import transaction` y `from django.utils import timezone` a los imports del inicio del archivo (junto a los que ya están de `django.db.models`).

3. Agregar al final del archivo:

```python
def materializar_horarios_academia(fecha, usuario):
    """Por cada AcademiaHorario cuyo dia_semana coincide con 'fecha', crea
    la Reserva real que falte (con su ReservaCancha) -- no hace nada si ya
    existe, si la fecha es pasada, si no hay tarifa configurada para esa
    hora, o si la cancha ya esta ocupada. Se llama desde
    ReservaViewSet.list() antes de devolver las reservas del dia: no hay
    ningun proceso en segundo plano, se materializa perezosamente la
    primera vez que alguien mira ese dia."""
    if fecha < timezone.localdate():
        return

    horarios = (
        AcademiaHorario.objects.filter(dia_semana=fecha.weekday())
        .select_related('academia')
        .prefetch_related('canchas')
    )
    for horario in horarios:
        ya_existe = Reserva.objects.filter(
            academia=horario.academia, fecha=fecha, hora_inicio=horario.hora_inicio,
        ).exclude(estado=Reserva.Estado.CANCELADA).exists()
        if ya_existe:
            continue

        cancha_ids = list(horario.canchas.values_list('id', flat=True))
        if not cancha_ids:
            continue

        if len(cancha_ids) == 4:
            grupos = [cancha_ids]
            modalidad = Modalidad.COMPLETO
        else:
            grupos = [[cid] for cid in cancha_ids]
            modalidad = Modalidad.INDIVIDUAL

        tarifa = obtener_tarifa(modalidad, horario.hora_inicio)
        if tarifa is None:
            continue

        inicio_min = _minutos_desde_medianoche(horario.hora_inicio)
        fin_min = _minutos_desde_medianoche(horario.hora_fin, es_fin=True)
        duracion_horas = Decimal(fin_min - inicio_min) / Decimal(60)
        precio_total = (tarifa.precio_por_hora * duracion_horas).quantize(Decimal('0.01'))

        for grupo in grupos:
            if canchas_ocupadas(fecha, horario.hora_inicio, horario.hora_fin, grupo):
                continue
            with transaction.atomic():
                reserva = Reserva.objects.create(
                    modalidad=modalidad, cliente_nombre=horario.academia.nombre, fecha=fecha,
                    hora_inicio=horario.hora_inicio, hora_fin=horario.hora_fin,
                    precio_total=precio_total, academia=horario.academia, asignada_por=usuario,
                )
                ReservaCancha.objects.bulk_create([
                    ReservaCancha(reserva=reserva, cancha_id=cid) for cid in grupo
                ])
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_servicios.MaterializarHorariosAcademiaTest -v 2`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/reservas/servicios.py backend/reservas/tests/test_servicios.py
git commit -m "feat: agrega materializar_horarios_academia(), sin cron -- se dispara al pedir la grilla"
```

---

## Task 3: Conectar la materialización a `GET /api/reservas/?fecha=`

**Files:**
- Modify: `backend/reservas/views.py`
- Modify: `backend/reservas/tests/test_reservas_api_listar.py`

**Interfaces:**
- Consumes: `materializar_horarios_academia(fecha, usuario)` de Task 2.

- [ ] **Step 1: Escribir el test que falla**

Leer primero `backend/reservas/tests/test_reservas_api_listar.py` para seguir su estilo exacto de `setUp`. Agregar al final del archivo (ajustar el nombre de la clase de test si el archivo ya tiene una, agregando el método dentro de ella; si no, usar esta clase):

```python
class ListarReservasMaterializaAcademiasTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def test_listar_un_dia_materializa_los_horarios_de_academia_de_ese_dia(self):
        academia = Academia.objects.create(nombre='Talentos FC')
        cancha = Cancha.objects.get(numero=1)
        horario = AcademiaHorario.objects.create(
            academia=academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(18, 0), hora_fin=time(19, 0),
        )
        horario.canchas.set([cancha])
        un_lunes_futuro = (timezone.localdate() + timedelta(days=(7 - timezone.localdate().weekday()) % 7 or 7))

        response = self.client.get('/api/reservas/', {'fecha': un_lunes_futuro.isoformat()})

        self.assertEqual(response.status_code, 200)
        nombres = [r['cliente_nombre'] for r in response.data]
        self.assertIn('Talentos FC', nombres)
```

Ajustar los imports de ese archivo si hace falta: `from datetime import time, timedelta`, `from django.utils import timezone`, y `Academia, AcademiaHorario` agregados al import de `reservas.models`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_listar.ListarReservasMaterializaAcademiasTest -v 2`
Expected: FAIL — la lista viene vacía, `'Talentos FC'` no está en `nombres`

- [ ] **Step 3: Conectar la materialización**

En `backend/reservas/views.py`, agregar `materializar_horarios_academia` al import de `.servicios` (junto a los demás). En `ReservaViewSet.list`, después de validar la fecha y antes de armar el queryset, agregar:

```python
        fecha_obj = datetime.strptime(fecha, '%Y-%m-%d').date()
        materializar_horarios_academia(fecha_obj, request.user)

        reservas = (
            Reserva.objects.filter(fecha=fecha)
```

(la línea `reservas = (Reserva.objects.filter(fecha=fecha)` ya existe — solo se agregan las dos líneas nuevas justo antes.)

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_listar -v 2`
Expected: PASS (todos, incluyendo el nuevo)

- [ ] **Step 5: Correr toda la suite de backend**

Run: `cd backend && venv/Scripts/python.exe manage.py test -v 1`
Expected: OK, todo en verde.

- [ ] **Step 6: Commit**

```bash
git add backend/reservas/views.py backend/reservas/tests/test_reservas_api_listar.py
git commit -m "feat: GET /reservas/ materializa los horarios de academia del dia antes de responder"
```

---

## Task 4: Endpoints de Academia (crear/editar/eliminar con horarios anidados)

**Files:**
- Modify: `backend/reservas/serializers.py`
- Modify: `backend/reservas/views.py`
- Modify: `backend/reservas/urls.py`
- Modify: `backend/reservas/tests/test_academias_api.py`

**Interfaces:**
- Consumes: `AcademiaHorario` de Task 1.
- Produces: `GET /api/academias/` (cada academia con `id, nombre, color, permiso_mostrar, horarios: [{id, dia_semana, hora_inicio, hora_fin, canchas: [id,...]}]`), `POST /api/academias/`, `PATCH /api/academias/{id}/`, `DELETE /api/academias/{id}/`. Body de creación/edición: `{"nombre", "color"?, "permiso_mostrar"?, "horarios": [{"dias": [0,2,4], "hora_inicio", "hora_fin", "canchas": [id,...]}, ...]}` — `"dias"` es una lista, el backend crea una fila de `AcademiaHorario` por cada día.

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar todo el contenido de `backend/reservas/tests/test_academias_api.py`:

```python
from datetime import time

from rest_framework.test import APIClient, APITestCase

from reservas.models import Academia, AcademiaHorario, Cancha
from usuarios.models import UsuarioInterno


class AcademiasApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def test_sin_login_devuelve_401(self):
        client_sin_login = APIClient()
        response = client_sin_login.get('/api/academias/')
        self.assertEqual(response.status_code, 401)

    def test_lista_las_academias_con_sus_horarios(self):
        academia = Academia.objects.create(nombre='Talentos FC', color='#059669')
        cancha = Cancha.objects.get(numero=2)
        horario = AcademiaHorario.objects.create(
            academia=academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(18, 0), hora_fin=time(19, 0),
        )
        horario.canchas.set([cancha])

        response = self.client.get('/api/academias/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['nombre'], 'Talentos FC')
        self.assertEqual(response.data[0]['color'], '#059669')
        self.assertEqual(len(response.data[0]['horarios']), 1)
        self.assertEqual(response.data[0]['horarios'][0]['canchas'], [cancha.id])

    def test_crea_academia_con_horario_de_varios_dias(self):
        cancha_2 = Cancha.objects.get(numero=2)
        cancha_3 = Cancha.objects.get(numero=3)
        response = self.client.post('/api/academias/', {
            'nombre': 'Talentos FC', 'color': '#7c3aed', 'permiso_mostrar': True,
            'horarios': [
                {'dias': [0, 2, 4], 'hora_inicio': '21:00', 'hora_fin': '22:00', 'canchas': [cancha_2.id, cancha_3.id]},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 201)
        academia = Academia.objects.get(id=response.data['id'])
        self.assertEqual(academia.horarios.count(), 3)
        dias = sorted(academia.horarios.values_list('dia_semana', flat=True))
        self.assertEqual(dias, [0, 2, 4])
        primero = academia.horarios.first()
        self.assertEqual(set(primero.canchas.values_list('id', flat=True)), {cancha_2.id, cancha_3.id})

    def test_crea_academia_sin_horarios(self):
        response = self.client.post('/api/academias/', {'nombre': 'Sin horario aun'}, format='json')
        self.assertEqual(response.status_code, 201)
        academia = Academia.objects.get(id=response.data['id'])
        self.assertEqual(academia.horarios.count(), 0)
        self.assertEqual(academia.color, '#7c3aed')

    def test_editar_reemplaza_los_horarios(self):
        academia = Academia.objects.create(nombre='Talentos FC')
        cancha_1 = Cancha.objects.get(numero=1)
        viejo = AcademiaHorario.objects.create(
            academia=academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(18, 0), hora_fin=time(19, 0),
        )
        viejo.canchas.set([cancha_1])

        cancha_4 = Cancha.objects.get(numero=4)
        response = self.client.patch(f'/api/academias/{academia.id}/', {
            'nombre': 'Talentos FC', 'color': '#7c3aed',
            'horarios': [
                {'dias': [1], 'hora_inicio': '20:00', 'hora_fin': '21:00', 'canchas': [cancha_4.id]},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 200)
        academia.refresh_from_db()
        self.assertEqual(academia.horarios.count(), 1)
        nuevo = academia.horarios.first()
        self.assertEqual(nuevo.dia_semana, 1)
        self.assertEqual(list(nuevo.canchas.values_list('id', flat=True)), [cancha_4.id])

    def test_eliminar_academia(self):
        academia = Academia.objects.create(nombre='Talentos FC')
        response = self.client.delete(f'/api/academias/{academia.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Academia.objects.count(), 0)

    def test_eliminar_academia_inexistente_devuelve_404(self):
        response = self.client.delete('/api/academias/999999/')
        self.assertEqual(response.status_code, 404)

    def test_hora_fin_antes_que_hora_inicio_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/academias/', {
            'nombre': 'Mal horario',
            'horarios': [
                {'dias': [0], 'hora_inicio': '20:00', 'hora_fin': '19:00', 'canchas': [cancha.id]},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_horario_sin_canchas_devuelve_400(self):
        response = self.client.post('/api/academias/', {
            'nombre': 'Sin cancha',
            'horarios': [
                {'dias': [0], 'hora_inicio': '19:00', 'hora_fin': '20:00', 'canchas': []},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 400)
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_academias_api -v 2`
Expected: FAIL (la mayoría con 404/405 porque `POST/PATCH/DELETE /academias/` no existen todavía)

- [ ] **Step 3: Agregar los serializers**

En `backend/reservas/serializers.py`:

1. Agregar `AcademiaHorario` al import de `.models` (línea 5): `from .models import Academia, AcademiaHorario, Cancha, ComentarioDia, Modalidad, Pago, Reserva, Tarifa`.

2. Reemplazar la clase `AcademiaSerializer` (líneas 8-11 actuales) por:

```python
class AcademiaResumenSerializer(serializers.ModelSerializer):
    """Version chica de Academia, para anidar en ReservaSerializer sin
    traer todos los horarios en cada reserva."""
    class Meta:
        model = Academia
        fields = ['id', 'nombre', 'color']


class AcademiaHorarioSerializer(serializers.ModelSerializer):
    canchas = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = AcademiaHorario
        fields = ['id', 'dia_semana', 'hora_inicio', 'hora_fin', 'canchas']


class AcademiaSerializer(serializers.ModelSerializer):
    horarios = AcademiaHorarioSerializer(many=True, read_only=True)

    class Meta:
        model = Academia
        fields = ['id', 'nombre', 'color', 'permiso_mostrar', 'horarios']


class HorarioEntradaSerializer(serializers.Serializer):
    dias = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6), allow_empty=False,
    )
    hora_inicio = serializers.TimeField()
    hora_fin = serializers.TimeField()
    canchas = serializers.PrimaryKeyRelatedField(
        queryset=Cancha.objects.filter(activa=True), many=True,
    )

    def validate_canchas(self, canchas):
        if not canchas:
            raise serializers.ValidationError('Debe elegir al menos una cancha.')
        return canchas

    def validate(self, datos):
        termina_a_medianoche = datos['hora_fin'].hour == 0 and datos['hora_fin'].minute == 0
        if datos['hora_fin'] <= datos['hora_inicio'] and not termina_a_medianoche:
            raise serializers.ValidationError('La hora de fin debe ser posterior a la de inicio.')
        return datos


class AcademiaEntradaSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=150)
    color = serializers.CharField(max_length=7, required=False, default='#7c3aed')
    permiso_mostrar = serializers.BooleanField(required=False, default=True)
    horarios = HorarioEntradaSerializer(many=True, required=False, default=list)
```

3. `ReservaSerializer` gana el campo `academia`:

```python
class ReservaSerializer(serializers.ModelSerializer):
    canchas = serializers.SerializerMethodField()
    pagos = PagoSerializer(many=True, read_only=True)
    academia = AcademiaResumenSerializer(read_only=True)

    class Meta:
        model = Reserva
        fields = [
            'id', 'modalidad', 'cliente_nombre', 'fecha', 'hora_inicio',
            'hora_fin', 'estado', 'precio_total', 'canchas', 'pagos', 'academia',
        ]

    def get_canchas(self, reserva):
        return [rc.cancha_id for rc in reserva.canchas_asignadas.all()]
```

(Reemplaza la clase `ReservaSerializer` completa que ya existe.)

- [ ] **Step 4: Agregar la vista `AcademiaViewSet`**

En `backend/reservas/views.py`:

1. Agregar `AcademiaHorario` al import de `.models`.

2. Cambiar el import de `.serializers`: quitar `AcademiaSerializer` de donde esté y en su lugar importar `AcademiaEntradaSerializer, AcademiaSerializer` (agregar el nuevo, mantener el viejo nombre que ahora tiene más campos).

3. Borrar la clase `AcademiaListView` completa.

4. Agregar, antes de `class CanchaListView`:

```python
class AcademiaViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        academias = Academia.objects.prefetch_related('horarios__canchas')
        return Response(AcademiaSerializer(academias, many=True).data)

    def create(self, request):
        entrada = AcademiaEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        academia = self._guardar(entrada.validated_data)
        return Response(AcademiaSerializer(academia).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        try:
            academia = Academia.objects.get(pk=pk)
        except Academia.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        entrada = AcademiaEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        academia = self._guardar(entrada.validated_data, academia=academia)
        return Response(AcademiaSerializer(academia).data)

    def destroy(self, request, pk=None):
        try:
            academia = Academia.objects.get(pk=pk)
        except Academia.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        academia.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _guardar(self, datos, academia=None):
        with transaction.atomic():
            if academia is None:
                academia = Academia.objects.create(
                    nombre=datos['nombre'], color=datos['color'], permiso_mostrar=datos['permiso_mostrar'],
                )
            else:
                academia.nombre = datos['nombre']
                academia.color = datos['color']
                academia.permiso_mostrar = datos['permiso_mostrar']
                academia.save(update_fields=['nombre', 'color', 'permiso_mostrar'])
                academia.horarios.all().delete()
            for horario in datos['horarios']:
                for dia in horario['dias']:
                    fila = AcademiaHorario.objects.create(
                        academia=academia, dia_semana=dia,
                        hora_inicio=horario['hora_inicio'], hora_fin=horario['hora_fin'],
                    )
                    fila.canchas.set(horario['canchas'])
        return academia
```

- [ ] **Step 5: Registrar las rutas**

En `backend/reservas/urls.py`:

1. Quitar `AcademiaListView` del import de `.views`, agregar `AcademiaViewSet`.
2. Quitar la línea `path('academias/', AcademiaListView.as_view(), name='academias'),`.
3. Agregar, junto al `router.register('reservas', ...)`:
```python
router.register('academias', AcademiaViewSet, basename='academia')
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_academias_api -v 2`
Expected: PASS (9 tests)

- [ ] **Step 7: Correr toda la suite de backend**

Run: `cd backend && venv/Scripts/python.exe manage.py test -v 1`
Expected: OK. Este es el checkpoint de "backend completo" antes de tocar el frontend.

- [ ] **Step 8: Commit**

```bash
git add backend/reservas/serializers.py backend/reservas/views.py backend/reservas/urls.py backend/reservas/tests/test_academias_api.py
git commit -m "feat: POST/PATCH/DELETE /academias/ con horarios anidados, academia visible en ReservaSerializer"
```

---

## Task 5: Frontend — página "Academias" (listar, crear, editar, eliminar)

**Files:**
- Create: `frontend/src/components/AcademiaDialogo.jsx`
- Create: `frontend/src/components/Academias.jsx`
- Modify: `frontend/src/components/PanelLayout.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/utils/fecha.js`

**Interfaces:**
- Consumes: `Button`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`, `Input` (`components/ui/`), `ConfirmDialogo`, `apiFetch`, `NOMBRES_DIA` (de `utils/fecha.js`, ya existe: `['Lun','Mar','Mie','Jue','Vie','Sab','Dom']`, índice 0=Lunes, coincide con `AcademiaHorario.dia_semana` del backend).
- Produces: `formatearHorasDeAcademia` en `utils/fecha.js` (no es estrictamente necesario para otras tareas, pero se define ahí junto a los demás helpers de fecha/hora).

- [ ] **Step 1: Agregar el generador de horas y la paleta de colores**

En `frontend/src/utils/fecha.js`, agregar al final del archivo:

```js
export function generarOpcionesHora() {
  const opciones = []
  for (let h = 0; h < 24; h++) {
    opciones.push(`${String(h).padStart(2, '0')}:00`)
    opciones.push(`${String(h).padStart(2, '0')}:30`)
  }
  return opciones
}
```

Create `frontend/src/utils/paletaColores.js`:

```js
export const PALETA_COLORES = [
  '#7c3aed', '#059669', '#2563eb', '#d97706', '#e11d48',
  '#0891b2', '#c026d3', '#ea580c', '#0d9488', '#4f46e5',
]
```

- [ ] **Step 2: Crear `AcademiaDialogo.jsx`**

Create `frontend/src/components/AcademiaDialogo.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '../api'
import { generarOpcionesHora, NOMBRES_DIA } from '../utils/fecha'
import { PALETA_COLORES } from '../utils/paletaColores'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

const HORAS = generarOpcionesHora()

function horarioVacio() {
  return { dias: [], horaInicio: '18:00', horaFin: '19:00', canchas: [] }
}

function horariosDesdeAcademia(academia) {
  if (!academia) return [horarioVacio()]
  if (academia.horarios.length === 0) return [horarioVacio()]
  return academia.horarios.map((h) => ({
    dias: [h.dia_semana],
    horaInicio: h.hora_inicio.slice(0, 5),
    horaFin: h.hora_fin.slice(0, 5),
    canchas: h.canchas,
  }))
}

export default function AcademiaDialogo({ abierto, academia, canchas, onCerrar, onGuardada }) {
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState(PALETA_COLORES[0])
  const [permisoMostrar, setPermisoMostrar] = useState(true)
  const [horarios, setHorarios] = useState([horarioVacio()])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const modoEditar = Boolean(academia)

  useEffect(() => {
    if (!abierto) return
    setError('')
    setNombre(academia?.nombre || '')
    setColor(academia?.color || PALETA_COLORES[0])
    setPermisoMostrar(academia ? academia.permiso_mostrar : true)
    setHorarios(horariosDesdeAcademia(academia))
  }, [abierto, academia])

  function actualizarHorario(indice, cambios) {
    setHorarios((anteriores) => anteriores.map((h, i) => (i === indice ? { ...h, ...cambios } : h)))
  }

  function alternarDia(indice, dia) {
    setHorarios((anteriores) => anteriores.map((h, i) => {
      if (i !== indice) return h
      const yaEsta = h.dias.includes(dia)
      return { ...h, dias: yaEsta ? h.dias.filter((d) => d !== dia) : [...h.dias, dia] }
    }))
  }

  function alternarCancha(indice, canchaId) {
    setHorarios((anteriores) => anteriores.map((h, i) => {
      if (i !== indice) return h
      const yaEsta = h.canchas.includes(canchaId)
      return { ...h, canchas: yaEsta ? h.canchas.filter((c) => c !== canchaId) : [...h.canchas, canchaId] }
    }))
  }

  function marcarCampoCompleto(indice) {
    actualizarHorario(indice, { canchas: canchas.map((c) => c.id) })
  }

  function agregarHorario() {
    setHorarios((anteriores) => [...anteriores, horarioVacio()])
  }

  function quitarHorario(indice) {
    setHorarios((anteriores) => anteriores.filter((_, i) => i !== indice))
  }

  async function guardar() {
    setError('')
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    setGuardando(true)
    const body = {
      nombre,
      color,
      permiso_mostrar: permisoMostrar,
      horarios: horarios
        .filter((h) => h.dias.length > 0 && h.canchas.length > 0)
        .map((h) => ({ dias: h.dias, hora_inicio: h.horaInicio, hora_fin: h.horaFin, canchas: h.canchas })),
    }
    try {
      const guardada = modoEditar
        ? await apiFetch(`/academias/${academia.id}/`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiFetch('/academias/', { method: 'POST', body: JSON.stringify(body) })
      onGuardada(guardada)
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(sigueAbierto) => !sigueAbierto && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{modoEditar ? 'Editar academia' : 'Nueva academia'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="academia-nombre">Nombre</label>
          <Input id="academia-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la academia" />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Color</span>
          <div className="flex flex-wrap gap-2">
            {PALETA_COLORES.map((c) => (
              <button
                key={c} type="button" onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={permisoMostrar} onChange={(e) => setPermisoMostrar(e.target.checked)} />
          Mostrar en la web pública
        </label>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Horarios</span>
            <Button type="button" size="sm" variant="outline" onClick={agregarHorario}>
              <Plus className="h-3.5 w-3.5" /> Agregar horario
            </Button>
          </div>

          {horarios.map((horario, indice) => (
            <div key={indice} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap gap-1">
                {NOMBRES_DIA.map((nombreDia, dia) => (
                  <button
                    key={dia} type="button" onClick={() => alternarDia(indice, dia)}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      horario.dias.includes(dia) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {nombreDia}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={horario.horaInicio}
                  onChange={(e) => actualizarHorario(indice, { horaInicio: e.target.value })}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                >
                  {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <select
                  value={horario.horaFin}
                  onChange={(e) => actualizarHorario(indice, { horaFin: e.target.value })}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                >
                  {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {canchas.map((c) => (
                  <button
                    key={c.id} type="button" onClick={() => alternarCancha(indice, c.id)}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      horario.canchas.includes(c.id) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Cancha {c.numero}
                  </button>
                ))}
                <button
                  type="button" onClick={() => marcarCampoCompleto(indice)}
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                >
                  Campo completo
                </button>
              </div>

              {horarios.length > 1 && (
                <button
                  type="button" onClick={() => quitarHorario(indice)}
                  className="flex w-fit items-center gap-1 text-xs text-red-600 hover:underline"
                >
                  <Trash2 className="h-3 w-3" /> Quitar este horario
                </button>
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Crear `Academias.jsx`**

Create `frontend/src/components/Academias.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '../api'
import { NOMBRES_DIA } from '../utils/fecha'
import AcademiaDialogo from './AcademiaDialogo'
import ConfirmDialogo from './ConfirmDialogo'
import { Button } from './ui/button'

function textoHorario(horario) {
  const dia = NOMBRES_DIA[horario.dia_semana]
  const fin = horario.hora_fin === '00:00:00' ? '00:00' : horario.hora_fin.slice(0, 5)
  return `${dia} · ${horario.hora_inicio.slice(0, 5)}–${fin} · ${horario.canchas.length} cancha(s)`
}

export default function Academias() {
  const [academias, setAcademias] = useState([])
  const [canchas, setCanchas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [academiaEditando, setAcademiaEditando] = useState(null)
  const [academiaAEliminar, setAcademiaAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => {
    Promise.all([apiFetch('/academias/'), apiFetch('/canchas/')])
      .then(([academiasData, canchasData]) => {
        setAcademias(academiasData)
        setCanchas(canchasData)
      })
      .finally(() => setCargando(false))
  }, [])

  function abrirCrear() {
    setAcademiaEditando(null)
    setDialogoAbierto(true)
  }

  function abrirEditar(academia) {
    setAcademiaEditando(academia)
    setDialogoAbierto(true)
  }

  function onGuardada(guardada) {
    setAcademias((anteriores) => {
      const existe = anteriores.some((a) => a.id === guardada.id)
      return existe ? anteriores.map((a) => (a.id === guardada.id ? guardada : a)) : [...anteriores, guardada]
    })
  }

  async function confirmarBorrado() {
    setEliminando(true)
    try {
      await apiFetch(`/academias/${academiaAEliminar.id}/`, { method: 'DELETE' })
      setAcademias((anteriores) => anteriores.filter((a) => a.id !== academiaAEliminar.id))
      setAcademiaAEliminar(null)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Academias</h2>
        <Button onClick={abrirCrear}>
          <Plus className="h-4 w-4" /> Agregar academia
        </Button>
      </div>

      {cargando && <p>Cargando...</p>}
      {!cargando && academias.length === 0 && (
        <p className="text-sm text-slate-400">Todavía no hay academias registradas.</p>
      )}

      <div className="flex flex-col gap-3">
        {academias.map((academia) => (
          <div key={academia.id} className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: academia.color }}>
                <Building2 className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">{academia.nombre}</div>
                {academia.horarios.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin horarios todavía.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm text-slate-500">
                    {academia.horarios.map((h) => <li key={h.id}>{textoHorario(h)}</li>)}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="outline" size="icon" onClick={() => abrirEditar(academia)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="destructive" size="icon" onClick={() => setAcademiaAEliminar(academia)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AcademiaDialogo
        abierto={dialogoAbierto}
        academia={academiaEditando}
        canchas={canchas}
        onCerrar={() => setDialogoAbierto(false)}
        onGuardada={onGuardada}
      />

      <ConfirmDialogo
        abierto={academiaAEliminar !== null}
        titulo="¿Eliminar esta academia?"
        detalle={academiaAEliminar?.nombre}
        confirmando={eliminando}
        onConfirmar={confirmarBorrado}
        onCancelar={() => setAcademiaAEliminar(null)}
      />
    </div>
  )
}
```

- [ ] **Step 4: Agregar la ruta y el ítem de menú**

En `frontend/src/App.jsx`: agregar `import Academias from './components/Academias'`, una función `AcademiasConLogin` (mismo patrón que `DashboardConLogin`) y la ruta `<Route path="/academias" element={<AcademiasConLogin />} />` dentro de `<Routes>`.

En `frontend/src/components/PanelLayout.jsx`: agregar `Building2` al import de `lucide-react`, y agregar `{ to: '/academias', label: 'Academias', icono: Building2 }` al array `NAV` (después de "Administración de campo").

- [ ] **Step 5: Verificación manual**

Run: `cd frontend && npm run build` (debe compilar sin errores). Luego `npm run dev`, entrar al panel: "Academias" aparece en el menú. Crear una academia con nombre, un color, y un horario para "hoy" (día de la semana actual) con una hora que ya pasó o esté por venir, 1 cancha. Editarla (cambiar color/horario). Eliminarla y confirmar que desaparece.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AcademiaDialogo.jsx frontend/src/components/Academias.jsx frontend/src/components/PanelLayout.jsx frontend/src/App.jsx frontend/src/utils/fecha.js frontend/src/utils/paletaColores.js
git commit -m "feat: pantalla Academias (crear/editar/eliminar con horarios semanales)"
```

---

## Task 6: Color de la academia en la grilla

**Files:**
- Modify: `frontend/src/components/PanelDisponibilidad.jsx`

**Interfaces:**
- Consumes: `reserva.academia` (`{id, nombre, color} | null`, ya viene en la respuesta de `GET /reservas/?fecha=` desde Task 4).

- [ ] **Step 1: Agregar el helper de estilo**

En `frontend/src/components/PanelDisponibilidad.jsx`, agregar después de `montosDeReserva`:

```js
function estiloAcademia(reserva) {
  if (!reserva.academia) return {}
  const color = reserva.academia.color
  return {
    backgroundColor: `color-mix(in srgb, ${color} 12%, white)`,
    borderColor: `color-mix(in srgb, ${color} 45%, white)`,
  }
}

function colorTextoAcademia(reserva) {
  return reserva.academia ? { color: reserva.academia.color } : {}
}
```

- [ ] **Step 2: Usarlo en `ContenidoReserva` y en los 2 botones de celda**

En `ContenidoReserva`, cambiar el `<span>` del nombre:

```jsx
<span className="min-w-0 truncate font-semibold text-rose-700" style={colorTextoAcademia(reserva)}>{reserva.cliente_nombre}</span>
```

En el `<button>` de la celda de campo completo (dentro de `completoInfo.tipo === 'inicio'`) y en el `<button>` de la celda individual (dentro de `info.tipo === 'inicio'`), agregar `style={estiloAcademia(info.reserva)}` (o `estiloAcademia(completoInfo.reserva)` según corresponda) al lado de `className`, sin quitar las clases `border-rose-200 bg-rose-50` — el `style` inline pisa esas clases solo cuando `reserva.academia` está presente (el helper devuelve `{}` si no hay academia, así que las clases rosa se siguen viendo igual que hoy para reservas sin academia).

- [ ] **Step 3: Verificación manual**

Run: `cd frontend && npm run dev`. Con la academia creada en la Task 5 (con horario para hoy), navegar al panel del día correspondiente: la celda de esa hora/cancha debe aparecer ya ocupada por la academia (creada sola por la materialización), con el nombre y el borde/fondo tintados con su color en vez del rosa genérico. Confirmar que una reserva de cliente normal (sin academia) se sigue viendo rosa como siempre.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PanelDisponibilidad.jsx
git commit -m "feat: la celda de una reserva de academia usa el color de la academia"
```

## Self-Review Notes

- **Cobertura del spec:** 2.1 (materialización perezosa) → Tasks 2-3; 2.2 (multi-cancha = varias reservas individuales) → Task 2; 2.3 (con pago) → ya viene gratis, son `Reserva` reales, `ReservaDialogo` no necesita cambios; 2.4 (duración libre) → Task 1/2, no se reutiliza `OPCIONES_DURACION` de `ReservaDialogo`; 2.5 (quita `horario_uso`) → Task 1; 3.1-3.2 (modelo) → Task 1; sección 4 (materialización) → Task 2; sección 5 (endpoints) → Tasks 3-4; sección 6 (frontend) → Tasks 5-6.
- **Fuera de alcance del spec respetado:** no se agrega cancelación retroactiva, ni reportes por academia, ni picker de color libre — la paleta fija cubre el pedido.
