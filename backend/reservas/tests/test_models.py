from datetime import time

from django.test import TestCase

from reservas.models import Academia, Cancha, Modalidad, ObservacionDia, Reserva
from usuarios.models import UsuarioInterno


class ObservacionDiaTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )

    def test_update_or_create_hace_upsert_por_fecha(self):
        ObservacionDia.objects.update_or_create(
            fecha='2026-08-20',
            defaults={'texto': 'Talentos debe 515.00', 'actualizado_por': self.usuario},
        )
        ObservacionDia.objects.update_or_create(
            fecha='2026-08-20',
            defaults={'texto': 'Talentos debe 600.00', 'actualizado_por': self.usuario},
        )

        self.assertEqual(ObservacionDia.objects.count(), 1)
        observacion = ObservacionDia.objects.get(fecha='2026-08-20')
        self.assertEqual(observacion.texto, 'Talentos debe 600.00')


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
        academia = Academia.objects.create(
            nombre='Talentos FC', horario_uso='Martes y jueves', permiso_mostrar=True,
        )
        reserva = self._crear_reserva(academia=academia)
        self.assertEqual(reserva.academia_id, academia.id)

    def test_borrar_la_academia_no_borra_la_reserva(self):
        academia = Academia.objects.create(
            nombre='Talentos FC', horario_uso='Martes y jueves', permiso_mostrar=True,
        )
        reserva = self._crear_reserva(academia=academia)

        academia.delete()
        reserva.refresh_from_db()

        self.assertIsNone(reserva.academia)
