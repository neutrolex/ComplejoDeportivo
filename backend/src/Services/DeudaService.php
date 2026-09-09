<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Academia;
use App\Models\ComentarioDia;
use App\Models\Reserva;
use App\Support\HttpException;

class DeudaService
{
    // La academia de esta reserva no pago hoy: en vez de dejarla "pendiente"
    // de cobro para siempre, se registra como deuda -- el monto se suma a
    // academias.deuda_actual (Pago de academia despues la va bajando) y
    // queda anotado en un comentario del dia, sin afectar los totales de
    // Yape/Efectivo porque no es dinero que realmente haya entrado hoy.
    public static function marcarDeuda(int $id, array $datos, int $usuarioId): array
    {
        $modelo = new Reserva();
        $reserva = self::obtenerOFallar($modelo, $id);

        if ($reserva['academia_id'] === null) {
            throw new HttpException('Esta reserva no tiene una academia asociada.', 400);
        }

        if (!is_numeric($datos['monto'] ?? null) || (float) $datos['monto'] <= 0) {
            throw new HttpException('monto debe ser un numero mayor a 0.', 400);
        }
        $monto = bcadd((string) $datos['monto'], '0', 2);

        $academiaModelo = new Academia();
        $academia = $academiaModelo->buscarPorId((int) $reserva['academia_id']);
        if ($academia === null) {
            throw new HttpException('La academia de esta reserva ya no existe.', 404);
        }

        $pdo = obtenerConexionPDO();
        $pdo->beginTransaction();
        try {
            $modelo->actualizarEstado((int) $reserva['id'], 'debe');
            $academiaModelo->ajustarDeuda((int) $academia['id'], $monto);
            (new ComentarioDia())->crear(
                $reserva['fecha'], "Deuda registrada: {$academia['nombre']} debe S/{$monto} del día.",
                '0.00', '0.00', $usuarioId, null
            );
            $pdo->commit();
        } catch (\Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }

        return [
            'reserva' => $modelo->paraSalida($modelo->buscarPorId((int) $reserva['id'])),
            'academia' => $academiaModelo->conAcademiaFormateada((int) $academia['id']),
        ];
    }

    private static function obtenerOFallar(Reserva $modelo, int $id): array
    {
        $fila = $modelo->buscarPorId($id);
        if ($fila === null) {
            throw new HttpException('Reserva no encontrada.', 404);
        }
        return $fila;
    }

}
