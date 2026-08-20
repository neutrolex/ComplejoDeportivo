from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Modalidad(models.TextChoices):
    """Compartida entre Tarifa y Reserva: una reserva es de media cancha
    (1 cancha) o de campo completo (las 4 canchas juntas)."""
    INDIVIDUAL = 'individual', 'Media cancha'
    COMPLETO = 'completo', 'Campo completo'


class Cancha(models.Model):
    numero = models.PositiveSmallIntegerField(
        unique=True,
        validators=[MinValueValidator(1), MaxValueValidator(4)],
    )
    activa = models.BooleanField(default=True)

    class Meta:
        db_table = 'canchas'
        ordering = ['numero']

    def __str__(self):
        return f'Cancha {self.numero}'


class Tarifa(models.Model):
    modalidad = models.CharField(max_length=20, choices=Modalidad.choices)
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()
    precio_por_hora = models.DecimalField(max_digits=6, decimal_places=2)

    class Meta:
        db_table = 'tarifas'
        ordering = ['modalidad', 'hora_inicio']

    def __str__(self):
        return f'{self.get_modalidad_display()} {self.hora_inicio}-{self.hora_fin}: S/ {self.precio_por_hora}'


class Reserva(models.Model):
    class Estado(models.TextChoices):
        CONFIRMADA = 'confirmada', 'Confirmada'
        CANCELADA = 'cancelada', 'Cancelada'
        COMPLETADA = 'completada', 'Completada'

    modalidad = models.CharField(max_length=20, choices=Modalidad.choices)
    cliente_nombre = models.CharField(max_length=150)
    fecha = models.DateField()
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.CONFIRMADA)
    precio_total = models.DecimalField(max_digits=7, decimal_places=2)
    creado_en = models.DateTimeField(auto_now_add=True)
    # PROTECT: no se puede borrar un usuario interno que tenga reservas a su
    # nombre (para eso está 'activo=False', que lo desactiva sin perder el
    # historial de quién asignó qué).
    asignada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='reservas_asignadas',
    )

    class Meta:
        db_table = 'reservas'
        ordering = ['-fecha', '-hora_inicio']

    def __str__(self):
        return f'{self.cliente_nombre} - {self.fecha} {self.hora_inicio}'


class ReservaCancha(models.Model):
    """Tabla intermedia: 1 fila si la reserva es individual, 4 filas si es
    campo completo."""
    reserva = models.ForeignKey(Reserva, on_delete=models.CASCADE, related_name='canchas_asignadas')
    cancha = models.ForeignKey(Cancha, on_delete=models.PROTECT, related_name='reservas')

    class Meta:
        db_table = 'reserva_canchas'
        unique_together = ('reserva', 'cancha')

    def __str__(self):
        return f'Reserva {self.reserva_id} - Cancha {self.cancha_id}'


class Pago(models.Model):
    class Tipo(models.TextChoices):
        ADELANTO = 'adelanto', 'Adelanto'
        SALDO = 'saldo', 'Saldo'

    class Metodo(models.TextChoices):
        EFECTIVO = 'efectivo', 'Efectivo'
        YAPE = 'yape', 'Yape'

    # Sin restriccion de unicidad entre reserva+tipo a propósito: un mismo
    # adelanto o saldo se puede dividir en varios pagos (parte Yape, parte
    # efectivo).
    reserva = models.ForeignKey(Reserva, on_delete=models.CASCADE, related_name='pagos')
    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    monto = models.DecimalField(max_digits=7, decimal_places=2)
    metodo = models.CharField(max_length=20, choices=Metodo.choices)
    fecha_hora = models.DateTimeField(auto_now_add=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='pagos_registrados',
    )

    class Meta:
        db_table = 'pagos'
        ordering = ['-fecha_hora']

    def __str__(self):
        return f'Pago {self.get_metodo_display()} S/ {self.monto} (reserva {self.reserva_id})'


class Academia(models.Model):
    nombre = models.CharField(max_length=150)
    horario_uso = models.CharField(max_length=255)
    permiso_mostrar = models.BooleanField(default=True)

    class Meta:
        db_table = 'academias'
        ordering = ['nombre']

    def __str__(self):
        return self.nombre
