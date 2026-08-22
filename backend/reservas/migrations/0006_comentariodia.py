import decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reservas', '0005_reserva_academia'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ComentarioDia',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fecha', models.DateField()),
                ('texto', models.CharField(max_length=500)),
                ('monto_yape', models.DecimalField(decimal_places=2, default=decimal.Decimal('0.00'), max_digits=7)),
                ('monto_efectivo', models.DecimalField(decimal_places=2, default=decimal.Decimal('0.00'), max_digits=7)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('creado_por', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='comentarios_dia', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'comentarios_dia',
                'ordering': ['-creado_en', '-id'],
            },
        ),
        migrations.DeleteModel(
            name='ObservacionDia',
        ),
    ]
