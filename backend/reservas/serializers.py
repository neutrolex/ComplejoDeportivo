from decimal import Decimal

from rest_framework import serializers

from .models import Academia, AcademiaHorario, Cancha, ComentarioDia, Modalidad, Pago, Reserva, Tarifa
from .servicios import conflicto_de_horario, obtener_tarifa


class AcademiaResumenSerializer(serializers.ModelSerializer):
    """Version chica de Academia, para anidar en ReservaSerializer sin
    traer todos los horarios en cada reserva."""
    class Meta:
        model = Academia
        fields = ['id', 'nombre', 'color']


class AcademiaHorarioSerializer(serializers.ModelSerializer):
    canchas = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = AcademiaHorario
        fields = ['id', 'dia_semana', 'hora_inicio', 'hora_fin', 'canchas']


class AcademiaSerializer(serializers.ModelSerializer):
    horarios = AcademiaHorarioSerializer(many=True, read_only=True)

    class Meta:
        model = Academia
        fields = ['id', 'nombre', 'color', 'permiso_mostrar', 'horarios']


class HorarioEntradaSerializer(serializers.Serializer):
    dias = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6), allow_empty=False,
    )
    hora_inicio = serializers.TimeField()
    hora_fin = serializers.TimeField()
    canchas = serializers.PrimaryKeyRelatedField(
        queryset=Cancha.objects.filter(activa=True), many=True,
    )

    def validate_canchas(self, canchas):
        if not canchas:
            raise serializers.ValidationError('Debe elegir al menos una cancha.')
        return canchas

    def validate(self, datos):
        # Se chequea la igualdad aparte porque el caso especial de
        # medianoche dejaba pasar hora_inicio == hora_fin == 00:00, que
        # describiria una franja absurda de 24 horas.
        if datos['hora_inicio'] == datos['hora_fin']:
            raise serializers.ValidationError('La hora de fin debe ser posterior a la de inicio.')
        termina_a_medianoche = datos['hora_fin'].hour == 0 and datos['hora_fin'].minute == 0
        if datos['hora_fin'] <= datos['hora_inicio'] and not termina_a_medianoche:
            raise serializers.ValidationError('La hora de fin debe ser posterior a la de inicio.')
        # Sin tarifa que cubra la hora de inicio, la materializacion se
        # saltea el horario en silencio y la academia nunca aparece en la
        # grilla: mejor rechazarlo al guardarlo. Se prueba con INDIVIDUAL
        # porque AcademiaHorario todavia no sabe si terminara siendo
        # completo o individual, y ambas modalidades comparten las mismas
        # franjas horarias (08:00 a 00:00), solo cambia el precio.
        if obtener_tarifa(Modalidad.INDIVIDUAL, datos['hora_inicio']) is None:
            raise serializers.ValidationError(
                'No hay tarifa configurada para esa hora: el horario debe empezar '
                'dentro del horario de atencion (08:00 a 00:00).'
            )
        return datos


class AcademiaEntradaSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=150)
    color = serializers.CharField(max_length=7, required=False, default='#7c3aed')
    permiso_mostrar = serializers.BooleanField(required=False, default=True)
    horarios = HorarioEntradaSerializer(many=True, required=False, default=list)

    def validate(self, datos):
        # La vista pasa el id de la academia que se esta editando por
        # context (None si es una academia nueva) para que sus propios
        # horarios no cuenten como conflicto consigo misma.
        academia_id = self.context.get('academia_id')
        for horario in datos['horarios']:
            cancha_ids = [c.id for c in horario['canchas']]
            for dia in horario['dias']:
                conflicto = conflicto_de_horario(
                    dia, horario['hora_inicio'], horario['hora_fin'], cancha_ids,
                    excluir_academia_id=academia_id,
                )
                if conflicto:
                    dia_nombre = AcademiaHorario.Dia(dia).label
                    inicio = horario['hora_inicio'].strftime('%H:%M')
                    fin = horario['hora_fin'].strftime('%H:%M')
                    raise serializers.ValidationError(
                        f'{dia_nombre} {inicio}–{fin} ya esta ocupado en esa cancha '
                        f'por la academia "{conflicto.nombre}".'
                    )
        return datos


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
    academia = AcademiaResumenSerializer(read_only=True)

    class Meta:
        model = Reserva
        fields = [
            'id', 'modalidad', 'cliente_nombre', 'fecha', 'hora_inicio',
            'hora_fin', 'estado', 'precio_total', 'canchas', 'pagos', 'academia',
            'es_adelanto',
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
    # True solo cuando la reserva nace del flujo "Agregar adelanto" del
    # panel de Observaciones del dia -- ver ReservaViewSet.create().
    es_adelanto = serializers.BooleanField(required=False, default=False)
    yape = serializers.DecimalField(
        max_digits=7, decimal_places=2, required=False, default=Decimal('0.00'), min_value=Decimal('0.00'),
    )
    efectivo = serializers.DecimalField(
        max_digits=7, decimal_places=2, required=False, default=Decimal('0.00'), min_value=Decimal('0.00'),
    )
    # En horas. Solo 1 o 1.5 (una hora o una hora y media).
    duracion = serializers.DecimalField(
        max_digits=3, decimal_places=1, required=False, default=Decimal('1.0'),
        min_value=Decimal('1.0'), max_value=Decimal('1.5'),
    )
    modalidad = serializers.ChoiceField(choices=Modalidad.choices)
    canchas = serializers.PrimaryKeyRelatedField(
        queryset=Cancha.objects.filter(activa=True), many=True,
    )

    def validate_duracion(self, valor):
        if (valor * 2) % 1 != 0:
            raise serializers.ValidationError('La duracion debe ser en incrementos de 30 minutos.')
        return valor

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


class ComentarioDiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComentarioDia
        fields = ['id', 'fecha', 'texto', 'monto_yape', 'monto_efectivo', 'creado_en']
        read_only_fields = ['id', 'creado_en']
