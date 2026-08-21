from datetime import time

from rest_framework.test import APIClient, APITestCase

from reservas.models import Academia, Cancha, Modalidad, Reserva, ReservaCancha
from usuarios.models import UsuarioInterno


class DisponibilidadPublicaApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()

    def _crear_reserva(self, cancha_ids, modalidad=Modalidad.INDIVIDUAL, hora=10,
                        cliente='Cliente', academia=None, estado=Reserva.Estado.CONFIRMADA):
        reserva = Reserva.objects.create(
            modalidad=modalidad,
            cliente_nombre=cliente,
            fecha='2026-08-24',
            hora_inicio=time(hora, 0),
            hora_fin=time(hora + 1, 0),
            precio_total='50.00',
            estado=estado,
            academia=academia,
            asignada_por=self.usuario,
        )
        for cancha_id in cancha_ids:
            ReservaCancha.objects.create(reserva=reserva, cancha_id=cancha_id)
        return reserva

    def _hora(self, response, hora_texto):
        return next(h for h in response.data['horas'] if h['hora'] == hora_texto)

    def test_sin_fecha_devuelve_400(self):
        response = self.client.get('/api/publico/disponibilidad/')
        self.assertEqual(response.status_code, 400)

    def test_fecha_malformada_devuelve_400(self):
        response = self.client.get('/api/publico/disponibilidad/', {'fecha': 'no-es-fecha'})
        self.assertEqual(response.status_code, 400)

    def test_no_requiere_login(self):
        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})
        self.assertEqual(response.status_code, 200)

    def test_dia_sin_reservas_todo_libre(self):
        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})
        hora_10 = self._hora(response, '10:00')
        self.assertEqual(hora_10['canchas']['1']['estado'], 'libre')
        self.assertEqual(hora_10['campo_completo']['estado'], 'libre')

    def test_cliente_casual_no_expone_nombre(self):
        cancha = Cancha.objects.get(numero=1)
        self._crear_reserva([cancha.id], cliente='Juan Perez')

        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})

        hora_10 = self._hora(response, '10:00')
        self.assertEqual(hora_10['canchas']['1']['estado'], 'ocupado')
        self.assertIsNone(hora_10['canchas']['1']['academia'])

    def test_academia_con_permiso_muestra_nombre(self):
        academia = Academia.objects.create(
            nombre='Talentos FC', horario_uso='Martes y jueves', permiso_mostrar=True,
        )
        cancha = Cancha.objects.get(numero=2)
        self._crear_reserva([cancha.id], cliente='Talentos FC', academia=academia)

        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})

        hora_10 = self._hora(response, '10:00')
        self.assertEqual(hora_10['canchas']['2']['academia'], 'Talentos FC')

    def test_academia_sin_permiso_no_muestra_nombre(self):
        academia = Academia.objects.create(
            nombre='Potrillos', horario_uso='Lunes', permiso_mostrar=False,
        )
        cancha = Cancha.objects.get(numero=3)
        self._crear_reserva([cancha.id], cliente='Potrillos', academia=academia)

        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})

        hora_10 = self._hora(response, '10:00')
        self.assertEqual(hora_10['canchas']['3']['estado'], 'ocupado')
        self.assertIsNone(hora_10['canchas']['3']['academia'])

    def test_campo_completo_marca_las_4_canchas_y_campo_completo(self):
        ids = list(Cancha.objects.values_list('id', flat=True))
        self._crear_reserva(ids, modalidad=Modalidad.COMPLETO, cliente='Cumpleanos')

        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})

        hora_10 = self._hora(response, '10:00')
        for numero in ['1', '2', '3', '4']:
            self.assertEqual(hora_10['canchas'][numero]['estado'], 'ocupado')
        self.assertEqual(hora_10['campo_completo']['estado'], 'ocupado')

    def test_reserva_cancelada_no_cuenta_como_ocupada(self):
        cancha = Cancha.objects.get(numero=1)
        self._crear_reserva([cancha.id], cliente='Cancelado', estado=Reserva.Estado.CANCELADA)

        response = self.client.get('/api/publico/disponibilidad/', {'fecha': '2026-08-24'})

        hora_10 = self._hora(response, '10:00')
        self.assertEqual(hora_10['canchas']['1']['estado'], 'libre')
