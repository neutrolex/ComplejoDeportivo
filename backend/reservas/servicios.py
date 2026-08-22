from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import TruncDate

from .models import Modalidad, Pago, Reserva, ReservaCancha, Tarifa


def fecha_valida(texto):
    """Devuelve True si texto tiene formato YYYY-MM-DD valido, False si no."""
    try:
        datetime.strptime(texto, '%Y-%m-%d')
        return True
    except (ValueError, TypeError):
        return False


def obtener_tarifa(modalidad, hora):
    """Busca la tarifa que cubre una hora dada, para una modalidad.

    hora_fin=00:00 significa 'medianoche = fin del dia operativo': se
    trata como caso especial porque PostgreSQL no tiene un valor de hora
    para las 24:00, y una comparacion literal (hora < hora_fin) fallaria
    para la franja nocturna (ej. 23:00 no es menor que 00:00).
    """
    for tarifa in Tarifa.objects.filter(modalidad=modalidad):
        termina_a_medianoche = tarifa.hora_fin == time(0, 0)
        cubre_la_hora = tarifa.hora_inicio <= hora and (
            termina_a_medianoche or hora < tarifa.hora_fin
        )
        if cubre_la_hora:
            return tarifa
    return None


def canchas_ocupadas(fecha, hora_inicio, cancha_ids):
    """De la lista cancha_ids, devuelve las que ya tienen una reserva NO
    cancelada para esa fecha y hora_inicio exactas."""
    return set(
        ReservaCancha.objects.filter(
            cancha_id__in=cancha_ids,
            reserva__fecha=fecha,
            reserva__hora_inicio=hora_inicio,
        )
        .exclude(reserva__estado=Reserva.Estado.CANCELADA)
        .values_list('cancha_id', flat=True)
    )


def guardar_pago(reserva, metodo, monto, usuario):
    """Upsert de a lo sumo un Pago por (reserva, metodo). monto<=0 borra el
    pago existente (equivale a 'no pago por este metodo'). Si hubiera mas
    de un Pago legacy del mismo metodo (dato de antes de este cambio),
    actualiza el mas reciente y deja los demas intactos."""
    pago = reserva.pagos.filter(metodo=metodo).order_by('-fecha_hora').first()
    if monto <= 0:
        if pago:
            pago.delete()
        return None
    if pago:
        pago.monto = monto
        pago.tipo = Pago.Tipo.SALDO
        pago.registrado_por = usuario
        pago.save(update_fields=['monto', 'tipo', 'registrado_por'])
        return pago
    return Pago.objects.create(
        reserva=reserva, metodo=metodo, monto=monto, tipo=Pago.Tipo.SALDO,
        registrado_por=usuario,
    )


def horas_operativas():
    """Horas enteras (8 a 23) durante las que el complejo opera, tomando
    como referencia la tarifa mas temprana -- mismo criterio que usa el
    frontend del panel (calcularHoras) para armar la grilla."""
    primera_tarifa = Tarifa.objects.order_by('hora_inicio').first()
    if primera_tarifa is None:
        return []
    return list(range(primera_tarifa.hora_inicio.hour, 24))


def nombre_academia_visible(reserva):
    """Nombre de la academia vinculada a una reserva, solo si esa academia
    tiene permiso de mostrarse publicamente. None en cualquier otro caso
    (cliente casual, bloqueo, academia sin permiso) -- la web publica
    nunca debe exponer cliente_nombre real."""
    if reserva.academia_id and reserva.academia.permiso_mostrar:
        return reserva.academia.nombre
    return None


def _monto_y_conteo(desde, hasta):
    """Suma de pagos (por la fecha LOCAL de fecha_hora) entre desde y hasta
    (ambas inclusive), y cantidad de reservas distintas que tuvieron al
    menos un pago en ese rango. Sigue la misma regla que resumen-pagos:
    tambien cuenta pagos de reservas canceladas, porque esa plata entro
    igual a la caja ese dia."""
    pagos = Pago.objects.filter(fecha_hora__date__gte=desde, fecha_hora__date__lte=hasta)
    monto = pagos.aggregate(t=Sum('monto'))['t'] or Decimal('0.00')
    reservas = pagos.values('reserva_id').distinct().count()
    return monto, reservas


def _ingresos_diarios(desde, hasta):
    """Lista de dicts {fecha, yape, efectivo} para cada dia entre desde y
    hasta (ambas inclusive), en orden cronologico, con '0.00' en los dias
    sin pagos."""
    filas = (
        Pago.objects.filter(fecha_hora__date__gte=desde, fecha_hora__date__lte=hasta)
        .annotate(dia=TruncDate('fecha_hora'))
        .values('dia', 'metodo')
        .annotate(total=Sum('monto'))
    )
    cantidad_dias = (hasta - desde).days + 1
    por_dia = {
        desde + timedelta(days=i): {'yape': Decimal('0.00'), 'efectivo': Decimal('0.00')}
        for i in range(cantidad_dias)
    }
    for fila in filas:
        por_dia[fila['dia']][fila['metodo']] = fila['total']
    return [
        {'fecha': dia.isoformat(), 'yape': str(datos['yape']), 'efectivo': str(datos['efectivo'])}
        for dia, datos in sorted(por_dia.items())
    ]


def _ingresos_por_cancha(desde, hasta):
    """Ingresos por cancha entre desde y hasta (ambas inclusive). Una
    reserva de campo completo suma entera al bucket 'Campo completo', no a
    las 4 canchas individuales -- son 4 filas en reserva_canchas pero un
    solo pago de negocio."""
    pagos = (
        Pago.objects.filter(fecha_hora__date__gte=desde, fecha_hora__date__lte=hasta)
        .select_related('reserva')
        .prefetch_related('reserva__canchas_asignadas__cancha')
    )
    totales = {1: Decimal('0.00'), 2: Decimal('0.00'), 3: Decimal('0.00'), 4: Decimal('0.00')}
    campo_completo = Decimal('0.00')
    for pago in pagos:
        reserva = pago.reserva
        if reserva.modalidad == Modalidad.COMPLETO:
            campo_completo += pago.monto
        else:
            for rc in reserva.canchas_asignadas.all():
                totales[rc.cancha.numero] += pago.monto
    return [
        {'cancha': f'Cancha {n}', 'monto': str(totales[n])} for n in (1, 2, 3, 4)
    ] + [{'cancha': 'Campo completo', 'monto': str(campo_completo)}]


def resumen_financiero_dashboard(hoy):
    """Arma todo lo que necesita el dashboard financiero en una sola
    pasada: monto+conteo de reservas de hoy/ayer/esta semana/este mes,
    totales por metodo de pago de los ultimos 30 dias, serie diaria de 30
    dias, e ingresos por cancha de los ultimos 30 dias. 'hoy' es un date
    (no se calcula aca) para que el llamador lo controle -- facilita
    testear con una fecha fija."""
    ayer = hoy - timedelta(days=1)
    lunes_de_esta_semana = hoy - timedelta(days=hoy.weekday())
    primero_del_mes = hoy.replace(day=1)
    desde_30_dias = hoy - timedelta(days=29)

    monto_hoy, reservas_hoy = _monto_y_conteo(hoy, hoy)
    monto_ayer, reservas_ayer = _monto_y_conteo(ayer, ayer)
    monto_semana, reservas_semana = _monto_y_conteo(lunes_de_esta_semana, hoy)
    monto_mes, reservas_mes = _monto_y_conteo(primero_del_mes, hoy)

    pagos_30_dias = Pago.objects.filter(fecha_hora__date__gte=desde_30_dias, fecha_hora__date__lte=hoy)
    total_yape_30d = pagos_30_dias.filter(metodo=Pago.Metodo.YAPE).aggregate(t=Sum('monto'))['t'] or Decimal('0.00')
    total_efectivo_30d = (
        pagos_30_dias.filter(metodo=Pago.Metodo.EFECTIVO).aggregate(t=Sum('monto'))['t'] or Decimal('0.00')
    )

    return {
        'hoy': {'monto': str(monto_hoy), 'reservas': reservas_hoy},
        'ayer': {'monto': str(monto_ayer), 'reservas': reservas_ayer},
        'esta_semana': {'monto': str(monto_semana), 'reservas': reservas_semana},
        'este_mes': {'monto': str(monto_mes), 'reservas': reservas_mes},
        'total_yape_30_dias': str(total_yape_30d),
        'total_efectivo_30_dias': str(total_efectivo_30d),
        'ingresos_diarios_30_dias': _ingresos_diarios(desde_30_dias, hoy),
        'ingresos_por_cancha_30_dias': _ingresos_por_cancha(desde_30_dias, hoy),
    }
