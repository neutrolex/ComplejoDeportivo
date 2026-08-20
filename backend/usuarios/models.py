from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class UsuarioInternoManager(BaseUserManager):
    def create_user(self, usuario, password=None, **extra_fields):
        if not usuario:
            raise ValueError('El usuario debe tener un nombre de usuario')
        user = self.model(usuario=usuario, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, usuario, password=None, **extra_fields):
        extra_fields.setdefault('rol', UsuarioInterno.Rol.ADMIN)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(usuario, password, **extra_fields)


class UsuarioInterno(AbstractBaseUser, PermissionsMixin):
    class Rol(models.TextChoices):
        ADMIN = 'admin', 'Administrador'
        RECEPCION = 'recepcion', 'Recepcion'

    nombre = models.CharField(max_length=150)
    usuario = models.CharField(max_length=50, unique=True)
    # AbstractBaseUser ya trae el campo 'password': guarda el hash de la
    # contraseña (nunca el texto plano), que es lo mismo que pedía el
    # diseño original con 'password_hash'. Django lo gestiona solo con
    # set_password()/check_password(), por eso no se declara aquí.
    rol = models.CharField(max_length=20, choices=Rol.choices, default=Rol.RECEPCION)
    activo = models.BooleanField(default=True)

    USERNAME_FIELD = 'usuario'
    REQUIRED_FIELDS = ['nombre']

    objects = UsuarioInternoManager()

    class Meta:
        db_table = 'usuarios_internos'

    def __str__(self):
        return f'{self.nombre} ({self.usuario})'

    # Django usa 'is_active' internamente para decidir si una cuenta puede
    # iniciar sesión. Lo conectamos con nuestro campo 'activo' para no
    # duplicar la información.
    @property
    def is_active(self):
        return self.activo

    @is_active.setter
    def is_active(self, value):
        self.activo = value

    # Necesario para poder entrar al panel /admin/. Como en este proyecto
    # todo usuario interno es personal del complejo, siempre es True.
    @property
    def is_staff(self):
        return True
