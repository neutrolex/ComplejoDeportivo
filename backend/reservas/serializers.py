from rest_framework import serializers

from .models import Cancha, Pago, Reserva, Tarifa


class CanchaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cancha
        fields = ['id', 'numero', 'activa']


class TarifaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tarifa
        fields = ['id', 'modalidad', 'hora_inicio', 'hora_fin', 'precio_por_hora']


class PagoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pago
        fields = ['id', 'tipo', 'monto', 'metodo', 'fecha_hora']
        read_only_fields = ['id', 'fecha_hora']


class ReservaSerializer(serializers.ModelSerializer):
    canchas = serializers.SerializerMethodField()
    pagos = PagoSerializer(many=True, read_only=True)

    class Meta:
        model = Reserva
        fields = [
            'id', 'modalidad', 'cliente_nombre', 'fecha', 'hora_inicio',
            'hora_fin', 'estado', 'precio_total', 'canchas', 'pagos',
        ]

    def get_canchas(self, reserva):
        return list(reserva.canchas_asignadas.values_list('cancha_id', flat=True))
