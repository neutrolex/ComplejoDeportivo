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
