from datetime import datetime, timedelta

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Cancha, Reserva, ReservaCancha, Tarifa
from .serializers import (
    CanchaSerializer,
    NuevaReservaSerializer,
    PagoSerializer,
    ReservaSerializer,
    TarifaSerializer,
)
from .servicios import canchas_ocupadas, obtener_tarifa


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

        tarifa = obtener_tarifa(datos['modalidad'], datos['hora_inicio'])
        if tarifa is None:
            return Response(
                {'detail': 'No hay tarifa configurada para esa modalidad y hora.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ocupadas = canchas_ocupadas(datos['fecha'], datos['hora_inicio'], datos['canchas'])
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
                asignada_por=request.user,
            )
            ReservaCancha.objects.bulk_create([
                ReservaCancha(reserva=reserva, cancha_id=cancha_id)
                for cancha_id in datos['canchas']
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
