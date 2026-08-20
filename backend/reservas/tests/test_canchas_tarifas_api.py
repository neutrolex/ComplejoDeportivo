from rest_framework.test import APIClient, APITestCase

from usuarios.models import UsuarioInterno


class CanchasTarifasApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()

    def test_sin_login_devuelve_401(self):
        response = self.client.get('/api/canchas/')
        self.assertEqual(response.status_code, 401)

    def test_lista_las_4_canchas(self):
        self.client.force_authenticate(user=self.usuario)
        response = self.client.get('/api/canchas/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 4)

    def test_lista_las_5_tarifas(self):
        self.client.force_authenticate(user=self.usuario)
        response = self.client.get('/api/tarifas/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)
