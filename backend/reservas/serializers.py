from rest_framework import serializers

from .models import Cancha, Tarifa


class CanchaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cancha
        fields = ['id', 'numero', 'activa']


class TarifaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tarifa
        fields = ['id', 'modalidad', 'hora_inicio', 'hora_fin', 'precio_por_hora']
