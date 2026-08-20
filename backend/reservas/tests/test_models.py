from django.test import TestCase

from reservas.models import ObservacionDia
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
