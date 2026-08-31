<?php

declare(strict_types=1);

// Este archivo recibe $router ya instanciado desde public/index.php y solo
// registra rutas -- ninguna logica de negocio vive aca. Las rutas reales de
// auth/usuarios/reservas/academias se agregan en las fases siguientes; por
// ahora solo hay endpoints de diagnostico para verificar que el router, la
// conexion PDO y el manejo de errores funcionan de punta a punta.

use App\Controllers\AcademiaController;
use App\Controllers\AuthController;
use App\Controllers\CanchaController;
use App\Controllers\ComentarioDiaController;
use App\Controllers\DisponibilidadPublicaController;
use App\Controllers\ReservaController;
use App\Controllers\TarifaController;
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

// Catalogo, disponibilidad publica, reservas, academias y comentarios del
// dia. Rutas con barra final a proposito: es lo que ya usa hoy
// frontend/src/api.js contra Django (DefaultRouter siempre la agrega),
// asi la fase 9 no necesita tocar ninguna de estas rutas en el frontend.
$router->get('/canchas/', fn () => CanchaController::list());
$router->get('/tarifas/', fn () => TarifaController::list());
$router->get('/publico/disponibilidad/', fn () => DisponibilidadPublicaController::get(), false);

$router->get('/reservas/', fn ($p, $u) => ReservaController::list($p, $u));
$router->post('/reservas/', fn ($p, $u) => ReservaController::create($p, $u));
$router->get('/reservas/adelantos-pendientes/', fn () => ReservaController::adelantosPendientes());
$router->get('/reservas/resumen-pagos/', fn () => ReservaController::resumenPagos());
$router->post('/reservas/{id}/cancelar/', fn ($p) => ReservaController::cancelar($p));
$router->post('/reservas/{id}/ausente/', fn ($p) => ReservaController::ausente($p));
$router->patch('/reservas/{id}/pagos/', fn ($p, $u) => ReservaController::pagos($p, $u));

$router->get('/academias/', fn () => AcademiaController::list());
$router->post('/academias/', fn () => AcademiaController::create());
$router->patch('/academias/{id}/', fn ($p) => AcademiaController::update($p));
$router->delete('/academias/{id}/', fn ($p) => AcademiaController::destroy($p));

$router->get('/comentarios-dia/', fn () => ComentarioDiaController::list());
$router->post('/comentarios-dia/', fn ($p, $u) => ComentarioDiaController::create($p, $u));
$router->delete('/comentarios-dia/{id}/', fn ($p) => ComentarioDiaController::destroy($p));
