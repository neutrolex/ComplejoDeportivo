<?php

declare(strict_types=1);

namespace App\Models;

class ComentarioDia
{
    public function listarPorFecha(string $fecha): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, fecha, texto, monto_yape, monto_efectivo, creado_en FROM comentarios_dia
             WHERE fecha = :fecha ORDER BY creado_en DESC, id DESC'
        );
        $stmt->execute(['fecha' => $fecha]);
        return array_map([self::class, 'paraSalida'], $stmt->fetchAll());
    }

    public function crear(
        string $fecha, string $texto, string $montoYape, string $montoEfectivo, int $creadoPorId
    ): int {
        $pdo = obtenerConexionPDO();
        $stmt = $pdo->prepare(
            'INSERT INTO comentarios_dia (fecha, texto, monto_yape, monto_efectivo, creado_por_id)
             VALUES (:fecha, :texto, :monto_yape, :monto_efectivo, :creado_por_id)'
        );
        $stmt->execute([
            'fecha' => $fecha,
            'texto' => $texto,
            'monto_yape' => $montoYape,
            'monto_efectivo' => $montoEfectivo,
            'creado_por_id' => $creadoPorId,
        ]);
        return (int) $pdo->lastInsertId();
    }

    public function buscarPorId(int $id): ?array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, fecha, texto, monto_yape, monto_efectivo, creado_en FROM comentarios_dia WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();
        return $fila === false ? null : self::paraSalida($fila);
    }

    public function eliminar(int $id): void
    {
        obtenerConexionPDO()->prepare('DELETE FROM comentarios_dia WHERE id = :id')->execute(['id' => $id]);
    }

    public function totalesPorFecha(string $fecha): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT COALESCE(SUM(monto_yape), 0) AS yape, COALESCE(SUM(monto_efectivo), 0) AS efectivo
             FROM comentarios_dia WHERE fecha = :fecha'
        );
        $stmt->execute(['fecha' => $fecha]);
        $fila = $stmt->fetch();
        return [
            'yape' => bcadd((string) $fila['yape'], '0', 2),
            'efectivo' => bcadd((string) $fila['efectivo'], '0', 2),
        ];
    }

    private static function paraSalida(array $fila): array
    {
        return [
            'id' => (int) $fila['id'],
            'fecha' => $fila['fecha'],
            'texto' => $fila['texto'],
            'monto_yape' => $fila['monto_yape'],
            'monto_efectivo' => $fila['monto_efectivo'],
            'creado_en' => $fila['creado_en'],
        ];
    }
}
