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

    def test_fecha_malformada_devuelve_400(self):
        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': 'not-a-date'})
        self.assertEqual(response.status_code, 400)

    def test_sin_pagos_devuelve_totales_en_0_00(self):
        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-20'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_efectivo'], '0.00')
        self.assertEqual(response.data['total_yape'], '0.00')
        self.assertEqual(response.data['total_general'], '0.00')

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
