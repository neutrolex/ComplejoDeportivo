<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Academia;
use App\Models\AcademiaHorario;
use App\Models\Cancha;
use App\Models\Reserva;
use App\Models\Tarifa;
use App\Support\HttpException;
use App\Support\Horario;

// Traduccion de la mitad de reservas/servicios.py dedicada a academias:
// validacion de horarios recurrentes, deteccion de conflictos,
// sincronizacion al editar y materializacion perezosa.
class AcademiaService
{
    private const NOMBRES_DIA = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

    // Equivalente a AcademiaEntradaSerializer + HorarioEntradaSerializer.
    // $academiaIdActual es null al crear (sus propios horarios no cuentan
    // como conflicto consigo misma al editar).
    public static function validarEntrada(array $datos, ?int $academiaIdActual): array
    {
        $nombre = trim((string) ($datos['nombre'] ?? ''));
        if ($nombre === '' || mb_strlen($nombre) > 150) {
            throw new HttpException('nombre es obligatorio (maximo 150 caracteres).', 400);
        }

        $color = (string) ($datos['color'] ?? '#7c3aed');
        if ($color === '' || mb_strlen($color) > 7) {
            throw new HttpException('color invalido (maximo 7 caracteres).', 400);
        }

        $permisoMostrar = array_key_exists('permiso_mostrar', $datos) ? (bool) $datos['permiso_mostrar'] : true;

        $horariosEntrada = is_array($datos['horarios'] ?? null) ? $datos['horarios'] : [];
        $horariosValidados = array_map(
            fn (array $horario) => self::validarHorario($horario, $academiaIdActual),
            $horariosEntrada
        );

        return [
            'nombre' => $nombre,
            'color' => $color,
            'permiso_mostrar' => $permisoMostrar,
            'horarios' => $horariosValidados,
        ];
    }

    private static function validarHorario(array $horario, ?int $academiaIdActual): array
    {
        $dias = is_array($horario['dias'] ?? null) ? array_map('intval', $horario['dias']) : [];
        if ($dias === []) {
            throw new HttpException('Cada horario debe tener al menos un dia.', 400);
        }
        foreach ($dias as $dia) {
            if ($dia < 0 || $dia > 6) {
                throw new HttpException('Dia de la semana invalido (0=Lunes .. 6=Domingo).', 400);
            }
        }

        $horaInicio = (string) ($horario['hora_inicio'] ?? '');
        $horaFin = (string) ($horario['hora_fin'] ?? '');
        $formatoValido = fn (string $h) => preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $h) === 1;
        if (!$formatoValido($horaInicio) || !$formatoValido($horaFin)) {
            throw new HttpException('hora_inicio/hora_fin invalida, use HH:MM.', 400);
        }

        $canchasEntrada = is_array($horario['canchas'] ?? null) ? array_map('intval', $horario['canchas']) : [];
        if ($canchasEntrada === []) {
            throw new HttpException('Debe elegir al menos una cancha.', 400);
        }
        if (!(new Cancha())->existenActivas($canchasEntrada)) {
            throw new HttpException('Una o mas canchas indicadas no existen o estan inactivas.', 400);
        }

        // Se chequea la igualdad aparte porque el caso especial de
        // medianoche dejaria pasar hora_inicio == hora_fin == '00:00',
        // que describiria una franja absurda de 24 horas.
        if ($horaInicio === $horaFin) {
            throw new HttpException('La hora de fin debe ser posterior a la de inicio.', 400);
        }
        $terminaAMedianoche = $horaFin === '00:00';
        if ($horaFin <= $horaInicio && !$terminaAMedianoche) {
            throw new HttpException('La hora de fin debe ser posterior a la de inicio.', 400);
        }

        // Se prueba con INDIVIDUAL porque un AcademiaHorario todavia no
        // sabe si terminara siendo completo o individual (eso lo decide
        // sincronizarHorarios segun cuantas canchas tenga), y ambas
        // modalidades comparten las mismas franjas horarias.
        if ((new Tarifa())->obtenerParaHora('individual', $horaInicio) === null) {
            throw new HttpException(
                'No hay tarifa configurada para esa hora: el horario debe empezar '
                . 'dentro del horario de atencion (08:00 a 00:00).',
                400
            );
        }

        $horarioModelo = new AcademiaHorario();
        foreach ($dias as $dia) {
            $conflicto = $horarioModelo->buscarConflicto($dia, $horaInicio, $horaFin, $canchasEntrada, $academiaIdActual);
            if ($conflicto !== null) {
                $diaNombre = self::NOMBRES_DIA[$dia];
                throw new HttpException(
                    "{$diaNombre} {$horaInicio}\u{2013}{$horaFin} ya esta ocupado en esa cancha "
                    . "por la academia \"{$conflicto['nombre']}\".",
                    400
                );
            }
        }

        return ['dias' => $dias, 'hora_inicio' => $horaInicio, 'hora_fin' => $horaFin, 'canchas' => $canchasEntrada];
    }

    // Reemplaza los AcademiaHorario de la academia por los descritos en
    // $horariosValidados (misma forma que devuelve validarEntrada: cada
    // fila trae 'dias' como lista y se expande a un AcademiaHorario por
    // dia). Un horario que ya existia tal cual (mismo dia, horario,
    // canchas) se deja intacto -- no pierde el vinculo con las reservas
    // que ya genero. El que desaparece o cambia se borra, y justo antes se
    // cancelan sus reservas futuras.
    public static function sincronizarHorarios(int $academiaId, array $horariosValidados): void
    {
        $deseados = [];
        foreach ($horariosValidados as $horario) {
            $canchas = $horario['canchas'];
            sort($canchas);
            foreach ($horario['dias'] as $dia) {
                $clave = "{$dia}|{$horario['hora_inicio']}|{$horario['hora_fin']}|" . implode(',', $canchas);
                $deseados[$clave] = $canchas;
            }
        }

        $horarioModelo = new AcademiaHorario();
        $existentes = [];
        foreach ($horarioModelo->listarCompletoPorAcademia($academiaId) as $fila) {
            $canchas = $fila['canchas'];
            sort($canchas);
            $clave = "{$fila['dia_semana']}|{$fila['hora_inicio']}|{$fila['hora_fin']}|" . implode(',', $canchas);
            $existentes[$clave] = $fila;
        }

        foreach ($existentes as $clave => $fila) {
            if (!array_key_exists($clave, $deseados)) {
                self::cancelarReservasFuturasDeHorario((int) $fila['id']);
                $horarioModelo->eliminar((int) $fila['id']);
            }
        }

        foreach ($deseados as $clave => $canchas) {
            if (array_key_exists($clave, $existentes)) {
                continue;
            }
            [$dia, $horaInicio, $horaFin] = explode('|', $clave);
            $horarioId = $horarioModelo->crear($academiaId, (int) $dia, $horaInicio, $horaFin);
            $horarioModelo->asignarCanchas($horarioId, $canchas);
        }
    }

    public static function cancelarReservasFuturasDeHorario(int $horarioId): void
    {
        $reservaModelo = new Reserva();
        $reservaModelo->cancelarFuturasEntreIds($reservaModelo->idsPorAcademiaHorario($horarioId), date('Y-m-d'));
    }

    public static function cancelarReservasFuturasDeAcademia(int $academiaId): void
    {
        $reservaModelo = new Reserva();
        $reservaModelo->cancelarFuturasEntreIds($reservaModelo->idsPorAcademia($academiaId), date('Y-m-d'));
    }

    // Equivalente a materializar_horarios_academia(): por cada
    // AcademiaHorario cuyo dia_semana coincide con $fecha, crea la Reserva
    // real que falte por cada hora del horario -- no hace nada si ya
    // existe (o si existio y se cancelo a mano), si la fecha es pasada, si
    // no hay tarifa para esa hora, o si la cancha ya esta ocupada. Se
    // llama desde ReservaController::list() antes de devolver las
    // reservas del dia: no hay ningun proceso en segundo plano, se
    // materializa perezosamente la primera vez que alguien mira ese dia.
    public static function materializarHorarios(string $fecha, int $usuarioId): void
    {
        if ($fecha < date('Y-m-d')) {
            return;
        }

        $diaSemana = ((int) (new \DateTime($fecha))->format('N')) - 1;
        $horarioModelo = new AcademiaHorario();
        $reservaModelo = new Reserva();
        $tarifaModelo = new Tarifa();
        $academiaModelo = new Academia();
        $pdo = obtenerConexionPDO();

        foreach ($horarioModelo->listarPorDiaSemana($diaSemana) as $horario) {
            $canchaIds = $horario['cancha_ids'];
            if ($canchaIds === []) {
                continue;
            }

            if (count($canchaIds) === 4) {
                $grupos = [$canchaIds];
                $modalidad = 'completo';
            } else {
                $grupos = array_map(fn ($id) => [$id], $canchaIds);
                $modalidad = 'individual';
            }

            // La verificacion y la creacion van dentro de la misma
            // transaccion, detras de un lock sobre la fila de la academia,
            // para que dos GET simultaneos del mismo dia se serialicen en
            // vez de crear cada uno su propia copia.
            $pdo->beginTransaction();
            try {
                $academiaModelo->bloquearFila($horario['academia_id']);

                foreach (Horario::segmentosDeUnaHora($horario['hora_inicio'], $horario['hora_fin']) as [$segInicio, $segFin]) {
                    $tarifa = $tarifaModelo->obtenerParaHora($modalidad, $segInicio);
                    if ($tarifa === null) {
                        continue;
                    }

                    $minutos = Horario::minutosDesdeMedianoche($segFin, true) - Horario::minutosDesdeMedianoche($segInicio);
                    $precioTotal = bcdiv(bcmul($tarifa['precio_por_hora'], (string) $minutos, 4), '60', 2);

                    foreach ($grupos as $grupo) {
                        $decididas = $reservaModelo->canchasYaDecididas($horario['academia_id'], $fecha, $segInicio, $grupo);
                        if (count(array_intersect($grupo, $decididas)) === count($grupo)) {
                            continue;
                        }
                        if ($reservaModelo->canchasOcupadas($fecha, $segInicio, $segFin, $grupo) !== []) {
                            continue;
                        }

                        $reservaId = $reservaModelo->crear([
                            'modalidad' => $modalidad,
                            'cliente_nombre' => $horario['academia_nombre'],
                            'fecha' => $fecha,
                            'hora_inicio' => $segInicio,
                            'hora_fin' => $segFin,
                            'precio_total' => $precioTotal,
                            'academia_id' => $horario['academia_id'],
                            'academia_horario_id' => $horario['id'],
                            'asignada_por_id' => $usuarioId,
                            'es_adelanto' => false,
                        ]);
                        $reservaModelo->asignarCanchas($reservaId, $grupo);
                    }
                }

                $pdo->commit();
            } catch (\Throwable $error) {
                $pdo->rollBack();
                throw $error;
            }
        }
    }
}
