from datetime import time, timedelta

from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from reservas.models import Academia, AcademiaHorario, Cancha, Modalidad, Reserva, ReservaCancha
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

    def test_fecha_malformada_devuelve_400(self):
        response = self.client.get('/api/reservas/', {'fecha': 'not-a-date'})
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
