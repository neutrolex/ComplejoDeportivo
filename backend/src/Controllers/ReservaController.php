<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\Academia;
use App\Models\ComentarioDia;
use App\Models\Reserva;
use App\Services\AcademiaService;
use App\Services\DashboardService;
use App\Services\ReservaService;
use App\Support\HttpException;
use App\Support\Horario;
use App\Support\Response;

class ReservaController
{
    public static function list(array $parametros, array $usuario): void
    {
        $fecha = $_GET['fecha'] ?? null;
        self::exigirFechaValida($fecha);

        // Materializacion perezosa: no hay ningun proceso en segundo
        // plano, se generan las reservas de horarios fijos de academia la
        // primera vez que alguien mira este dia.
        AcademiaService::materializarHorarios($fecha, (int) $usuario['id']);

        Response::json((new Reserva())->listarPorFecha($fecha));
    }

    public static function create(array $parametros, array $usuario): void
    {
        $datos = ReservaService::validarNuevaReserva(self::leerJson());
        $reserva = ReservaService::crearReserva($datos, (int) $usuario['id']);
        Response::json($reserva, 201);
    }

    public static function cancelar(array $parametros): void
    {
        $modelo = new Reserva();
        $reserva = self::obtenerOFallar($modelo, (int) $parametros['id']);
        $modelo->actualizarEstado((int) $reserva['id'], 'cancelada');
        Response::json($modelo->paraSalida($modelo->buscarPorId((int) $reserva['id'])));
    }

    // Toggle, no un solo sentido: marca "no vino" si no lo estaba, y
    // revierte a confirmada si ya lo estaba. A diferencia de cancelar/,
    // no toca los pagos ya cargados.
    public static function ausente(array $parametros): void
    {
        $modelo = new Reserva();
        $reserva = self::obtenerOFallar($modelo, (int) $parametros['id']);
        $nuevoEstado = $reserva['estado'] === 'ausente' ? 'confirmada' : 'ausente';
        $modelo->actualizarEstado((int) $reserva['id'], $nuevoEstado);
        Response::json($modelo->paraSalida($modelo->buscarPorId((int) $reserva['id'])));
    }

    public static function adelantosPendientes(): void
    {
        Response::json((new Reserva())->listarAdelantosPendientes());
    }

    // La academia de esta reserva no pago hoy: en vez de dejarla "pendiente"
    // de cobro para siempre, se registra como deuda -- el monto se suma a
    // academias.deuda_actual (Pago de academia despues la va bajando) y
    // queda anotado en un comentario del dia, sin afectar los totales de
    // Yape/Efectivo porque no es dinero que realmente haya entrado hoy.
    public static function marcarDeuda(array $parametros, array $usuario): void
    {
        $modelo = new Reserva();
        $reserva = self::obtenerOFallar($modelo, (int) $parametros['id']);

        if ($reserva['academia_id'] === null) {
            throw new HttpException('Esta reserva no tiene una academia asociada.', 400);
        }

        $datos = self::leerJson();
        if (!is_numeric($datos['monto'] ?? null) || (float) $datos['monto'] <= 0) {
            throw new HttpException('monto debe ser un numero mayor a 0.', 400);
        }
        $monto = bcadd((string) $datos['monto'], '0', 2);

        $academiaModelo = new Academia();
        $academia = $academiaModelo->buscarPorId((int) $reserva['academia_id']);
        if ($academia === null) {
            throw new HttpException('La academia de esta reserva ya no existe.', 404);
        }

        $pdo = obtenerConexionPDO();
        $pdo->beginTransaction();
        try {
            $modelo->actualizarEstado((int) $reserva['id'], 'debe');
            $academiaModelo->ajustarDeuda((int) $academia['id'], $monto);
            (new ComentarioDia())->crear(
                $reserva['fecha'], "Deuda registrada: {$academia['nombre']} debe S/{$monto} del día.",
                '0.00', '0.00', (int) $usuario['id'], null
            );
            $pdo->commit();
        } catch (\Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }

        Response::json([
            'reserva' => $modelo->paraSalida($modelo->buscarPorId((int) $reserva['id'])),
            'academia' => $academiaModelo->conAcademiaFormateada((int) $academia['id']),
        ]);
    }

    public static function pagos(array $parametros, array $usuario): void
    {
        $modelo = new Reserva();
        $reserva = self::obtenerOFallar($modelo, (int) $parametros['id']);

        $datos = self::leerJson();
        foreach (['efectivo', 'yape'] as $metodo) {
            if (!array_key_exists($metodo, $datos)) {
                continue;
            }
            if (!is_numeric($datos[$metodo])) {
                throw new HttpException("{$metodo} debe ser un numero.", 400);
            }
            $monto = (string) $datos[$metodo];
            if (bccomp($monto, '0', 2) < 0) {
                throw new HttpException("{$metodo} no puede ser negativo.", 400);
            }
            ReservaService::guardarPago((int) $reserva['id'], $metodo, bcadd($monto, '0', 2), (int) $usuario['id']);
        }

        Response::json($modelo->paraSalida($modelo->buscarPorId((int) $reserva['id'])));
    }

    // Para completar el saldo de un adelanto en otro dia: fija el total de
    // cada metodo igual que pagos(), pero el upsert busca solo entre los
    // pagos tipo='saldo' (ver ReservaService::actualizarSaldo) -- nunca
    // encuentra ni pisa el deposito original (tipo='adelanto'), que
    // conserva su fecha_hora y su dia en el total. Tambien es donde se
    // guarda el estado_pago manual (Pendiente/Pagado/Falta) de un adelanto.
    public static function agregarPago(array $parametros, array $usuario): void
    {
        $modelo = new Reserva();
        $reserva = self::obtenerOFallar($modelo, (int) $parametros['id']);

        $datos = self::leerJson();
        foreach (['efectivo', 'yape'] as $metodo) {
            if (!array_key_exists($metodo, $datos)) {
                continue;
            }
            if (!is_numeric($datos[$metodo])) {
                throw new HttpException("{$metodo} debe ser un numero.", 400);
            }
            $monto = (string) $datos[$metodo];
            if (bccomp($monto, '0', 2) < 0) {
                throw new HttpException("{$metodo} no puede ser negativo.", 400);
            }
            ReservaService::actualizarSaldo((int) $reserva['id'], $metodo, bcadd($monto, '0', 2), (int) $usuario['id']);
        }

        if (array_key_exists('estado_pago', $datos)) {
            $estadoPago = (string) $datos['estado_pago'];
            if (!in_array($estadoPago, ['pendiente', 'pagado', 'falta'], true)) {
                throw new HttpException('estado_pago invalido (use pendiente, pagado o falta).', 400);
            }
            $modelo->actualizarEstadoPago((int) $reserva['id'], $estadoPago);
        }

        Response::json($modelo->paraSalida($modelo->buscarPorId((int) $reserva['id'])));
    }

    // Agrupa por la fecha en que se registro el PAGO, no por la fecha de
    // la reserva -- ver ReservaService::resumenPagosPorFecha().
    public static function resumenPagos(): void
    {
        $fecha = $_GET['fecha'] ?? null;
        self::exigirFechaValida($fecha);
        Response::json(ReservaService::resumenPagosPorFecha($fecha));
    }

    public static function dashboardFinanciero(): void
    {
        Response::json(DashboardService::resumen(date('Y-m-d')));
    }

    private static function exigirFechaValida(?string $fecha): void
    {
        if ($fecha === null || $fecha === '') {
            throw new HttpException('Falta el parametro fecha.', 400);
        }
        if (!Horario::fechaValida($fecha)) {
            throw new HttpException('Formato de fecha invalido, use YYYY-MM-DD.', 400);
        }
    }

    private static function obtenerOFallar(Reserva $modelo, int $id): array
    {
        $fila = $modelo->buscarPorId($id);
        if ($fila === null) {
            throw new HttpException('Reserva no encontrada.', 404);
        }
        return $fila;
    }

    private static function leerJson(): array
    {
        $datos = json_decode((string) file_get_contents('php://input'), true);
        return is_array($datos) ? $datos : [];
    }
}
