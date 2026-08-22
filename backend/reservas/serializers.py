from decimal import Decimal

from rest_framework import serializers

from .models import Academia, Cancha, Modalidad, Pago, Reserva, Tarifa


class AcademiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Academia
        fields = ['id', 'nombre']


class CanchaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cancha
        fields = ['id', 'numero', 'activa']


class TarifaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tarifa
        fields = ['id', 'modalidad', 'hora_inicio', 'hora_fin', 'precio_por_hora']


class PagoSerializer(serializers.ModelSerializer):
    monto = serializers.DecimalField(max_digits=7, decimal_places=2, min_value=Decimal('0.01'))

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
        return [rc.cancha_id for rc in reserva.canchas_asignadas.all()]


class NuevaReservaSerializer(serializers.Serializer):
    fecha = serializers.DateField()
    hora_inicio = serializers.TimeField()
    # Texto libre a proposito: ademas de nombres de clientes reales, el
    # mismo campo se usa para bloqueos sin cliente (ej. "Mantenimiento")
    # y para academias (ej. "Talentos") - sin campo, estado ni tabla
    # especial para ninguno de esos dos casos.
    cliente_nombre = serializers.CharField(max_length=150)
    academia = serializers.PrimaryKeyRelatedField(
        queryset=Academia.objects.all(), required=False, allow_null=True, default=None,
    )
    yape = serializers.DecimalField(
        max_digits=7, decimal_places=2, required=False, default=Decimal('0.00'), min_value=Decimal('0.00'),
    )
    efectivo = serializers.DecimalField(
        max_digits=7, decimal_places=2, required=False, default=Decimal('0.00'), min_value=Decimal('0.00'),
    )
    modalidad = serializers.ChoiceField(choices=Modalidad.choices)
    canchas = serializers.PrimaryKeyRelatedField(
        queryset=Cancha.objects.filter(activa=True), many=True,
    )

    def validate_canchas(self, canchas):
        if len(canchas) != len(set(c.id for c in canchas)):
            raise serializers.ValidationError('No se puede repetir la misma cancha.')
        if not (1 <= len(canchas) <= 4):
            raise serializers.ValidationError('Debe haber entre 1 y 4 canchas.')
        return canchas

    def validate(self, datos):
        cantidad = len(datos['canchas'])
        if datos['modalidad'] == Modalidad.INDIVIDUAL and cantidad != 1:
            raise serializers.ValidationError(
                'Una reserva individual debe tener exactamente 1 cancha.'
            )
        if datos['modalidad'] == Modalidad.COMPLETO and cantidad != 4:
            raise serializers.ValidationError(
                'Una reserva de campo completo debe tener exactamente 4 canchas.'
            )
        return datos
