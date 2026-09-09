<?php

declare(strict_types=1);

namespace App\Models;

class Inventario
{
    public function listar(): array
    {
        $stmt = obtenerConexionPDO()->query('SELECT id, nombre, cantidad FROM inventario ORDER BY nombre');
        return array_map([self::class, 'paraSalida'], $stmt->fetchAll());
    }

    public function buscarPorId(int $id): ?array
    {
        $stmt = obtenerConexionPDO()->prepare('SELECT id, nombre, cantidad FROM inventario WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();
        return $fila === false ? null : self::paraSalida($fila);
    }

    public function crear(string $nombre, int $cantidad): int
    {
        $pdo = obtenerConexionPDO();
        $stmt = $pdo->prepare('INSERT INTO inventario (nombre, cantidad) VALUES (:nombre, :cantidad)');
        $stmt->execute(['nombre' => $nombre, 'cantidad' => $cantidad]);
        return (int) $pdo->lastInsertId();
    }

    public function actualizar(int $id, string $nombre, int $cantidad): void
    {
        $stmt = obtenerConexionPDO()->prepare(
            'UPDATE inventario SET nombre = :nombre, cantidad = :cantidad WHERE id = :id'
        );
        $stmt->execute(['id' => $id, 'nombre' => $nombre, 'cantidad' => $cantidad]);
    }

    public function eliminar(int $id): void
    {
        obtenerConexionPDO()->prepare('DELETE FROM inventario WHERE id = :id')->execute(['id' => $id]);
    }

    private static function paraSalida(array $fila): array
    {
        return [
            'id' => (int) $fila['id'],
            'nombre' => $fila['nombre'],
            'cantidad' => (int) $fila['cantidad'],
        ];
    }
}
