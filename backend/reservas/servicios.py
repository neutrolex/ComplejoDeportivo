from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import (
    Academia, AcademiaHorario, ComentarioDia, Modalidad, Pago, Reserva, ReservaCancha, Tarifa,
)


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


def _minutos_desde_medianoche(hora, es_fin=False):
    """Convierte un time a minutos desde las 00:00. Si es_fin=True y el
    valor es exactamente medianoche, se interpreta como el fin del dia
    operativo (24:00) y no como el inicio del dia -- mismo caso especial
    que ya usa obtener_tarifa()."""
    if es_fin and hora == time(0, 0):
        return 24 * 60
    return hora.hour * 60 + hora.minute


def _hora_desde_minutos(minutos):
    """Inverso de _minutos_desde_medianoche: 24*60 (medianoche como fin del
    dia operativo) vuelve a time(0, 0)."""
    minutos %= 24 * 60
    return time(minutos // 60, minutos % 60)


def segmentos_de_una_hora(hora_inicio, hora_fin):
    """Parte [hora_inicio, hora_fin) en tramos de a lo sumo 1 hora cada uno,
    contados desde hora_inicio -- el ultimo tramo se queda con lo que sobre
    si la duracion total no es multiplo de 60 minutos (ej. 18:00-19:30 da
    18:00-19:00 y 19:00-19:30). Un horario fijo de academia de varias horas
    se materializa como una reserva independiente por tramo, para que se
    pueda cancelar o cobrar una hora sin tocar las demas horas del mismo
    horario."""
    inicio_min = _minutos_desde_medianoche(hora_inicio)
    fin_min = _minutos_desde_medianoche(hora_fin, es_fin=True)
    segmentos = []
    cursor = inicio_min
    while cursor < fin_min:
        siguiente = min(cursor + 60, fin_min)
        segmentos.append((_hora_desde_minutos(cursor), _hora_desde_minutos(siguiente)))
        cursor = siguiente
    return segmentos


def horarios_se_solapan(inicio_a, fin_a, inicio_b, fin_b):
    """True si el rango [inicio_a, fin_a) se solapa con [inicio_b, fin_b),
    tratando hora_fin=00:00 como fin del dia operativo en ambos rangos."""
    a_ini = _minutos_desde_medianoche(inicio_a)
    a_fin = _minutos_desde_medianoche(fin_a, es_fin=True)
    b_ini = _minutos_desde_medianoche(inicio_b)
    b_fin = _minutos_desde_medianoche(fin_b, es_fin=True)
    return a_ini < b_fin and a_fin > b_ini


def conflicto_de_horario(dia_semana, hora_inicio, hora_fin, cancha_ids, excluir_academia_id=None):
    """Busca un AcademiaHorario de OTRA academia que se solape en dia,
    horario y al menos una cancha con lo que se esta por guardar. Devuelve
    esa academia (para poder nombrarla en el mensaje de error) o None si no
    hay conflicto. 'excluir_academia_id' es la academia que se esta
    editando -- sus propios horarios no cuentan como conflicto consigo
    misma."""
    candidatos = (
        AcademiaHorario.objects.filter(dia_semana=dia_semana, canchas__id__in=cancha_ids)
        .exclude(academia_id=excluir_academia_id)
        .select_related('academia')
        .distinct()
    )
    for horario in candidatos:
        if horarios_se_solapan(hora_inicio, hora_fin, horario.hora_inicio, horario.hora_fin):
            return horario.academia
    return None


def canchas_ocupadas(fecha, hora_inicio, hora_fin, cancha_ids):
    """De la lista cancha_ids, devuelve las que ya tienen una reserva NO
    cancelada ese dia cuyo horario se solapa con [hora_inicio, hora_fin).
    Se resuelve en Python (no en la consulta SQL) porque el caso especial
    de hora_fin=00:00 no es comparable con una condicion simple de rango
    en el motor de base de datos -- el volumen de reservas por dia es
    chico, no hay problema de rendimiento."""
    candidatas = (
        ReservaCancha.objects.filter(cancha_id__in=cancha_ids, reserva__fecha=fecha)
        .exclude(reserva__estado=Reserva.Estado.CANCELADA)
        .select_related('reserva')
    )
    return {
        rc.cancha_id for rc in candidatas
        if horarios_se_solapan(hora_inicio, hora_fin, rc.reserva.hora_inicio, rc.reserva.hora_fin)
    }


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
    """Suma de pagos + comentarios (por su fecha de negocio) entre desde y
    hasta (ambas inclusive), y cantidad de reservas distintas que tuvieron
    al menos un pago en ese rango. Sigue la misma regla que resumen-pagos:
    tambien cuenta pagos de reservas canceladas, porque esa plata entro
    igual a la caja ese dia. Un ComentarioDia no esta ligado a ninguna
    reserva, asi que solo aporta al monto, no al conteo de reservas."""
    pagos = Pago.objects.filter(fecha_hora__date__gte=desde, fecha_hora__date__lte=hasta)
    monto_pagos = pagos.aggregate(t=Sum('monto'))['t'] or Decimal('0.00')
    reservas = pagos.values('reserva_id').distinct().count()

    comentarios = ComentarioDia.objects.filter(fecha__gte=desde, fecha__lte=hasta).aggregate(
        yape=Sum('monto_yape'), efectivo=Sum('monto_efectivo'),
    )
    monto_comentarios = (comentarios['yape'] or Decimal('0.00')) + (comentarios['efectivo'] or Decimal('0.00'))

    return monto_pagos + monto_comentarios, reservas


def _ingresos_diarios(desde, hasta):
    """Lista de dicts {fecha, yape, efectivo} para cada dia entre desde y
    hasta (ambas inclusive), sumando Pago + ComentarioDia, en orden
    cronologico, con '0.00' en los dias sin ninguno de los dos."""
    filas_pago = (
        Pago.objects.filter(fecha_hora__date__gte=desde, fecha_hora__date__lte=hasta)
        .annotate(dia=TruncDate('fecha_hora'))
        .values('dia', 'metodo')
        .annotate(total=Sum('monto'))
    )
    filas_comentario = (
        ComentarioDia.objects.filter(fecha__gte=desde, fecha__lte=hasta)
        .values('fecha')
        .annotate(yape=Sum('monto_yape'), efectivo=Sum('monto_efectivo'))
    )
    cantidad_dias = (hasta - desde).days + 1
    por_dia = {
        desde + timedelta(days=i): {'yape': Decimal('0.00'), 'efectivo': Decimal('0.00')}
        for i in range(cantidad_dias)
    }
    for fila in filas_pago:
        por_dia[fila['dia']][fila['metodo']] = fila['total']
    for fila in filas_comentario:
        por_dia[fila['fecha']]['yape'] += fila['yape'] or Decimal('0.00')
        por_dia[fila['fecha']]['efectivo'] += fila['efectivo'] or Decimal('0.00')
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
    comentarios_30_dias = ComentarioDia.objects.filter(
        fecha__gte=desde_30_dias, fecha__lte=hoy,
    ).aggregate(yape=Sum('monto_yape'), efectivo=Sum('monto_efectivo'))
    total_yape_30d += comentarios_30_dias['yape'] or Decimal('0.00')
    total_efectivo_30d += comentarios_30_dias['efectivo'] or Decimal('0.00')

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


def canchas_ya_decididas(academia_id, fecha, hora_inicio, cancha_ids):
    """De la lista cancha_ids, las que ya tienen una Reserva de esa academia
    en (fecha, hora_inicio) -- INCLUIDAS las canceladas. A diferencia de
    canchas_ocupadas() (que es para conflictos de reservas manuales y por
    eso ignora las canceladas), aca una reserva cancelada cuenta: cancelar
    una ocurrencia a mano es la valvula de escape documentada en el diseno
    para saltear un dia puntual, y revivirla en la siguiente materializacion
    la volveria inutil (y podria duplicar un pago ya registrado).

    La clave de idempotencia incluye la cancha justamente para que dos
    horarios de la misma academia a la misma hora en canchas distintas se
    materialicen los dos, y para que una materializacion parcial (una cancha
    estaba tomada) pueda completarse despues."""
    return set(
        ReservaCancha.objects.filter(
            cancha_id__in=cancha_ids,
            reserva__academia_id=academia_id,
            reserva__fecha=fecha,
            reserva__hora_inicio=hora_inicio,
        ).values_list('cancha_id', flat=True)
    )


def materializar_horarios_academia(fecha, usuario):
    """Por cada AcademiaHorario cuyo dia_semana coincide con 'fecha', crea
    la Reserva real que falte por cada hora del horario (ver
    segmentos_de_una_hora) -- no hace nada si ya existe (o si existio y se
    cancelo a mano) para esa hora puntual, si la fecha es pasada, si no hay
    tarifa configurada para esa hora, o si la cancha ya esta ocupada. Se
    llama desde ReservaViewSet.list() antes de devolver las reservas del
    dia: no hay ningun proceso en segundo plano, se materializa
    perezosamente la primera vez que alguien mira ese dia.

    Invariante: una vez que una cancha/hora de una academia quedo decidida
    (materializada y viva, o materializada y cancelada a mano) no se toca
    nunca mas; solo se completan las canchas que nunca se decidieron."""
    if fecha < timezone.localdate():
        return

    horarios = (
        AcademiaHorario.objects.filter(dia_semana=fecha.weekday())
        .select_related('academia')
        .prefetch_related('canchas')
    )
    for horario in horarios:
        cancha_ids = list(horario.canchas.values_list('id', flat=True))
        if not cancha_ids:
            continue

        if len(cancha_ids) == 4:
            grupos = [cancha_ids]
            modalidad = Modalidad.COMPLETO
        else:
            grupos = [[cid] for cid in cancha_ids]
            modalidad = Modalidad.INDIVIDUAL

        # La verificacion y la creacion van dentro de la misma transaccion,
        # detras de un lock sobre la fila de la academia, para que dos GET
        # simultaneos del mismo dia (StrictMode remontando el efecto, dos
        # admins mirando la misma fecha) se serialicen en vez de ver los dos
        # "todavia no existe" y crear cada uno su copia.
        with transaction.atomic():
            Academia.objects.select_for_update().filter(pk=horario.academia_id).first()
            # Un horario de varias horas se materializa como una reserva
            # independiente por cada hora (el tramo final se queda con lo
            # que sobre si la duracion no es multiplo de 60 minutos): asi se
            # puede cancelar o cobrar una hora puntual de la academia sin
            # tocar el resto de su horario, y en la grilla cada hora se ve
            # como su propio bloque en vez de una sola celda gigante.
            for seg_inicio, seg_fin in segmentos_de_una_hora(horario.hora_inicio, horario.hora_fin):
                tarifa = obtener_tarifa(modalidad, seg_inicio)
                if tarifa is None:
                    continue

                inicio_min = _minutos_desde_medianoche(seg_inicio)
                fin_min = _minutos_desde_medianoche(seg_fin, es_fin=True)
                duracion_horas = Decimal(fin_min - inicio_min) / Decimal(60)
                precio_total = (tarifa.precio_por_hora * duracion_horas).quantize(Decimal('0.01'))

                for grupo in grupos:
                    decididas = canchas_ya_decididas(horario.academia_id, fecha, seg_inicio, grupo)
                    if decididas.issuperset(grupo):
                        continue
                    if canchas_ocupadas(fecha, seg_inicio, seg_fin, grupo):
                        continue
                    reserva = Reserva.objects.create(
                        modalidad=modalidad, cliente_nombre=horario.academia.nombre, fecha=fecha,
                        hora_inicio=seg_inicio, hora_fin=seg_fin,
                        precio_total=precio_total, academia=horario.academia,
                        academia_horario=horario, asignada_por=usuario,
                    )
                    ReservaCancha.objects.bulk_create([
                        ReservaCancha(reserva=reserva, cancha_id=cid) for cid in grupo
                    ])


def _cancelar_reservas_futuras(queryset):
    """Pasa a estado=CANCELADA las reservas de 'queryset' cuya fecha sea
    hoy o futura. Las pasadas no se tocan -- son historial, no una
    ocurrencia pendiente que haya que desarmar."""
    queryset.filter(fecha__gte=timezone.localdate()).exclude(
        estado=Reserva.Estado.CANCELADA,
    ).update(estado=Reserva.Estado.CANCELADA)


def cancelar_reservas_futuras_de_horario(horario):
    """Cancela las reservas de hoy en adelante que materializar_horarios_academia
    genero para este AcademiaHorario puntual -- ni las de otro horario de la
    misma academia, ni las reservas manuales que un admin haya vinculado a
    mano (esas no tienen 'academia_horario'). Se llama antes de borrar o
    reemplazar un horario (al editarlo o quitarlo desde la pantalla de
    Academias) para que el administrador de campo deje de mostrar
    ocurrencias de un horario que ya no existe."""
    _cancelar_reservas_futuras(Reserva.objects.filter(academia_horario=horario))


def cancelar_reservas_futuras_de_academia(academia):
    """Igual que cancelar_reservas_futuras_de_horario, pero para todos los
    horarios de la academia a la vez -- se usa al borrar la academia
    entera, para no dejar reservas fantasma en la grilla."""
    _cancelar_reservas_futuras(Reserva.objects.filter(academia_horario__academia=academia))


def sincronizar_horarios_academia(academia, horarios_entrada):
    """Reemplaza los AcademiaHorario de 'academia' por los descritos en
    'horarios_entrada' (misma forma que valida HorarioEntradaSerializer:
    cada fila trae 'dias' como lista y se expande a un AcademiaHorario por
    dia). Un horario que ya existia tal cual -- mismo dia, mismo horario,
    mismas canchas -- se deja intacto (no se le cambia el id), para no
    perder el vinculo con las reservas que ya genero. Un horario que
    desaparece o cambia de horario/cancha se borra, y justo antes se
    cancelan las reservas futuras que habia generado: son ocurrencias de un
    horario que ya no existe tal cual, no deben seguir en el administrador
    de campo. Las reservas pasadas nunca se tocan."""
    deseados = {}
    for horario in horarios_entrada:
        canchas = frozenset(c.id for c in horario['canchas'])
        for dia in horario['dias']:
            clave = (dia, horario['hora_inicio'], horario['hora_fin'], canchas)
            deseados[clave] = horario['canchas']

    existentes = {}
    for fila in academia.horarios.prefetch_related('canchas'):
        clave = (
            fila.dia_semana, fila.hora_inicio, fila.hora_fin,
            frozenset(fila.canchas.values_list('id', flat=True)),
        )
        existentes[clave] = fila

    for clave, fila in existentes.items():
        if clave not in deseados:
            cancelar_reservas_futuras_de_horario(fila)
            fila.delete()

    for clave, canchas in deseados.items():
        if clave in existentes:
            continue
        dia, hora_inicio, hora_fin, _ = clave
        fila = AcademiaHorario.objects.create(
            academia=academia, dia_semana=dia, hora_inicio=hora_inicio, hora_fin=hora_fin,
        )
        fila.canchas.set(canchas)
