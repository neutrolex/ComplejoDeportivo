<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\UsuarioInterno;
use App\Support\HttpException;
use App\Support\Jwt;
use App\Support\Response;

// POST /api/auth/login, POST /api/auth/refresh, GET /api/auth/me.
// Reemplaza TokenObtainPairView/TokenRefreshView (SimpleJWT) + PerfilView.
class AuthController
{
    public static function login(): void
    {
        $datos = self::leerJson();
        $usuario = trim((string) ($datos['usuario'] ?? ''));
        $password = (string) ($datos['password'] ?? '');

        if ($usuario === '' || $password === '') {
            throw new HttpException('Usuario y password son obligatorios.', 400);
        }

        $fila = (new UsuarioInterno())->buscarPorUsuario($usuario);

        // Mismo mensaje generico exista o no el usuario, para no confirmar
        // a un atacante que un nombre de usuario en particular existe.
        if ($fila === null || !$fila['activo'] || !password_verify($password, $fila['password'])) {
            throw new HttpException('Usuario o contraseña incorrectos.', 401);
        }

        Response::json(self::emitirTokens($fila));
    }

    public static function refresh(): void
    {
        $datos = self::leerJson();
        $refresh = (string) ($datos['refresh'] ?? '');

        $payload = Jwt::verificar($refresh);
        if ($payload === null || ($payload['tipo'] ?? null) !== 'refresh') {
            throw new HttpException('Refresh token invalido o expirado.', 401);
        }

        $fila = (new UsuarioInterno())->buscarPorId((int) $payload['sub']);
        if ($fila === null || !$fila['activo']) {
            throw new HttpException('Usuario no encontrado o inactivo.', 401);
        }

        // ROTATE_REFRESH_TOKENS=True en el proyecto original: cada refresh
        // devuelve un access Y un refresh nuevos, ambos con su duracion
        // completa desde este momento. Sin blacklist (no estaba instalada
        // en el backend Django tampoco): el refresh anterior sigue siendo
        // valido hasta su propio vencimiento natural.
        Response::json(self::emitirTokens($fila));
    }

    // $usuario lo inyecta el Router via AuthMiddleware antes de llegar aca.
    public static function me(array $usuario): void
    {
        Response::json([
            'id' => (int) $usuario['id'],
            'nombre' => $usuario['nombre'],
            'usuario' => $usuario['usuario'],
            'rol' => $usuario['rol'],
            'activo' => (bool) $usuario['activo'],
        ]);
    }

    private static function emitirTokens(array $fila): array
    {
        $base = [
            'sub' => (int) $fila['id'],
            'usuario' => $fila['usuario'],
            'rol' => $fila['rol'],
        ];

        return [
            'access' => Jwt::generar($base + ['tipo' => 'access'], JWT_ACCESS_TTL),
            'refresh' => Jwt::generar($base + ['tipo' => 'refresh'], JWT_REFRESH_TTL),
        ];
    }

    private static function leerJson(): array
    {
        $datos = json_decode((string) file_get_contents('php://input'), true);
        return is_array($datos) ? $datos : [];
    }
}
