from datetime import time

from rest_framework.test import APIClient, APITestCase

from reservas.models import Modalidad, Reserva
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

    def test_cancelar_una_reserva_no_afecta_una_reserva_de_otro_dia(self):
        otra = Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL, cliente_nombre='Maria', fecha='2026-08-21',
            hora_inicio=time(10, 0), hora_fin=time(11, 0), precio_total='50.00',
            asignada_por=self.usuario,
        )

        response = self.client.post(f'/api/reservas/{self.reserva.id}/cancelar/')

        self.assertEqual(response.status_code, 200)
        otra.refresh_from_db()
        self.assertEqual(otra.estado, Reserva.Estado.CONFIRMADA)
