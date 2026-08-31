<?php

declare(strict_types=1);

// Conexion PDO unica por request (singleton simple via variable estatica).
// Sin ORM: cada Model arma sus propias consultas preparadas sobre este PDO.
function obtenerConexionPDO(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = env('DB_HOST', 'localhost');
    $puerto = env('DB_PORT', '3306');
    $nombre = env('DB_NAME', '');
    $usuario = env('DB_USER', '');
    $password = env('DB_PASSWORD', '');

    $dsn = "mysql:host={$host};port={$puerto};dbname={$nombre};charset=utf8mb4";

    $pdo = new PDO($dsn, $usuario, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    // MySQL guarda DATETIME sin zona horaria: fijamos el offset de la
    // sesion a America/Lima (UTC-5 todo el ano, Peru no usa horario de
    // verano) para que CURRENT_TIMESTAMP coincida con
    // date_default_timezone_set() hecho en config.php.
    $pdo->exec("SET time_zone = '-05:00'");

    return $pdo;
}
