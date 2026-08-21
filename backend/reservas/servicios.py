from datetime import datetime, time

from .models import Reserva, ReservaCancha, Tarifa


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
