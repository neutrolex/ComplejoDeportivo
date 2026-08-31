<?php

declare(strict_types=1);

namespace App\Support;

// Helper central para respuestas JSON. Toda salida de la API pasa por aca
// para que el formato (status code + content-type + shape del body) sea
// consistente en todos los controllers.
class Response
{
    public static function json(mixed $datos, int $status = 200): void
    {
        http_response_code($status);
        echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    // Mismo shape de error que devolvia DRF ({"detail": "..."}), para que
    // el frontend (api.js) no necesite cambiar como lee los mensajes.
    public static function error(string $detalle, int $status = 400): void
    {
        self::json(['detail' => $detalle], $status);
    }

    public static function sinContenido(): void
    {
        http_response_code(204);
    }
}
