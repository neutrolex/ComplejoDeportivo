from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CanchaListView, ReservaViewSet, TarifaListView

router = DefaultRouter()
router.register('reservas', ReservaViewSet, basename='reserva')

urlpatterns = [
    path('canchas/', CanchaListView.as_view(), name='canchas'),
    path('tarifas/', TarifaListView.as_view(), name='tarifas'),
] + router.urls
