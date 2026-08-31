<?php

declare(strict_types=1);

namespace App\Models;

class Pago
{
    public function listarPorReserva(int $reservaId): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, tipo, monto, metodo, fecha_hora FROM pagos
             WHERE reserva_id = :reserva_id ORDER BY fecha_hora DESC'
        );
        $stmt->execute(['reserva_id' => $reservaId]);
        return array_map([self::class, 'paraSalida'], $stmt->fetchAll());
    }

    public function buscarUltimoPorReservaYMetodo(int $reservaId, string $metodo): ?array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, monto FROM pagos WHERE reserva_id = :reserva_id AND metodo = :metodo
             ORDER BY fecha_hora DESC LIMIT 1'
        );
        $stmt->execute(['reserva_id' => $reservaId, 'metodo' => $metodo]);
        $fila = $stmt->fetch();
        return $fila === false ? null : $fila;
    }

    public function crear(int $reservaId, string $metodo, string $monto, string $tipo, int $registradoPorId): void
    {
        $stmt = obtenerConexionPDO()->prepare(
            'INSERT INTO pagos (reserva_id, tipo, monto, metodo, registrado_por_id)
             VALUES (:reserva_id, :tipo, :monto, :metodo, :registrado_por_id)'
        );
        $stmt->execute([
            'reserva_id' => $reservaId,
            'tipo' => $tipo,
            'monto' => $monto,
            'metodo' => $metodo,
            'registrado_por_id' => $registradoPorId,
        ]);
    }

    public function actualizarMontoYTipo(int $id, string $monto, string $tipo, int $registradoPorId): void
    {
        $stmt = obtenerConexionPDO()->prepare(
            'UPDATE pagos SET monto = :monto, tipo = :tipo, registrado_por_id = :registrado_por_id WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id, 'monto' => $monto, 'tipo' => $tipo, 'registrado_por_id' => $registradoPorId,
        ]);
    }

    public function eliminar(int $id): void
    {
        obtenerConexionPDO()->prepare('DELETE FROM pagos WHERE id = :id')->execute(['id' => $id]);
    }

    // Suma de pagos por metodo, agrupados por la fecha del PAGO (no de la
    // reserva) -- incluye pagos de reservas canceladas a proposito: un
    // adelanto no reembolsable sigue siendo plata que entro ese dia.
    public function totalesPorFecha(string $fecha): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT metodo, COALESCE(SUM(monto), 0) AS total FROM pagos
             WHERE DATE(fecha_hora) = :fecha GROUP BY metodo'
        );
        $stmt->execute(['fecha' => $fecha]);

        $totales = ['efectivo' => '0.00', 'yape' => '0.00'];
        foreach ($stmt->fetchAll() as $fila) {
            $totales[$fila['metodo']] = bcadd((string) $fila['total'], '0', 2);
        }
        return $totales;
    }

    private static function paraSalida(array $fila): array
    {
        return [
            'id' => (int) $fila['id'],
            'tipo' => $fila['tipo'],
            'monto' => $fila['monto'],
            'metodo' => $fila['metodo'],
            'fecha_hora' => $fila['fecha_hora'],
        ];
    }
}
