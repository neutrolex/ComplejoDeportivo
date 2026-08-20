from django.test import TestCase

from reservas.models import Cancha, Modalidad, Tarifa


class DatosSemillaTest(TestCase):
    def test_hay_4_canchas(self):
        self.assertEqual(Cancha.objects.count(), 4)
        numeros = sorted(Cancha.objects.values_list('numero', flat=True))
        self.assertEqual(numeros, [1, 2, 3, 4])

    def test_hay_5_tarifas_con_los_precios_correctos(self):
        self.assertEqual(Tarifa.objects.count(), 5)
        nocturna_individual = Tarifa.objects.get(modalidad=Modalidad.INDIVIDUAL, hora_inicio='18:00')
        self.assertEqual(str(nocturna_individual.precio_por_hora), '70.00')
        diurna_completo = Tarifa.objects.get(modalidad=Modalidad.COMPLETO, hora_inicio='08:00')
        self.assertEqual(str(diurna_completo.precio_por_hora), '160.00')
