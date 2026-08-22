from rest_framework.test import APIClient, APITestCase

from reservas.models import ComentarioDia
from usuarios.models import UsuarioInterno


class ComentariosDiaApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def test_get_sin_fecha_devuelve_400(self):
        response = self.client.get('/api/comentarios-dia/')
        self.assertEqual(response.status_code, 400)

    def test_get_fecha_malformada_devuelve_400(self):
        response = self.client.get('/api/comentarios-dia/', {'fecha': 'not-a-date'})
        self.assertEqual(response.status_code, 400)

    def test_get_sin_comentarios_devuelve_lista_vacia(self):
        response = self.client.get('/api/comentarios-dia/', {'fecha': '2026-08-20'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_post_crea_comentario_con_montos(self):
        response = self.client.post('/api/comentarios-dia/', {
            'fecha': '2026-08-20', 'texto': 'Deportivo Lima yapeo 200, debe 500',
            'monto_yape': '200.00', 'monto_efectivo': '0.00',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        comentario = ComentarioDia.objects.get(id=response.data['id'])
        self.assertEqual(comentario.creado_por, self.usuario)
        self.assertEqual(str(comentario.monto_yape), '200.00')

    def test_post_sin_montos_usa_cero_por_defecto(self):
        response = self.client.post('/api/comentarios-dia/', {
            'fecha': '2026-08-20', 'texto': 'Nota sin plata asociada',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['monto_yape'], '0.00')
        self.assertEqual(response.data['monto_efectivo'], '0.00')

    def test_get_filtra_por_fecha_mas_reciente_primero(self):
        self.client.post('/api/comentarios-dia/', {'fecha': '2026-08-20', 'texto': 'Primero'}, format='json')
        self.client.post('/api/comentarios-dia/', {'fecha': '2026-08-20', 'texto': 'Segundo'}, format='json')
        self.client.post('/api/comentarios-dia/', {'fecha': '2026-08-21', 'texto': 'Otro dia'}, format='json')

        response = self.client.get('/api/comentarios-dia/', {'fecha': '2026-08-20'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]['texto'], 'Segundo')
        self.assertEqual(response.data[1]['texto'], 'Primero')

    def test_delete_borra_el_comentario(self):
        creado = self.client.post(
            '/api/comentarios-dia/', {'fecha': '2026-08-20', 'texto': 'Borrame'}, format='json',
        )
        response = self.client.delete(f"/api/comentarios-dia/{creado.data['id']}/")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(ComentarioDia.objects.count(), 0)

    def test_delete_inexistente_devuelve_404(self):
        response = self.client.delete('/api/comentarios-dia/999999/')
        self.assertEqual(response.status_code, 404)

    def test_sin_login_devuelve_401(self):
        client_sin_login = APIClient()
        response = client_sin_login.get('/api/comentarios-dia/', {'fecha': '2026-08-20'})
        self.assertEqual(response.status_code, 401)
