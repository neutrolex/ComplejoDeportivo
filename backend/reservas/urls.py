from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AcademiaListView,
    CanchaListView,
    ComentarioDiaDestroyView,
    ComentarioDiaListCreateView,
    DisponibilidadPublicaView,
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
    path('comentarios-dia/', ComentarioDiaListCreateView.as_view(), name='comentarios-dia'),
    path('comentarios-dia/<int:pk>/', ComentarioDiaDestroyView.as_view(), name='comentario-dia-detalle'),
] + router.urls
