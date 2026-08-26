from decimal import Decimal

from rest_framework.test import APIClient, APITestCase

from reservas.models import Academia, Cancha, Pago, Reserva, ReservaCancha
from usuarios.models import UsuarioInterno


class CrearReservaApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def test_crea_reserva_individual_con_precio_correcto(self):
        cancha = Cancha.objects.get(numero=3)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '10:00',
            'cliente_nombre': 'Juan Perez',
            'modalidad': 'individual',
            'canchas': [cancha.id],
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['precio_total'], '50.00')
        self.assertEqual(response.data['hora_fin'], '11:00:00')
        self.assertEqual(response.data['canchas'], [cancha.id])

        reserva = Reserva.objects.get(id=response.data['id'])
        self.assertEqual(reserva.asignada_por, self.usuario)

    def test_crea_reserva_campo_completo_con_las_4_canchas(self):
        ids = list(Cancha.objects.values_list('id', flat=True))
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '19:00',
            'cliente_nombre': 'Cumpleanos',
            'modalidad': 'completo',
            'canchas': ids,
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['precio_total'], '180.00')
        self.assertEqual(
            ReservaCancha.objects.filter(reserva_id=response.data['id']).count(), 4,
        )

    def test_fuera_de_horario_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '03:00',
            'cliente_nombre': 'Nadie',
            'modalidad': 'individual',
            'canchas': [cancha.id],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_no_permite_doble_reserva_de_la_misma_cancha_y_hora(self):
        cancha = Cancha.objects.get(numero=1)
        body = {
            'fecha': '2026-08-20',
            'hora_inicio': '10:00',
            'cliente_nombre': 'Primero',
            'modalidad': 'individual',
            'canchas': [cancha.id],
        }
        primera = self.client.post('/api/reservas/', body, format='json')
        self.assertEqual(primera.status_code, 201)

        body['cliente_nombre'] = 'Segundo'
        segunda = self.client.post('/api/reservas/', body, format='json')
        self.assertEqual(segunda.status_code, 400)

    def test_individual_con_multiples_canchas_devuelve_400(self):
        ids = list(Cancha.objects.values_list('id', flat=True))[:2]
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '10:00',
            'cliente_nombre': 'Prueba',
            'modalidad': 'individual',
            'canchas': ids,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_completo_sin_las_4_canchas_devuelve_400(self):
        ids = list(Cancha.objects.values_list('id', flat=True))[:2]
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '19:00',
            'cliente_nombre': 'Incompleto',
            'modalidad': 'completo',
            'canchas': ids,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_cancha_repetida_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '19:00',
            'cliente_nombre': 'Repetido',
            'modalidad': 'completo',
            'canchas': [cancha.id, cancha.id, cancha.id, cancha.id],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_cancha_inexistente_devuelve_400(self):
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '10:00',
            'cliente_nombre': 'Fantasma',
            'modalidad': 'individual',
            'canchas': [999999],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_crea_reserva_vinculada_a_una_academia(self):
        academia = Academia.objects.create(nombre='Talentos FC', permiso_mostrar=True)
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '10:00',
            'cliente_nombre': 'Talentos FC',
            'modalidad': 'individual',
            'canchas': [cancha.id],
            'academia': academia.id,
        }, format='json')

        self.assertEqual(response.status_code, 201)
        reserva = Reserva.objects.get(id=response.data['id'])
        self.assertEqual(reserva.academia_id, academia.id)

    def test_crea_reserva_sin_academia_queda_sin_vincular(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20',
            'hora_inicio': '10:00',
            'cliente_nombre': 'Juan Perez',
            'modalidad': 'individual',
            'canchas': [cancha.id],
        }, format='json')

        self.assertEqual(response.status_code, 201)
        reserva = Reserva.objects.get(id=response.data['id'])
        self.assertIsNone(reserva.academia_id)

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

    def test_duracion_hora_y_media_calcula_hora_fin_y_precio(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '10:00', 'cliente_nombre': 'Juan',
            'modalidad': 'individual', 'canchas': [cancha.id], 'duracion': '1.5',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['hora_fin'], '11:30:00')
        self.assertEqual(response.data['precio_total'], '75.00')

    def test_sin_duracion_por_defecto_es_una_hora(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '10:00', 'cliente_nombre': 'Juan',
            'modalidad': 'individual', 'canchas': [cancha.id],
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['hora_fin'], '11:00:00')

    def test_duracion_que_no_es_multiplo_de_media_hora_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '10:00', 'cliente_nombre': 'Juan',
            'modalidad': 'individual', 'canchas': [cancha.id], 'duracion': '1.25',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_duracion_menor_a_una_hora_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '10:00', 'cliente_nombre': 'Juan',
            'modalidad': 'individual', 'canchas': [cancha.id], 'duracion': '0.5',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_duracion_mayor_a_una_hora_y_media_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '10:00', 'cliente_nombre': 'Juan',
            'modalidad': 'individual', 'canchas': [cancha.id], 'duracion': '2',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_reserva_que_cruzaria_medianoche_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '23:00', 'cliente_nombre': 'Juan',
            'modalidad': 'individual', 'canchas': [cancha.id], 'duracion': '1.5',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_reserva_que_termina_justo_a_medianoche_es_valida(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '22:30', 'cliente_nombre': 'Juan',
            'modalidad': 'individual', 'canchas': [cancha.id], 'duracion': '1.5',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['hora_fin'], '00:00:00')

    def test_detecta_solapamiento_con_reserva_de_mayor_duracion(self):
        cancha = Cancha.objects.get(numero=1)
        primera = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '08:00', 'cliente_nombre': 'Primero',
            'modalidad': 'individual', 'canchas': [cancha.id], 'duracion': '1.5',
        }, format='json')
        self.assertEqual(primera.status_code, 201)

        # La primera reserva ocupa hasta las 09:30 -- pedir 09:00-10:00 se
        # solapa con esos ultimos 30 minutos, aunque los inicios no coincidan.
        segunda = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '09:00', 'cliente_nombre': 'Segundo',
            'modalidad': 'individual', 'canchas': [cancha.id], 'duracion': '1',
        }, format='json')
        self.assertEqual(segunda.status_code, 400)

    def test_es_adelanto_por_defecto_es_false(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-20', 'hora_inicio': '10:00', 'cliente_nombre': 'Juan',
            'modalidad': 'individual', 'canchas': [cancha.id],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data['es_adelanto'])

    def test_crea_reserva_marcada_como_adelanto_con_pago_tipo_adelanto(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/reservas/', {
            'fecha': '2026-08-29', 'hora_inicio': '10:00', 'cliente_nombre': 'Rosa',
            'modalidad': 'individual', 'canchas': [cancha.id],
            'es_adelanto': True, 'efectivo': '30.00',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['es_adelanto'])
        reserva = Reserva.objects.get(id=response.data['id'])
        self.assertTrue(reserva.es_adelanto)
        pago = reserva.pagos.get(metodo='efectivo')
        self.assertEqual(pago.tipo, Pago.Tipo.ADELANTO)

    def test_completar_saldo_de_un_adelanto_no_cambia_es_adelanto(self):
        cancha = Cancha.objects.get(numero=1)
        creada = self.client.post('/api/reservas/', {
            'fecha': '2026-08-29', 'hora_inicio': '10:00', 'cliente_nombre': 'Rosa',
            'modalidad': 'individual', 'canchas': [cancha.id],
            'es_adelanto': True, 'efectivo': '30.00',
        }, format='json')
        reserva_id = creada.data['id']

        completada = self.client.patch(f'/api/reservas/{reserva_id}/pagos/', {
            'efectivo': '50.00',
        }, format='json')

        self.assertEqual(completada.status_code, 200)
        self.assertTrue(completada.data['es_adelanto'])
        reserva = Reserva.objects.get(id=reserva_id)
        self.assertTrue(reserva.es_adelanto)
        self.assertEqual(reserva.pagos.get(metodo='efectivo').tipo, Pago.Tipo.SALDO)
