from rest_framework.test import APIClient, APITestCase

from reservas.models import Academia
from usuarios.models import UsuarioInterno


class AcademiasApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()

    def test_sin_login_devuelve_401(self):
        response = self.client.get('/api/academias/')
        self.assertEqual(response.status_code, 401)

    def test_lista_las_academias_existentes(self):
        Academia.objects.create(nombre='Talentos FC', horario_uso='Martes', permiso_mostrar=True)
        Academia.objects.create(nombre='Potrillos', horario_uso='Lunes', permiso_mostrar=False)

        self.client.force_authenticate(user=self.usuario)
        response = self.client.get('/api/academias/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        nombres = {a['nombre'] for a in response.data}
        self.assertEqual(nombres, {'Talentos FC', 'Potrillos'})
