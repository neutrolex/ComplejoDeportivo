from datetime import date, time
from decimal import Decimal

from django.test import TestCase

from reservas.models import Academia, Cancha, ComentarioDia, Modalidad, Pago, Reserva, ReservaCancha
from reservas.servicios import (
    canchas_ocupadas,
    guardar_pago,
    horas_operativas,
    nombre_academia_visible,
    obtener_tarifa,
    resumen_financiero_dashboard,
)
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


class ResumenFinancieroDashboardTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.hoy = date(2026, 8, 22)  # sabado

    def _crear_reserva(self, cancha_ids, modalidad=Modalidad.INDIVIDUAL, cliente='Cliente'):
        reserva = Reserva.objects.create(
            modalidad=modalidad, cliente_nombre=cliente, fecha='2026-08-22',
            hora_inicio=time(10, 0), hora_fin=time(11, 0), precio_total='50.00',
            asignada_por=self.usuario,
        )
        for cancha_id in cancha_ids:
            ReservaCancha.objects.create(reserva=reserva, cancha_id=cancha_id)
        return reserva

    def _crear_pago(self, reserva, monto, metodo, fecha_pago):
        pago = Pago.objects.create(
            reserva=reserva, tipo='saldo', monto=monto, metodo=metodo,
            registrado_por=self.usuario,
        )
        # fecha_hora tiene auto_now_add=True: se fuerza con update() (no
        # dispara auto_now_add, a diferencia de save()) para poder testear
        # los distintos rangos de fecha.
        Pago.objects.filter(id=pago.id).update(fecha_hora=f'{fecha_pago}T15:00:00-05:00')
        pago.refresh_from_db()
        return pago

    def test_hoy_suma_solo_pagos_de_hoy(self):
        c1 = Cancha.objects.get(numero=1)
        r1 = self._crear_reserva([c1.id])
        self._crear_pago(r1, '30.00', 'efectivo', '2026-08-22')
        self._crear_pago(r1, '20.00', 'yape', '2026-08-21')

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['hoy']['monto'], '30.00')
        self.assertEqual(resumen['hoy']['reservas'], 1)

    def test_ayer_suma_solo_pagos_de_ayer(self):
        c1 = Cancha.objects.get(numero=1)
        r1 = self._crear_reserva([c1.id])
        self._crear_pago(r1, '40.00', 'efectivo', '2026-08-21')

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['ayer']['monto'], '40.00')
        self.assertEqual(resumen['ayer']['reservas'], 1)

    def test_esta_semana_va_de_lunes_a_hoy(self):
        c1 = Cancha.objects.get(numero=1)
        r1 = self._crear_reserva([c1.id])
        self._crear_pago(r1, '10.00', 'efectivo', '2026-08-17')
        r2 = self._crear_reserva([c1.id])
        self._crear_pago(r2, '5.00', 'efectivo', '2026-08-16')

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['esta_semana']['monto'], '10.00')
        self.assertEqual(resumen['esta_semana']['reservas'], 1)

    def test_este_mes_va_del_primero_a_hoy(self):
        c1 = Cancha.objects.get(numero=1)
        r1 = self._crear_reserva([c1.id])
        self._crear_pago(r1, '15.00', 'efectivo', '2026-08-01')
        r2 = self._crear_reserva([c1.id])
        self._crear_pago(r2, '5.00', 'efectivo', '2026-07-31')

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['este_mes']['monto'], '15.00')
        self.assertEqual(resumen['este_mes']['reservas'], 1)

    def test_reservas_cuenta_distintas_no_pagos(self):
        c1 = Cancha.objects.get(numero=1)
        r1 = self._crear_reserva([c1.id])
        self._crear_pago(r1, '30.00', 'efectivo', '2026-08-22')
        self._crear_pago(r1, '20.00', 'yape', '2026-08-22')

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['hoy']['monto'], '50.00')
        self.assertEqual(resumen['hoy']['reservas'], 1)

    def test_incluye_pagos_de_reservas_canceladas(self):
        c1 = Cancha.objects.get(numero=1)
        r1 = self._crear_reserva([c1.id])
        r1.estado = Reserva.Estado.CANCELADA
        r1.save(update_fields=['estado'])
        self._crear_pago(r1, '30.00', 'efectivo', '2026-08-22')

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['hoy']['monto'], '30.00')

    def test_totales_30_dias_separa_yape_y_efectivo(self):
        c1 = Cancha.objects.get(numero=1)
        r1 = self._crear_reserva([c1.id])
        self._crear_pago(r1, '30.00', 'efectivo', '2026-08-22')
        self._crear_pago(r1, '20.00', 'yape', '2026-07-25')
        self._crear_pago(r1, '99.00', 'yape', '2026-07-01')

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['total_efectivo_30_dias'], '30.00')
        self.assertEqual(resumen['total_yape_30_dias'], '20.00')

    def test_ingresos_diarios_devuelve_30_dias_en_orden_con_ceros(self):
        c1 = Cancha.objects.get(numero=1)
        r1 = self._crear_reserva([c1.id])
        self._crear_pago(r1, '10.00', 'yape', '2026-08-22')

        resumen = resumen_financiero_dashboard(self.hoy)
        dias = resumen['ingresos_diarios_30_dias']

        self.assertEqual(len(dias), 30)
        self.assertEqual(dias[0]['fecha'], '2026-07-24')
        self.assertEqual(dias[-1]['fecha'], '2026-08-22')
        self.assertEqual(dias[-1]['yape'], '10.00')
        self.assertEqual(dias[-1]['efectivo'], '0.00')
        self.assertEqual(dias[0]['yape'], '0.00')

    def test_ingresos_por_cancha_reserva_individual(self):
        c2 = Cancha.objects.get(numero=2)
        r1 = self._crear_reserva([c2.id])
        self._crear_pago(r1, '50.00', 'efectivo', '2026-08-22')

        resumen = resumen_financiero_dashboard(self.hoy)
        por_cancha = {fila['cancha']: fila['monto'] for fila in resumen['ingresos_por_cancha_30_dias']}

        self.assertEqual(por_cancha['Cancha 2'], '50.00')
        self.assertEqual(por_cancha['Cancha 1'], '0.00')
        self.assertEqual(por_cancha['Campo completo'], '0.00')

    def test_ingresos_por_cancha_completo_va_junto_no_a_las_4_canchas(self):
        ids = list(Cancha.objects.values_list('id', flat=True))
        r1 = self._crear_reserva(ids, modalidad=Modalidad.COMPLETO)
        self._crear_pago(r1, '160.00', 'yape', '2026-08-22')

        resumen = resumen_financiero_dashboard(self.hoy)
        por_cancha = {fila['cancha']: fila['monto'] for fila in resumen['ingresos_por_cancha_30_dias']}

        self.assertEqual(por_cancha['Campo completo'], '160.00')
        self.assertEqual(por_cancha['Cancha 1'], '0.00')
        self.assertEqual(por_cancha['Cancha 2'], '0.00')
        self.assertEqual(por_cancha['Cancha 3'], '0.00')
        self.assertEqual(por_cancha['Cancha 4'], '0.00')

    def test_hoy_suma_tambien_comentarios_del_dia(self):
        ComentarioDia.objects.create(
            fecha=self.hoy, texto='Venta suelta', monto_yape='25.00', creado_por=self.usuario,
        )

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['hoy']['monto'], '25.00')
        self.assertEqual(resumen['hoy']['reservas'], 0)

    def test_comentario_de_otro_dia_no_afecta_hoy(self):
        ComentarioDia.objects.create(
            fecha='2026-08-21', texto='Ayer', monto_efectivo='10.00', creado_por=self.usuario,
        )

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['hoy']['monto'], '0.00')
        self.assertEqual(resumen['ayer']['monto'], '10.00')

    def test_ingresos_diarios_incluye_comentarios(self):
        ComentarioDia.objects.create(
            fecha=self.hoy, texto='Venta suelta', monto_efectivo='12.00', creado_por=self.usuario,
        )

        resumen = resumen_financiero_dashboard(self.hoy)
        dias = resumen['ingresos_diarios_30_dias']

        self.assertEqual(dias[-1]['efectivo'], '12.00')

    def test_totales_30_dias_incluyen_comentarios(self):
        ComentarioDia.objects.create(
            fecha=self.hoy, texto='Venta suelta', monto_yape='8.00', creado_por=self.usuario,
        )

        resumen = resumen_financiero_dashboard(self.hoy)

        self.assertEqual(resumen['total_yape_30_dias'], '8.00')

    def test_ingresos_por_cancha_no_incluye_comentarios(self):
        ComentarioDia.objects.create(
            fecha=self.hoy, texto='Venta suelta', monto_efectivo='99.00', creado_por=self.usuario,
        )

        resumen = resumen_financiero_dashboard(self.hoy)
        por_cancha = {fila['cancha']: fila['monto'] for fila in resumen['ingresos_por_cancha_30_dias']}

        self.assertEqual(por_cancha['Cancha 1'], '0.00')
        self.assertEqual(por_cancha['Campo completo'], '0.00')


class GuardarPagoTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.reserva = Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL, cliente_nombre='Juan', fecha='2026-08-20',
            hora_inicio=time(10, 0), hora_fin=time(11, 0), precio_total='50.00',
            asignada_por=self.usuario,
        )

    def test_crea_pago_nuevo(self):
        pago = guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('50.00'), self.usuario)
        self.assertEqual(pago.monto, Decimal('50.00'))
        self.assertEqual(pago.tipo, Pago.Tipo.SALDO)
        self.assertEqual(pago.registrado_por, self.usuario)

    def test_actualiza_pago_existente_sin_duplicar(self):
        guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('50.00'), self.usuario)
        guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('70.00'), self.usuario)

        self.assertEqual(self.reserva.pagos.filter(metodo=Pago.Metodo.EFECTIVO).count(), 1)
        self.assertEqual(self.reserva.pagos.get(metodo=Pago.Metodo.EFECTIVO).monto, Decimal('70.00'))

    def test_yape_y_efectivo_son_independientes(self):
        guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('30.00'), self.usuario)
        guardar_pago(self.reserva, Pago.Metodo.YAPE, Decimal('20.00'), self.usuario)

        self.assertEqual(self.reserva.pagos.count(), 2)

    def test_monto_cero_borra_pago_existente(self):
        guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('50.00'), self.usuario)
        resultado = guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('0.00'), self.usuario)

        self.assertIsNone(resultado)
        self.assertEqual(self.reserva.pagos.filter(metodo=Pago.Metodo.EFECTIVO).count(), 0)

    def test_monto_cero_sin_pago_previo_no_hace_nada(self):
        resultado = guardar_pago(self.reserva, Pago.Metodo.EFECTIVO, Decimal('0.00'), self.usuario)

        self.assertIsNone(resultado)
        self.assertEqual(self.reserva.pagos.count(), 0)
