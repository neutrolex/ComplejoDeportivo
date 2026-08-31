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
        $encabezado = self::obtenerEncabezadoAuthorization();
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

    // Muchos hosts compartidos corren PHP como CGI/FastCGI, que no le pasa
    // el header Authorization a $_SERVER['HTTP_AUTHORIZATION'] por
    // defecto (rompe la autenticacion Bearer por completo). El
    // .htaccess de produccion lo reenvia como variable de entorno via
    // mod_rewrite, pero cada redireccion interna de Apache (el handler de
    // Action para .php, la reescritura a public/index.php) le antepone
    // otro 'REDIRECT_' al nombre -- la cantidad exacta de prefijos varia
    // segun como este configurado el host, asi que se busca cualquier
    // clave que termine en '_HTTP_AUTHORIZATION' en vez de asumir una
    // profundidad fija. Verificado en un Apache+CGI real: aparece como
    // REDIRECT_REDIRECT_HTTP_AUTHORIZATION.
    private static function obtenerEncabezadoAuthorization(): string
    {
        if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
            return (string) $_SERVER['HTTP_AUTHORIZATION'];
        }
        foreach ($_SERVER as $clave => $valor) {
            if ($valor !== '' && str_ends_with($clave, '_HTTP_AUTHORIZATION')) {
                return (string) $valor;
            }
        }
        return '';
    }
}
