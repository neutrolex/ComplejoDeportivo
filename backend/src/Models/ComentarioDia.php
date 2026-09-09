<?php

declare(strict_types=1);

namespace App\Models;

class ComentarioDia
{
    public function listarPorFecha(string $fecha): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT c.id, c.fecha, c.texto, c.monto_yape, c.monto_efectivo, c.creado_en, c.academia_id,
                    c.academia_deuda_resultante, a.nombre AS academia_nombre, a.color AS academia_color
             FROM comentarios_dia c
             LEFT JOIN academias a ON a.id = c.academia_id
             WHERE c.fecha = :fecha ORDER BY c.creado_en DESC, c.id DESC'
        );
        $stmt->execute(['fecha' => $fecha]);
        return array_map([self::class, 'paraSalida'], $stmt->fetchAll());
    }

    public function crear(
        string $fecha, string $texto, string $montoYape, string $montoEfectivo, int $creadoPorId, ?int $academiaId,
        ?string $academiaDeudaResultante = null, bool $cuentaEnTotal = true
    ): int {
        $pdo = obtenerConexionPDO();
        $stmt = $pdo->prepare(
            'INSERT INTO comentarios_dia
                (fecha, texto, monto_yape, monto_efectivo, creado_por_id, academia_id, academia_deuda_resultante,
                 cuenta_en_total)
             VALUES
                (:fecha, :texto, :monto_yape, :monto_efectivo, :creado_por_id, :academia_id, :academia_deuda_resultante,
                 :cuenta_en_total)'
        );
        $stmt->execute([
            'fecha' => $fecha,
            'texto' => $texto,
            'monto_yape' => $montoYape,
            'monto_efectivo' => $montoEfectivo,
            'creado_por_id' => $creadoPorId,
            'academia_id' => $academiaId,
            'academia_deuda_resultante' => $academiaDeudaResultante,
            'cuenta_en_total' => $cuentaEnTotal ? 1 : 0,
        ]);
        return (int) $pdo->lastInsertId();
    }

    public function actualizar(int $id, string $texto, string $montoYape, string $montoEfectivo, ?string $academiaDeudaResultante): void
    {
        $stmt = obtenerConexionPDO()->prepare(
            'UPDATE comentarios_dia SET texto = :texto, monto_yape = :monto_yape, monto_efectivo = :monto_efectivo,
             academia_deuda_resultante = :academia_deuda_resultante WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id,
            'texto' => $texto,
            'monto_yape' => $montoYape,
            'monto_efectivo' => $montoEfectivo,
            'academia_deuda_resultante' => $academiaDeudaResultante,
        ]);
    }

    public function buscarPorId(int $id): ?array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT c.id, c.fecha, c.texto, c.monto_yape, c.monto_efectivo, c.creado_en, c.academia_id,
                    c.academia_deuda_resultante, a.nombre AS academia_nombre, a.color AS academia_color
             FROM comentarios_dia c
             LEFT JOIN academias a ON a.id = c.academia_id
             WHERE c.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();
        return $fila === false ? null : self::paraSalida($fila);
    }

    // Version cruda (sin JOIN) para uso interno del controller antes de
    // borrar/editar: solo necesita saber si tenia academia_id y los montos
    // para reponer/reajustar la deuda.
    public function buscarCrudoPorId(int $id): ?array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, monto_yape, monto_efectivo, academia_id FROM comentarios_dia WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();
        return $fila === false ? null : $fila;
    }

    public function eliminar(int $id): void
    {
        obtenerConexionPDO()->prepare('DELETE FROM comentarios_dia WHERE id = :id')->execute(['id' => $id]);
    }

    public function totalesPorFecha(string $fecha): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT COALESCE(SUM(monto_yape), 0) AS yape, COALESCE(SUM(monto_efectivo), 0) AS efectivo
             FROM comentarios_dia WHERE fecha = :fecha AND cuenta_en_total = 1'
        );
        $stmt->execute(['fecha' => $fecha]);
        $fila = $stmt->fetch();
        return [
            'yape' => bcadd((string) $fila['yape'], '0', 2),
            'efectivo' => bcadd((string) $fila['efectivo'], '0', 2),
        ];
    }

    // Igual que totalesPorFecha() pero para un rango -- dashboard.
    public function totalesEntreFechas(string $desde, string $hasta): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT COALESCE(SUM(monto_yape), 0) AS yape, COALESCE(SUM(monto_efectivo), 0) AS efectivo
             FROM comentarios_dia WHERE fecha BETWEEN :desde AND :hasta AND cuenta_en_total = 1'
        );
        $stmt->execute(['desde' => $desde, 'hasta' => $hasta]);
        $fila = $stmt->fetch();
        return [
            'yape' => bcadd((string) $fila['yape'], '0', 2),
            'efectivo' => bcadd((string) $fila['efectivo'], '0', 2),
        ];
    }

    // Filas [fecha, yape, efectivo] para la serie diaria del dashboard.
    public function porDiaEntreFechas(string $desde, string $hasta): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT fecha, COALESCE(SUM(monto_yape), 0) AS yape, COALESCE(SUM(monto_efectivo), 0) AS efectivo
             FROM comentarios_dia WHERE fecha BETWEEN :desde AND :hasta AND cuenta_en_total = 1 GROUP BY fecha'
        );
        $stmt->execute(['desde' => $desde, 'hasta' => $hasta]);
        return $stmt->fetchAll();
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
            'academia' => $fila['academia_id'] === null ? null : [
                'id' => (int) $fila['academia_id'],
                'nombre' => $fila['academia_nombre'],
                'color' => $fila['academia_color'],
            ],
            'academia_deuda_resultante' => $fila['academia_deuda_resultante'],
        ];
    }
}
