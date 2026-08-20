from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated

from .serializers import UsuarioInternoSerializer


class PerfilView(RetrieveAPIView):
    """Devuelve los datos del usuario dueño del token JWT enviado.
    Sirve para comprobar que la autenticacion funciona: sin token valido
    responde 401, con token valido responde los datos de esa cuenta."""
    serializer_class = UsuarioInternoSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user
