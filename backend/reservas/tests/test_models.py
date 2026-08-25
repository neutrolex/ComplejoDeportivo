from datetime import time

from django.test import TestCase

from reservas.models import Academia, AcademiaHorario, Cancha, ComentarioDia, Modalidad, Reserva
from usuarios.models import UsuarioInterno


class ComentarioDiaTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )

    def test_crea_comentario_con_montos_por_defecto_en_cero(self):
        comentario = ComentarioDia.objects.create(
            fecha='2026-08-20', texto='Nota sin plata', creado_por=self.usuario,
        )
        self.assertEqual(str(comentario.monto_yape), '0.00')
        self.assertEqual(str(comentario.monto_efectivo), '0.00')

    def test_permite_varios_comentarios_en_el_mismo_dia(self):
        ComentarioDia.objects.create(fecha='2026-08-20', texto='Primero', creado_por=self.usuario)
        ComentarioDia.objects.create(fecha='2026-08-20', texto='Segundo', creado_por=self.usuario)

        self.assertEqual(ComentarioDia.objects.filter(fecha='2026-08-20').count(), 2)

    def test_ordena_del_mas_reciente_al_mas_antiguo(self):
        primero = ComentarioDia.objects.create(fecha='2026-08-20', texto='Primero', creado_por=self.usuario)
        segundo = ComentarioDia.objects.create(fecha='2026-08-20', texto='Segundo', creado_por=self.usuario)

        ids_en_orden = list(ComentarioDia.objects.values_list('id', flat=True))
        self.assertEqual(ids_en_orden, [segundo.id, primero.id])


class ReservaAcademiaTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )

    def _crear_reserva(self, academia=None):
        return Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre='Juan',
            fecha='2026-08-20',
            hora_inicio=time(10, 0),
            hora_fin=time(11, 0),
            precio_total='50.00',
            academia=academia,
            asignada_por=self.usuario,
        )

    def test_reserva_sin_academia_queda_en_none_por_defecto(self):
        reserva = self._crear_reserva()
        self.assertIsNone(reserva.academia)

    def test_reserva_se_puede_vincular_a_una_academia(self):
        academia = Academia.objects.create(nombre='Talentos FC', permiso_mostrar=True)
        reserva = self._crear_reserva(academia=academia)
        self.assertEqual(reserva.academia_id, academia.id)

    def test_borrar_la_academia_no_borra_la_reserva(self):
        academia = Academia.objects.create(nombre='Talentos FC', permiso_mostrar=True)
        reserva = self._crear_reserva(academia=academia)

        academia.delete()
        reserva.refresh_from_db()

        self.assertIsNone(reserva.academia)


class AcademiaHorarioTest(TestCase):
    def setUp(self):
        self.academia = Academia.objects.create(nombre='Talentos FC')
        self.cancha_2 = Cancha.objects.get(numero=2)
        self.cancha_3 = Cancha.objects.get(numero=3)

    def test_color_por_defecto(self):
        self.assertEqual(self.academia.color, '#7c3aed')

    def test_crea_horario_con_varias_canchas(self):
        horario = AcademiaHorario.objects.create(
            academia=self.academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(21, 0), hora_fin=time(22, 0),
        )
        horario.canchas.set([self.cancha_2, self.cancha_3])

        self.assertEqual(self.academia.horarios.count(), 1)
        self.assertEqual(set(horario.canchas.values_list('numero', flat=True)), {2, 3})

    def test_borrar_academia_borra_sus_horarios(self):
        AcademiaHorario.objects.create(
            academia=self.academia, dia_semana=AcademiaHorario.Dia.LUNES,
            hora_inicio=time(21, 0), hora_fin=time(22, 0),
        )
        self.academia.delete()
        self.assertEqual(AcademiaHorario.objects.count(), 0)
