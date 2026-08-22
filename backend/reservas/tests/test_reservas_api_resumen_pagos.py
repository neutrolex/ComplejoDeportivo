from datetime import time

from rest_framework.test import APIClient, APITestCase

from reservas.models import ComentarioDia, Modalidad, Pago, Reserva
from usuarios.models import UsuarioInterno


class ResumenPagosApiTest(APITestCase):
    def setUp(self):
        self.usuario = UsuarioInterno.objects.create_user(
            usuario='ana', password='clave123', nombre='Ana',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

    def _crear_reserva(self, cliente, fecha='2026-08-20', estado=Reserva.Estado.CONFIRMADA):
        return Reserva.objects.create(
            modalidad=Modalidad.INDIVIDUAL,
            cliente_nombre=cliente,
            fecha=fecha,
            hora_inicio=time(10, 0),
            hora_fin=time(11, 0),
            precio_total='50.00',
            estado=estado,
            asignada_por=self.usuario,
        )

    def _crear_pago(self, reserva, monto, metodo, tipo='saldo', fecha_pago='2026-08-20'):
        pago = Pago.objects.create(
            reserva=reserva, tipo=tipo, monto=monto, metodo=metodo,
            registrado_por=self.usuario,
        )
        # fecha_hora tiene auto_now_add=True: Django la pisa con "ahora" al
        # crear. Para poder probar el agrupamiento por fecha de pago, la
        # forzamos con un update() directo (no dispara auto_now_add,
        # a diferencia de save()).
        Pago.objects.filter(id=pago.id).update(fecha_hora=f'{fecha_pago}T15:00:00-05:00')
        pago.refresh_from_db()
        return pago

    def test_sin_fecha_devuelve_400(self):
        response = self.client.get('/api/reservas/resumen-pagos/')
        self.assertEqual(response.status_code, 400)

    def test_fecha_malformada_devuelve_400(self):
        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': 'not-a-date'})
        self.assertEqual(response.status_code, 400)

    def test_sin_pagos_devuelve_totales_en_0_00(self):
        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-20'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_efectivo'], '0.00')
        self.assertEqual(response.data['total_yape'], '0.00')
        self.assertEqual(response.data['total_general'], '0.00')

    def test_suma_efectivo_yape_y_general(self):
        r1 = self._crear_reserva('Juan')
        self._crear_pago(r1, '50.00', 'efectivo')
        r2 = self._crear_reserva('Maria')
        self._crear_pago(r2, '30.00', 'yape', tipo='adelanto')

        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-20'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_efectivo'], '50.00')
        self.assertEqual(response.data['total_yape'], '30.00')
        self.assertEqual(response.data['total_general'], '80.00')

    def test_incluye_pagos_de_reservas_canceladas(self):
        r1 = self._crear_reserva('Juan', estado=Reserva.Estado.CANCELADA)
        self._crear_pago(r1, '30.00', 'yape', tipo='adelanto')

        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-20'})

        self.assertEqual(response.data['total_yape'], '30.00')

    def test_agrupa_por_fecha_del_pago_no_por_fecha_de_la_reserva(self):
        # Un adelanto cobrado HOY (2026-08-20) para una reserva del sabado
        # (2026-08-22) debe contar en el total de HOY, no en el del sabado
        # -- es la plata que entro fisicamente a la caja hoy.
        reserva_del_sabado = self._crear_reserva('Cliente Sabado', fecha='2026-08-22')
        self._crear_pago(reserva_del_sabado, '40.00', 'efectivo', tipo='adelanto', fecha_pago='2026-08-20')

        total_hoy = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-20'})
        total_sabado = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-22'})

        self.assertEqual(total_hoy.data['total_efectivo'], '40.00')
        self.assertEqual(total_sabado.data['total_efectivo'], '0.00')

    def test_suma_tambien_los_comentarios_del_dia(self):
        ComentarioDia.objects.create(
            fecha='2026-08-20', texto='Venta suelta', monto_efectivo='15.00', creado_por=self.usuario,
        )

        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-20'})

        self.assertEqual(response.data['total_efectivo'], '15.00')
        self.assertEqual(response.data['total_general'], '15.00')

    def test_no_suma_comentarios_de_otro_dia(self):
        ComentarioDia.objects.create(
            fecha='2026-08-21', texto='Otro dia', monto_efectivo='15.00', creado_por=self.usuario,
        )

        response = self.client.get('/api/reservas/resumen-pagos/', {'fecha': '2026-08-20'})

        self.assertEqual(response.data['total_efectivo'], '0.00')
