from rest_framework import status, viewsets
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Cancha, Reserva, Tarifa
from .serializers import CanchaSerializer, ReservaSerializer, TarifaSerializer


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
