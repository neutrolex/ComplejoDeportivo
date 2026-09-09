<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Academia;
use App\Models\Cancha;
use App\Models\ComentarioDia;
use App\Models\Pago;
use App\Models\Reserva;
use App\Models\Tarifa;
use App\Support\HttpException;
use App\Support\Horario;

// Traduccion de reservas/servicios.py (la mitad que no es materializacion
// de horarios de academia -- eso vive en AcademiaService).
class ReservaService
{
    public static function horasOperativas(): array
    {
        $primeraHora = (new Tarifa())->primeraHoraOperativa();
        return $primeraHora === null ? [] : range($primeraHora, 23);
    }

    // Equivalente a NuevaReservaSerializer: valida el body de POST
    // /reservas/ y devuelve los datos ya normalizados (fecha/hora como
    // texto, montos como strings decimales, cancha_ids como int[]).
    public static function validarNuevaReserva(array $datos): array
    {
        $fecha = (string) ($datos['fecha'] ?? '');
        if (!Horario::fechaValida($fecha)) {
            throw new HttpException('fecha invalida, use YYYY-MM-DD.', 400);
        }

        $horaInicio = (string) ($datos['hora_inicio'] ?? '');
        if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $horaInicio)) {
            throw new HttpException('hora_inicio invalida, use HH:MM.', 400);
        }

        $clienteNombre = trim((string) ($datos['cliente_nombre'] ?? ''));
        if ($clienteNombre === '' || mb_strlen($clienteNombre) > 150) {
            throw new HttpException('cliente_nombre es obligatorio (maximo 150 caracteres).', 400);
        }

        $academiaId = null;
        if (!empty($datos['academia'])) {
            $academiaId = (int) $datos['academia'];
            if ((new Academia())->buscarPorId($academiaId) === null) {
                throw new HttpException('La academia indicada no existe.', 400);
            }
        }

        $esAdelanto = !empty($datos['es_adelanto']);
        $yape = self::decimalNoNegativo($datos['yape'] ?? '0.00', 'yape');
        $efectivo = self::decimalNoNegativo($datos['efectivo'] ?? '0.00', 'efectivo');

        $duracion = isset($datos['duracion']) ? (float) $datos['duracion'] : 1.0;
        if ($duracion < 1.0 || $duracion > 1.5 || fmod($duracion * 2, 1.0) !== 0.0) {
            throw new HttpException('La duracion debe ser en incrementos de 30 minutos (1 o 1.5 horas).', 400);
        }

        $modalidad = (string) ($datos['modalidad'] ?? '');
        if (!in_array($modalidad, ['individual', 'completo'], true)) {
            throw new HttpException("modalidad invalida: debe ser 'individual' o 'completo'.", 400);
        }

        $canchasEntrada = $datos['canchas'] ?? [];
        if (!is_array($canchasEntrada) || $canchasEntrada === []) {
            throw new HttpException('Debe indicar al menos una cancha.', 400);
        }
        $canchaIds = array_map('intval', $canchasEntrada);
        if (count($canchaIds) !== count(array_unique($canchaIds))) {
            throw new HttpException('No se puede repetir la misma cancha.', 400);
        }
        if (count($canchaIds) < 1 || count($canchaIds) > 4) {
            throw new HttpException('Debe haber entre 1 y 4 canchas.', 400);
        }
        if (!(new Cancha())->existenActivas($canchaIds)) {
            throw new HttpException('Una o mas canchas indicadas no existen o estan inactivas.', 400);
        }
        if ($modalidad === 'individual' && count($canchaIds) !== 1) {
            throw new HttpException('Una reserva individual debe tener exactamente 1 cancha.', 400);
        }
        if ($modalidad === 'completo' && count($canchaIds) !== 4) {
            throw new HttpException('Una reserva de campo completo debe tener exactamente 4 canchas.', 400);
        }

        return [
            'fecha' => $fecha,
            'hora_inicio' => $horaInicio,
            'cliente_nombre' => $clienteNombre,
            'academia_id' => $academiaId,
            'es_adelanto' => $esAdelanto,
            'yape' => $yape,
            'efectivo' => $efectivo,
            'duracion' => $duracion,
            'modalidad' => $modalidad,
            'cancha_ids' => $canchaIds,
        ];
    }

    // Equivalente al bloque de ReservaViewSet.create(): busca tarifa,
    // calcula hora_fin (con el caso especial de medianoche), verifica
    // disponibilidad y guarda todo en una transaccion.
    public static function crearReserva(array $datos, int $asignadaPorId): array
    {
        $tarifa = (new Tarifa())->obtenerParaHora($datos['modalidad'], $datos['hora_inicio']);
        if ($tarifa === null) {
            throw new HttpException('No hay tarifa configurada para esa modalidad y hora.', 400);
        }

        $inicioMin = Horario::minutosDesdeMedianoche($datos['hora_inicio']);
        $duracionMinutos = (int) round($datos['duracion'] * 60);
        $finMin = $inicioMin + $duracionMinutos;
        if ($finMin > 24 * 60) {
            throw new HttpException('La reserva no puede terminar despues de medianoche.', 400);
        }
        $horaFin = Horario::horaDesdeMinutos($finMin);

        $reservaModelo = new Reserva();
        $ocupadas = $reservaModelo->canchasOcupadas($datos['fecha'], $datos['hora_inicio'], $horaFin, $datos['cancha_ids']);
        if ($ocupadas !== []) {
            sort($ocupadas);
            throw new HttpException(
                'Las canchas [' . implode(', ', $ocupadas) . '] ya estan ocupadas a esa hora.', 400
            );
        }

        $precioTotal = bcdiv(bcmul($tarifa['precio_por_hora'], (string) $duracionMinutos, 4), '60', 2);

        $pdo = obtenerConexionPDO();
        $pdo->beginTransaction();
        try {
            $reservaId = $reservaModelo->crear([
                'modalidad' => $datos['modalidad'],
                'cliente_nombre' => $datos['cliente_nombre'],
                'fecha' => $datos['fecha'],
                'hora_inicio' => $datos['hora_inicio'],
                'hora_fin' => $horaFin,
                'precio_total' => $precioTotal,
                'academia_id' => $datos['academia_id'],
                'academia_horario_id' => null,
                'asignada_por_id' => $asignadaPorId,
                'es_adelanto' => $datos['es_adelanto'],
            ]);
            $reservaModelo->asignarCanchas($reservaId, $datos['cancha_ids']);

            $tipoPago = $datos['es_adelanto'] ? 'adelanto' : 'saldo';
            if (bccomp($datos['efectivo'], '0', 2) > 0) {
                self::guardarPago($reservaId, 'efectivo', $datos['efectivo'], $asignadaPorId, $tipoPago);
            }
            if (bccomp($datos['yape'], '0', 2) > 0) {
                self::guardarPago($reservaId, 'yape', $datos['yape'], $asignadaPorId, $tipoPago);
            }

            // Nota informativa en las Observaciones de HOY (el dia en que se
            // registra el adelanto, no el dia en que se juega -- la reserva
            // en si ya aparece sola en la grilla de ese otro dia). Lleva el
            // monto real (para que el badge de Yape/Efectivo salga solo, sin
            // editarla a mano) pero con cuenta_en_total=false: ese dinero ya
            // se cuenta por el Pago recien creado (fecha_hora = ahora);
            // sumarlo tambien aca duplicaria el total del dia.
            if ($datos['es_adelanto']) {
                $montoPartes = [];
                if (bccomp($datos['yape'], '0', 2) > 0) {
                    $montoPartes[] = "S/{$datos['yape']} Yape";
                }
                if (bccomp($datos['efectivo'], '0', 2) > 0) {
                    $montoPartes[] = "S/{$datos['efectivo']} Efectivo";
                }
                $montoTexto = $montoPartes === [] ? 'sin monto' : implode(' + ', $montoPartes);
                (new ComentarioDia())->crear(
                    date('Y-m-d'),
                    "Adelanto de {$datos['cliente_nombre']} — {$montoTexto} — juega el {$datos['fecha']} a las {$datos['hora_inicio']}.",
                    $datos['yape'], $datos['efectivo'], $asignadaPorId, null, null, false
                );
            }

            $pdo->commit();
        } catch (\Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }

        return $reservaModelo->paraSalida($reservaModelo->buscarPorId($reservaId));
    }

    // Upsert de a lo sumo un Pago por (reserva, metodo) -- equivalente a
    // guardar_pago(). monto<=0 borra el pago existente (equivale a "no
    // pago por este metodo"). 'tipo' solo se usa al CREAR el pago; uno que
    // se actualiza despues de creado siempre queda en 'saldo'.
    public static function guardarPago(int $reservaId, string $metodo, string $monto, int $usuarioId, string $tipo = 'saldo'): void
    {
        $modelo = new Pago();
        $ultimo = $modelo->buscarUltimoPorReservaYMetodo($reservaId, $metodo);

        if (bccomp($monto, '0', 2) <= 0) {
            if ($ultimo !== null) {
                $modelo->eliminar((int) $ultimo['id']);
            }
            return;
        }

        if ($ultimo !== null) {
            $modelo->actualizarMontoYTipo((int) $ultimo['id'], $monto, 'saldo', $usuarioId);
            return;
        }

        $modelo->crear($reservaId, $metodo, $monto, $tipo, $usuarioId);
    }

    // Upsert igual que guardarPago(), pero buscando SOLO entre los pagos
    // tipo='saldo' de esta reserva -- asi el saldo que se completa en un
    // adelanto se puede editar (mostrar lo ya cobrado, corregirlo) sin
    // arriesgarse a encontrar y pisar el deposito original (tipo='adelanto'
    // del mismo metodo, que tiene que conservar su fecha_hora para seguir
    // contando en el dia en que realmente se cobro).
    public static function actualizarSaldo(int $reservaId, string $metodo, string $monto, int $usuarioId): void
    {
        $modelo = new Pago();
        $existente = $modelo->buscarUltimoPorReservaMetodoYTipo($reservaId, $metodo, 'saldo');

        if (bccomp($monto, '0', 2) <= 0) {
            if ($existente !== null) {
                $modelo->eliminar((int) $existente['id']);
            }
            return;
        }

        if ($existente !== null) {
            $modelo->actualizarMontoYTipo((int) $existente['id'], $monto, 'saldo', $usuarioId);
            return;
        }

        $modelo->crear($reservaId, $metodo, $monto, 'saldo', $usuarioId);
    }

    public static function resumenPagosPorFecha(string $fecha): array
    {
        $pagos = (new Pago())->totalesPorFecha($fecha);
        $comentarios = (new ComentarioDia())->totalesPorFecha($fecha);

        $totalEfectivo = bcadd($pagos['efectivo'], $comentarios['efectivo'], 2);
        $totalYape = bcadd($pagos['yape'], $comentarios['yape'], 2);

        return [
            'total_efectivo' => $totalEfectivo,
            'total_yape' => $totalYape,
            'total_general' => bcadd($totalEfectivo, $totalYape, 2),
        ];
    }

    private static function decimalNoNegativo(mixed $valor, string $campo): string
    {
        $texto = (string) $valor;
        if (!preg_match('/^\d+(\.\d{1,2})?$/', $texto)) {
            throw new HttpException("{$campo} debe ser un numero valido, no negativo (hasta 2 decimales).", 400);
        }
        return bcadd($texto, '0', 2);
    }
}
