from datetime import time
from decimal import Decimal

from rest_framework.test import APIClient, APITestCase

from reservas.models import Modalidad, Pago, Reserva
from usuarios.models import UsuarioInterno


class MarcarAusenteApiTest(APITestCase):
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

    def test_marca_como_ausente(self):
        response = self.client.post(f'/api/reservas/{self.reserva.id}/ausente/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['estado'], 'ausente')
        self.reserva.refresh_from_db()
        self.assertEqual(self.reserva.estado, Reserva.Estado.AUSENTE)

    def test_llamarlo_de_nuevo_revierte_a_confirmada(self):
        self.client.post(f'/api/reservas/{self.reserva.id}/ausente/')
        response = self.client.post(f'/api/reservas/{self.reserva.id}/ausente/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['estado'], 'confirmada')
        self.reserva.refresh_from_db()
        self.assertEqual(self.reserva.estado, Reserva.Estado.CONFIRMADA)

    def test_no_toca_los_pagos_ya_cargados(self):
        Pago.objects.create(
            reserva=self.reserva, tipo=Pago.Tipo.SALDO, monto=Decimal('20.00'),
            metodo=Pago.Metodo.EFECTIVO, registrado_por=self.usuario,
        )

        response = self.client.post(f'/api/reservas/{self.reserva.id}/ausente/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['pagos']), 1)
        self.assertEqual(Decimal(response.data['pagos'][0]['monto']), Decimal('20.00'))
        self.assertEqual(self.reserva.pagos.count(), 1)

    def test_reserva_inexistente_devuelve_404(self):
        response = self.client.post('/api/reservas/999999/ausente/')
        self.assertEqual(response.status_code, 404)

    def test_sigue_apareciendo_en_el_listado_del_dia(self):
        # A diferencia de cancelar/, marcar "no vino" no debe sacar la
        # reserva de la grilla -- el turno sigue ocupado, solo cambia el
        # motivo.
        self.client.post(f'/api/reservas/{self.reserva.id}/ausente/')

        response = self.client.get('/api/reservas/?fecha=2026-08-20')

        ids = [r['id'] for r in response.data]
        self.assertIn(self.reserva.id, ids)
