<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\ComentarioDia;
use App\Support\HttpException;
use App\Support\Horario;
use App\Support\Response;

class ComentarioDiaController
{
    public static function list(): void
    {
        $fecha = $_GET['fecha'] ?? null;
        if ($fecha === null || $fecha === '') {
            throw new HttpException('Falta el parametro fecha.', 400);
        }
        if (!Horario::fechaValida($fecha)) {
            throw new HttpException('Formato de fecha invalido, use YYYY-MM-DD.', 400);
        }
        Response::json((new ComentarioDia())->listarPorFecha($fecha));
    }

    public static function create(array $parametros, array $usuario): void
    {
        $datos = self::leerJson();

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

        $modelo = new ComentarioDia();
        $id = $modelo->crear($fecha, $texto, $montoYape, $montoEfectivo, (int) $usuario['id']);
        Response::json($modelo->buscarPorId($id), 201);
    }

    public static function destroy(array $parametros): void
    {
        $modelo = new ComentarioDia();
        $id = (int) $parametros['id'];
        if ($modelo->buscarPorId($id) === null) {
            throw new HttpException('Comentario no encontrado.', 404);
        }
        $modelo->eliminar($id);
        Response::sinContenido();
    }

    private static function decimalNoNegativo(mixed $valor, string $campo): string
    {
        $texto = (string) $valor;
        if (!preg_match('/^\d+(\.\d{1,2})?$/', $texto)) {
            throw new HttpException("{$campo} debe ser un numero valido, no negativo (hasta 2 decimales).", 400);
        }
        return bcadd($texto, '0', 2);
    }

    private static function leerJson(): array
    {
        $datos = json_decode((string) file_get_contents('php://input'), true);
        return is_array($datos) ? $datos : [];
    }
}
