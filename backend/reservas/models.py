from decimal import Decimal

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
    # Opcional: solo se completa cuando el personal, al crear la reserva,
    # la vincula a una academia del catalogo (en vez de comparar el texto
    # libre de cliente_nombre contra academias.nombre, que se rompe con
    # cualquier typo). SET_NULL: si se borra la academia, la reserva no
    # se pierde, solo pierde el vinculo.
    academia = models.ForeignKey(
        'Academia', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reservas',
    )
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
    permiso_mostrar = models.BooleanField(default=True)
    color = models.CharField(max_length=7, default='#7c3aed')

    class Meta:
        db_table = 'academias'
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class AcademiaHorario(models.Model):
    class Dia(models.IntegerChoices):
        # Mismo criterio que date.weekday() de Python (Lunes=0), para que
        # la materializacion compare directo sin conversion.
        LUNES = 0, 'Lunes'
        MARTES = 1, 'Martes'
        MIERCOLES = 2, 'Miercoles'
        JUEVES = 3, 'Jueves'
        VIERNES = 4, 'Viernes'
        SABADO = 5, 'Sabado'
        DOMINGO = 6, 'Domingo'

    academia = models.ForeignKey(Academia, on_delete=models.CASCADE, related_name='horarios')
    dia_semana = models.IntegerField(choices=Dia.choices)
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()
    canchas = models.ManyToManyField(Cancha, related_name='horarios_academia')

    class Meta:
        db_table = 'academia_horarios'
        ordering = ['dia_semana', 'hora_inicio']

    def __str__(self):
        return f'{self.academia.nombre} - {self.get_dia_semana_display()} {self.hora_inicio}'


class ComentarioDia(models.Model):
    """Notas del dia, no ligadas a ninguna reserva especifica (ej. ventas
    sueltas, deudas). Puede haber varias por dia, cada una con su propio
    monto opcional en Yape y/o Efectivo -- ver spec seccion 3.2. 'fecha' es
    la fecha del panel que se estaba viendo al crear el comentario, no
    necesariamente 'hoy'."""
    fecha = models.DateField()
    texto = models.CharField(max_length=500)
    monto_yape = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0.00'))
    monto_efectivo = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0.00'))
    creado_en = models.DateTimeField(auto_now_add=True)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='comentarios_dia',
    )

    class Meta:
        db_table = 'comentarios_dia'
        # '-id' desempata cuando dos comentarios se crean tan seguido que
        # 'creado_en' queda igual (pasa en tests, y podria pasar en la app
        # real si dos personas guardan casi al mismo tiempo).
        ordering = ['-creado_en', '-id']

    def __str__(self):
        return f'Comentario {self.fecha}: {self.texto[:40]}'
