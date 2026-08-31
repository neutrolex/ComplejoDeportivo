<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Models\UsuarioInterno;
use App\Support\HttpException;
use App\Support\Jwt;

// Equivalente a JWTAuthentication + IsAuthenticated de DRF: valida el
// Bearer token del header Authorization y devuelve la fila del usuario
// dueno de ese token. El Router llama esto antes de cualquier ruta
// 'protegida' (por defecto todas, igual que DEFAULT_PERMISSION_CLASSES en
// el settings.py original -- fallar cerrado si algo se olvida declarar).
class AuthMiddleware
{
    public static function requerirUsuario(): array
    {
        $encabezado = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!str_starts_with($encabezado, 'Bearer ')) {
            throw new HttpException('No autenticado.', 401);
        }

        $payload = Jwt::verificar(substr($encabezado, 7));
        if ($payload === null || ($payload['tipo'] ?? null) !== 'access') {
            throw new HttpException('Token invalido o expirado.', 401);
        }

        $fila = (new UsuarioInterno())->buscarPorId((int) $payload['sub']);
        if ($fila === null || !$fila['activo']) {
            throw new HttpException('Usuario no encontrado o inactivo.', 401);
        }

        return $fila;
    }
}
