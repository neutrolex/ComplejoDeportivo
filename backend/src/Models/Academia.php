<?php

declare(strict_types=1);

namespace App\Models;

class Academia
{
    public function listarConHorarios(): array
    {
        $academias = obtenerConexionPDO()
            ->query('SELECT id, nombre, tipo, color, permiso_mostrar, deuda_actual FROM academias ORDER BY nombre')
            ->fetchAll();

        $horarioModelo = new AcademiaHorario();
        return array_map(function (array $fila) use ($horarioModelo): array {
            return [
                'id' => (int) $fila['id'],
                'nombre' => $fila['nombre'],
                'tipo' => $fila['tipo'],
                'color' => $fila['color'],
                'permiso_mostrar' => (bool) $fila['permiso_mostrar'],
                'deuda_actual' => $fila['deuda_actual'],
                'horarios' => $horarioModelo->listarPorAcademia((int) $fila['id']),
            ];
        }, $academias);
    }

    public function buscarPorId(int $id): ?array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, nombre, tipo, color, permiso_mostrar, deuda_actual FROM academias WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();
        return $fila === false ? null : $fila;
    }

    // Version chica (AcademiaResumenSerializer): para anidar en una
    // Reserva sin traer permiso_mostrar ni horarios.
    public function buscarResumen(int $id): ?array
    {
        $stmt = obtenerConexionPDO()->prepare('SELECT id, nombre, tipo, color FROM academias WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();
        return $fila === false ? null : [
            'id' => (int) $fila['id'], 'nombre' => $fila['nombre'], 'tipo' => $fila['tipo'], 'color' => $fila['color'],
        ];
    }

    public function crear(string $nombre, string $tipo, string $color, bool $permisoMostrar, string $deudaActual): int
    {
        $pdo = obtenerConexionPDO();
        $stmt = $pdo->prepare(
            'INSERT INTO academias (nombre, tipo, color, permiso_mostrar, deuda_actual)
             VALUES (:nombre, :tipo, :color, :permiso_mostrar, :deuda_actual)'
        );
        $stmt->execute([
            'nombre' => $nombre, 'tipo' => $tipo, 'color' => $color, 'permiso_mostrar' => $permisoMostrar ? 1 : 0,
            'deuda_actual' => $deudaActual,
        ]);
        return (int) $pdo->lastInsertId();
    }

    public function actualizar(int $id, string $nombre, string $tipo, string $color, bool $permisoMostrar, string $deudaActual): void
    {
        $stmt = obtenerConexionPDO()->prepare(
            'UPDATE academias SET nombre = :nombre, tipo = :tipo, color = :color, permiso_mostrar = :permiso_mostrar,
             deuda_actual = :deuda_actual WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id, 'nombre' => $nombre, 'tipo' => $tipo, 'color' => $color,
            'permiso_mostrar' => $permisoMostrar ? 1 : 0, 'deuda_actual' => $deudaActual,
        ]);
    }

    public function eliminar(int $id): void
    {
        obtenerConexionPDO()->prepare('DELETE FROM academias WHERE id = :id')->execute(['id' => $id]);
    }

    // Suma (o resta, con $monto negativo) al saldo de deuda de la academia --
    // usado por ComentarioDiaController al crear/borrar un comentario
    // marcado como pago de esta academia. Se hace en SQL (deuda_actual =
    // deuda_actual + :monto) en vez de leer-modificar-escribir en PHP para
    // que dos ajustes concurrentes no se pisen entre si.
    public function ajustarDeuda(int $id, string $monto): void
    {
        $stmt = obtenerConexionPDO()->prepare(
            'UPDATE academias SET deuda_actual = deuda_actual + :monto WHERE id = :id'
        );
        $stmt->execute(['id' => $id, 'monto' => $monto]);
    }

    // Respuesta completa (AcademiaSerializer) despues de crear/editar: lee
    // lo que quedo guardado en vez de armar la forma a mano.
    public function conAcademiaFormateada(int $id): array
    {
        $academia = $this->buscarPorId($id);
        return [
            'id' => (int) $academia['id'],
            'nombre' => $academia['nombre'],
            'tipo' => $academia['tipo'],
            'color' => $academia['color'],
            'permiso_mostrar' => (bool) $academia['permiso_mostrar'],
            'deuda_actual' => $academia['deuda_actual'],
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
