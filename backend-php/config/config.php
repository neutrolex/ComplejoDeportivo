<?php

declare(strict_types=1);

// Carga variables desde .env (no versionado) a $_ENV, sin depender de
// ninguna libreria externa -- equivalente minimo a django-environ.
$rutaEnv = dirname(__DIR__) . '/.env';
if (file_exists($rutaEnv)) {
    foreach (file($rutaEnv, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linea) {
        $linea = trim($linea);
        if ($linea === '' || str_starts_with($linea, '#')) {
            continue;
        }
        $partes = explode('=', $linea, 2);
        if (count($partes) !== 2) {
            continue;
        }
        [$clave, $valor] = array_map('trim', $partes);
        if ($clave !== '' && !array_key_exists($clave, $_ENV)) {
            $_ENV[$clave] = $valor;
        }
    }
}

function env(string $clave, ?string $porDefecto = null): ?string
{
    return $_ENV[$clave] ?? $porDefecto;
}

date_default_timezone_set(env('APP_TIMEZONE', 'America/Lima'));

define('APP_DEBUG', env('APP_DEBUG', 'false') === 'true');
define('JWT_SECRET', env('JWT_SECRET', ''));
// Duraciones en segundos. Igual que SIMPLE_JWT en el backend Django:
// access 18 horas, refresh 7 dias, con rotacion (ver Support/Jwt.php,
// fase 5).
define('JWT_ACCESS_TTL', (int) env('JWT_ACCESS_TTL', '64800'));
define('JWT_REFRESH_TTL', (int) env('JWT_REFRESH_TTL', '604800'));
define('CORS_ALLOWED_ORIGINS', array_filter(array_map(
    'trim',
    explode(',', env('CORS_ALLOWED_ORIGINS', ''))
)));
