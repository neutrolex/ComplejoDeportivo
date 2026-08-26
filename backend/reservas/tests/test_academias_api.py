from datetime import time, timedelta

from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from reservas.models import Academia, AcademiaHorario, Cancha, Reserva
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

    def test_editar_y_quitar_un_horario_cancela_solo_sus_reservas_futuras(self):
        academia = Academia.objects.create(nombre='Talentos FC')
        cancha_1 = Cancha.objects.get(numero=1)
        cancha_2 = Cancha.objects.get(numero=2)
        horario_lunes = AcademiaHorario.objects.create(
            academia=academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(18, 0), hora_fin=time(19, 0),
        )
        horario_lunes.canchas.set([cancha_1])
        horario_martes = AcademiaHorario.objects.create(
            academia=academia, dia_semana=AcademiaHorario.Dia.MARTES,
            hora_inicio=time(18, 0), hora_fin=time(19, 0),
        )
        horario_martes.canchas.set([cancha_2])
        hoy = timezone.localdate()
        lunes = hoy + timedelta(days=(0 - hoy.weekday()) % 7)
        martes = lunes + timedelta(days=1)
        # GET /reservas/ es lo que dispara la materializacion perezosa.
        self.client.get(f'/api/reservas/?fecha={lunes}')
        self.client.get(f'/api/reservas/?fecha={martes}')
        reserva_lunes = Reserva.objects.get(academia_horario=horario_lunes)
        reserva_martes = Reserva.objects.get(academia_horario=horario_martes)

        # Se edita la academia quitando el horario del lunes; el del martes
        # queda igual.
        response = self.client.patch(f'/api/academias/{academia.id}/', {
            'nombre': 'Talentos FC', 'color': '#7c3aed',
            'horarios': [
                {'dias': [1], 'hora_inicio': '18:00', 'hora_fin': '19:00', 'canchas': [cancha_2.id]},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 200)
        reserva_lunes.refresh_from_db()
        reserva_martes.refresh_from_db()
        self.assertEqual(reserva_lunes.estado, Reserva.Estado.CANCELADA)
        self.assertEqual(reserva_martes.estado, Reserva.Estado.CONFIRMADA)

    def test_eliminar_academia_cancela_sus_reservas_futuras_pero_no_las_pasadas(self):
        academia = Academia.objects.create(nombre='Talentos FC')
        cancha_1 = Cancha.objects.get(numero=1)
        horario = AcademiaHorario.objects.create(
            academia=academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(18, 0), hora_fin=time(19, 0),
        )
        horario.canchas.set([cancha_1])
        hoy = timezone.localdate()
        lunes = hoy + timedelta(days=(0 - hoy.weekday()) % 7)
        self.client.get(f'/api/reservas/?fecha={lunes}')
        reserva_futura = Reserva.objects.get(academia_horario=horario)
        reserva_pasada = Reserva.objects.create(
            modalidad='individual', cliente_nombre='Talentos FC', fecha='2020-01-06',
            hora_inicio=time(18, 0), hora_fin=time(19, 0), precio_total='70.00',
            academia=academia, academia_horario=horario, asignada_por=self.usuario,
        )

        response = self.client.delete(f'/api/academias/{academia.id}/')

        self.assertEqual(response.status_code, 204)
        reserva_futura.refresh_from_db()
        reserva_pasada.refresh_from_db()
        self.assertEqual(reserva_futura.estado, Reserva.Estado.CANCELADA)
        self.assertEqual(reserva_pasada.estado, Reserva.Estado.CONFIRMADA)
        self.assertIsNone(reserva_futura.academia_id)

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

    def test_horario_fuera_del_horario_de_tarifas_devuelve_400(self):
        # Las tarifas cubren de 08:00 a 00:00. Un horario que empieza a las
        # 03:00 se guardaria sin error pero nunca se materializaria (no hay
        # tarifa), asi que se rechaza al crearlo.
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/academias/', {
            'nombre': 'Madrugada',
            'horarios': [
                {'dias': [0], 'hora_inicio': '03:00', 'hora_fin': '04:00', 'canchas': [cancha.id]},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Academia.objects.count(), 0)

    def test_hora_inicio_igual_a_hora_fin_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/academias/', {
            'nombre': 'Franja vacia',
            'horarios': [
                {'dias': [0], 'hora_inicio': '00:00', 'hora_fin': '00:00', 'canchas': [cancha.id]},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Academia.objects.count(), 0)

    def test_horario_que_termina_a_medianoche_se_acepta(self):
        cancha = Cancha.objects.get(numero=1)
        response = self.client.post('/api/academias/', {
            'nombre': 'Nocturna',
            'horarios': [
                {'dias': [0], 'hora_inicio': '23:00', 'hora_fin': '00:00', 'canchas': [cancha.id]},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 201)

    def test_horario_sin_canchas_devuelve_400(self):
        response = self.client.post('/api/academias/', {
            'nombre': 'Sin cancha',
            'horarios': [
                {'dias': [0], 'hora_inicio': '19:00', 'hora_fin': '20:00', 'canchas': []},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_horario_identico_al_de_otra_academia_en_la_misma_cancha_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        academia_existente = Academia.objects.create(nombre='Arco Sport')
        horario = AcademiaHorario.objects.create(
            academia=academia_existente, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(20, 0), hora_fin=time(21, 0),
        )
        horario.canchas.set([cancha])

        response = self.client.post('/api/academias/', {
            'nombre': 'As FC',
            'horarios': [
                {'dias': [0], 'hora_inicio': '20:00', 'hora_fin': '21:00', 'canchas': [cancha.id]},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('Arco Sport', str(response.data))
        self.assertFalse(Academia.objects.filter(nombre='As FC').exists())

    def test_horario_que_se_solapa_parcialmente_en_la_misma_cancha_devuelve_400(self):
        cancha = Cancha.objects.get(numero=1)
        academia_existente = Academia.objects.create(nombre='Arco Sport')
        horario = AcademiaHorario.objects.create(
            academia=academia_existente, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(20, 0), hora_fin=time(21, 0),
        )
        horario.canchas.set([cancha])

        response = self.client.post('/api/academias/', {
            'nombre': 'As FC',
            'horarios': [
                {'dias': [0], 'hora_inicio': '20:30', 'hora_fin': '21:30', 'canchas': [cancha.id]},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 400)

    def test_mismo_horario_en_otra_cancha_no_es_conflicto(self):
        cancha_1 = Cancha.objects.get(numero=1)
        cancha_2 = Cancha.objects.get(numero=2)
        academia_existente = Academia.objects.create(nombre='Arco Sport')
        horario = AcademiaHorario.objects.create(
            academia=academia_existente, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(20, 0), hora_fin=time(21, 0),
        )
        horario.canchas.set([cancha_1])

        response = self.client.post('/api/academias/', {
            'nombre': 'As FC',
            'horarios': [
                {'dias': [0], 'hora_inicio': '20:00', 'hora_fin': '21:00', 'canchas': [cancha_2.id]},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 201)

    def test_mismo_horario_en_otro_dia_no_es_conflicto(self):
        cancha = Cancha.objects.get(numero=1)
        academia_existente = Academia.objects.create(nombre='Arco Sport')
        horario = AcademiaHorario.objects.create(
            academia=academia_existente, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(20, 0), hora_fin=time(21, 0),
        )
        horario.canchas.set([cancha])

        response = self.client.post('/api/academias/', {
            'nombre': 'As FC',
            'horarios': [
                {'dias': [1], 'hora_inicio': '20:00', 'hora_fin': '21:00', 'canchas': [cancha.id]},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 201)

    def test_editar_una_academia_con_su_propio_horario_sin_cambios_no_es_conflicto_consigo_misma(self):
        cancha = Cancha.objects.get(numero=1)
        academia = Academia.objects.create(nombre='Arco Sport')
        horario = AcademiaHorario.objects.create(
            academia=academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(20, 0), hora_fin=time(21, 0),
        )
        horario.canchas.set([cancha])

        response = self.client.patch(f'/api/academias/{academia.id}/', {
            'nombre': 'Arco Sport', 'color': '#7c3aed',
            'horarios': [
                {'dias': [0], 'hora_inicio': '20:00', 'hora_fin': '21:00', 'canchas': [cancha.id]},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 200)
