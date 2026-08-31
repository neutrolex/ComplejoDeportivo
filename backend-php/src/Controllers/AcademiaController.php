<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\Academia;
use App\Services\AcademiaService;
use App\Support\HttpException;
use App\Support\Response;

class AcademiaController
{
    public static function list(): void
    {
        Response::json((new Academia())->listarConHorarios());
    }

    public static function create(): void
    {
        $datos = AcademiaService::validarEntrada(self::leerJson(), null);
        $academiaModelo = new Academia();

        $pdo = obtenerConexionPDO();
        $pdo->beginTransaction();
        try {
            $id = $academiaModelo->crear($datos['nombre'], $datos['color'], $datos['permiso_mostrar']);
            AcademiaService::sincronizarHorarios($id, $datos['horarios']);
            $pdo->commit();
        } catch (\Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }

        Response::json($academiaModelo->conAcademiaFormateada($id), 201);
    }

    public static function update(array $parametros): void
    {
        $id = (int) $parametros['id'];
        $academiaModelo = new Academia();
        if ($academiaModelo->buscarPorId($id) === null) {
            throw new HttpException('Academia no encontrada.', 404);
        }

        $datos = AcademiaService::validarEntrada(self::leerJson(), $id);

        $pdo = obtenerConexionPDO();
        $pdo->beginTransaction();
        try {
            $academiaModelo->actualizar($id, $datos['nombre'], $datos['color'], $datos['permiso_mostrar']);
            AcademiaService::sincronizarHorarios($id, $datos['horarios']);
            $pdo->commit();
        } catch (\Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }

        Response::json($academiaModelo->conAcademiaFormateada($id));
    }

    public static function destroy(array $parametros): void
    {
        $id = (int) $parametros['id'];
        $academiaModelo = new Academia();
        if ($academiaModelo->buscarPorId($id) === null) {
            throw new HttpException('Academia no encontrada.', 404);
        }

        $pdo = obtenerConexionPDO();
        $pdo->beginTransaction();
        try {
            AcademiaService::cancelarReservasFuturasDeAcademia($id);
            $academiaModelo->eliminar($id);
            $pdo->commit();
        } catch (\Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }

        Response::sinContenido();
    }

    private static function leerJson(): array
    {
        $datos = json_decode((string) file_get_contents('php://input'), true);
        return is_array($datos) ? $datos : [];
    }
}
