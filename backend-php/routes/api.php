<?php

declare(strict_types=1);

// Este archivo recibe $router ya instanciado desde public/index.php y solo
// registra rutas -- ninguna logica de negocio vive aca. Las rutas reales de
// auth/usuarios/reservas/academias se agregan en las fases siguientes; por
// ahora solo hay endpoints de diagnostico para verificar que el router, la
// conexion PDO y el manejo de errores funcionan de punta a punta.

use App\Support\Response;

/** @var \App\Support\Router $router */

$router->get('/health', function (): void {
    Response::json(['status' => 'ok']);
});

$router->get('/health/db', function (): void {
    $pdo = obtenerConexionPDO();
    $fila = $pdo->query('SELECT 1 AS ok')->fetch();
    Response::json(['status' => 'ok', 'db' => $fila['ok'] === 1 || $fila['ok'] === '1']);
});
