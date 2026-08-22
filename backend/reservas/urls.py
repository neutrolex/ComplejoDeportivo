from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AcademiaListView,
    CanchaListView,
    DisponibilidadPublicaView,
    ObservacionDiaView,
    ReservaViewSet,
    TarifaListView,
)

router = DefaultRouter()
router.register('reservas', ReservaViewSet, basename='reserva')

urlpatterns = [
    path('academias/', AcademiaListView.as_view(), name='academias'),
    path('canchas/', CanchaListView.as_view(), name='canchas'),
    path('tarifas/', TarifaListView.as_view(), name='tarifas'),
    path('publico/disponibilidad/', DisponibilidadPublicaView.as_view(), name='disponibilidad-publica'),
    path('observaciones/<str:fecha>/', ObservacionDiaView.as_view(), name='observacion-dia'),
] + router.urls
