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
