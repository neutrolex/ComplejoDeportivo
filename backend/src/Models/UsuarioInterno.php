<?php

declare(strict_types=1);

namespace App\Models;

// buscarPorUsuario/buscarPorId (fase 5) devuelven la fila completa,
// password incluido -- son para AuthMiddleware/AuthController, que
// necesitan el hash para password_verify(). El resto de metodos (fase 6,
// CRUD de UsuarioController) nunca devuelven la columna password.
class UsuarioInterno
{
    public function buscarPorUsuario(string $usuario): ?array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, nombre, usuario, password, rol, activo
             FROM usuarios_internos WHERE usuario = :usuario'
        );
        $stmt->execute(['usuario' => $usuario]);
        $fila = $stmt->fetch();

        return $fila === false ? null : $fila;
    }

    public function buscarPorId(int $id): ?array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, nombre, usuario, password, rol, activo
             FROM usuarios_internos WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();

        return $fila === false ? null : $fila;
    }

    public function listar(): array
    {
        $stmt = obtenerConexionPDO()->query(
            'SELECT id, nombre, usuario, rol, activo FROM usuarios_internos ORDER BY nombre'
        );

        return array_map([self::class, 'paraSalida'], $stmt->fetchAll());
    }

    public function buscarPublicoPorId(int $id): ?array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, nombre, usuario, rol, activo FROM usuarios_internos WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();

        return $fila === false ? null : self::paraSalida($fila);
    }

    // $datos ya viene validado y con 'password' hasheado (ver
    // UsuarioController::validar()).
    public function crear(array $datos): array
    {
        $pdo = obtenerConexionPDO();
        $stmt = $pdo->prepare(
            'INSERT INTO usuarios_internos (nombre, usuario, password, rol, activo)
             VALUES (:nombre, :usuario, :password, :rol, :activo)'
        );
        $stmt->execute([
            'nombre' => $datos['nombre'],
            'usuario' => $datos['usuario'],
            'password' => $datos['password'],
            'rol' => $datos['rol'],
            'activo' => $datos['activo'] ? 1 : 0,
        ]);

        return $this->buscarPublicoPorId((int) $pdo->lastInsertId());
    }

    // 'password' en $datos es opcional: solo se pisa si vino en el body
    // (ver UsuarioController::validar()), para no forzar a reescribir la
    // contraseña en cada edicion de nombre/rol/activo.
    public function actualizar(int $id, array $datos): ?array
    {
        $campos = ['nombre = :nombre', 'usuario = :usuario', 'rol = :rol', 'activo = :activo'];
        $parametros = [
            'id' => $id,
            'nombre' => $datos['nombre'],
            'usuario' => $datos['usuario'],
            'rol' => $datos['rol'],
            'activo' => $datos['activo'] ? 1 : 0,
        ];
        if (isset($datos['password'])) {
            $campos[] = 'password = :password';
            $parametros['password'] = $datos['password'];
        }

        $sql = 'UPDATE usuarios_internos SET ' . implode(', ', $campos) . ' WHERE id = :id';
        obtenerConexionPDO()->prepare($sql)->execute($parametros);

        return $this->buscarPublicoPorId($id);
    }

    // Puede lanzar PDOException (SQLSTATE 23000) si el usuario tiene
    // reservas/pagos/comentarios asociados -- las FK son RESTRICT a
    // proposito (ver database/schema.sql), igual que el on_delete=PROTECT
    // del modelo Django original. UsuarioController la traduce a un 409
    // con un mensaje que sugiere desactivar en vez de eliminar.
    public function eliminar(int $id): void
    {
        obtenerConexionPDO()
            ->prepare('DELETE FROM usuarios_internos WHERE id = :id')
            ->execute(['id' => $id]);
    }

    private static function paraSalida(array $fila): array
    {
        return [
            'id' => (int) $fila['id'],
            'nombre' => $fila['nombre'],
            'usuario' => $fila['usuario'],
            'rol' => $fila['rol'],
            'activo' => (bool) $fila['activo'],
        ];
    }
}
