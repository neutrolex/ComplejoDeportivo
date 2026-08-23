from datetime import datetime, time, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import DestroyAPIView, ListAPIView, ListCreateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Academia, Cancha, ComentarioDia, Modalidad, Pago, Reserva, ReservaCancha, Tarifa
from .serializers import (
    AcademiaSerializer,
    CanchaSerializer,
    ComentarioDiaSerializer,
    NuevaReservaSerializer,
    ReservaSerializer,
    TarifaSerializer,
)
from .servicios import (
    canchas_ocupadas,
    fecha_valida,
    guardar_pago,
    horarios_se_solapan,
    horas_operativas,
    nombre_academia_visible,
    obtener_tarifa,
    resumen_financiero_dashboard,
)


class AcademiaListView(ListAPIView):
    queryset = Academia.objects.all()
    serializer_class = AcademiaSerializer
    permission_classes = [IsAuthenticated]


class CanchaListView(ListAPIView):
    queryset = Cancha.objects.all()
    serializer_class = CanchaSerializer
    permission_classes = [IsAuthenticated]


class TarifaListView(ListAPIView):
    queryset = Tarifa.objects.all()
    serializer_class = TarifaSerializer
    permission_classes = [IsAuthenticated]


class ReservaViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not fecha_valida(fecha):
            return Response(
                {'detail': 'Formato de fecha invalido, use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reservas = (
            Reserva.objects.filter(fecha=fecha)
            .exclude(estado=Reserva.Estado.CANCELADA)
            .prefetch_related('canchas_asignadas', 'pagos')
        )
        return Response(ReservaSerializer(reservas, many=True).data)

    def create(self, request):
        entrada = NuevaReservaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        # validate_canchas() en el serializer devuelve instancias de Cancha
        # (via PrimaryKeyRelatedField), no ids sueltos: se resuelven a ids
        # una sola vez aqui para usarlos tanto en canchas_ocupadas() como
        # en el bulk_create de abajo.
        cancha_ids = [cancha.id for cancha in datos['canchas']]

        tarifa = obtener_tarifa(datos['modalidad'], datos['hora_inicio'])
        if tarifa is None:
            return Response(
                {'detail': 'No hay tarifa configurada para esa modalidad y hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inicio_dt = datetime.combine(datos['fecha'], datos['hora_inicio'])
        fin_dt = inicio_dt + timedelta(hours=float(datos['duracion']))
        # fin_dt cae justo a medianoche del dia siguiente es un caso valido
        # (la reserva termina "a las 00:00", el cierre del dia operativo,
        # mismo criterio que obtener_tarifa/horarios_se_solapan). Cualquier
        # otro cruce de fecha significa que la reserva seguiria despues de
        # medianoche, lo cual no esta permitido.
        termina_justo_a_medianoche = (
            fin_dt.time() == time(0, 0) and fin_dt.date() == datos['fecha'] + timedelta(days=1)
        )
        if fin_dt.date() != datos['fecha'] and not termina_justo_a_medianoche:
            return Response(
                {'detail': 'La reserva no puede terminar despues de medianoche.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        hora_fin = fin_dt.time()

        ocupadas = canchas_ocupadas(datos['fecha'], datos['hora_inicio'], hora_fin, cancha_ids)
        if ocupadas:
            return Response(
                {'detail': f'Las canchas {sorted(ocupadas)} ya estan ocupadas a esa hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        precio_total = (tarifa.precio_por_hora * datos['duracion']).quantize(Decimal('0.01'))

        with transaction.atomic():
            reserva = Reserva.objects.create(
                modalidad=datos['modalidad'],
                cliente_nombre=datos['cliente_nombre'],
                fecha=datos['fecha'],
                hora_inicio=datos['hora_inicio'],
                hora_fin=hora_fin,
                precio_total=precio_total,
                academia=datos.get('academia'),
                asignada_por=request.user,
            )
            ReservaCancha.objects.bulk_create([
                ReservaCancha(reserva=reserva, cancha_id=cancha_id)
                for cancha_id in cancha_ids
            ])
            if datos['efectivo'] > 0:
                guardar_pago(reserva, Pago.Metodo.EFECTIVO, datos['efectivo'], request.user)
            if datos['yape'] > 0:
                guardar_pago(reserva, Pago.Metodo.YAPE, datos['yape'], request.user)

        return Response(ReservaSerializer(reserva).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        try:
            reserva = Reserva.objects.get(pk=pk)
        except Reserva.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        reserva.estado = Reserva.Estado.CANCELADA
        reserva.save(update_fields=['estado'])
        return Response(ReservaSerializer(reserva).data)

    @action(detail=True, methods=['patch'])
    def pagos(self, request, pk=None):
        try:
            reserva = Reserva.objects.get(pk=pk)
        except Reserva.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        for campo, metodo in (('efectivo', Pago.Metodo.EFECTIVO), ('yape', Pago.Metodo.YAPE)):
            if campo not in request.data:
                continue
            try:
                monto = Decimal(str(request.data[campo]))
            except InvalidOperation:
                return Response(
                    {'detail': f'{campo} debe ser un numero.'}, status=status.HTTP_400_BAD_REQUEST,
                )
            if monto < 0:
                return Response(
                    {'detail': f'{campo} no puede ser negativo.'}, status=status.HTTP_400_BAD_REQUEST,
                )
            guardar_pago(reserva, metodo, monto, request.user)

        reserva.refresh_from_db()
        return Response(ReservaSerializer(reserva).data)

    @action(detail=False, methods=['get'], url_path='resumen-pagos')
    def resumen_pagos(self, request):
        # Agrupa por la fecha en que se registro el PAGO (fecha_hora), no
        # por la fecha de la reserva: si hoy se cobra un adelanto para una
        # reserva del sabado, esa plata entro a la caja hoy y debe cuadrar
        # con el total de hoy, sin importar para que reserva sea.
        # Ademas suma TODOS los pagos, incluyendo los de reservas con
        # estado='cancelada' -- un adelanto no reembolsable sigue siendo
        # plata que entro ese dia. No filtrar por estado.
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not fecha_valida(fecha):
            return Response(
                {'detail': 'Formato de fecha invalido, use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pagos_del_dia = Pago.objects.filter(fecha_hora__date=fecha)
        total_efectivo = pagos_del_dia.filter(
            metodo=Pago.Metodo.EFECTIVO,
        ).aggregate(t=Sum('monto'))['t'] or Decimal('0.00')
        total_yape = pagos_del_dia.filter(
            metodo=Pago.Metodo.YAPE,
        ).aggregate(t=Sum('monto'))['t'] or Decimal('0.00')

        comentarios_del_dia = ComentarioDia.objects.filter(fecha=fecha).aggregate(
            yape=Sum('monto_yape'), efectivo=Sum('monto_efectivo'),
        )
        total_efectivo += comentarios_del_dia['efectivo'] or Decimal('0.00')
        total_yape += comentarios_del_dia['yape'] or Decimal('0.00')

        return Response({
            'total_efectivo': str(total_efectivo),
            'total_yape': str(total_yape),
            'total_general': str(total_efectivo + total_yape),
        })

    @action(detail=False, methods=['get'], url_path='dashboard-financiero')
    def dashboard_financiero(self, request):
        hoy = timezone.localdate()
        return Response(resumen_financiero_dashboard(hoy))


class DisponibilidadPublicaView(APIView):
    """Sin login: la usa la web publica de horarios. Nunca serializa
    cliente_nombre, montos ni metodos de pago -- solo libre/ocupado y,
    cuando corresponde, el nombre de una academia con permiso de
    mostrarse."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not fecha_valida(fecha):
            return Response(
                {'detail': 'Formato de fecha invalido, use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        canchas = list(Cancha.objects.filter(activa=True).order_by('numero'))
        reservas = (
            Reserva.objects.filter(fecha=fecha)
            .exclude(estado=Reserva.Estado.CANCELADA)
            .select_related('academia')
            .prefetch_related('canchas_asignadas')
        )

        horas_resultado = []
        for hora in horas_operativas():
            hora_texto = f'{hora:02d}:00'
            bloque_inicio = time(hora, 0)
            bloque_fin = time(0, 0) if hora == 23 else time(hora + 1, 0)
            # Solapamiento, no coincidencia exacta de hora_inicio: una
            # reserva de varias horas que empezo antes debe seguir
            # marcando ocupada esta franja aunque no arranque aca.
            reservas_hora = [
                r for r in reservas
                if horarios_se_solapan(bloque_inicio, bloque_fin, r.hora_inicio, r.hora_fin)
            ]

            ocupacion_por_cancha = {}
            for r in reservas_hora:
                for rc in r.canchas_asignadas.all():
                    ocupacion_por_cancha[rc.cancha_id] = r

            canchas_estado = {}
            for cancha in canchas:
                reserva_de_la_cancha = ocupacion_por_cancha.get(cancha.id)
                if reserva_de_la_cancha:
                    canchas_estado[str(cancha.numero)] = {
                        'estado': 'ocupado',
                        'academia': nombre_academia_visible(reserva_de_la_cancha),
                    }
                else:
                    canchas_estado[str(cancha.numero)] = {'estado': 'libre'}

            completo = next(
                (r for r in reservas_hora if r.modalidad == Modalidad.COMPLETO), None,
            )
            todas_las_canchas_ocupadas = bool(canchas) and all(
                canchas_estado[str(c.numero)]['estado'] == 'ocupado' for c in canchas
            )
            if completo:
                campo_completo_estado = {
                    'estado': 'ocupado',
                    'academia': nombre_academia_visible(completo),
                }
            elif todas_las_canchas_ocupadas:
                campo_completo_estado = {'estado': 'ocupado', 'academia': None}
            else:
                campo_completo_estado = {'estado': 'libre'}

            horas_resultado.append({
                'hora': hora_texto,
                'canchas': canchas_estado,
                'campo_completo': campo_completo_estado,
            })

        return Response({'fecha': fecha, 'horas': horas_resultado})


class ComentarioDiaListCreateView(ListCreateAPIView):
    serializer_class = ComentarioDiaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        fecha = self.request.query_params.get('fecha')
        if not fecha_valida(fecha):
            return ComentarioDia.objects.none()
        return ComentarioDia.objects.filter(fecha=fecha)

    def list(self, request, *args, **kwargs):
        fecha = request.query_params.get('fecha')
        if not fecha:
            return Response(
                {'detail': 'Falta el parametro fecha.'}, status=status.HTTP_400_BAD_REQUEST,
            )
        if not fecha_valida(fecha):
            return Response(
                {'detail': 'Formato de fecha invalido, use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST,
            )
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(creado_por=self.request.user)


class ComentarioDiaDestroyView(DestroyAPIView):
    queryset = ComentarioDia.objects.all()
    permission_classes = [IsAuthenticated]
