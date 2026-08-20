from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from .models import Cancha, Tarifa
from .serializers import CanchaSerializer, TarifaSerializer


class CanchaListView(ListAPIView):
    queryset = Cancha.objects.all()
    serializer_class = CanchaSerializer
    permission_classes = [IsAuthenticated]


class TarifaListView(ListAPIView):
    queryset = Tarifa.objects.all()
    serializer_class = TarifaSerializer
    permission_classes = [IsAuthenticated]
