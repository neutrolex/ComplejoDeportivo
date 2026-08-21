from datetime import time

from django.test import TestCase

from reservas.models import Academia, Cancha, Modalidad, Reserva, ReservaCancha
from reservas.servicios import canchas_ocupadas, horas_operativas, nombre_academia_visible, obtener_tarifa
from usuarios.models import UsuarioInterno


class ObtenerTarifaTest(TestCase):
    def test_encuentra_la_franja_de_la_manana(self):
        tarifa = obtener_tarifa(Modalidad.INDIVIDUAL, time(10, 0))
        self.assertEqual(str(tarifa.precio_por_hora), '50.00')

    def test_encuentra_la_franja_nocturna_que_termina_a_medianoche(self):
        tarifa = obtener_tarifa(Modalidad.INDIVIDUAL, time(23, 0))
        self.assertEqual(str(tarifa.precio_por_hora), '70.00')

    def test_devuelve_none_fuera_de_horario(self):
        tarifa = obtener_tarifa(Modalidad.INDIVIDUAL, time(3, 0))
        self.assertIsNone(tarifa)


class CanchasOcupadasTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.cancha_1 = Cancha.objects.get(numero=1)
        self.cancha_2 = Cancha.objects.get(numero=2)
        self.cancha_3 = Cancha.objects.get(numero=3)
        self.reserva = Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre='Juan',
            fecha='2026-08-20',
            hora_inicio=time(18, 0),
            hora_fin=time(19, 0),
            precio_total='70.00',
            asignada_por=self.usuario,
        )
        ReservaCancha.objects.create(reserva=self.reserva, cancha=self.cancha_2)

    def test_detecta_cancha_ocupada(self):
        ids = [self.cancha_1.id, self.cancha_2.id, self.cancha_3.id]
        ocupadas = canchas_ocupadas('2026-08-20', time(18, 0), ids)
        self.assertEqual(ocupadas, {self.cancha_2.id})

    def test_reserva_cancelada_no_cuenta_como_ocupada(self):
        self.reserva.estado = Reserva.Estado.CANCELADA
        self.reserva.save(update_fields=['estado'])
        ids = [self.cancha_1.id, self.cancha_2.id, self.cancha_3.id]
        ocupadas = canchas_ocupadas('2026-08-20', time(18, 0), ids)
        self.assertEqual(ocupadas, set())


class HorasOperativasTest(TestCase):
    def test_va_de_8_a_23(self):
        self.assertEqual(horas_operativas(), list(range(8, 24)))


class NombreAcademiaVisibleTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )

    def _crear_reserva(self, academia=None):
        return Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre='Cliente',
            fecha='2026-08-20',
            hora_inicio=time(10, 0),
            hora_fin=time(11, 0),
            precio_total='50.00',
            academia=academia,
            asignada_por=self.usuario,
        )

    def test_sin_academia_devuelve_none(self):
        reserva = self._crear_reserva()
        self.assertIsNone(nombre_academia_visible(reserva))

    def test_academia_con_permiso_devuelve_su_nombre(self):
        academia = Academia.objects.create(
            nombre='Talentos FC', horario_uso='Martes', permiso_mostrar=True,
        )
        reserva = self._crear_reserva(academia=academia)
        self.assertEqual(nombre_academia_visible(reserva), 'Talentos FC')

    def test_academia_sin_permiso_devuelve_none(self):
        academia = Academia.objects.create(
            nombre='Potrillos', horario_uso='Lunes', permiso_mostrar=False,
        )
        reserva = self._crear_reserva(academia=academia)
        self.assertIsNone(nombre_academia_visible(reserva))
