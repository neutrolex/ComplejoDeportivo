<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Horario;

class AcademiaHorario
{
    public function listarPorAcademia(int $academiaId): array
    {
        $pdo = obtenerConexionPDO();
        $stmt = $pdo->prepare(
            'SELECT id, dia_semana, hora_inicio, hora_fin FROM academia_horarios
             WHERE academia_id = :academia_id ORDER BY dia_semana, hora_inicio'
        );
        $stmt->execute(['academia_id' => $academiaId]);

        $canchasStmt = $pdo->prepare('SELECT cancha_id FROM academia_horario_canchas WHERE academia_horario_id = :id');
        $resultado = [];
        foreach ($stmt->fetchAll() as $fila) {
            $canchasStmt->execute(['id' => $fila['id']]);
            $resultado[] = [
                'id' => (int) $fila['id'],
                'dia_semana' => (int) $fila['dia_semana'],
                'hora_inicio' => substr($fila['hora_inicio'], 0, 5),
                'hora_fin' => substr($fila['hora_fin'], 0, 5),
                'canchas' => array_map('intval', $canchasStmt->fetchAll(\PDO::FETCH_COLUMN)),
            ];
        }
        return $resultado;
    }

    // Igual que listarPorAcademia() pero pensado para comparar contra los
    // horarios "deseados" en sincronizarHorarios(): mismos campos, sin
    // formatear para presentacion.
    public function listarCompletoPorAcademia(int $academiaId): array
    {
        return $this->listarPorAcademia($academiaId);
    }

    public function crear(int $academiaId, int $diaSemana, string $horaInicio, string $horaFin): int
    {
        $pdo = obtenerConexionPDO();
        $stmt = $pdo->prepare(
            'INSERT INTO academia_horarios (academia_id, dia_semana, hora_inicio, hora_fin)
             VALUES (:academia_id, :dia_semana, :hora_inicio, :hora_fin)'
        );
        $stmt->execute([
            'academia_id' => $academiaId, 'dia_semana' => $diaSemana,
            'hora_inicio' => $horaInicio, 'hora_fin' => $horaFin,
        ]);
        return (int) $pdo->lastInsertId();
    }

    public function asignarCanchas(int $horarioId, array $canchaIds): void
    {
        $stmt = obtenerConexionPDO()->prepare(
            'INSERT INTO academia_horario_canchas (academia_horario_id, cancha_id) VALUES (:horario_id, :cancha_id)'
        );
        foreach ($canchaIds as $canchaId) {
            $stmt->execute(['horario_id' => $horarioId, 'cancha_id' => $canchaId]);
        }
    }

    public function eliminar(int $id): void
    {
        obtenerConexionPDO()->prepare('DELETE FROM academia_horarios WHERE id = :id')->execute(['id' => $id]);
    }

    // Equivalente a conflicto_de_horario(): busca un AcademiaHorario de
    // OTRA academia que se solape en dia, horario y al menos una cancha.
    // Devuelve el resumen de esa academia (para nombrarla en el mensaje
    // de error) o null si no hay conflicto. $excluirAcademiaId es la
    // academia que se esta editando -- sus propios horarios no cuentan
    // como conflicto consigo misma.
    public function buscarConflicto(
        int $diaSemana, string $horaInicio, string $horaFin, array $canchaIds, ?int $excluirAcademiaId
    ): ?array {
        if ($canchaIds === []) {
            return null;
        }
        $marcadores = implode(',', array_fill(0, count($canchaIds), '?'));
        $sql = "SELECT DISTINCT ah.id, ah.hora_inicio, ah.hora_fin, a.id AS academia_id, a.nombre AS academia_nombre
                FROM academia_horarios ah
                JOIN academia_horario_canchas ahc ON ahc.academia_horario_id = ah.id
                JOIN academias a ON a.id = ah.academia_id
                WHERE ah.dia_semana = ? AND ahc.cancha_id IN ($marcadores)";
        $parametros = [$diaSemana, ...$canchaIds];
        if ($excluirAcademiaId !== null) {
            $sql .= ' AND ah.academia_id != ?';
            $parametros[] = $excluirAcademiaId;
        }

        $stmt = obtenerConexionPDO()->prepare($sql);
        $stmt->execute($parametros);

        foreach ($stmt->fetchAll() as $fila) {
            $horaInicioFila = substr($fila['hora_inicio'], 0, 5);
            $horaFinFila = substr($fila['hora_fin'], 0, 5);
            if (Horario::seSolapan($horaInicio, $horaFin, $horaInicioFila, $horaFinFila)) {
                return ['id' => (int) $fila['academia_id'], 'nombre' => $fila['academia_nombre']];
            }
        }
        return null;
    }

    // Para materializarHorarios(): todos los horarios de academia que
    // caen en un dia de la semana dado, con el nombre de la academia y
    // los ids de cancha ya resueltos.
    public function listarPorDiaSemana(int $diaSemana): array
    {
        $pdo = obtenerConexionPDO();
        $stmt = $pdo->prepare(
            'SELECT ah.id, ah.academia_id, a.nombre AS academia_nombre, ah.hora_inicio, ah.hora_fin
             FROM academia_horarios ah JOIN academias a ON a.id = ah.academia_id
             WHERE ah.dia_semana = :dia_semana'
        );
        $stmt->execute(['dia_semana' => $diaSemana]);
        $filas = $stmt->fetchAll();

        $canchasStmt = $pdo->prepare('SELECT cancha_id FROM academia_horario_canchas WHERE academia_horario_id = :id');
        $resultado = [];
        foreach ($filas as $fila) {
            $canchasStmt->execute(['id' => $fila['id']]);
            $resultado[] = [
                'id' => (int) $fila['id'],
                'academia_id' => (int) $fila['academia_id'],
                'academia_nombre' => $fila['academia_nombre'],
                'hora_inicio' => substr($fila['hora_inicio'], 0, 5),
                'hora_fin' => substr($fila['hora_fin'], 0, 5),
                'cancha_ids' => array_map('intval', $canchasStmt->fetchAll(\PDO::FETCH_COLUMN)),
            ];
        }
        return $resultado;
    }
}
