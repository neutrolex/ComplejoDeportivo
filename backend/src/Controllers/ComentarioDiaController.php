<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\ComentarioDiaService;
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
        Response::json(ComentarioDiaService::crear(self::leerJson(), (int) $usuario['id']), 201);
    }

    public static function update(array $parametros): void
    {
        Response::json(ComentarioDiaService::actualizar((int) $parametros['id'], self::leerJson()));
    }

    public static function destroy(array $parametros): void
    {
        ComentarioDiaService::eliminar((int) $parametros['id']);
        Response::sinContenido();
    }

    private static function leerJson(): array
    {
        $datos = json_decode((string) file_get_contents('php://input'), true);
        return is_array($datos) ? $datos : [];
    }
}
