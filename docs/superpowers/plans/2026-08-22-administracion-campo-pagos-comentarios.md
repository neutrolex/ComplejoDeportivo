# Administración de campo: pagos por reserva y comentarios del día — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir el panel de reservas ("Administración de campo") con pago editable por reserva (Yape/Efectivo), comentarios del día con montos, total del día bajo demanda y un dashboard financiero con gráficos reales, sobre un nuevo stack visual Tailwind CSS + shadcn/ui.

**Architecture:** Backend Django (upsert de `Pago` por método, nuevo modelo `ComentarioDia` que reemplaza `ObservacionDia`, agregaciones existentes extendidas) sin cambios de forma en las respuestas ya consumidas por el dashboard. Frontend React reconstruido sobre Tailwind CSS v4 + shadcn/ui (diálogos modales en vez del panel fijo bajo la grilla) + recharts para los gráficos.

**Tech Stack:** Django REST Framework (backend, sin cambios de librerías), React 19 + Vite + Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui (Radix primitives, copiados a mano) + recharts + lucide-react (frontend, deps nuevas).

**Spec:** `docs/superpowers/specs/2026-08-22-administracion-campo-pagos-comentarios-design.md`

## Global Constraints

- Español para todo texto de interfaz y mensajes de error.
- Moneda: soles, formato `S/{monto}` con 2 decimales, sin separador de miles.
- Ningún endpoint nuevo o modificado cambia su forma de respuesta salvo las descritas explícitamente en este plan (`resumen_pagos` y `dashboard_financiero` mantienen sus claves de siempre).
- Backend: TDD estricto (test que falla → implementación → test que pasa) en cada tarea de backend.
- Frontend: el proyecto no tiene suite de tests automatizados (ver specs previos del repo) — la verificación de cada tarea de frontend es manual, en el navegador, siguiendo los pasos indicados.
- No se migra el texto libre de `ObservacionDia` a `ComentarioDia` (spec sección 4.2) — se pierde al aplicar la migración.

---

## Task 1: `guardar_pago()` — upsert compartido de pagos

**Files:**
- Modify: `backend/reservas/servicios.py`
- Test: `backend/reservas/tests/test_servicios.py`

**Interfaces:**
- Produces: `guardar_pago(reserva, metodo, monto, usuario) -> Pago | None` en `reservas/servicios.py`. `metodo` es `Pago.Metodo.EFECTIVO` o `Pago.Metodo.YAPE`. `monto` es un `Decimal`. Si `monto <= 0`, borra el `Pago` de ese método si existía y devuelve `None`. Si `monto > 0`, crea o actualiza (sin duplicar) el único `Pago` de esa `(reserva, metodo)`, fijando `tipo=Pago.Tipo.SALDO`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `backend/reservas/tests/test_servicios.py` (agregar `Pago` y `guardar_pago` a los imports existentes de ese archivo: `from reservas.models import Academia, Cancha, Modalidad, Pago, Reserva, ReservaCancha` y `from reservas.servicios import (canchas_ocupadas, guardar_pago, horas_operativas, nombre_academia_visible, obtener_tarifa, resumen_financiero_dashboard)`):

```python
from decimal import Decimal


class GuardarPagoTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.reserva = Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL, cliente_nombre='Juan', fecha='2026-08-20',
            hora_inicio=time(10, 0), hora_fin=time(11, 0), precio_total='50.00',
            asignada_por=self.usuario,
        )

    def test_crea_pago_nuevo(self):
        pago = guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('50.00'), self.usuario)
        self.assertEqual(pago.monto, Decimal('50.00'))
        self.assertEqual(pago.tipo, Pago.Tipo.SALDO)
        self.assertEqual(pago.registrado_por, self.usuario)

    def test_actualiza_pago_existente_sin_duplicar(self):
        guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('50.00'), self.usuario)
        guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('70.00'), self.usuario)

        self.assertEqual(self.reserva.pagos.filter(metodo=Pago.Metodo.EFECTIVO).count(), 1)
        self.assertEqual(self.reserva.pagos.get(metodo=Pago.Metodo.EFECTIVO).monto, Decimal('70.00'))

    def test_yape_y_efectivo_son_independientes(self):
        guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('30.00'), self.usuario)
        guardar_pago(self.reserva, Pago.Metodo.YAPE, Decimal('20.00'), self.usuario)

        self.assertEqual(self.reserva.pagos.count(), 2)

    def test_monto_cero_borra_pago_existente(self):
        guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('50.00'), self.usuario)
        resultado = guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('0.00'), self.usuario)

        self.assertIsNone(resultado)
        self.assertEqual(self.reserva.pagos.filter(metodo=Pago.Metodo.EFECTIVO).count(), 0)

    def test_monto_cero_sin_pago_previo_no_hace_nada(self):
        resultado = guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('0.00'), self.usuario)

        self.assertIsNone(resultado)
        self.assertEqual(self.reserva.pagos.count(), 0)
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_servicios.GuardarPagoTest -v 2`
Expected: FAIL — `ImportError: cannot import name 'guardar_pago'`

- [ ] **Step 3: Implementar `guardar_pago`**

En `backend/reservas/servicios.py`, agregar (después de `canchas_ocupadas`, antes de `horas_operativas`):

```python
def guardar_pago(reserva, metodo, monto, usuario):
    """Upsert de a lo sumo un Pago por (reserva, metodo). monto<=0 borra el
    pago existente (equivale a 'no pago por este metodo'). Si hubiera mas
    de un Pago legacy del mismo metodo (dato de antes de este cambio),
    actualiza el mas reciente y deja los demas intactos."""
    pago = reserva.pagos.filter(metodo=metodo).order_by('-fecha_hora').first()
    if monto <= 0:
        if pago:
            pago.delete()
        return None
    if pago:
        pago.monto = monto
        pago.tipo = Pago.Tipo.SALDO
        pago.registrado_por = usuario
        pago.save(update_fields=['monto', 'tipo', 'registrado_por'])
        return pago
    return Pago.objects.create(
        reserva=reserva, metodo=metodo, monto=monto, tipo=Pago.Tipo.SALDO,
        registrado_por=usuario,
    )
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_servicios.GuardarPagoTest -v 2`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/reservas/servicios.py backend/reservas/tests/test_servicios.py
git commit -m "feat: agrega guardar_pago(), upsert compartido de Pago por metodo"
```

---

## Task 2: `PATCH /api/reservas/{id}/pagos/` — reemplaza el `POST` de lista

**Files:**
- Modify: `backend/reservas/views.py`
- Modify (delete old, write new): `backend/reservas/tests/test_reservas_api_pagos.py`

**Interfaces:**
- Consumes: `guardar_pago(reserva, metodo, monto, usuario)` de Task 1.
- Produces: `PATCH /api/reservas/{id}/pagos/` — body `{"efectivo"?: string, "yape"?: string}`, ambas claves opcionales. Response `200` con `ReservaSerializer` completo. `400` si algún monto no es un número o es negativo. `404` si la reserva no existe.

- [ ] **Step 1: Escribir el archivo de tests que falla**

Reemplazar TODO el contenido de `backend/reservas/tests/test_reservas_api_pagos.py`:

```python
from datetime import time
from decimal import Decimal

from rest_framework.test import APIClient, APITestCase

from reservas.models import Modalidad, Reserva
from usuarios.models import UsuarioInterno


class EditarPagosApiTest(APITestCase):
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

    def test_crea_pago_de_efectivo_si_no_existia(self):
        response = self.client.patch(
            f'/api/reservas/{self.reserva.id}/pagos/', {'efectivo': '80.00'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.reserva.pagos.count(), 1)
        pago = self.reserva.pagos.get(metodo='efectivo')
        self.assertEqual(pago.monto, Decimal('80.00'))
        self.assertEqual(pago.tipo, 'saldo')

    def test_edita_el_mismo_pago_en_vez_de_duplicar(self):
        self.client.patch(f'/api/reservas/{self.reserva.id}/pagos/', {'efectivo': '80.00'}, format='json')
        self.client.patch(f'/api/reservas/{self.reserva.id}/pagos/', {'efectivo': '95.00'}, format='json')

        self.assertEqual(self.reserva.pagos.filter(metodo='efectivo').count(), 1)
        self.assertEqual(self.reserva.pagos.get(metodo='efectivo').monto, Decimal('95.00'))

    def test_efectivo_y_yape_se_guardan_por_separado(self):
        response = self.client.patch(
            f'/api/reservas/{self.reserva.id}/pagos/', {'efectivo': '30.00', 'yape': '20.00'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.reserva.pagos.count(), 2)
        self.assertEqual(self.reserva.pagos.get(metodo='efectivo').monto, Decimal('30.00'))
        self.assertEqual(self.reserva.pagos.get(metodo='yape').monto, Decimal('20.00'))

    def test_monto_en_cero_borra_el_pago_existente(self):
        self.client.patch(f'/api/reservas/{self.reserva.id}/pagos/', {'efectivo': '80.00'}, format='json')
        response = self.client.patch(f'/api/reservas/{self.reserva.id}/pagos/', {'efectivo': '0'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.reserva.pagos.filter(metodo='efectivo').count(), 0)

    def test_monto_negativo_devuelve_400(self):
        response = self.client.patch(
            f'/api/reservas/{self.reserva.id}/pagos/', {'efectivo': '-10.00'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.reserva.pagos.count(), 0)

    def test_monto_no_numerico_devuelve_400(self):
        response = self.client.patch(
            f'/api/reservas/{self.reserva.id}/pagos/', {'efectivo': 'no-es-numero'}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_reserva_inexistente_devuelve_404(self):
        response = self.client.patch('/api/reservas/999999/pagos/', {'efectivo': '10.00'}, format='json')
        self.assertEqual(response.status_code, 404)

    def test_response_incluye_la_reserva_completa(self):
        response = self.client.patch(
            f'/api/reservas/{self.reserva.id}/pagos/', {'efectivo': '80.00'}, format='json',
        )
        self.assertEqual(response.data['id'], self.reserva.id)
        self.assertEqual(response.data['cliente_nombre'], 'Juan')
        self.assertEqual(len(response.data['pagos']), 1)
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_pagos -v 2`
Expected: FAIL — el `POST` actual devuelve `405 Method Not Allowed` para `PATCH` (o `400` por faltarle `tipo`/`metodo` si el método coincidiera).

- [ ] **Step 3: Reemplazar la acción `pagos` en el ViewSet**

En `backend/reservas/views.py`:

1. Cambiar el import de `decimal` (línea 2) a:
```python
from decimal import Decimal, InvalidOperation
```

2. Agregar `guardar_pago` al import de `.servicios` (junto a los que ya están: `canchas_ocupadas, fecha_valida, horas_operativas, nombre_academia_visible, obtener_tarifa, resumen_financiero_dashboard`).

3. Reemplazar el método `pagos` completo (líneas 128-137 actuales):

```python
    @action(detail=True, methods=['patch'])
    def pagos(self, request, pk=None):
        try:
            reserva = Reserva.objects.get(pk=pk)
        except Reserva.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        for campo, metodo in (('efectivo', Pago.Metodo.EFECTIVO), ('yape', Pago.Metodo.YAPE)):
            if campo not in request.data:
                continue
            try:
                monto = Decimal(str(request.data[campo]))
            except InvalidOperation:
                return Response(
                    {'detail': f'{campo} debe ser un numero.'}, status=status.HTTP_400_BAD_REQUEST,
                )
            if monto < 0:
                return Response(
                    {'detail': f'{campo} no puede ser negativo.'}, status=status.HTTP_400_BAD_REQUEST,
                )
            guardar_pago(reserva, metodo, monto, request.user)

        reserva.refresh_from_db()
        return Response(ReservaSerializer(reserva).data)
```

`PagoSerializer` deja de usarse en este método (sigue usándose para anidar `pagos` dentro de `ReservaSerializer`, no se toca).

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_pagos -v 2`
Expected: PASS (8 tests)

- [ ] **Step 5: Correr toda la suite de backend para detectar roturas**

Run: `cd backend && venv/Scripts/python.exe manage.py test -v 1`
Expected: el resto de la suite sigue en verde (nada más depende del `POST` viejo).

- [ ] **Step 6: Commit**

```bash
git add backend/reservas/views.py backend/reservas/tests/test_reservas_api_pagos.py
git commit -m "feat: PATCH /reservas/{id}/pagos/ hace upsert por metodo en vez de acumular una lista"
```

---

## Task 3: `yape`/`efectivo` opcionales al crear una reserva

**Files:**
- Modify: `backend/reservas/serializers.py`
- Modify: `backend/reservas/views.py`
- Modify: `backend/reservas/tests/test_reservas_api_crear.py`

**Interfaces:**
- Consumes: `guardar_pago()` de Task 1.
- Produces: `POST /api/reservas/` gana los campos opcionales `yape` y `efectivo` (string decimal, default `"0.00"`). Si vienen con monto > 0, la reserva creada queda con esos `Pago` ya registrados.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/reservas/tests/test_reservas_api_crear.py` (agregar `from decimal import Decimal` al inicio del archivo):

```python
    def test_crea_reserva_con_pago_yape_y_efectivo(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '10:00', 'cliente_nombre': 'Juan',
            'modalidad': 'individual', 'canchas': [cancha.id],
            'yape': '30.00', 'efectivo': '20.00',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        reserva = Reserva.objects.get(id=response.data['id'])
        self.assertEqual(reserva.pagos.count(), 2)
        self.assertEqual(reserva.pagos.get(metodo='yape').monto, Decimal('30.00'))
        self.assertEqual(reserva.pagos.get(metodo='efectivo').monto, Decimal('20.00'))

    def test_crea_reserva_sin_pago_no_crea_pagos(self):
        cancha = Cancha.objects.get(numero=2)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '10:00', 'cliente_nombre': 'Maria',
            'modalidad': 'individual', 'canchas': [cancha.id],
        }, format='json')

        self.assertEqual(response.status_code, 201)
        reserva = Reserva.objects.get(id=response.data['id'])
        self.assertEqual(reserva.pagos.count(), 0)

    def test_yape_negativo_devuelve_400(self):
        cancha = Cancha.objects.get(numero=3)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '10:00', 'cliente_nombre': 'Pedro',
            'modalidad': 'individual', 'canchas': [cancha.id], 'yape': '-5.00',
        }, format='json')
        self.assertEqual(response.status_code, 400)
```

(Estos tres métodos van dentro de la clase `CrearReservaApiTest` ya existente, al mismo nivel que los demás `test_...`.)

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_crear.CrearReservaApiTest.test_crea_reserva_con_pago_yape_y_efectivo -v 2`
Expected: FAIL — `reserva.pagos.count()` es `0` (el serializer todavía ignora `yape`/`efectivo`).

- [ ] **Step 3: Agregar los campos al serializer**

En `backend/reservas/serializers.py`, dentro de `NuevaReservaSerializer`, agregar (después de `academia`, antes de `modalidad`):

```python
    yape = serializers.DecimalField(
        max_digits=7, decimal_places=2, required=False, default=Decimal('0.00'), min_value=Decimal('0.00'),
    )
    efectivo = serializers.DecimalField(
        max_digits=7, decimal_places=2, required=False, default=Decimal('0.00'), min_value=Decimal('0.00'),
    )
```

- [ ] **Step 4: Registrar los pagos al crear la reserva**

En `backend/reservas/views.py`, dentro de `ReservaViewSet.create`, dentro del bloque `with transaction.atomic():`, después del `ReservaCancha.objects.bulk_create(...)`:

```python
            if datos['efectivo'] > 0:
                guardar_pago(reserva, Pago.Metodo.EFECTIVO, datos['efectivo'], request.user)
            if datos['yape'] > 0:
                guardar_pago(reserva, Pago.Metodo.YAPE, datos['yape'], request.user)
```

(`guardar_pago` y `Pago` ya están importados desde la Task 2.)

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_reservas_api_crear -v 2`
Expected: PASS (todos, incluyendo los 3 nuevos)

- [ ] **Step 6: Commit**

```bash
git add backend/reservas/serializers.py backend/reservas/views.py backend/reservas/tests/test_reservas_api_crear.py
git commit -m "feat: permite registrar yape/efectivo al crear una reserva"
```

---

## Task 4: Modelo `ComentarioDia` (reemplaza `ObservacionDia`)

**Files:**
- Modify: `backend/reservas/models.py`
- Create: `backend/reservas/migrations/0006_comentariodia.py`
- Modify: `backend/reservas/tests/test_models.py`

**Interfaces:**
- Produces: modelo `ComentarioDia` en `reservas.models` — campos `fecha` (`DateField`), `texto` (`CharField`, max 500), `monto_yape` (`DecimalField`, default `0.00`), `monto_efectivo` (`DecimalField`, default `0.00`), `creado_en` (auto), `creado_por` (FK a `UsuarioInterno`, `PROTECT`). `db_table='comentarios_dia'`, `ordering=['-creado_en']`.

- [ ] **Step 1: Escribir el test que falla**

En `backend/reservas/tests/test_models.py`: cambiar el import de la línea 5 de
`from reservas.models import Academia, Cancha, Modalidad, ObservacionDia, Reserva`
a
`from reservas.models import Academia, Cancha, ComentarioDia, Modalidad, Reserva`.

Reemplazar toda la clase `ObservacionDiaTest` (líneas 9-27) por:

```python
class ComentarioDiaTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )

    def test_crea_comentario_con_montos_por_defecto_en_cero(self):
        comentario = ComentarioDia.objects.create(
            fecha='2026-08-20', texto='Nota sin plata', creado_por=self.usuario,
        )
        self.assertEqual(str(comentario.monto_yape), '0.00')
        self.assertEqual(str(comentario.monto_efectivo), '0.00')

    def test_permite_varios_comentarios_en_el_mismo_dia(self):
        ComentarioDia.objects.create(fecha='2026-08-20', texto='Primero', creado_por=self.usuario)
        ComentarioDia.objects.create(fecha='2026-08-20', texto='Segundo', creado_por=self.usuario)

        self.assertEqual(ComentarioDia.objects.filter(fecha='2026-08-20').count(), 2)

    def test_ordena_del_mas_reciente_al_mas_antiguo(self):
        primero = ComentarioDia.objects.create(fecha='2026-08-20', texto='Primero', creado_por=self.usuario)
        segundo = ComentarioDia.objects.create(fecha='2026-08-20', texto='Segundo', creado_por=self.usuario)

        ids_en_orden = list(ComentarioDia.objects.values_list('id', flat=True))
        self.assertEqual(ids_en_orden, [segundo.id, primero.id])
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_models -v 2`
Expected: FAIL — `ImportError: cannot import name 'ComentarioDia'`

- [ ] **Step 3: Editar el modelo**

En `backend/reservas/models.py`:

1. Agregar al inicio del archivo: `from decimal import Decimal`.

2. Reemplazar toda la clase `ObservacionDia` (líneas 140-154) por:

```python
class ComentarioDia(models.Model):
    """Notas del dia, no ligadas a ninguna reserva especifica (ej. ventas
    sueltas, deudas). Puede haber varias por dia, cada una con su propio
    monto opcional en Yape y/o Efectivo -- ver spec seccion 3.2. 'fecha' es
    la fecha del panel que se estaba viendo al crear el comentario, no
    necesariamente 'hoy'."""
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

    def __str__(self):
        return f'Comentario {self.fecha}: {self.texto[:40]}'
```

- [ ] **Step 4: Escribir la migración**

Create `backend/reservas/migrations/0006_comentariodia.py`:

```python
import decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reservas', '0005_reserva_academia'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ComentarioDia',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fecha', models.DateField()),
                ('texto', models.CharField(max_length=500)),
                ('monto_yape', models.DecimalField(decimal_places=2, default=decimal.Decimal('0.00'), max_digits=7)),
                ('monto_efectivo', models.DecimalField(decimal_places=2, default=decimal.Decimal('0.00'), max_digits=7)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('creado_por', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='comentarios_dia', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'comentarios_dia',
                'ordering': ['-creado_en'],
            },
        ),
        migrations.DeleteModel(
            name='ObservacionDia',
        ),
    ]
```

- [ ] **Step 5: Aplicar la migración**

Run: `cd backend && venv/Scripts/python.exe manage.py migrate reservas`
Expected: `Applying reservas.0006_comentariodia... OK`

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_models -v 2`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/reservas/models.py backend/reservas/migrations/0006_comentariodia.py backend/reservas/tests/test_models.py
git commit -m "feat: agrega el modelo ComentarioDia, reemplaza a ObservacionDia"
```

---

## Task 5: Endpoints de `comentarios-dia/` (retira `observaciones/`)

**Files:**
- Modify: `backend/reservas/serializers.py`
- Modify: `backend/reservas/views.py`
- Modify: `backend/reservas/urls.py`
- Delete: `backend/reservas/tests/test_observaciones_api.py`
- Create: `backend/reservas/tests/test_comentarios_dia_api.py`

**Interfaces:**
- Consumes: modelo `ComentarioDia` de Task 4.
- Produces: `GET /api/comentarios-dia/?fecha=YYYY-MM-DD` (lista, más reciente primero), `POST /api/comentarios-dia/` (body `{"fecha", "texto", "monto_yape"?, "monto_efectivo"?}`), `DELETE /api/comentarios-dia/{id}/`.

- [ ] **Step 1: Escribir el test que falla**

Delete `backend/reservas/tests/test_observaciones_api.py`.

Create `backend/reservas/tests/test_comentarios_dia_api.py`:

```python
from rest_framework.test import APIClient, APITestCase

from reservas.models import ComentarioDia
from usuarios.models import UsuarioInterno


class ComentariosDiaApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def test_get_sin_fecha_devuelve_400(self):
        response = self.client.get('/api/comentarios-dia/')
        self.assertEqual(response.status_code, 400)

    def test_get_fecha_malformada_devuelve_400(self):
        response = self.client.get('/api/comentarios-dia/', {'fecha': 'not-a-date'})
        self.assertEqual(response.status_code, 400)

    def test_get_sin_comentarios_devuelve_lista_vacia(self):
        response = self.client.get('/api/comentarios-dia/', {'fecha': '2026-08-20'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_post_crea_comentario_con_montos(self):
        response = self.client.post('/api/comentarios-dia/', {
            'fecha': '2026-08-20', 'texto': 'Deportivo Lima yapeo 200, debe 500',
            'monto_yape': '200.00', 'monto_efectivo': '0.00',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        comentario = ComentarioDia.objects.get(id=response.data['id'])
        self.assertEqual(comentario.creado_por, self.usuario)
        self.assertEqual(str(comentario.monto_yape), '200.00')

    def test_post_sin_montos_usa_cero_por_defecto(self):
        response = self.client.post('/api/comentarios-dia/', {
            'fecha': '2026-08-20', 'texto': 'Nota sin plata asociada',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['monto_yape'], '0.00')
        self.assertEqual(response.data['monto_efectivo'], '0.00')

    def test_get_filtra_por_fecha_mas_reciente_primero(self):
        self.client.post('/api/comentarios-dia/', {'fecha': '2026-08-20', 'texto': 'Primero'}, format='json')
        self.client.post('/api/comentarios-dia/', {'fecha': '2026-08-20', 'texto': 'Segundo'}, format='json')
        self.client.post('/api/comentarios-dia/', {'fecha': '2026-08-21', 'texto': 'Otro dia'}, format='json')

        response = self.client.get('/api/comentarios-dia/', {'fecha': '2026-08-20'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]['texto'], 'Segundo')
        self.assertEqual(response.data[1]['texto'], 'Primero')

    def test_delete_borra_el_comentario(self):
        creado = self.client.post(
            '/api/comentarios-dia/', {'fecha': '2026-08-20', 'texto': 'Borrame'}, format='json',
        )
        response = self.client.delete(f"/api/comentarios-dia/{creado.data['id']}/")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(ComentarioDia.objects.count(), 0)

    def test_delete_inexistente_devuelve_404(self):
        response = self.client.delete('/api/comentarios-dia/999999/')
        self.assertEqual(response.status_code, 404)

    def test_sin_login_devuelve_401(self):
        client_sin_login = APIClient()
        response = client_sin_login.get('/api/comentarios-dia/', {'fecha': '2026-08-20'})
        self.assertEqual(response.status_code, 401)
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_comentarios_dia_api -v 2`
Expected: FAIL — `404 Not Found` (la ruta no existe todavía)

- [ ] **Step 3: Agregar el serializer**

En `backend/reservas/serializers.py`, agregar `ComentarioDia` al import de `.models` y agregar al final del archivo:

```python
class ComentarioDiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComentarioDia
        fields = ['id', 'fecha', 'texto', 'monto_yape', 'monto_efectivo', 'creado_en']
        read_only_fields = ['id', 'creado_en']
```

- [ ] **Step 4: Agregar las vistas**

En `backend/reservas/views.py`:

1. Cambiar `from .models import Academia, Cancha, Modalidad, ObservacionDia, Pago, Reserva, ReservaCancha, Tarifa` a `from .models import Academia, Cancha, ComentarioDia, Modalidad, Pago, Reserva, ReservaCancha, Tarifa`.

2. Cambiar `from rest_framework.generics import ListAPIView` a `from rest_framework.generics import DestroyAPIView, ListAPIView, ListCreateAPIView`.

3. Agregar `ComentarioDiaSerializer` al import de `.serializers`.

4. Borrar la clase `ObservacionDiaView` completa (líneas 253-278 actuales).

5. Agregar al final del archivo:

```python
class ComentarioDiaListCreateView(ListCreateAPIView):
    serializer_class = ComentarioDiaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        fecha = self.request.query_params.get('fecha')
        if not fecha_valida(fecha):
            return ComentarioDia.objects.none()
        return ComentarioDia.objects.filter(fecha=fecha)

    def list(self, request, *args, **kwargs):
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'}, status=status.HTTP_400_BAD_REQUEST,
            )
        if not fecha_valida(fecha):
            return Response(
                {'detail': 'Formato de fecha invalido, use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST,
            )
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(creado_por=self.request.user)


class ComentarioDiaDestroyView(DestroyAPIView):
    queryset = ComentarioDia.objects.all()
    permission_classes = [IsAuthenticated]
```

- [ ] **Step 5: Actualizar las URLs**

En `backend/reservas/urls.py`:

1. Cambiar el import de vistas: quitar `ObservacionDiaView`, agregar `ComentarioDiaDestroyView, ComentarioDiaListCreateView`.

2. Reemplazar la línea `path('observaciones/<str:fecha>/', ObservacionDiaView.as_view(), name='observacion-dia'),` por:

```python
    path('comentarios-dia/', ComentarioDiaListCreateView.as_view(), name='comentarios-dia'),
    path('comentarios-dia/<int:pk>/', ComentarioDiaDestroyView.as_view(), name='comentario-dia-detalle'),
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_comentarios_dia_api -v 2`
Expected: PASS (9 tests)

- [ ] **Step 7: Correr toda la suite de backend**

Run: `cd backend && venv/Scripts/python.exe manage.py test -v 1`
Expected: verde salvo por referencias a `/observaciones/` que ya no deberían existir (ninguna, tras borrar `test_observaciones_api.py`).

- [ ] **Step 8: Commit**

```bash
git add backend/reservas/serializers.py backend/reservas/views.py backend/reservas/urls.py backend/reservas/tests/test_comentarios_dia_api.py
git rm backend/reservas/tests/test_observaciones_api.py
git commit -m "feat: agrega GET/POST/DELETE /comentarios-dia/, retira /observaciones/"
```

---

## Task 6: `resumen_pagos` y `dashboard_financiero` suman `ComentarioDia`

**Files:**
- Modify: `backend/reservas/servicios.py`
- Modify: `backend/reservas/views.py`
- Modify: `backend/reservas/tests/test_servicios.py`
- Modify: `backend/reservas/tests/test_reservas_api_resumen_pagos.py`

**Interfaces:**
- Consumes: `ComentarioDia` de Task 4.
- Produces: sin cambio de forma — `resumen_financiero_dashboard()` y `GET /reservas/resumen-pagos/` devuelven las mismas claves de siempre, con montos que ahora incluyen `ComentarioDia`. `_ingresos_por_cancha` **no** se toca (un comentario no está ligado a ninguna cancha, no se le puede atribuir una — sección 5.6 del spec).

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/reservas/tests/test_servicios.py`: agregar `ComentarioDia` al import de `.models` (`from reservas.models import Academia, Cancha, ComentarioDia, Modalidad, Pago, Reserva, ReservaCancha`). Agregar estos métodos dentro de `ResumenFinancieroDashboardTest`:

```python
    def test_hoy_suma_tambien_comentarios_del_dia(self):
        ComentarioDia.objects.create(
            fecha=self.hoy, texto='Venta suelta', monto_yape='25.00', creado_por=self.usuario,
        )

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['hoy']['monto'], '25.00')
        self.assertEqual(resumen['hoy']['reservas'], 0)

    def test_comentario_de_otro_dia_no_afecta_hoy(self):
        ComentarioDia.objects.create(
            fecha='2026-08-21', texto='Ayer', monto_efectivo='10.00', creado_por=self.usuario,
        )

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['hoy']['monto'], '0.00')
        self.assertEqual(resumen['ayer']['monto'], '10.00')

    def test_ingresos_diarios_incluye_comentarios(self):
        ComentarioDia.objects.create(
            fecha=self.hoy, texto='Venta suelta', monto_efectivo='12.00', creado_por=self.usuario,
        )

        resumen = resumen_financiero_dashboard(self.hoy)
        dias = resumen['ingresos_diarios_30_dias']

        self.assertEqual(dias[-1]['efectivo'], '12.00')

    def test_totales_30_dias_incluyen_comentarios(self):
        ComentarioDia.objects.create(
            fecha=self.hoy, texto='Venta suelta', monto_yape='8.00', creado_por=self.usuario,
        )

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['total_yape_30_dias'], '8.00')

    def test_ingresos_por_cancha_no_incluye_comentarios(self):
        ComentarioDia.objects.create(
            fecha=self.hoy, texto='Venta suelta', monto_efectivo='99.00', creado_por=self.usuario,
        )

        resumen = resumen_financiero_dashboard(self.hoy)
        por_cancha = {fila['cancha']: fila['monto'] for fila in resumen['ingresos_por_cancha_30_dias']}

        self.assertEqual(por_cancha['Cancha 1'], '0.00')
        self.assertEqual(por_cancha['Campo completo'], '0.00')
```

Agregar a `backend/reservas/tests/test_reservas_api_resumen_pagos.py` (agregar `ComentarioDia` al import de `.models`):

```python
    def test_suma_tambien_los_comentarios_del_dia(self):
        ComentarioDia.objects.create(
            fecha='2026-08-20', texto='Venta suelta', monto_efectivo='15.00', creado_por=self.usuario,
        )

        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-20'})

        self.assertEqual(response.data['total_efectivo'], '15.00')
        self.assertEqual(response.data['total_general'], '15.00')

    def test_no_suma_comentarios_de_otro_dia(self):
        ComentarioDia.objects.create(
            fecha='2026-08-21', texto='Otro dia', monto_efectivo='15.00', creado_por=self.usuario,
        )

        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-20'})

        self.assertEqual(response.data['total_efectivo'], '0.00')
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_servicios.ResumenFinancieroDashboardTest reservas.tests.test_reservas_api_resumen_pagos -v 2`
Expected: FAIL en los tests nuevos (los montos no incluyen todavía los comentarios).

- [ ] **Step 3: Extender `_monto_y_conteo`**

En `backend/reservas/servicios.py`, agregar `ComentarioDia` al import de `.models` (`from .models import ComentarioDia, Modalidad, Pago, Reserva, ReservaCancha, Tarifa`). Reemplazar `_monto_y_conteo`:

```python
def _monto_y_conteo(desde, hasta):
    """Suma de pagos + comentarios (por su fecha de negocio) entre desde y
    hasta (ambas inclusive), y cantidad de reservas distintas con al menos
    un pago en ese rango. Un ComentarioDia no esta ligado a ninguna
    reserva, asi que solo aporta al monto, no al conteo de reservas."""
    pagos = Pago.objects.filter(fecha_hora__date__gte=desde, fecha_hora__date__lte=hasta)
    monto_pagos = pagos.aggregate(t=Sum('monto'))['t'] or Decimal('0.00')
    reservas = pagos.values('reserva_id').distinct().count()

    comentarios = ComentarioDia.objects.filter(fecha__gte=desde, fecha__lte=hasta).aggregate(
        yape=Sum('monto_yape'), efectivo=Sum('monto_efectivo'),
    )
    monto_comentarios = (comentarios['yape'] or Decimal('0.00')) + (comentarios['efectivo'] or Decimal('0.00'))

    return monto_pagos + monto_comentarios, reservas
```

- [ ] **Step 4: Extender `_ingresos_diarios`**

Reemplazar `_ingresos_diarios`:

```python
def _ingresos_diarios(desde, hasta):
    """Lista de dicts {fecha, yape, efectivo} para cada dia entre desde y
    hasta (ambas inclusive), sumando Pago + ComentarioDia, con '0.00' en
    los dias sin ninguno de los dos."""
    filas_pago = (
        Pago.objects.filter(fecha_hora__date__gte=desde, fecha_hora__date__lte=hasta)
        .annotate(dia=TruncDate('fecha_hora'))
        .values('dia', 'metodo')
        .annotate(total=Sum('monto'))
    )
    filas_comentario = (
        ComentarioDia.objects.filter(fecha__gte=desde, fecha__lte=hasta)
        .values('fecha')
        .annotate(yape=Sum('monto_yape'), efectivo=Sum('monto_efectivo'))
    )
    cantidad_dias = (hasta - desde).days + 1
    por_dia = {
        desde + timedelta(days=i): {'yape': Decimal('0.00'), 'efectivo': Decimal('0.00')}
        for i in range(cantidad_dias)
    }
    for fila in filas_pago:
        por_dia[fila['dia']][fila['metodo']] = fila['total']
    for fila in filas_comentario:
        por_dia[fila['fecha']]['yape'] += fila['yape'] or Decimal('0.00')
        por_dia[fila['fecha']]['efectivo'] += fila['efectivo'] or Decimal('0.00')
    return [
        {'fecha': dia.isoformat(), 'yape': str(datos['yape']), 'efectivo': str(datos['efectivo'])}
        for dia, datos in sorted(por_dia.items())
    ]
```

`_ingresos_por_cancha` no se toca (ver Interfaces arriba).

- [ ] **Step 5: Extender `resumen_pagos` en la vista**

En `backend/reservas/views.py`, agregar `ComentarioDia` al import de `.models` (ya se hizo en Task 5). Reemplazar el cuerpo del método `resumen_pagos` (después de los chequeos de `fecha`):

```python
        pagos_del_dia = Pago.objects.filter(fecha_hora__date=fecha)
        total_efectivo = pagos_del_dia.filter(
            metodo=Pago.Metodo.EFECTIVO,
        ).aggregate(t=Sum('monto'))['t'] or Decimal('0.00')
        total_yape = pagos_del_dia.filter(
            metodo=Pago.Metodo.YAPE,
        ).aggregate(t=Sum('monto'))['t'] or Decimal('0.00')

        comentarios_del_dia = ComentarioDia.objects.filter(fecha=fecha).aggregate(
            yape=Sum('monto_yape'), efectivo=Sum('monto_efectivo'),
        )
        total_efectivo += comentarios_del_dia['efectivo'] or Decimal('0.00')
        total_yape += comentarios_del_dia['yape'] or Decimal('0.00')

        return Response({
            'total_efectivo': str(total_efectivo),
            'total_yape': str(total_yape),
            'total_general': str(total_efectivo + total_yape),
        })
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `cd backend && venv/Scripts/python.exe manage.py test reservas.tests.test_servicios.ResumenFinancieroDashboardTest reservas.tests.test_reservas_api_resumen_pagos -v 2`
Expected: PASS

- [ ] **Step 7: Correr toda la suite de backend**

Run: `cd backend && venv/Scripts/python.exe manage.py test -v 1`
Expected: todo en verde. Este es el checkpoint de "backend completo" antes de tocar el frontend.

- [ ] **Step 8: Commit**

```bash
git add backend/reservas/servicios.py backend/reservas/views.py backend/reservas/tests/test_servicios.py backend/reservas/tests/test_reservas_api_resumen_pagos.py
git commit -m "feat: resumen_pagos y dashboard_financiero suman ComentarioDia"
```

---

## Task 7: Tailwind CSS v4 + primitivos de shadcn/ui

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`
- Modify: `frontend/src/index.css`
- Create: `frontend/src/lib/utils.js`
- Create: `frontend/src/components/ui/button.jsx`
- Create: `frontend/src/components/ui/dialog.jsx`
- Create: `frontend/src/components/ui/input.jsx`
- Create: `frontend/src/components/ui/textarea.jsx`
- Create: `frontend/src/components/ui/badge.jsx`
- Create: `frontend/src/components/ui/card.jsx`

**Interfaces:**
- Produces: `cn(...inputs)` en `frontend/src/lib/utils.js`. Componentes `Button`/`buttonVariants` (`button.jsx`), `Dialog`/`DialogTrigger`/`DialogPortal`/`DialogClose`/`DialogOverlay`/`DialogContent`/`DialogHeader`/`DialogTitle` (`dialog.jsx`), `Input` (`input.jsx`), `Textarea` (`textarea.jsx`), `Badge`/`badgeVariants` (`badge.jsx`, variantes: `default`, `yape`, `efectivo`, `pendiente`), `Card` (`card.jsx`) — todos en `frontend/src/components/ui/`, importables con rutas relativas.

No hay tests automáticos de frontend en este proyecto — la verificación de esta tarea es que `npm run build` compile sin errores.

- [ ] **Step 1: Instalar dependencias**

Run (desde `frontend/`):
```bash
npm install tailwindcss @tailwindcss/vite @radix-ui/react-dialog @radix-ui/react-slot class-variance-authority clsx tailwind-merge lucide-react recharts
```

- [ ] **Step 2: Activar el plugin de Tailwind en Vite**

Reemplazar `frontend/vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

- [ ] **Step 3: Importar Tailwind en el CSS global**

En `frontend/src/index.css`, agregar como primera línea del archivo (antes de `:root { ... }`):

```css
@import "tailwindcss";
```

(El resto del archivo, incluido el `#root` ya corregido en el trabajo previo, queda igual.)

- [ ] **Step 4: Crear el helper `cn()`**

Create `frontend/src/lib/utils.js`:

```js
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 5: Crear los componentes de `components/ui/`**

Create `frontend/src/components/ui/button.jsx`:

```jsx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-emerald-600 text-white shadow hover:bg-emerald-700',
        destructive: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
        outline: 'border border-slate-200 bg-white shadow-sm hover:bg-slate-50',
        ghost: 'hover:bg-slate-100',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
})
Button.displayName = 'Button'

export { Button, buttonVariants }
```

Create `frontend/src/components/ui/dialog.jsx`:

```jsx
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/50', className)}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-lg',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
        <span className="sr-only">Cerrar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }) => (
  <div className={cn('flex flex-col gap-1.5 text-left', className)} {...props} />
)

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold text-slate-900', className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

export { Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent, DialogHeader, DialogTitle }
```

Create `frontend/src/components/ui/input.jsx`:

```jsx
import * as React from 'react'
import { cn } from '../../lib/utils'

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
```

Create `frontend/src/components/ui/textarea.jsx`:

```jsx
import * as React from 'react'
import { cn } from '../../lib/utils'

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-16 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Textarea }
```

Create `frontend/src/components/ui/badge.jsx`:

```jsx
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-slate-100 text-slate-700',
        yape: 'border-transparent bg-violet-100 text-violet-700',
        efectivo: 'border-transparent bg-emerald-100 text-emerald-700',
        pendiente: 'border-transparent bg-amber-100 text-amber-700',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
```

Create `frontend/src/components/ui/card.jsx`:

```jsx
import * as React from 'react'
import { cn } from '../../lib/utils'

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...props} />
))
Card.displayName = 'Card'

export { Card }
```

- [ ] **Step 6: Verificar que el proyecto compila**

Run: `cd frontend && npm run build`
Expected: build exitoso, sin errores de resolución de módulos.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/src/index.css frontend/src/lib/utils.js frontend/src/components/ui/
git commit -m "feat: instala Tailwind CSS v4 + primitivos de shadcn/ui (button, dialog, input, textarea, badge, card)"
```

---

## Task 8: `PanelLayout` — rename, restyle, fecha larga

**Files:**
- Modify: `frontend/src/components/PanelLayout.jsx`
- Modify: `frontend/src/utils/fecha.js`

**Interfaces:**
- Consumes: `Button` de Task 7.
- Produces: `formatearFechaLarga(fechaTexto) -> string` en `frontend/src/utils/fecha.js` (ej. `"2026-08-22"` → `"Sábado 22 de Agosto"`).

- [ ] **Step 1: Agregar `formatearFechaLarga`**

En `frontend/src/utils/fecha.js`, agregar al final del archivo:

```js
const NOMBRES_DIA_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function formatearFechaLarga(fechaTexto) {
  const fecha = parsearFecha(fechaTexto)
  return `${NOMBRES_DIA_LARGO[fecha.getDay()]} ${fecha.getDate()} de ${NOMBRES_MES[fecha.getMonth()]}`
}
```

- [ ] **Step 2: Reescribir `PanelLayout.jsx`**

Reemplazar todo el contenido de `frontend/src/components/PanelLayout.jsx`:

```jsx
import { Link, useLocation } from 'react-router-dom'
import { BarChart3, Calendar, Trophy } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button } from './ui/button'

const NAV = [
  { to: '/', label: 'Administración de campo', icono: Calendar },
  { to: '/dashboard', label: 'Dashboard', icono: BarChart3 },
]

export default function PanelLayout({ children }) {
  const location = useLocation()
  const { cerrarSesion } = useAuth()

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white py-6">
        <div className="mb-8 flex items-center gap-2.5 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">Campos</div>
            <div className="text-xs text-slate-400">Panel de administración</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Principal
          </div>
          {NAV.map((item) => {
            const activo = location.pathname === item.to
            const Icono = item.icono
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activo ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icono className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-5">
          <Button variant="outline" className="w-full" onClick={cerrarSesion}>
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-auto p-7">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Verificación manual**

Run: `cd frontend && npm run dev` (si no está corriendo ya en 5174). En el navegador, entrar con `admin`/`admin123` y confirmar: el ítem del menú dice "Administración de campo" con ícono de calendario, el logo tiene el ícono de trofeo (🏆 estilizado), el fondo del ítem activo es verde esmeralda.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PanelLayout.jsx frontend/src/utils/fecha.js
git commit -m "feat: renombra el menu a Administracion de campo y restyla el sidebar con Tailwind"
```

---

## Task 9: `ReservaDialogo` — crear/editar en un modal, reemplaza `window.prompt` y `ReservaDetalle`

**Files:**
- Create: `frontend/src/components/ReservaDialogo.jsx`
- Modify: `frontend/src/components/PanelDisponibilidad.jsx`
- Delete: `frontend/src/components/ReservaDetalle.jsx`

**Interfaces:**
- Consumes: `Button`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`, `Input` de Task 7; `apiFetch` de `frontend/src/api.js`.
- Produces: `ReservaDialogo({ contexto, academias, onCerrar, onGuardada, onCancelada })`. `contexto` es `null` (cerrado) o uno de:
  - `{ modo: 'crear', fecha, horaInicio, modalidad, canchaIds, etiquetaCancha }`
  - `{ modo: 'editar', reserva, horaInicio, etiquetaCancha }`

  `onGuardada(reserva)` se llama con la reserva creada o actualizada (shape de `ReservaSerializer`). `onCancelada(id)` se llama tras cancelar una reserva existente.

- [ ] **Step 1: Crear `ReservaDialogo.jsx`**

Create `frontend/src/components/ReservaDialogo.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Banknote, Smartphone, Trash2 } from 'lucide-react'
import { apiFetch } from '../api'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

function montoPorMetodo(reserva, metodo) {
  return reserva.pagos
    .filter((p) => p.metodo === metodo)
    .reduce((acc, p) => acc + Number(p.monto), 0)
    .toFixed(2)
}

export default function ReservaDialogo({ contexto, academias, onCerrar, onGuardada, onCancelada }) {
  const [cliente, setCliente] = useState('')
  const [academiaId, setAcademiaId] = useState('')
  const [yape, setYape] = useState('0.00')
  const [efectivo, setEfectivo] = useState('0.00')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const modoEditar = contexto?.modo === 'editar'

  useEffect(() => {
    if (!contexto) return
    setError('')
    if (contexto.modo === 'editar') {
      setCliente(contexto.reserva.cliente_nombre)
      setYape(montoPorMetodo(contexto.reserva, 'yape'))
      setEfectivo(montoPorMetodo(contexto.reserva, 'efectivo'))
    } else {
      setCliente('')
      setAcademiaId('')
      setYape('0.00')
      setEfectivo('0.00')
    }
  }, [contexto])

  if (!contexto) return null

  const total = (Number(yape) || 0) + (Number(efectivo) || 0)

  async function guardar() {
    setError('')
    if (!modoEditar && !cliente.trim()) {
      setError('El nombre del cliente es obligatorio.')
      return
    }
    setGuardando(true)
    try {
      if (modoEditar) {
        const actualizada = await apiFetch(`/reservas/${contexto.reserva.id}/pagos/`, {
          method: 'PATCH',
          body: JSON.stringify({ yape, efectivo }),
        })
        onGuardada(actualizada)
      } else {
        const nueva = await apiFetch('/reservas/', {
          method: 'POST',
          body: JSON.stringify({
            fecha: contexto.fecha,
            hora_inicio: contexto.horaInicio,
            cliente_nombre: cliente,
            modalidad: contexto.modalidad,
            canchas: contexto.canchaIds,
            academia: academiaId || null,
            yape,
            efectivo,
          }),
        })
        onGuardada(nueva)
      }
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar() {
    if (!window.confirm(`¿Cancelar la reserva de ${contexto.reserva.cliente_nombre}?`)) return
    setError('')
    try {
      await apiFetch(`/reservas/${contexto.reserva.id}/cancelar/`, { method: 'POST' })
      onCancelada(contexto.reserva.id)
      onCerrar()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {modoEditar ? 'Editar reserva' : 'Nueva reserva'} — {contexto.horaInicio.slice(0, 5)} · {contexto.etiquetaCancha}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="reserva-cliente">Cliente</label>
          <Input
            id="reserva-cliente"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            placeholder="Nombre del cliente"
            disabled={modoEditar}
          />
        </div>

        {!modoEditar && academias.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="reserva-academia">
              Academia (opcional)
            </label>
            <select
              id="reserva-academia"
              value={academiaId}
              onChange={(e) => setAcademiaId(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm"
            >
              <option value="">Ninguna (cliente casual)</option>
              {academias.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1 text-sm font-medium text-violet-700" htmlFor="reserva-yape">
              <Smartphone className="h-3.5 w-3.5" /> Yape (S/)
            </label>
            <Input
              id="reserva-yape" type="number" step="0.01" min="0"
              value={yape} onChange={(e) => setYape(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1 text-sm font-medium text-emerald-700" htmlFor="reserva-efectivo">
              <Banknote className="h-3.5 w-3.5" /> Efectivo (S/)
            </label>
            <Input
              id="reserva-efectivo" type="number" step="0.01" min="0"
              value={efectivo} onChange={(e) => setEfectivo(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">Si pagó en dos partes, completa ambos campos.</p>

        <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm font-medium">
          <span>Total</span>
          <span>S/{total.toFixed(2)}</span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between">
          {modoEditar ? (
            <Button variant="destructive" size="icon" onClick={eliminar} type="button">
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : <span />}
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Reescribir `PanelDisponibilidad.jsx`**

Delete `frontend/src/components/ReservaDetalle.jsx`.

Reemplazar todo el contenido de `frontend/src/components/PanelDisponibilidad.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { formatearFecha, formatearFechaLarga } from '../utils/fecha'
import { Badge } from './ui/badge'
import ReservaDialogo from './ReservaDialogo'

function calcularHoras(tarifas) {
  if (tarifas.length === 0) return []
  const horaInicio = Math.min(...tarifas.map((t) => Number(t.hora_inicio.slice(0, 2))))
  const horas = []
  for (let h = horaInicio; h <= 23; h++) horas.push(h)
  return horas
}

function horaTexto(hora) {
  return `${String(hora).padStart(2, '0')}:00`
}

function montosDeReserva(reserva) {
  const suma = (metodo) =>
    reserva.pagos.filter((p) => p.metodo === metodo).reduce((acc, p) => acc + Number(p.monto), 0)
  return { yape: suma('yape'), efectivo: suma('efectivo') }
}

function BadgesPago({ reserva }) {
  const { yape, efectivo } = montosDeReserva(reserva)
  if (yape === 0 && efectivo === 0) {
    return <Badge variant="pendiente">Pendiente</Badge>
  }
  return (
    <>
      {yape > 0 && <Badge variant="yape">Yape S/{yape.toFixed(2)}</Badge>}
      {efectivo > 0 && <Badge variant="efectivo">Efectivo S/{efectivo.toFixed(2)}</Badge>}
    </>
  )
}

export default function PanelDisponibilidad() {
  const [fecha, setFecha] = useState(formatearFecha(new Date()))
  const [canchas, setCanchas] = useState([])
  const [tarifas, setTarifas] = useState([])
  const [reservas, setReservas] = useState([])
  const [academias, setAcademias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [dialogoContexto, setDialogoContexto] = useState(null)

  useEffect(() => {
    let vigente = true
    async function cargarDatos() {
      setCargando(true)
      setError('')
      setDialogoContexto(null)
      try {
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
      } catch (err) {
        if (!vigente) return
        setError(err.message)
      } finally {
        if (vigente) setCargando(false)
      }
    }
    cargarDatos()
    return () => { vigente = false }
  }, [fecha])

  function reservaEnCelda(canchaId, hora) {
    const horaComparar = `${String(hora).padStart(2, '0')}:00:00`
    return reservas.find((r) => r.hora_inicio === horaComparar && r.canchas.includes(canchaId))
  }

  function reservaCompletaEnHora(hora) {
    const horaComparar = `${String(hora).padStart(2, '0')}:00:00`
    return reservas.find((r) => r.modalidad === 'completo' && r.hora_inicio === horaComparar)
  }

  function abrirCrear(hora, cancha) {
    setDialogoContexto({
      modo: 'crear', fecha, horaInicio: horaTexto(hora), modalidad: 'individual',
      canchaIds: [cancha.id], etiquetaCancha: `Cancha ${cancha.numero}`,
    })
  }

  function abrirCrearCompleto(hora) {
    setDialogoContexto({
      modo: 'crear', fecha, horaInicio: horaTexto(hora), modalidad: 'completo',
      canchaIds: canchas.map((c) => c.id), etiquetaCancha: 'Campo completo',
    })
  }

  function abrirEditar(reserva, etiquetaCancha) {
    setDialogoContexto({ modo: 'editar', reserva, horaInicio: reserva.hora_inicio, etiquetaCancha })
  }

  function onGuardada(reservaGuardada) {
    setReservas((anteriores) => {
      const existe = anteriores.some((r) => r.id === reservaGuardada.id)
      return existe
        ? anteriores.map((r) => (r.id === reservaGuardada.id ? reservaGuardada : r))
        : [...anteriores, reservaGuardada]
    })
  }

  function onCancelada(id) {
    setReservas((anteriores) => anteriores.filter((r) => r.id !== id))
  }

  const horas = calcularHoras(tarifas)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Reservas</h2>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <span aria-hidden="true">📅</span>
            <span>{formatearFechaLarga(fecha)}</span>
          </div>
        </div>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm shadow-sm"
        />
      </div>

      {cargando && <p>Cargando...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!cargando && !error && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Hora</th>
                {canchas.map((c) => (
                  <th key={c.id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                    Cancha {c.numero}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Campo completo</th>
              </tr>
            </thead>
            <tbody>
              {horas.map((hora, i) => {
                const completa = reservaCompletaEnHora(hora)
                const hayCanchaOcupada = canchas.some((c) => reservaEnCelda(c.id, hora))
                return (
                  <tr key={hora} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-2 align-top text-slate-500">{horaTexto(hora)}</td>
                    {completa ? (
                      <td colSpan={canchas.length + 1} className="px-2 py-1.5">
                        <button
                          onClick={() => abrirEditar(completa, 'Campo completo')}
                          className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left"
                        >
                          <span className="font-semibold text-rose-700">{completa.cliente_nombre}</span>
                          <Badge>Campo completo</Badge>
                          <BadgesPago reserva={completa} />
                        </button>
                      </td>
                    ) : (
                      <>
                        {canchas.map((c) => {
                          const reserva = reservaEnCelda(c.id, hora)
                          return (
                            <td key={c.id} className="px-2 py-1.5">
                              {reserva ? (
                                <button
                                  onClick={() => abrirEditar(reserva, `Cancha ${c.numero}`)}
                                  className="flex w-full flex-wrap items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left"
                                >
                                  <span className="font-semibold text-rose-700">{reserva.cliente_nombre}</span>
                                  <BadgesPago reserva={reserva} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => abrirCrear(hora, c)}
                                  className="w-full rounded-lg px-3 py-2 text-left text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                                >
                                  Libre
                                </button>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-2 py-1.5">
                          {hayCanchaOcupada ? (
                            <div className="px-3 py-2 text-slate-300">-</div>
                          ) : (
                            <button
                              onClick={() => abrirCrearCompleto(hora)}
                              className="w-full rounded-lg px-3 py-2 text-left text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              Reservar todo
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ReservaDialogo
        contexto={dialogoContexto}
        academias={academias}
        onCerrar={() => setDialogoContexto(null)}
        onGuardada={onGuardada}
        onCancelada={onCancelada}
      />
    </div>
  )
}
```

(Los bloques de `Observaciones` y `ResumenPagos` que había al final del `return` original se quitan en esta tarea — vuelven, ya como componentes nuevos, en las Tasks 10 y 11.)

- [ ] **Step 3: Verificación manual**

Run: `cd frontend && npm run dev`. En el navegador:
1. Click en una celda "Libre" → se abre el diálogo "Nueva reserva", con Cliente, Academia (si hay alguna cargada), Yape, Efectivo y Total en vivo. Completar cliente + un monto y Guardar → la celda pasa a mostrar el nombre y el badge correspondiente.
2. Click en "Reservar todo" en una hora libre → se abre el diálogo, al guardar la fila entera queda como una sola celda fusionada (colSpan) con el nombre y "Campo completo".
3. Click en una celda ocupada → se abre "Editar reserva" con los montos precargados; cambiar Efectivo y Guardar → el badge de la celda se actualiza sin recargar la página.
4. Click en el ícono de basurero dentro de "Editar reserva" → confirma y la celda vuelve a "Libre".

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ReservaDialogo.jsx frontend/src/components/PanelDisponibilidad.jsx
git rm frontend/src/components/ReservaDetalle.jsx
git commit -m "feat: diálogo modal para crear/editar reservas, celda de campo completo fusionada"
```

---

## Task 10: `ComentariosDia` — panel lateral + diálogo, reemplaza `Observaciones`

**Files:**
- Create: `frontend/src/components/ComentarioDialogo.jsx`
- Create: `frontend/src/components/ComentariosDia.jsx`
- Modify: `frontend/src/components/PanelDisponibilidad.jsx`
- Delete: `frontend/src/components/Observaciones.jsx`

**Interfaces:**
- Consumes: `Button`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`, `Input`, `Textarea`, `Badge` de Task 7.
- Produces: `ComentariosDia({ fecha })` — panel lateral con la lista de comentarios de ese día y el botón "+ Agregar". `ComentarioDialogo({ abierto, fecha, onCerrar, onCreado })`.

- [ ] **Step 1: Crear `ComentarioDialogo.jsx`**

Create `frontend/src/components/ComentarioDialogo.jsx`:

```jsx
import { useState } from 'react'
import { apiFetch } from '../api'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

export default function ComentarioDialogo({ abierto, fecha, onCerrar, onCreado }) {
  const [texto, setTexto] = useState('')
  const [montoYape, setMontoYape] = useState('')
  const [montoEfectivo, setMontoEfectivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    if (!texto.trim()) {
      setError('Escribe un comentario.')
      return
    }
    setError('')
    setGuardando(true)
    try {
      const nuevo = await apiFetch('/comentarios-dia/', {
        method: 'POST',
        body: JSON.stringify({
          fecha, texto, monto_yape: montoYape || '0.00', monto_efectivo: montoEfectivo || '0.00',
        }),
      })
      onCreado(nuevo)
      setTexto('')
      setMontoYape('')
      setMontoEfectivo('')
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(sigueAbierto) => !sigueAbierto && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar comentario — {fecha}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="comentario-texto">Comentario</label>
          <Textarea
            id="comentario-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe un comentario..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-violet-700" htmlFor="comentario-yape">
              📱 Monto Yape (S/)
            </label>
            <Input
              id="comentario-yape" type="number" step="0.01" min="0" placeholder="0.00"
              value={montoYape} onChange={(e) => setMontoYape(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-emerald-700" htmlFor="comentario-efectivo">
              💵 Monto Efectivo (S/)
            </label>
            <Input
              id="comentario-efectivo" type="number" step="0.01" min="0" placeholder="0.00"
              value={montoEfectivo} onChange={(e) => setMontoEfectivo(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">El monto es opcional y suma al total del día y al dashboard.</p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Crear `ComentariosDia.jsx`**

Create `frontend/src/components/ComentariosDia.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { MessageSquare, Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '../api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import ComentarioDialogo from './ComentarioDialogo'

export default function ComentariosDia({ fecha }) {
  const [comentarios, setComentarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    apiFetch(`/comentarios-dia/?fecha=${fecha}`)
      .then((data) => { if (vigente) setComentarios(data) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [fecha])

  async function borrar(id) {
    if (!window.confirm('¿Borrar este comentario?')) return
    await apiFetch(`/comentarios-dia/${id}/`, { method: 'DELETE' })
    setComentarios((anteriores) => anteriores.filter((c) => c.id !== id))
  }

  return (
    <div className="sticky top-7 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-900">
          <MessageSquare className="h-4 w-4" /> Comentarios
        </h3>
        <Button size="sm" onClick={() => setDialogoAbierto(true)}>
          <Plus className="h-3.5 w-3.5" /> Agregar
        </Button>
      </div>

      {cargando && <p className="text-sm text-slate-400">Cargando...</p>}
      {!cargando && comentarios.length === 0 && (
        <p className="text-sm text-slate-400">Sin comentarios este día.</p>
      )}

      <div className="flex flex-col gap-2">
        {comentarios.map((c) => (
          <div key={c.id} className="group rounded-lg border-l-4 border-emerald-500 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-slate-700">{c.texto}</p>
              <button
                onClick={() => borrar(c.id)}
                className="shrink-0 text-slate-300 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {Number(c.monto_yape) > 0 && <Badge variant="yape">Yape S/{c.monto_yape}</Badge>}
              {Number(c.monto_efectivo) > 0 && <Badge variant="efectivo">Efectivo S/{c.monto_efectivo}</Badge>}
            </div>
          </div>
        ))}
      </div>

      <ComentarioDialogo
        abierto={dialogoAbierto}
        fecha={fecha}
        onCerrar={() => setDialogoAbierto(false)}
        onCreado={(nuevo) => setComentarios((anteriores) => [nuevo, ...anteriores])}
      />
    </div>
  )
}
```

- [ ] **Step 3: Integrar el panel de dos columnas en `PanelDisponibilidad.jsx`**

Delete `frontend/src/components/Observaciones.jsx`.

En `frontend/src/components/PanelDisponibilidad.jsx`:

1. Agregar el import: `import ComentariosDia from './ComentariosDia'`.

2. Envolver la grilla (el bloque `{!cargando && !error && (...)}`) y el `<ReservaDialogo .../>` final en un layout de dos columnas. El `return` completo del componente queda:

```jsx
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Reservas</h2>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <span aria-hidden="true">📅</span>
            <span>{formatearFechaLarga(fecha)}</span>
          </div>
        </div>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm shadow-sm"
        />
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {cargando && <p>Cargando...</p>}
          {error && <p className="text-red-600">{error}</p>}

          {!cargando && !error && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {/* ... la tabla de la Task 9, sin cambios ... */}
            </div>
          )}
        </div>

        <div className="w-80 shrink-0">
          <ComentariosDia key={`comentarios-${fecha}`} fecha={fecha} />
        </div>
      </div>

      <ReservaDialogo
        contexto={dialogoContexto}
        academias={academias}
        onCerrar={() => setDialogoContexto(null)}
        onGuardada={onGuardada}
        onCancelada={onCancelada}
      />
    </div>
  )
```

(El comentario `{/* ... la tabla de la Task 9, sin cambios ... */}` es solo para marcar dónde va en esta descripción — en el archivo real va el `<table>...</table>` completo que ya se escribió en la Task 9, Step 2, sin modificar ni una línea de su contenido, solo movido dentro de este nuevo `<div className="min-w-0 flex-1">`.)

- [ ] **Step 4: Verificación manual**

Run: `cd frontend && npm run dev`. En el navegador: la grilla queda a la izquierda (más angosta que antes, pero sigue legible) y a la derecha un panel "Comentarios" fijo (sticky) con botón "+ Agregar". Click en "+ Agregar" → diálogo con Comentario, Monto Yape, Monto Efectivo, Guardar → la tarjeta nueva aparece arriba de la lista con sus badges. Hover sobre una tarjeta → aparece el ícono de basurero; click → confirma y la borra.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ComentarioDialogo.jsx frontend/src/components/ComentariosDia.jsx frontend/src/components/PanelDisponibilidad.jsx
git rm frontend/src/components/Observaciones.jsx
git commit -m "feat: panel de Comentarios del dia (reemplaza Observaciones)"
```

---

## Task 11: Total del día bajo demanda (reemplaza `ResumenPagos`)

**Files:**
- Create: `frontend/src/components/TotalDelDia.jsx`
- Modify: `frontend/src/components/PanelDisponibilidad.jsx`
- Delete: `frontend/src/components/ResumenPagos.jsx`

**Interfaces:**
- Consumes: `Button` de Task 7.
- Produces: `TotalDelDia({ fecha })`.

- [ ] **Step 1: Crear `TotalDelDia.jsx`**

Delete `frontend/src/components/ResumenPagos.jsx`.

Create `frontend/src/components/TotalDelDia.jsx`:

```jsx
import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { apiFetch } from '../api'
import { Button } from './ui/button'

export default function TotalDelDia({ fecha }) {
  const [totales, setTotales] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function calcular() {
    setCargando(true)
    setError('')
    try {
      const data = await apiFetch(`/reservas/resumen-pagos/?fecha=${fecha}`)
      setTotales(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex justify-center">
        <Button onClick={calcular} disabled={cargando} className="gap-2">
          <Calculator className="h-4 w-4" />
          {cargando ? 'Calculando...' : 'Calcular total del día'}
        </Button>
      </div>
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
      {totales && (
        <div className="mt-4 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white">
          <div className="flex justify-between text-sm text-slate-300">
            <span>Total Yape</span>
            <span className="font-semibold text-white">S/{totales.total_yape}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm text-slate-300">
            <span>Total Efectivo</span>
            <span className="font-semibold text-white">S/{totales.total_efectivo}</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-slate-700 pt-3">
            <span className="text-sm font-medium uppercase tracking-wide text-slate-300">Total del día</span>
            <span className="text-2xl font-bold text-emerald-400">S/{totales.total_general}</span>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Agregarlo debajo de la grilla en `PanelDisponibilidad.jsx`**

Agregar el import: `import TotalDelDia from './TotalDelDia'`. Dentro de `<div className="min-w-0 flex-1">` (la columna de la izquierda, ver Task 10 Step 3), agregar justo después del bloque de la tabla:

```jsx
          <TotalDelDia key={`total-${fecha}`} fecha={fecha} />
```

- [ ] **Step 3: Verificación manual**

Run: `cd frontend && npm run dev`. Click en "Calcular total del día" → aparece la tarjeta con gradiente oscuro mostrando Total Yape, Total Efectivo y "Total del día" en verde esmeralda grande. Cambiar la fecha del selector → la tarjeta desaparece (se resetea) hasta volver a apretar el botón para esa nueva fecha.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TotalDelDia.jsx frontend/src/components/PanelDisponibilidad.jsx
git rm frontend/src/components/ResumenPagos.jsx
git commit -m "feat: total del dia bajo demanda con tarjeta de gradiente (reemplaza ResumenPagos)"
```

---

## Task 12: `DashboardFinanciero` con recharts

**Files:**
- Modify: `frontend/src/components/DashboardFinanciero.jsx`

**Interfaces:**
- Consumes: `recharts` y `lucide-react` de Task 7. Mismo endpoint `GET /reservas/dashboard-financiero/`, mismo shape de respuesta (sin cambios de backend en esta tarea).

- [ ] **Step 1: Reescribir `DashboardFinanciero.jsx`**

Reemplazar todo el contenido de `frontend/src/components/DashboardFinanciero.jsx`:

```jsx
import { useEffect, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Banknote, Calendar, CalendarDays, Clock, Smartphone, TrendingUp } from 'lucide-react'
import { apiFetch } from '../api'

const COLOR_YAPE = '#7c3aed'
const COLOR_EFECTIVO = '#059669'

const TARJETAS_PERIODO = [
  { clave: 'hoy', titulo: 'Hoy', icono: Calendar },
  { clave: 'ayer', titulo: 'Ayer', icono: Clock },
  { clave: 'esta_semana', titulo: 'Esta semana', icono: TrendingUp },
  { clave: 'este_mes', titulo: 'Este mes', icono: CalendarDays },
]

function TarjetaPeriodo({ titulo, Icono, monto, reservas }) {
  return (
    <div className="min-w-[170px] flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-slate-500">{titulo}</span>
        <Icono className="h-4 w-4 text-slate-400" />
      </div>
      <div className="text-2xl font-bold text-slate-900">S/{monto}</div>
      <div className="mt-1 text-xs text-slate-400">{reservas} reservas</div>
    </div>
  )
}

function TarjetaMetodo({ Icono, titulo, monto, color, fondo }) {
  return (
    <div className="flex min-w-[220px] flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${fondo}`}>
        <Icono className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <div className="text-xs text-slate-500">{titulo}</div>
        <div className={`text-lg font-bold ${color}`}>S/{monto}</div>
      </div>
    </div>
  )
}

export default function DashboardFinanciero() {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    apiFetch('/reservas/dashboard-financiero/')
      .then((data) => { if (vigente) setDatos(data) })
      .catch((err) => { if (vigente) setError(err.message) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [])

  if (cargando) return <p>Cargando...</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!datos) return null

  const diarios = datos.ingresos_diarios_30_dias.map((d) => ({
    fecha: `${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}`, Yape: Number(d.yape), Efectivo: Number(d.efectivo),
  }))
  const pieData = [
    { name: 'Yape', value: Number(datos.total_yape_30_dias), fill: COLOR_YAPE },
    { name: 'Efectivo', value: Number(datos.total_efectivo_30_dias), fill: COLOR_EFECTIVO },
  ]
  const porCancha = datos.ingresos_por_cancha_30_dias.map((f) => ({ cancha: f.cancha, monto: Number(f.monto) }))

  return (
    <div>
      <h2 className="mb-5 text-2xl font-bold text-slate-900">Dashboard financiero</h2>

      <div className="mb-4 flex flex-wrap gap-4">
        {TARJETAS_PERIODO.map((t) => (
          <TarjetaPeriodo
            key={t.clave} titulo={t.titulo} Icono={t.icono}
            monto={datos[t.clave].monto} reservas={datos[t.clave].reservas}
          />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-4">
        <TarjetaMetodo
          Icono={Smartphone} titulo="Total Yape (30 días)" monto={datos.total_yape_30_dias}
          color="text-violet-600" fondo="bg-violet-100"
        />
        <TarjetaMetodo
          Icono={Banknote} titulo="Total Efectivo (30 días)" monto={datos.total_efectivo_30_dias}
          color="text-emerald-600" fondo="bg-emerald-100"
        />
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold text-slate-900">Ingresos diarios (últimos 30 días)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={diarios}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="fecha" fontSize={10} interval={2} />
            <YAxis fontSize={10} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Yape" stackId="a" fill={COLOR_YAPE} />
            <Bar dataKey="Efectivo" stackId="a" fill={COLOR_EFECTIVO} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="min-w-[260px] flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-900">Yape vs Efectivo</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                {pieData.map((entrada) => <Cell key={entrada.name} fill={entrada.fill} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="min-w-[320px] flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-900">Ingresos por cancha (30 días)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porCancha} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={10} />
              <YAxis type="category" dataKey="cancha" fontSize={11} width={90} />
              <Tooltip />
              <Bar dataKey="monto" fill="#0891b2" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificación manual**

Run: `cd frontend && npm run dev`. Entrar a "Dashboard" en el menú: 4 tarjetas de KPI arriba, 2 tarjetas de Total Yape/Efectivo, gráfico de barras apiladas de 30 días (morado + verde), gráfico de pastel Yape vs Efectivo, barras horizontales de ingresos por cancha. Confirmar que los montos coinciden con lo que muestra "Total del día" del panel de Reservas para el día de hoy.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DashboardFinanciero.jsx
git commit -m "feat: dashboard financiero con graficos de recharts"
```

---

## Self-Review Notes

- **Cobertura del spec:** sección 2 (stack) → Task 7; 3.1/4.1/5.1-5.2 (pago upsert) → Tasks 1-3; 3.2/4.2/5.3-5.5 (comentarios) → Tasks 4-5, 10; 3.3/6.3 (diálogo modal) → Task 9; 3.4 (campo completo fusionado) → Task 9; 5.6 (totales combinados) → Task 6, 11; 6.6 (dashboard) → Task 12; 6.1 (rename/logo) → Task 8; 8.1 (ancho completo) ya estaba aplicado antes de este plan.
- **`_ingresos_por_cancha` deliberadamente sin tocar** — un `ComentarioDia` no tiene cancha asociada, no hay forma correcta de atribuirlo a una barra del desglose por cancha (documentado en Task 6).
- **Academia en el diálogo de crear reserva:** no estaba en los mockups pero se mantiene (Task 9) porque ya era una funcionalidad construida (alimenta el nombre visible en `/horarios`) — quitarla sería una regresión silenciosa, no algo que el usuario pidió eliminar.
