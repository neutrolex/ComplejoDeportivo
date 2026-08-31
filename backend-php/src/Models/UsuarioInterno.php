<?php

declare(strict_types=1);

namespace App\Models;

// Solo los metodos que necesita la autenticacion por ahora (fase 5). El
// CRUD completo (listar/crear/actualizar/eliminar) se agrega en la fase 6
// junto con UsuarioController.
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
}
