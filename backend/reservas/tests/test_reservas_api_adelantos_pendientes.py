from rest_framework.test import APIClient, APITestCase

from reservas.models import Cancha
from usuarios.models import UsuarioInterno


class AdelantosPendientesApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)
        self.cancha = Cancha.objects.get(numero=1)

    def test_sin_login_devuelve_401(self):
        client_sin_login = APIClient()
        response = client_sin_login.get('/api/reservas/adelantos-pendientes/')
        self.assertEqual(response.status_code, 401)

    def test_lista_un_adelanto_con_saldo_pendiente(self):
        creada = self.client.post('/api/reservas/', {
            'fecha': '2026-09-10', 'hora_inicio': '10:00', 'cliente_nombre': 'Rosa',
            'modalidad': 'individual', 'canchas': [self.cancha.id],
            'es_adelanto': True, 'efectivo': '20.00',
        }, format='json')

        response = self.client.get('/api/reservas/adelantos-pendientes/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], creada.data['id'])

    def test_no_lista_reserva_normal(self):
        self.client.post('/api/reservas/', {
            'fecha': '2026-09-10', 'hora_inicio': '10:00', 'cliente_nombre': 'Juan',
            'modalidad': 'individual', 'canchas': [self.cancha.id],
        }, format='json')

        response = self.client.get('/api/reservas/adelantos-pendientes/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_no_lista_adelanto_ya_pagado_del_todo(self):
        self.client.post('/api/reservas/', {
            'fecha': '2026-09-10', 'hora_inicio': '10:00', 'cliente_nombre': 'Rosa',
            'modalidad': 'individual', 'canchas': [self.cancha.id],
            'es_adelanto': True, 'efectivo': '50.00',
        }, format='json')

        response = self.client.get('/api/reservas/adelantos-pendientes/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
