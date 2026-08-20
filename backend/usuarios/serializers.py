from rest_framework import serializers

from .models import UsuarioInterno


class UsuarioInternoSerializer(serializers.ModelSerializer):
    class Meta:
        model = UsuarioInterno
        fields = ['id', 'nombre', 'usuario', 'rol', 'activo']
