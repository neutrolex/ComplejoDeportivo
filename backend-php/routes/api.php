<?php

declare(strict_types=1);

// Este archivo recibe $router ya instanciado desde public/index.php y solo
// registra rutas -- ninguna logica de negocio vive aca. Las rutas reales de
// auth/usuarios/reservas/academias se agregan en las fases siguientes; por
// ahora solo hay endpoints de diagnostico para verificar que el router, la
// conexion PDO y el manejo de errores funcionan de punta a punta.

use App\Controllers\AuthController;
use App\Controllers\UsuarioController;
use App\Support\Response;

/** @var \App\Support\Router $router */

// Diagnostico, sin autenticacion.
$router->get('/health', function (): void {
    Response::json(['status' => 'ok']);
}, false);

$router->get('/health/db', function (): void {
    $pdo = obtenerConexionPDO();
    $fila = $pdo->query('SELECT 1 AS ok')->fetch();
    Response::json(['status' => 'ok', 'db' => $fila['ok'] === 1 || $fila['ok'] === '1']);
}, false);

// Autenticacion. login/refresh son publicas (todavia no hay usuario
// autenticado en ese punto); me/ requiere un access token valido.
$router->post('/auth/login', fn () => AuthController::login(), false);
$router->post('/auth/refresh', fn () => AuthController::refresh(), false);
$router->get('/auth/me', fn ($parametros, $usuario) => AuthController::me($usuario));

// Usuarios internos. Todas requieren autenticacion (default del Router) y
// ademas rol admin (chequeado dentro de cada accion del controller).
$router->get('/usuarios', fn ($p, $u) => UsuarioController::list($p, $u));
$router->get('/usuarios/{id}', fn ($p, $u) => UsuarioController::show($p, $u));
$router->post('/usuarios', fn ($p, $u) => UsuarioController::create($p, $u));
$router->put('/usuarios/{id}', fn ($p, $u) => UsuarioController::update($p, $u));
$router->delete('/usuarios/{id}', fn ($p, $u) => UsuarioController::destroy($p, $u));
