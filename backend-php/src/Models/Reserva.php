<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Horario;

class Reserva
{
    public function listarPorFecha(string $fecha): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            "SELECT id, modalidad, cliente_nombre, fecha, hora_inicio, hora_fin, estado, precio_total,
                    academia_id, es_adelanto
             FROM reservas
             WHERE fecha = :fecha AND estado != 'cancelada'
             ORDER BY fecha DESC, hora_inicio DESC"
        );
        $stmt->execute(['fecha' => $fecha]);
        return array_map([$this, 'paraSalida'], $stmt->fetchAll());
    }

    public function buscarPorId(int $id): ?array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, modalidad, cliente_nombre, fecha, hora_inicio, hora_fin, estado, precio_total,
                    academia_id, academia_horario_id, asignada_por_id, es_adelanto
             FROM reservas WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();
        return $fila === false ? null : $fila;
    }

    // Equivalente a ReservaSerializer: agrega canchas[], pagos[] y el
    // resumen de la academia a la fila cruda de la tabla.
    public function paraSalida(array $fila): array
    {
        $academia = $fila['academia_id'] !== null
            ? (new Academia())->buscarResumen((int) $fila['academia_id'])
            : null;

        return [
            'id' => (int) $fila['id'],
            'modalidad' => $fila['modalidad'],
            'cliente_nombre' => $fila['cliente_nombre'],
            'fecha' => $fila['fecha'],
            'hora_inicio' => substr($fila['hora_inicio'], 0, 5),
            'hora_fin' => substr($fila['hora_fin'], 0, 5),
            'estado' => $fila['estado'],
            'precio_total' => $fila['precio_total'],
            'canchas' => $this->canchasDeReserva((int) $fila['id']),
            'pagos' => (new Pago())->listarPorReserva((int) $fila['id']),
            'academia' => $academia,
            'es_adelanto' => (bool) $fila['es_adelanto'],
        ];
    }

    public function canchasDeReserva(int $reservaId): array
    {
        $stmt = obtenerConexionPDO()->prepare('SELECT cancha_id FROM reserva_canchas WHERE reserva_id = :id');
        $stmt->execute(['id' => $reservaId]);
        return array_map('intval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    public function crear(array $datos): int
    {
        $pdo = obtenerConexionPDO();
        $stmt = $pdo->prepare(
            'INSERT INTO reservas
                (modalidad, cliente_nombre, fecha, hora_inicio, hora_fin, precio_total,
                 academia_id, academia_horario_id, asignada_por_id, es_adelanto)
             VALUES
                (:modalidad, :cliente_nombre, :fecha, :hora_inicio, :hora_fin, :precio_total,
                 :academia_id, :academia_horario_id, :asignada_por_id, :es_adelanto)'
        );
        $stmt->execute([
            'modalidad' => $datos['modalidad'],
            'cliente_nombre' => $datos['cliente_nombre'],
            'fecha' => $datos['fecha'],
            'hora_inicio' => $datos['hora_inicio'],
            'hora_fin' => $datos['hora_fin'],
            'precio_total' => $datos['precio_total'],
            'academia_id' => $datos['academia_id'] ?? null,
            'academia_horario_id' => $datos['academia_horario_id'] ?? null,
            'asignada_por_id' => $datos['asignada_por_id'],
            'es_adelanto' => !empty($datos['es_adelanto']) ? 1 : 0,
        ]);
        return (int) $pdo->lastInsertId();
    }

    public function asignarCanchas(int $reservaId, array $canchaIds): void
    {
        $stmt = obtenerConexionPDO()->prepare(
            'INSERT INTO reserva_canchas (reserva_id, cancha_id) VALUES (:reserva_id, :cancha_id)'
        );
        foreach ($canchaIds as $canchaId) {
            $stmt->execute(['reserva_id' => $reservaId, 'cancha_id' => $canchaId]);
        }
    }

    public function actualizarEstado(int $id, string $estado): void
    {
        obtenerConexionPDO()
            ->prepare('UPDATE reservas SET estado = :estado WHERE id = :id')
            ->execute(['id' => $id, 'estado' => $estado]);
    }

    // Equivalente a canchas_ocupadas(): de $canchaIds, las que ya tienen
    // una reserva NO cancelada ese dia cuyo horario se solapa con
    // [$horaInicio, $horaFin). El solapamiento se resuelve en PHP (no en
    // SQL) por el mismo motivo que el original: hora_fin='00:00' no es
    // comparable con una condicion simple de rango en el motor de base de
    // datos, y el volumen de reservas por dia es chico.
    public function canchasOcupadas(string $fecha, string $horaInicio, string $horaFin, array $canchaIds): array
    {
        if ($canchaIds === []) {
            return [];
        }
        $marcadores = implode(',', array_fill(0, count($canchaIds), '?'));
        $sql = "SELECT rc.cancha_id, r.hora_inicio, r.hora_fin
                FROM reserva_canchas rc JOIN reservas r ON r.id = rc.reserva_id
                WHERE rc.cancha_id IN ($marcadores) AND r.fecha = ? AND r.estado != 'cancelada'";
        $stmt = obtenerConexionPDO()->prepare($sql);
        $stmt->execute([...$canchaIds, $fecha]);

        $ocupadas = [];
        foreach ($stmt->fetchAll() as $fila) {
            $inicioFila = substr($fila['hora_inicio'], 0, 5);
            $finFila = substr($fila['hora_fin'], 0, 5);
            if (Horario::seSolapan($horaInicio, $horaFin, $inicioFila, $finFila)) {
                $ocupadas[(int) $fila['cancha_id']] = true;
            }
        }
        return array_keys($ocupadas);
    }

    // Equivalente a canchas_ya_decididas(): de $canchaIds, las que ya
    // tienen una Reserva de esa academia en (fecha, horaInicio) --
    // INCLUIDAS las canceladas (idempotencia de la materializacion: una
    // cancelacion manual no debe revivirse en la siguiente corrida).
    public function canchasYaDecididas(int $academiaId, string $fecha, string $horaInicio, array $canchaIds): array
    {
        if ($canchaIds === []) {
            return [];
        }
        $marcadores = implode(',', array_fill(0, count($canchaIds), '?'));
        $sql = "SELECT DISTINCT rc.cancha_id
                FROM reserva_canchas rc JOIN reservas r ON r.id = rc.reserva_id
                WHERE rc.cancha_id IN ($marcadores) AND r.academia_id = ? AND r.fecha = ? AND r.hora_inicio = ?";
        $stmt = obtenerConexionPDO()->prepare($sql);
        $stmt->execute([...$canchaIds, $academiaId, $fecha, $horaInicio]);
        return array_map('intval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    // Reservas marcadas como adelanto que todavia tienen saldo por cobrar
    // (precio_total > suma de pagos), sin cancelar, ordenadas por fecha y
    // hora. Sin filtro de fecha a proposito -- ver spec de adelantos --
    // para no perder de vista un adelanto viejo sin completar.
    public function listarAdelantosPendientes(): array
    {
        $stmt = obtenerConexionPDO()->query(
            "SELECT id, modalidad, cliente_nombre, fecha, hora_inicio, hora_fin, estado, precio_total,
                    academia_id, es_adelanto
             FROM reservas
             WHERE es_adelanto = 1 AND estado != 'cancelada'
             ORDER BY fecha, hora_inicio"
        );

        $resultado = [];
        foreach ($stmt->fetchAll() as $fila) {
            $pagos = (new Pago())->listarPorReserva((int) $fila['id']);
            $pagado = array_reduce($pagos, fn ($acumulado, $pago) => bcadd($acumulado, $pago['monto'], 2), '0.00');
            if (bccomp($pagado, $fila['precio_total'], 2) < 0) {
                $resultado[] = $this->paraSalida($fila);
            }
        }
        return $resultado;
    }

    // Pasa a 'cancelada' las reservas de $reservaIds cuya fecha sea $hoy o
    // futura -- equivalente a _cancelar_reservas_futuras(). Las pasadas no
    // se tocan: son historial, no una ocurrencia pendiente por desarmar.
    public function cancelarFuturasEntreIds(array $reservaIds, string $hoy): void
    {
        if ($reservaIds === []) {
            return;
        }
        $marcadores = implode(',', array_fill(0, count($reservaIds), '?'));
        $sql = "UPDATE reservas SET estado = 'cancelada'
                WHERE id IN ($marcadores) AND fecha >= ? AND estado != 'cancelada'";
        obtenerConexionPDO()->prepare($sql)->execute([...$reservaIds, $hoy]);
    }

    public function idsPorAcademiaHorario(int $horarioId): array
    {
        $stmt = obtenerConexionPDO()->prepare('SELECT id FROM reservas WHERE academia_horario_id = :id');
        $stmt->execute(['id' => $horarioId]);
        return array_map('intval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    // Solo reservas generadas por un horario de esta academia (join contra
    // academia_horarios), no cualquier reserva con academia_id=$academiaId
    // -- una reserva manual vinculada a mano a la academia no debe
    // cancelarse al borrar la academia por este camino.
    public function idsPorAcademia(int $academiaId): array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT r.id FROM reservas r JOIN academia_horarios ah ON ah.id = r.academia_horario_id
             WHERE ah.academia_id = :academia_id'
        );
        $stmt->execute(['academia_id' => $academiaId]);
        return array_map('intval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }
}
