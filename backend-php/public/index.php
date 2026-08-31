<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/Support/autoload.php';
require dirname(__DIR__) . '/config/config.php';
require dirname(__DIR__) . '/config/database.php';

use App\Middleware\CorsMiddleware;
use App\Support\HttpException;
use App\Support\Response;
use App\Support\Router;

// display_errors apagado siempre: si algo revienta antes de llegar al
// handler de abajo, no debe filtrar rutas de archivos ni stack traces al
// cliente. Los errores de todas formas quedan en el log del servidor.
ini_set('display_errors', '0');
error_reporting(E_ALL);

set_exception_handler(function (\Throwable $error): void {
    // HttpException es un corte de control deliberado (401 sin token, 400
    // de validacion, etc.), no una falla real: se responde tal cual pide,
    // sin loguearla como error del servidor.
    if ($error instanceof HttpException) {
        Response::error($error->getMessage(), $error->status());
        return;
    }
    error_log($error->getMessage() . "\n" . $error->getTraceAsString());
    Response::error(
        APP_DEBUG ? $error->getMessage() : 'Error interno del servidor.',
        500
    );
});

CorsMiddleware::aplicar();
header('Content-Type: application/json; charset=utf-8');

$router = new Router();
require dirname(__DIR__) . '/routes/api.php';

// El frontend llama a VITE_API_URL + '/reservas/...' con VITE_API_URL
// terminando en '/api' (igual que con Django); se recorta ese prefijo aca
// para que routes/api.php defina las rutas sin repetirlo.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$path = preg_replace('#^/api#', '', $path);
if ($path === '' || $path === false) {
    $path = '/';
}

$router->despachar($_SERVER['REQUEST_METHOD'] ?? 'GET', $path);
