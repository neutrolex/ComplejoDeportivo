<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Academia;
use App\Models\ComentarioDia;
use App\Support\HttpException;
use App\Support\Horario;

// Los pagos de academia son comentarios: su deuda y su historial se escriben juntos.
class ComentarioDiaService
{
    public static function crear(array $datos, int $usuarioId): array
    {

        $fecha = (string) ($datos['fecha'] ?? '');
        if (!Horario::fechaValida($fecha)) {
            throw new HttpException('fecha invalida, use YYYY-MM-DD.', 400);
        }

        $texto = trim((string) ($datos['texto'] ?? ''));
        if ($texto === '' || mb_strlen($texto) > 500) {
            throw new HttpException('texto es obligatorio (maximo 500 caracteres).', 400);
        }

        $montoYape = self::decimalNoNegativo($datos['monto_yape'] ?? '0.00', 'monto_yape');
        $montoEfectivo = self::decimalNoNegativo($datos['monto_efectivo'] ?? '0.00', 'monto_efectivo');

        $academiaId = null;
        if (array_key_exists('academia_id', $datos) && $datos['academia_id'] !== null && $datos['academia_id'] !== '') {
            $academiaId = (int) $datos['academia_id'];
            if ((new Academia())->buscarPorId($academiaId) === null) {
                throw new HttpException('academia_id no corresponde a ninguna academia.', 400);
            }
        }

        $modelo = new ComentarioDia();
        $academiaModelo = new Academia();
        $pdo = obtenerConexionPDO();
        $pdo->beginTransaction();
        try {
            $deudaResultante = null;
            if ($academiaId !== null) {
                $monto = bcadd($montoYape, $montoEfectivo, 2);
                $academiaModelo->ajustarDeuda($academiaId, "-{$monto}");
                $deudaResultante = $academiaModelo->buscarPorId($academiaId)['deuda_actual'];
            }
            $id = $modelo->crear($fecha, $texto, $montoYape, $montoEfectivo, $usuarioId, $academiaId, $deudaResultante);
            $pdo->commit();
        } catch (\Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }

        return $modelo->buscarPorId($id);
    }

    // Solo texto y montos son editables -- academia_id se queda fija (si
    // hace falta reasignar el pago a otra academia es mas simple borrar y
    // crear de nuevo). Si el comentario esta ligado a una academia, la
    // diferencia entre el monto viejo y el nuevo se aplica a su deuda para
    // que quede consistente con lo que realmente se pago.
    public static function actualizar(int $id, array $datos): array
    {
        $modelo = new ComentarioDia();
        $existente = $modelo->buscarCrudoPorId($id);
        if ($existente === null) {
            throw new HttpException('Comentario no encontrado.', 404);
        }


        $texto = trim((string) ($datos['texto'] ?? ''));
        if ($texto === '' || mb_strlen($texto) > 500) {
            throw new HttpException('texto es obligatorio (maximo 500 caracteres).', 400);
        }

        $montoYape = self::decimalNoNegativo($datos['monto_yape'] ?? '0.00', 'monto_yape');
        $montoEfectivo = self::decimalNoNegativo($datos['monto_efectivo'] ?? '0.00', 'monto_efectivo');

        $academiaModelo = new Academia();
        $pdo = obtenerConexionPDO();
        $pdo->beginTransaction();
        try {
            $deudaResultante = null;
            if ($existente['academia_id'] !== null) {
                $montoAnterior = bcadd((string) $existente['monto_yape'], (string) $existente['monto_efectivo'], 2);
                $montoNuevo = bcadd($montoYape, $montoEfectivo, 2);
                // Se pago mas que antes (montoNuevo > montoAnterior) -> baja
                // mas la deuda; se pago menos -> se le repone la diferencia.
                $ajuste = bcsub($montoAnterior, $montoNuevo, 2);
                $academiaModelo->ajustarDeuda((int) $existente['academia_id'], $ajuste);
                $deudaResultante = $academiaModelo->buscarPorId((int) $existente['academia_id'])['deuda_actual'];
            }
            $modelo->actualizar($id, $texto, $montoYape, $montoEfectivo, $deudaResultante);
            $pdo->commit();
        } catch (\Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }

        return $modelo->buscarPorId($id);
    }

    public static function eliminar(int $id): void
    {
        $modelo = new ComentarioDia();
        $comentario = $modelo->buscarCrudoPorId($id);
        if ($comentario === null) {
            throw new HttpException('Comentario no encontrado.', 404);
        }

        $pdo = obtenerConexionPDO();
        $pdo->beginTransaction();
        try {
            if ($comentario['academia_id'] !== null) {
                $monto = bcadd((string) $comentario['monto_yape'], (string) $comentario['monto_efectivo'], 2);
                (new Academia())->ajustarDeuda((int) $comentario['academia_id'], $monto);
            }
            $modelo->eliminar($id);
            $pdo->commit();
        } catch (\Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }

    }

    private static function decimalNoNegativo(mixed $valor, string $campo): string
    {
        $texto = (string) $valor;
        if (!preg_match('/^\d+(\.\d{1,2})?$/', $texto)) {
            throw new HttpException("{$campo} debe ser un numero valido, no negativo (hasta 2 decimales).", 400);
        }
        return bcadd($texto, '0', 2);
    }

}
