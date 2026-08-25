import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reservas', '0006_comentariodia'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='academia',
            name='horario_uso',
        ),
        migrations.AddField(
            model_name='academia',
            name='color',
            field=models.CharField(default='#7c3aed', max_length=7),
        ),
        migrations.CreateModel(
            name='AcademiaHorario',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('dia_semana', models.IntegerField(choices=[(0, 'Lunes'), (1, 'Martes'), (2, 'Miercoles'), (3, 'Jueves'), (4, 'Viernes'), (5, 'Sabado'), (6, 'Domingo')])),
                ('hora_inicio', models.TimeField()),
                ('hora_fin', models.TimeField()),
                ('academia', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='horarios', to='reservas.academia')),
                ('canchas', models.ManyToManyField(related_name='horarios_academia', to='reservas.cancha')),
            ],
            options={
                'db_table': 'academia_horarios',
                'ordering': ['dia_semana', 'hora_inicio'],
            },
        ),
    ]
