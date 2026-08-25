from datetime import time

from rest_framework.test import APIClient, APITestCase

from reservas.models import Academia, AcademiaHorario, Cancha
from usuarios.models import UsuarioInterno


class AcademiasApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def test_sin_login_devuelve_401(self):
        client_sin_login = APIClient()
        response = client_sin_login.get('/api/academias/')
        self.assertEqual(response.status_code, 401)

    def test_lista_las_academias_con_sus_horarios(self):
        academia = Academia.objects.create(nombre='Talentos FC', color='#059669')
        cancha = Cancha.objects.get(numero=2)
        horario = AcademiaHorario.objects.create(
            academia=academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(18, 0), hora_fin=time(19, 0),
        )
        horario.canchas.set([cancha])

        response = self.client.get('/api/academias/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['nombre'], 'Talentos FC')
        self.assertEqual(response.data[0]['color'], '#059669')
        self.assertEqual(len(response.data[0]['horarios']), 1)
        self.assertEqual(response.data[0]['horarios'][0]['canchas'], [cancha.id])

    def test_crea_academia_con_horario_de_varios_dias(self):
        cancha_2 = Cancha.objects.get(numero=2)
        cancha_3 = Cancha.objects.get(numero=3)
        response = self.client.post('/api/academias/', {
            'nombre': 'Talentos FC', 'color': '#7c3aed', 'permiso_mostrar': True,
            'horarios': [
                {'dias': [0, 2, 4], 'hora_inicio': '21:00', 'hora_fin': '22:00', 'canchas': [cancha_2.id, cancha_3.id]},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 201)
        academia = Academia.objects.get(id=response.data['id'])
        self.assertEqual(academia.horarios.count(), 3)
        dias = sorted(academia.horarios.values_list('dia_semana', flat=True))
        self.assertEqual(dias, [0, 2, 4])
        primero = academia.horarios.first()
        self.assertEqual(set(primero.canchas.values_list('id', flat=True)), {cancha_2.id, cancha_3.id})

    def test_crea_academia_sin_horarios(self):
        response = self.client.post('/api/academias/', {'nombre': 'Sin horario aun'}, format='json')
        self.assertEqual(response.status_code, 201)
        academia = Academia.objects.get(id=response.data['id'])
        self.assertEqual(academia.horarios.count(), 0)
        self.assertEqual(academia.color, '#7c3aed')

    def test_editar_reemplaza_los_horarios(self):
        academia = Academia.objects.create(nombre='Talentos FC')
        cancha_1 = Cancha.objects.get(numero=1)
        viejo = AcademiaHorario.objects.create(
            academia=academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(18, 0), hora_fin=time(19, 0),
        )
        viejo.canchas.set([cancha_1])

        cancha_4 = Cancha.objects.get(numero=4)
        response = self.client.patch(f'/api/academias/{academia.id}/', {
            'nombre': 'Talentos FC', 'color': '#7c3aed',
            'horarios': [
                {'dias': [1], 'hora_inicio': '20:00', 'hora_fin': '21:00', 'canchas': [cancha_4.id]},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 200)
        academia.refresh_from_db()
        self.assertEqual(academia.horarios.count(), 1)
        nuevo = academia.horarios.first()
        self.assertEqual(nuevo.dia_semana, 1)
        self.assertEqual(list(nuevo.canchas.values_list('id', flat=True)), [cancha_4.id])

    def test_eliminar_academia(self):
        academia = Academia.objects.create(nombre='Talentos FC')
        response = self.client.delete(f'/api/academias/{academia.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Academia.objects.count(), 0)

    def test_eliminar_academia_inexistente_devuelve_404(self):
        response = self.client.delete('/api/academias/999999/')
        self.assertEqual(response.status_code, 404)

    def test_hora_fin_antes_que_hora_inicio_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/academias/', {
            'nombre': 'Mal horario',
            'horarios': [
                {'dias': [0], 'hora_inicio': '20:00', 'hora_fin': '19:00', 'canchas': [cancha.id]},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_horario_sin_canchas_devuelve_400(self):
        response = self.client.post('/api/academias/', {
            'nombre': 'Sin cancha',
            'horarios': [
                {'dias': [0], 'hora_inicio': '19:00', 'hora_fin': '20:00', 'canchas': []},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 400)
