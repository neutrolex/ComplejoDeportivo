from django.contrib import admin

from .models import Academia, Cancha, ObservacionDia, Pago, Reserva, ReservaCancha, Tarifa

admin.site.register(Cancha)
admin.site.register(Tarifa)
admin.site.register(Reserva)
admin.site.register(ReservaCancha)
admin.site.register(Pago)
admin.site.register(Academia)
admin.site.register(ObservacionDia)
