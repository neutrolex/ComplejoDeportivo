from rest_framework.test import APIClient, APITestCase

from reservas.models import ObservacionDia
from usuarios.models import UsuarioInterno


class ObservacionDiaApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def test_get_sin_observacion_devuelve_texto_vacio(self):
        response = self.client.get('/api/observaciones/2026-08-20/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['texto'], '')

    def test_get_fecha_malformada_devuelve_400(self):
        response = self.client.get('/api/observaciones/not-a-date/')
        self.assertEqual(response.status_code, 400)

    def test_put_fecha_malformada_devuelve_400(self):
        response = self.client.put(
            '/api/observaciones/not-a-date/', {'texto': 'x'}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_put_crea_y_luego_actualiza_la_observacion(self):
        primera = self.client.put(
            '/api/observaciones/2026-08-20/', {'texto': 'Talentos debe 515.00'}, format='json',
        )
        self.assertEqual(primera.status_code, 200)

        segunda = self.client.put(
            '/api/observaciones/2026-08-20/', {'texto': 'Talentos debe 600.00'}, format='json',
        )
        self.assertEqual(segunda.status_code, 200)

        respuesta = self.client.get('/api/observaciones/2026-08-20/')
        self.assertEqual(respuesta.data['texto'], 'Talentos debe 600.00')
        self.assertEqual(ObservacionDia.objects.count(), 1)
