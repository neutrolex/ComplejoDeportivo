<?php

declare(strict_types=1);

namespace App\Middleware;

// Equivalente a django-cors-headers: solo refleja el header Origin cuando
// esta en la lista blanca de config.php (CORS_ALLOWED_ORIGINS). La API se
// autentica con Bearer token en el header Authorization, no con cookies,
// asi que no hace falta Access-Control-Allow-Credentials.
class CorsMiddleware
{
    public static function aplicar(): void
    {
        $origen = $_SERVER['HTTP_ORIGIN'] ?? '';

        if ($origen !== '' && in_array($origen, CORS_ALLOWED_ORIGINS, true)) {
            header("Access-Control-Allow-Origin: {$origen}");
            header('Vary: Origin');
        }
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Max-Age: 86400');

        // El navegador manda un preflight OPTIONS antes de PATCH/DELETE o
        // de cualquier request con Authorization: no lleva cuerpo ni logica
        // de negocio, solo confirma que los headers de arriba estan.
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
