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
