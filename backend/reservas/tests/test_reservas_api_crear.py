from rest_framework.test import APIClient, APITestCase

from reservas.models import Cancha, Reserva, ReservaCancha
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
