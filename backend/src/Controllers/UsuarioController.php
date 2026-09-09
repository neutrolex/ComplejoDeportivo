<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\UsuarioInterno;
use App\Support\HttpException;
use App\Support\Response;
use PDOException;

// GET/POST /api/usuarios, GET/PUT/DELETE /api/usuarios/{id}.
// No existia en el backend Django original (solo habia GET /api/perfil/
// para el propio usuario) -- se agrega ahora porque el admin de Django
// desaparece con la migracion y alguien necesita poder dar de alta al
// personal interno sin tocar phpMyAdmin a mano. Ver decision registrada
// en docs/migracion/01-auditoria.md, seccion 6.3.
//
// Todas las acciones requieren rol 'admin' -- un usuario 'recepcion'
// autenticado puede usar el resto de la API pero no administrar cuentas.
class UsuarioController
{
    public static function list(array $parametros, array $usuarioActual): void
    {
        self::exigirAdmin($usuarioActual);
        Response::json((new UsuarioInterno())->listar());
    }

    public static function show(array $parametros, array $usuarioActual): void
    {
        self::exigirAdmin($usuarioActual);
        $fila = (new UsuarioInterno())->buscarPublicoPorId((int) $parametros['id']);
        if ($fila === null) {
            throw new HttpException('Usuario no encontrado.', 404);
        }
        Response::json($fila);
    }

    public static function create(array $parametros, array $usuarioActual): void
    {
        self::exigirAdmin($usuarioActual);
        $datos = self::validar(self::leerJson(), esCreacion: true);
        Response::json((new UsuarioInterno())->crear($datos), 201);
    }

    public static function update(array $parametros, array $usuarioActual): void
    {
        self::exigirAdmin($usuarioActual);
        $id = (int) $parametros['id'];
        $modelo = new UsuarioInterno();

        if ($modelo->buscarPublicoPorId($id) === null) {
            throw new HttpException('Usuario no encontrado.', 404);
        }

        $datos = self::validar(self::leerJson(), esCreacion: false, idActual: $id);
        Response::json($modelo->actualizar($id, $datos));
    }

    public static function destroy(array $parametros, array $usuarioActual): void
    {
        self::exigirAdmin($usuarioActual);
        $id = (int) $parametros['id'];

        if ($id === (int) $usuarioActual['id']) {
            throw new HttpException('No puede eliminar su propio usuario.', 400);
        }

        $modelo = new UsuarioInterno();
        if ($modelo->buscarPublicoPorId($id) === null) {
            throw new HttpException('Usuario no encontrado.', 404);
        }

        try {
            $modelo->eliminar($id);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                throw new HttpException(
                    'No se puede eliminar: tiene reservas, pagos o comentarios asociados. '
                    . 'Desactivelo en su lugar (PUT con activo=false).',
                    409
                );
            }
            throw $error;
        }

        Response::sinContenido();
    }

    private static function exigirAdmin(array $usuario): void
    {
        if ($usuario['rol'] !== 'admin') {
            throw new HttpException('No tiene permisos para esta accion.', 403);
        }
    }

    private static function validar(array $datos, bool $esCreacion, ?int $idActual = null): array
    {
        $nombre = trim((string) ($datos['nombre'] ?? ''));
        $usuario = trim((string) ($datos['usuario'] ?? ''));
        $rol = (string) ($datos['rol'] ?? 'recepcion');
        $activo = array_key_exists('activo', $datos) ? (bool) $datos['activo'] : true;
        $password = (string) ($datos['password'] ?? '');

        if ($nombre === '' || mb_strlen($nombre) > 150) {
            throw new HttpException('Nombre invalido: requerido, maximo 150 caracteres.', 400);
        }
        if ($usuario === '' || mb_strlen($usuario) > 50) {
            throw new HttpException('Usuario invalido: requerido, maximo 50 caracteres.', 400);
        }
        if (!in_array($rol, ['admin', 'recepcion'], true)) {
            throw new HttpException("Rol invalido: debe ser 'admin' o 'recepcion'.", 400);
        }

        $existente = (new UsuarioInterno())->buscarPorUsuario($usuario);
        if ($existente !== null && (int) $existente['id'] !== $idActual) {
            throw new HttpException('Ya existe un usuario con ese nombre de usuario.', 400);
        }

        $resultado = compact('nombre', 'usuario', 'rol', 'activo');

        if ($esCreacion && $password === '') {
            throw new HttpException('La contraseña es obligatoria.', 400);
        }
        if ($password !== '') {
            self::validarPassword($password, $usuario);
            $resultado['password'] = password_hash($password, PASSWORD_DEFAULT);
        }

        return $resultado;
    }

    // Equivalente simplificado a AUTH_PASSWORD_VALIDATORS del settings.py
    // original (Minimum length 8, Numeric password, User attribute
    // similarity). No se replica CommonPasswordValidator: depende de una
    // lista de contraseñas comunes que Django trae empaquetada y no tiene
    // un equivalente liviano en PHP sin sumar una dependencia solo para eso.
    private static function validarPassword(string $password, string $usuario): void
    {
        if (mb_strlen($password) < 8) {
            throw new HttpException('La contraseña debe tener al menos 8 caracteres.', 400);
        }
        if (ctype_digit($password)) {
            throw new HttpException('La contraseña no puede ser completamente numerica.', 400);
        }
        if (mb_strtolower($password) === mb_strtolower($usuario)) {
            throw new HttpException('La contraseña no puede ser igual al usuario.', 400);
        }
    }

    private static function leerJson(): array
    {
        $datos = json_decode((string) file_get_contents('php://input'), true);
        return is_array($datos) ? $datos : [];
    }
}
