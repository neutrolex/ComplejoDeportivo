from django.urls import path

from .views import CanchaListView, TarifaListView

urlpatterns = [
    path('canchas/', CanchaListView.as_view(), name='canchas'),
    path('tarifas/', TarifaListView.as_view(), name='tarifas'),
]
