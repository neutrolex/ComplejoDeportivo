from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CanchaListView, ObservacionDiaView, ReservaViewSet, TarifaListView

router = DefaultRouter()
router.register('reservas', ReservaViewSet, basename='reserva')

urlpatterns = [
    path('canchas/', CanchaListView.as_view(), name='canchas'),
    path('tarifas/', TarifaListView.as_view(), name='tarifas'),
    path('observaciones/<str:fecha>/', ObservacionDiaView.as_view(), name='observacion-dia'),
] + router.urls
