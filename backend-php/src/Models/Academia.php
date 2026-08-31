<?php

declare(strict_types=1);

namespace App\Models;

class Academia
{
    public function listarConHorarios(): array
    {
        $academias = obtenerConexionPDO()
            ->query('SELECT id, nombre, color, permiso_mostrar FROM academias ORDER BY nombre')
            ->fetchAll();

        $horarioModelo = new AcademiaHorario();
        return array_map(function (array $fila) use ($horarioModelo): array {
            return [
                'id' => (int) $fila['id'],
                'nombre' => $fila['nombre'],
                'color' => $fila['color'],
                'permiso_mostrar' => (bool) $fila['permiso_mostrar'],
                'horarios' => $horarioModelo->listarPorAcademia((int) $fila['id']),
            ];
        }, $academias);
    }

    public function buscarPorId(int $id): ?array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, nombre, color, permiso_mostrar FROM academias WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();
        return $fila === false ? null : $fila;
    }

    // Version chica (AcademiaResumenSerializer): para anidar en una
    // Reserva sin traer permiso_mostrar ni horarios.
    public function buscarResumen(int $id): ?array
    {
        $stmt = obtenerConexionPDO()->prepare('SELECT id, nombre, color FROM academias WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();
        return $fila === false ? null : [
            'id' => (int) $fila['id'], 'nombre' => $fila['nombre'], 'color' => $fila['color'],
        ];
    }

    public function crear(string $nombre, string $color, bool $permisoMostrar): int
    {
        $pdo = obtenerConexionPDO();
        $stmt = $pdo->prepare(
            'INSERT INTO academias (nombre, color, permiso_mostrar) VALUES (:nombre, :color, :permiso_mostrar)'
        );
        $stmt->execute(['nombre' => $nombre, 'color' => $color, 'permiso_mostrar' => $permisoMostrar ? 1 : 0]);
        return (int) $pdo->lastInsertId();
    }

    public function actualizar(int $id, string $nombre, string $color, bool $permisoMostrar): void
    {
        $stmt = obtenerConexionPDO()->prepare(
            'UPDATE academias SET nombre = :nombre, color = :color, permiso_mostrar = :permiso_mostrar
             WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id, 'nombre' => $nombre, 'color' => $color, 'permiso_mostrar' => $permisoMostrar ? 1 : 0,
        ]);
    }

    public function eliminar(int $id): void
    {
        obtenerConexionPDO()->prepare('DELETE FROM academias WHERE id = :id')->execute(['id' => $id]);
    }

    // Respuesta completa (AcademiaSerializer) despues de crear/editar: lee
    // lo que quedo guardado en vez de armar la forma a mano.
    public function conAcademiaFormateada(int $id): array
    {
        $academia = $this->buscarPorId($id);
        return [
            'id' => (int) $academia['id'],
            'nombre' => $academia['nombre'],
            'color' => $academia['color'],
            'permiso_mostrar' => (bool) $academia['permiso_mostrar'],
            'horarios' => (new AcademiaHorario())->listarPorAcademia($id),
        ];
    }

    // SELECT ... FOR UPDATE dentro de una transaccion activa: evita que
    // dos GET /reservas/?fecha= simultaneos del mismo dia materialicen
    // cada uno su propia copia de las reservas de esta academia (ver
    // AcademiaService::materializarHorarios()).
    public function bloquearFila(int $id): void
    {
        obtenerConexionPDO()->prepare('SELECT id FROM academias WHERE id = :id FOR UPDATE')->execute(['id' => $id]);
    }
}
