<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Cancha;
use App\Support\Horario;

// Arma la grilla de /api/publico/disponibilidad/ -- equivalente a
// DisponibilidadPublicaView. Nunca serializa cliente_nombre, montos ni
// metodos de pago: solo libre/ocupado y, cuando corresponde, el nombre de
// una academia con permiso de mostrarse.
class DisponibilidadService
{
    public static function grillaPublica(string $fecha): array
    {
        $canchas = (new Cancha())->listarActivas();

        $pdo = obtenerConexionPDO();
        $stmt = $pdo->prepare(
            "SELECT r.id, r.modalidad, r.hora_inicio, r.hora_fin, r.academia_id,
                    a.nombre AS academia_nombre, a.permiso_mostrar AS academia_permiso_mostrar
             FROM reservas r LEFT JOIN academias a ON a.id = r.academia_id
             WHERE r.fecha = :fecha AND r.estado != 'cancelada'"
        );
        $stmt->execute(['fecha' => $fecha]);
        $reservas = $stmt->fetchAll();

        $canchasStmt = $pdo->prepare('SELECT cancha_id FROM reserva_canchas WHERE reserva_id = :id');
        foreach ($reservas as &$reserva) {
            $canchasStmt->execute(['id' => $reserva['id']]);
            $reserva['cancha_ids'] = array_map('intval', $canchasStmt->fetchAll(\PDO::FETCH_COLUMN));
            $reserva['hora_inicio'] = substr($reserva['hora_inicio'], 0, 5);
            $reserva['hora_fin'] = substr($reserva['hora_fin'], 0, 5);
        }
        unset($reserva);

        $horasResultado = [];
        foreach (ReservaService::horasOperativas() as $hora) {
            $bloqueInicio = sprintf('%02d:00', $hora);
            $bloqueFin = $hora === 23 ? '00:00' : sprintf('%02d:00', $hora + 1);

            $reservasHora = array_values(array_filter(
                $reservas,
                fn (array $r) => Horario::seSolapan($bloqueInicio, $bloqueFin, $r['hora_inicio'], $r['hora_fin'])
            ));

            $ocupacionPorCancha = [];
            foreach ($reservasHora as $r) {
                foreach ($r['cancha_ids'] as $canchaId) {
                    $ocupacionPorCancha[$canchaId] = $r;
                }
            }

            $canchasEstado = [];
            foreach ($canchas as $cancha) {
                $reservaDeLaCancha = $ocupacionPorCancha[$cancha['id']] ?? null;
                $canchasEstado[(string) $cancha['numero']] = $reservaDeLaCancha === null
                    ? ['estado' => 'libre']
                    : ['estado' => 'ocupado', 'academia' => self::nombreAcademiaVisible($reservaDeLaCancha)];
            }

            $completo = null;
            foreach ($reservasHora as $r) {
                if ($r['modalidad'] === 'completo') {
                    $completo = $r;
                    break;
                }
            }
            $todasOcupadas = $canchas !== [] && array_reduce(
                $canchas,
                fn ($acc, $c) => $acc && $canchasEstado[(string) $c['numero']]['estado'] === 'ocupado',
                true
            );

            if ($completo !== null) {
                $campoCompletoEstado = ['estado' => 'ocupado', 'academia' => self::nombreAcademiaVisible($completo)];
            } elseif ($todasOcupadas) {
                $campoCompletoEstado = ['estado' => 'ocupado', 'academia' => null];
            } else {
                $campoCompletoEstado = ['estado' => 'libre'];
            }

            $horasResultado[] = [
                'hora' => $bloqueInicio,
                'canchas' => $canchasEstado,
                'campo_completo' => $campoCompletoEstado,
            ];
        }

        return ['fecha' => $fecha, 'horas' => $horasResultado];
    }

    // Equivalente a nombre_academia_visible().
    private static function nombreAcademiaVisible(array $reserva): ?string
    {
        if ($reserva['academia_id'] === null || !$reserva['academia_permiso_mostrar']) {
            return null;
        }
        return $reserva['academia_nombre'];
    }
}
