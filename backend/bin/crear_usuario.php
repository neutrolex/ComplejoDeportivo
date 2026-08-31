<?php

declare(strict_types=1);

// Bootstrap de usuarios internos para desarrollo local.
// Uso: php bin/crear_usuario.php <usuario> <password> <nombre> [rol=recepcion]
//
// En produccion (InfinityFree no tiene SSH, no se puede correr este
// script ahi) se genera el hash en local con:
//   php -r "echo password_hash('la-password', PASSWORD_DEFAULT), PHP_EOL;"
// y se inserta la fila a mano desde phpMyAdmin. Una vez que exista un
// primer admin, el resto de usuarios se crea desde el panel (UsuarioController,
// fase 6), no hace falta volver a tocar la base a mano.

require __DIR__ . '/../src/Support/autoload.php';
require __DIR__ . '/../config/config.php';
require __DIR__ . '/../config/database.php';

if ($argc < 4) {
    fwrite(STDERR, "Uso: php bin/crear_usuario.php <usuario> <password> <nombre> [rol=recepcion]\n");
    exit(1);
}

[, $usuario, $password, $nombre] = $argv;
$rol = $argv[4] ?? 'recepcion';

if (!in_array($rol, ['admin', 'recepcion'], true)) {
    fwrite(STDERR, "Rol invalido: {$rol} (debe ser 'admin' o 'recepcion')\n");
    exit(1);
}

$pdo = obtenerConexionPDO();
$stmt = $pdo->prepare(
    'INSERT INTO usuarios_internos (nombre, usuario, password, rol, activo)
     VALUES (:nombre, :usuario, :password, :rol, 1)'
);
$stmt->execute([
    'nombre' => $nombre,
    'usuario' => $usuario,
    'password' => password_hash($password, PASSWORD_DEFAULT),
    'rol' => $rol,
]);

echo "Usuario '{$usuario}' creado (rol: {$rol}).\n";
