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

    // Monto total y cantidad de RESERVAS DISTINTAS con al menos un pago en
    // el rango -- para el dashboard financiero (hoy/ayer/semana/mes).
    public function resumenEntreFechas(string $desde, string $hasta): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT COALESCE(SUM(monto), 0) AS monto, COUNT(DISTINCT reserva_id) AS reservas
             FROM pagos WHERE DATE(fecha_hora) BETWEEN :desde AND :hasta'
        );
        $stmt->execute(['desde' => $desde, 'hasta' => $hasta]);
        $fila = $stmt->fetch();
        return ['monto' => bcadd((string) $fila['monto'], '0', 2), 'reservas' => (int) $fila['reservas']];
    }

    // Suma por metodo en un rango de fechas (no un solo dia) -- para los
    // totales de 30 dias del dashboard.
    public function totalesEntreFechas(string $desde, string $hasta): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            "SELECT metodo, COALESCE(SUM(monto), 0) AS total FROM pagos
             WHERE DATE(fecha_hora) BETWEEN :desde AND :hasta GROUP BY metodo"
        );
        $stmt->execute(['desde' => $desde, 'hasta' => $hasta]);

        $totales = ['efectivo' => '0.00', 'yape' => '0.00'];
        foreach ($stmt->fetchAll() as $fila) {
            $totales[$fila['metodo']] = bcadd((string) $fila['total'], '0', 2);
        }
        return $totales;
    }

    // Filas [dia, metodo, total] para armar la serie diaria del dashboard.
    public function porDiaYMetodoEntreFechas(string $desde, string $hasta): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            "SELECT DATE(fecha_hora) AS dia, metodo, COALESCE(SUM(monto), 0) AS total
             FROM pagos WHERE DATE(fecha_hora) BETWEEN :desde AND :hasta
             GROUP BY DATE(fecha_hora), metodo"
        );
        $stmt->execute(['desde' => $desde, 'hasta' => $hasta]);
        return $stmt->fetchAll();
    }

    // Suma de pagos de reservas de modalidad 'completo' en el rango -- una
    // reserva de campo completo suma entera al bucket "Campo completo", no
    // a las 4 canchas individuales (son 4 filas en reserva_canchas pero un
    // solo pago de negocio).
    public function totalCompletoEntreFechas(string $desde, string $hasta): string
    {
        $stmt = obtenerConexionPDO()->prepare(
            "SELECT COALESCE(SUM(p.monto), 0) AS total FROM pagos p JOIN reservas r ON r.id = p.reserva_id
             WHERE r.modalidad = 'completo' AND DATE(p.fecha_hora) BETWEEN :desde AND :hasta"
        );
        $stmt->execute(['desde' => $desde, 'hasta' => $hasta]);
        return bcadd((string) $stmt->fetchColumn(), '0', 2);
    }

    // Suma de pagos de reservas 'individual' por numero de cancha (1-4) en
    // el rango. Une con reserva_canchas sin riesgo de duplicar montos:
    // una reserva individual siempre tiene exactamente 1 fila ahi.
    public function totalesPorCanchaEntreFechas(string $desde, string $hasta): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            "SELECT c.numero AS cancha_numero, COALESCE(SUM(p.monto), 0) AS total
             FROM pagos p
             JOIN reservas r ON r.id = p.reserva_id
             JOIN reserva_canchas rc ON rc.reserva_id = r.id
             JOIN canchas c ON c.id = rc.cancha_id
             WHERE r.modalidad = 'individual' AND DATE(p.fecha_hora) BETWEEN :desde AND :hasta
             GROUP BY c.numero"
        );
        $stmt->execute(['desde' => $desde, 'hasta' => $hasta]);

        $totales = [1 => '0.00', 2 => '0.00', 3 => '0.00', 4 => '0.00'];
        foreach ($stmt->fetchAll() as $fila) {
            $totales[(int) $fila['cancha_numero']] = bcadd((string) $fila['total'], '0', 2);
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
