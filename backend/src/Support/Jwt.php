<?php

declare(strict_types=1);

namespace App\Support;

// JWT HS256 propio, sin libreria externa (firebase/php-jwt no hace falta
// para un solo algoritmo y este volumen de trafico). Formato estandar:
// base64url(header).base64url(payload).base64url(firma HMAC-SHA256).
class Jwt
{
    public static function generar(array $payload, int $ttlSegundos): string
    {
        $encabezado = self::base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload['iat'] = time();
        $payload['exp'] = time() + $ttlSegundos;
        $cuerpo = self::base64UrlEncode(json_encode($payload));
        $firma = self::firmar("{$encabezado}.{$cuerpo}");

        return "{$encabezado}.{$cuerpo}.{$firma}";
    }

    // Devuelve el payload decodificado si la firma es valida y el token no
    // expiro, o null en cualquier otro caso (formato invalido, firma que no
    // coincide, o expirado). No lanza excepcion: el llamador decide que
    // status HTTP corresponde (401 en casi todos los casos de uso actuales).
    public static function verificar(string $token): ?array
    {
        $partes = explode('.', $token);
        if (count($partes) !== 3) {
            return null;
        }
        [$encabezado, $cuerpo, $firma] = $partes;

        $firmaEsperada = self::firmar("{$encabezado}.{$cuerpo}");
        if (!hash_equals($firmaEsperada, $firma)) {
            return null;
        }

        $payload = json_decode(self::base64UrlDecode($cuerpo), true);
        if (!is_array($payload) || !isset($payload['exp']) || $payload['exp'] < time()) {
            return null;
        }

        return $payload;
    }

    private static function firmar(string $datos): string
    {
        return self::base64UrlEncode(hash_hmac('sha256', $datos, JWT_SECRET, true));
    }

    private static function base64UrlEncode(string $datos): string
    {
        return rtrim(strtr(base64_encode($datos), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $datos): string
    {
        $resultado = base64_decode(strtr($datos, '-_', '+/'), true);
        return $resultado === false ? '' : $resultado;
    }
}
