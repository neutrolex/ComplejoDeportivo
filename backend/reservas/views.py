from datetime import datetime, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Academia, Cancha, ObservacionDia, Pago, Reserva, ReservaCancha, Tarifa
from .serializers import (
    AcademiaSerializer,
    CanchaSerializer,
    NuevaReservaSerializer,
    PagoSerializer,
    ReservaSerializer,
    TarifaSerializer,
)
from .servicios import canchas_ocupadas, fecha_valida, obtener_tarifa


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

        ocupadas = canchas_ocupadas(datos['fecha'], datos['hora_inicio'], cancha_ids)
        if ocupadas:
            return Response(
                {'detail': f'Las canchas {sorted(ocupadas)} ya estan ocupadas a esa hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inicio_dt = datetime.combine(datos['fecha'], datos['hora_inicio'])
        hora_fin = (inicio_dt + timedelta(hours=1)).time()

        with transaction.atomic():
            reserva = Reserva.objects.create(
                modalidad=datos['modalidad'],
                cliente_nombre=datos['cliente_nombre'],
                fecha=datos['fecha'],
                hora_inicio=datos['hora_inicio'],
                hora_fin=hora_fin,
                precio_total=tarifa.precio_por_hora,
                academia=datos.get('academia'),
                asignada_por=request.user,
            )
            ReservaCancha.objects.bulk_create([
                ReservaCancha(reserva=reserva, cancha_id=cancha_id)
                for cancha_id in cancha_ids
            ])

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

    @action(detail=True, methods=['post'])
    def pagos(self, request, pk=None):
        try:
            reserva = Reserva.objects.get(pk=pk)
        except Reserva.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        entrada = PagoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        pago = entrada.save(reserva=reserva, registrado_por=request.user)
        return Response(PagoSerializer(pago).data, status=status.HTTP_201_CREATED)

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
        return Response({
            'total_efectivo': str(total_efectivo),
            'total_yape': str(total_yape),
            'total_general': str(total_efectivo + total_yape),
        })


class ObservacionDiaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, fecha):
        if not fecha_valida(fecha):
            return Response(
                {'detail': 'Formato de fecha invalido, use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        observacion = ObservacionDia.objects.filter(fecha=fecha).first()
        texto = observacion.texto if observacion else ''
        return Response({'fecha': fecha, 'texto': texto})

    def put(self, request, fecha):
        if not fecha_valida(fecha):
            return Response(
                {'detail': 'Formato de fecha invalido, use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        texto = request.data.get('texto', '')
        observacion, _ = ObservacionDia.objects.update_or_create(
            fecha=fecha,
            defaults={'texto': texto, 'actualizado_por': request.user},
        )
        return Response({'fecha': fecha, 'texto': observacion.texto})
