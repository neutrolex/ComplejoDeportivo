<?php

declare(strict_types=1);

namespace App\Models;

class Cancha
{
    public function listar(): array
    {
        $stmt = obtenerConexionPDO()->query('SELECT id, numero, activa FROM canchas ORDER BY numero');
        return array_map([self::class, 'paraSalida'], $stmt->fetchAll());
    }

    public function listarActivas(): array
    {
        $stmt = obtenerConexionPDO()->query('SELECT id, numero, activa FROM canchas WHERE activa = 1 ORDER BY numero');
        return array_map([self::class, 'paraSalida'], $stmt->fetchAll());
    }

    // True solo si todos los ids en $ids existen y estan activos (sin
    // duplicados exigidos: la unicidad la valida el llamador).
    public function existenActivas(array $ids): bool
    {
        if ($ids === []) {
            return false;
        }
        $unicos = array_unique($ids);
        $marcadores = implode(',', array_fill(0, count($unicos), '?'));
        $stmt = obtenerConexionPDO()->prepare("SELECT COUNT(*) FROM canchas WHERE activa = 1 AND id IN ($marcadores)");
        $stmt->execute(array_values($unicos));
        return (int) $stmt->fetchColumn() === count($unicos);
    }

    private static function paraSalida(array $fila): array
    {
        return [
            'id' => (int) $fila['id'],
            'numero' => (int) $fila['numero'],
            'activa' => (bool) $fila['activa'],
        ];
    }
}
