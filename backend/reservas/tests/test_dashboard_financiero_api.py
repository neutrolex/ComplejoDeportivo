from rest_framework.test import APIClient, APITestCase

from usuarios.models import UsuarioInterno


class DashboardFinancieroApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()

    def test_sin_login_devuelve_401(self):
        response = self.client.get('/api/reservas/dashboard-financiero/')
        self.assertEqual(response.status_code, 401)

    def test_con_login_devuelve_las_claves_esperadas(self):
        self.client.force_authenticate(user=self.usuario)

        response = self.client.get('/api/reservas/dashboard-financiero/')

        self.assertEqual(response.status_code, 200)
        for clave in [
            'hoy', 'ayer', 'esta_semana', 'este_mes',
            'total_yape_30_dias', 'total_efectivo_30_dias',
            'ingresos_diarios_30_dias', 'ingresos_por_cancha_30_dias',
        ]:
            self.assertIn(clave, response.data)
        self.assertEqual(response.data['hoy'], {'monto': '0.00', 'reservas': 0})
        self.assertEqual(len(response.data['ingresos_diarios_30_dias']), 30)
        self.assertEqual(len(response.data['ingresos_por_cancha_30_dias']), 5)
