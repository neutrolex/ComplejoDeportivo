from django.db import migrations


def crear_canchas_y_tarifas(apps, schema_editor):
    Cancha = apps.get_model('reservas', 'Cancha')
    Tarifa = apps.get_model('reservas', 'Tarifa')

    for numero in range(1, 5):
        Cancha.objects.create(numero=numero, activa=True)

    tarifas = [
        ('individual', '08:00', '17:30', '50.00'),
        ('individual', '17:30', '18:00', '60.00'),
        ('individual', '18:00', '00:00', '70.00'),
        ('completo', '08:00', '18:00', '160.00'),
        ('completo', '18:00', '00:00', '180.00'),
    ]
    for modalidad, hora_inicio, hora_fin, precio in tarifas:
        Tarifa.objects.create(
            modalidad=modalidad,
            hora_inicio=hora_inicio,
            hora_fin=hora_fin,
            precio_por_hora=precio,
        )


def eliminar_canchas_y_tarifas(apps, schema_editor):
    Cancha = apps.get_model('reservas', 'Cancha')
    Tarifa = apps.get_model('reservas', 'Tarifa')
    Cancha.objects.all().delete()
    Tarifa.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('reservas', '0003_observaciondia'),
    ]

    operations = [
        migrations.RunPython(crear_canchas_y_tarifas, eliminar_canchas_y_tarifas),
    ]
