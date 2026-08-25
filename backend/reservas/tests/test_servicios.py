from datetime import date, time, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from reservas.models import Academia, AcademiaHorario, Cancha, ComentarioDia, Modalidad, Pago, Reserva, ReservaCancha
from reservas.servicios import (
    canchas_ocupadas,
    guardar_pago,
    horarios_se_solapan,
    horas_operativas,
    materializar_horarios_academia,
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


class HorariosSeSolapanTest(TestCase):
    def test_mismo_horario_se_solapa(self):
        self.assertTrue(horarios_se_solapan(time(18, 0), time(19, 0), time(18, 0), time(19, 0)))

    def test_uno_empieza_donde_termina_el_otro_no_se_solapan(self):
        self.assertFalse(horarios_se_solapan(time(18, 0), time(19, 0), time(19, 0), time(20, 0)))
        self.assertFalse(horarios_se_solapan(time(19, 0), time(20, 0), time(18, 0), time(19, 0)))

    def test_solapamiento_parcial(self):
        # 18:00-19:30 se solapa con 19:00-20:00 (comparten 19:00-19:30)
        self.assertTrue(horarios_se_solapan(time(18, 0), time(19, 30), time(19, 0), time(20, 0)))

    def test_uno_contiene_al_otro(self):
        self.assertTrue(horarios_se_solapan(time(18, 0), time(21, 0), time(19, 0), time(20, 0)))

    def test_completamente_separados_no_se_solapan(self):
        self.assertFalse(horarios_se_solapan(time(8, 0), time(9, 0), time(20, 0), time(21, 0)))

    def test_hora_fin_medianoche_se_trata_como_fin_del_dia(self):
        # Una reserva 22:00-00:00 (medianoche) debe solaparse con 23:00-00:30
        # del dia siguiente NO -- pero si con cualquier horario de esa misma
        # noche que empiece antes de medianoche, como 23:30-00:00.
        self.assertTrue(horarios_se_solapan(time(22, 0), time(0, 0), time(23, 30), time(0, 0)))
        self.assertFalse(horarios_se_solapan(time(8, 0), time(9, 0), time(22, 0), time(0, 0)))


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
        ocupadas = canchas_ocupadas('2026-08-20', time(18, 0), time(19, 0), ids)
        self.assertEqual(ocupadas, {self.cancha_2.id})

    def test_reserva_cancelada_no_cuenta_como_ocupada(self):
        self.reserva.estado = Reserva.Estado.CANCELADA
        self.reserva.save(update_fields=['estado'])
        ids = [self.cancha_1.id, self.cancha_2.id, self.cancha_3.id]
        ocupadas = canchas_ocupadas('2026-08-20', time(18, 0), time(19, 0), ids)
        self.assertEqual(ocupadas, set())

    def test_detecta_solapamiento_parcial_con_duracion_mayor(self):
        # La reserva existente es 18:00-19:00. Pedir 17:30-18:30 (1h) se
        # solapa (comparten 18:00-18:30) aunque no coincidan los inicios.
        ids = [self.cancha_2.id]
        ocupadas = canchas_ocupadas('2026-08-20', time(17, 30), time(18, 30), ids)
        self.assertEqual(ocupadas, {self.cancha_2.id})

    def test_no_detecta_ocupacion_si_no_se_solapan(self):
        ids = [self.cancha_2.id]
        ocupadas = canchas_ocupadas('2026-08-20', time(19, 0), time(20, 0), ids)
        self.assertEqual(ocupadas, set())

    def test_no_detecta_ocupacion_en_otra_fecha(self):
        ids = [self.cancha_2.id]
        ocupadas = canchas_ocupadas('2026-08-21', time(18, 0), time(19, 0), ids)
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
        academia = Academia.objects.create(nombre='Talentos FC', permiso_mostrar=True)
        reserva = self._crear_reserva(academia=academia)
        self.assertEqual(nombre_academia_visible(reserva), 'Talentos FC')

    def test_academia_sin_permiso_devuelve_none(self):
        academia = Academia.objects.create(nombre='Potrillos', permiso_mostrar=False)
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


class MaterializarHorariosAcademiaTest(TestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.academia = Academia.objects.create(nombre='Talentos FC', color='#059669')
        self.cancha_1 = Cancha.objects.get(numero=1)
        self.cancha_2 = Cancha.objects.get(numero=2)
        # Usar el proximo lunes (o hoy si hoy es lunes)
        hoy = timezone.localdate()
        dias_hasta_lunes = (0 - hoy.weekday()) % 7
        self.lunes = hoy + timedelta(days=dias_hasta_lunes)

    def _crear_horario(self, dia_semana, canchas, hora_inicio=time(18, 0), hora_fin=time(19, 0)):
        horario = AcademiaHorario.objects.create(
            academia=self.academia, dia_semana=dia_semana,
            hora_inicio=hora_inicio, hora_fin=hora_fin,
        )
        horario.canchas.set(canchas)
        return horario

    def test_crea_reserva_individual_para_una_cancha(self):
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1])

        materializar_horarios_academia(self.lunes, self.usuario)

        reserva = Reserva.objects.get(academia=self.academia, fecha=self.lunes)
        self.assertEqual(reserva.modalidad, Modalidad.INDIVIDUAL)
        self.assertEqual(reserva.cliente_nombre, 'Talentos FC')
        self.assertEqual(reserva.hora_inicio, time(18, 0))
        self.assertEqual(reserva.hora_fin, time(19, 0))
        self.assertEqual(reserva.asignada_por, self.usuario)
        self.assertEqual([rc.cancha_id for rc in reserva.canchas_asignadas.all()], [self.cancha_1.id])

    def test_crea_una_reserva_por_cada_cancha_si_no_son_las_4(self):
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1, self.cancha_2])

        materializar_horarios_academia(self.lunes, self.usuario)

        reservas = Reserva.objects.filter(academia=self.academia, fecha=self.lunes)
        self.assertEqual(reservas.count(), 2)
        self.assertTrue(all(r.modalidad == Modalidad.INDIVIDUAL for r in reservas))

    def test_crea_una_sola_reserva_completo_si_son_las_4_canchas(self):
        todas = list(Cancha.objects.all())
        self._crear_horario(AcademiaHorario.Dia.LUNES, todas)

        materializar_horarios_academia(self.lunes, self.usuario)

        reservas = Reserva.objects.filter(academia=self.academia, fecha=self.lunes)
        self.assertEqual(reservas.count(), 1)
        self.assertEqual(reservas.first().modalidad, Modalidad.COMPLETO)
        self.assertEqual(reservas.first().canchas_asignadas.count(), 4)

    def test_precio_total_segun_tarifa_y_duracion(self):
        # Tarifa individual 18:00-00:00 es 70.00/hora (ver seed). 1.5h = 105.00
        self._crear_horario(
            AcademiaHorario.Dia.LUNES, [self.cancha_1],
            hora_inicio=time(18, 0), hora_fin=time(19, 30),
        )

        materializar_horarios_academia(self.lunes, self.usuario)

        reserva = Reserva.objects.get(academia=self.academia, fecha=self.lunes)
        self.assertEqual(reserva.precio_total, Decimal('105.00'))

    def test_no_duplica_si_se_llama_dos_veces(self):
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1])

        materializar_horarios_academia(self.lunes, self.usuario)
        materializar_horarios_academia(self.lunes, self.usuario)

        self.assertEqual(Reserva.objects.filter(academia=self.academia, fecha=self.lunes).count(), 1)

    def test_no_materializa_en_dia_de_la_semana_distinto(self):
        self._crear_horario(AcademiaHorario.Dia.MARTES, [self.cancha_1])

        materializar_horarios_academia(self.lunes, self.usuario)  # self.lunes es Lunes

        self.assertEqual(Reserva.objects.filter(academia=self.academia).count(), 0)

    def test_no_materializa_hacia_el_pasado(self):
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1])
        un_lunes_pasado = date(2020, 1, 6)  # tambien lunes, pero muy en el pasado

        materializar_horarios_academia(un_lunes_pasado, self.usuario)

        self.assertEqual(Reserva.objects.filter(academia=self.academia).count(), 0)

    def test_no_recrea_una_reserva_cancelada(self):
        # Cancelar una ocurrencia puntual es la valvula de escape documentada
        # en el diseno: una reserva cancelada es un "saltar esta vez", no un
        # "nunca existio", asi que la siguiente materializacion no la revive.
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1])
        materializar_horarios_academia(self.lunes, self.usuario)
        reserva = Reserva.objects.get(academia=self.academia, fecha=self.lunes)
        reserva.estado = Reserva.Estado.CANCELADA
        reserva.save(update_fields=['estado'])

        materializar_horarios_academia(self.lunes, self.usuario)

        self.assertEqual(Reserva.objects.filter(academia=self.academia, fecha=self.lunes).count(), 1)
        self.assertEqual(
            Reserva.objects.filter(
                academia=self.academia, fecha=self.lunes,
            ).exclude(estado=Reserva.Estado.CANCELADA).count(),
            0,
        )

    def test_dos_horarios_misma_hora_distintas_canchas_materializan_los_dos(self):
        # La idempotencia es por (academia, fecha, hora, cancha): dos filas de
        # AcademiaHorario a la misma hora pero en canchas distintas son dos
        # ocurrencias distintas, no un duplicado.
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1])
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_2])

        materializar_horarios_academia(self.lunes, self.usuario)

        reservas = Reserva.objects.filter(academia=self.academia, fecha=self.lunes)
        self.assertEqual(reservas.count(), 2)
        canchas = {rc.cancha_id for r in reservas for rc in r.canchas_asignadas.all()}
        self.assertEqual(canchas, {self.cancha_1.id, self.cancha_2.id})

    def test_completa_la_cancha_que_faltaba_cuando_se_libera_el_conflicto(self):
        # Materializacion parcial: la cancha 1 estaba tomada por una reserva
        # manual, asi que solo se creo la de la cancha 2. Al liberarse la
        # cancha 1, la siguiente materializacion debe completarla.
        manual = Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL, cliente_nombre='Cliente manual', fecha=self.lunes,
            hora_inicio=time(18, 0), hora_fin=time(19, 0), precio_total='70.00',
            asignada_por=self.usuario,
        )
        ReservaCancha.objects.create(reserva=manual, cancha=self.cancha_1)
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1, self.cancha_2])

        materializar_horarios_academia(self.lunes, self.usuario)
        self.assertEqual(Reserva.objects.filter(academia=self.academia, fecha=self.lunes).count(), 1)

        manual.estado = Reserva.Estado.CANCELADA
        manual.save(update_fields=['estado'])
        materializar_horarios_academia(self.lunes, self.usuario)

        reservas = Reserva.objects.filter(academia=self.academia, fecha=self.lunes)
        self.assertEqual(reservas.count(), 2)
        canchas = {rc.cancha_id for r in reservas for rc in r.canchas_asignadas.all()}
        self.assertEqual(canchas, {self.cancha_1.id, self.cancha_2.id})

    def test_no_pisa_una_cancha_ya_ocupada(self):
        Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL, cliente_nombre='Cliente manual', fecha=self.lunes,
            hora_inicio=time(18, 0), hora_fin=time(19, 0), precio_total='70.00',
            asignada_por=self.usuario,
        )
        # Sin ReservaCancha para simplificar: se prueba el caso comun de
        # abajo, con la cancha si tomada, que es el que importa de verdad.
        reserva_manual = Reserva.objects.get(cliente_nombre='Cliente manual')
        ReservaCancha.objects.create(reserva=reserva_manual, cancha=self.cancha_1)
        self._crear_horario(AcademiaHorario.Dia.LUNES, [self.cancha_1])

        materializar_horarios_academia(self.lunes, self.usuario)

        self.assertEqual(Reserva.objects.filter(academia=self.academia).count(), 0)
