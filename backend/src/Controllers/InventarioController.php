<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\Inventario;
use App\Support\HttpException;
use App\Support\Response;

class InventarioController
{
    public static function list(): void
    {
        Response::json((new Inventario())->listar());
    }

    public static function create(): void
    {
        [$nombre, $cantidad] = self::validarEntrada(self::leerJson());
        $modelo = new Inventario();
        $id = $modelo->crear($nombre, $cantidad);
        Response::json($modelo->buscarPorId($id), 201);
    }

    public static function update(array $parametros): void
    {
        $id = (int) $parametros['id'];
        $modelo = new Inventario();
        if ($modelo->buscarPorId($id) === null) {
            throw new HttpException('Material no encontrado.', 404);
        }

        [$nombre, $cantidad] = self::validarEntrada(self::leerJson());
        $modelo->actualizar($id, $nombre, $cantidad);
        Response::json($modelo->buscarPorId($id));
    }

    public static function destroy(array $parametros): void
    {
        $id = (int) $parametros['id'];
        $modelo = new Inventario();
        if ($modelo->buscarPorId($id) === null) {
            throw new HttpException('Material no encontrado.', 404);
        }
        $modelo->eliminar($id);
        Response::sinContenido();
    }

    private static function validarEntrada(array $datos): array
    {
        $nombre = trim((string) ($datos['nombre'] ?? ''));
        if ($nombre === '' || mb_strlen($nombre) > 150) {
            throw new HttpException('nombre es obligatorio (maximo 150 caracteres).', 400);
        }

        if (!is_numeric($datos['cantidad'] ?? null) || (int) $datos['cantidad'] < 0) {
            throw new HttpException('cantidad debe ser un numero entero mayor o igual a 0.', 400);
        }

        return [$nombre, (int) $datos['cantidad']];
    }

    private static function leerJson(): array
    {
        $datos = json_decode((string) file_get_contents('php://input'), true);
        return is_array($datos) ? $datos : [];
    }
}
