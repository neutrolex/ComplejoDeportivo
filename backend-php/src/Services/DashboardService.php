<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ComentarioDia;
use App\Models\Pago;

// Traduccion de resumen_financiero_dashboard() y sus helpers privados en
// reservas/servicios.py. Arma todo lo que necesita el dashboard financiero
// (Recharts en React) en una sola pasada.
class DashboardService
{
    // $hoy es un string 'YYYY-MM-DD' que el llamador controla (no se
    // calcula aca), igual que el parametro 'hoy' del original -- facilita
    // probar con una fecha fija.
    public static function resumen(string $hoy): array
    {
        $ayer = self::sumarDias($hoy, -1);
        $diaSemanaCero = ((int) (new \DateTime($hoy))->format('N')) - 1; // 0=Lunes..6=Domingo
        $lunesDeEstaSemana = self::sumarDias($hoy, -$diaSemanaCero);
        $primeroDelMes = substr($hoy, 0, 8) . '01';
        $desde30Dias = self::sumarDias($hoy, -29);

        [$montoHoy, $reservasHoy] = self::montoYConteo($hoy, $hoy);
        [$montoAyer, $reservasAyer] = self::montoYConteo($ayer, $ayer);
        [$montoSemana, $reservasSemana] = self::montoYConteo($lunesDeEstaSemana, $hoy);
        [$montoMes, $reservasMes] = self::montoYConteo($primeroDelMes, $hoy);

        $totalesPagos30d = (new Pago())->totalesEntreFechas($desde30Dias, $hoy);
        $totalesComentarios30d = (new ComentarioDia())->totalesEntreFechas($desde30Dias, $hoy);

        return [
            'hoy' => ['monto' => $montoHoy, 'reservas' => $reservasHoy],
            'ayer' => ['monto' => $montoAyer, 'reservas' => $reservasAyer],
            'esta_semana' => ['monto' => $montoSemana, 'reservas' => $reservasSemana],
            'este_mes' => ['monto' => $montoMes, 'reservas' => $reservasMes],
            'total_yape_30_dias' => bcadd($totalesPagos30d['yape'], $totalesComentarios30d['yape'], 2),
            'total_efectivo_30_dias' => bcadd($totalesPagos30d['efectivo'], $totalesComentarios30d['efectivo'], 2),
            'ingresos_diarios_30_dias' => self::ingresosDiarios($desde30Dias, $hoy),
            'ingresos_por_cancha_30_dias' => self::ingresosPorCancha($desde30Dias, $hoy),
        ];
    }

    // Suma de pagos + comentarios (por su fecha de negocio) entre $desde y
    // $hasta (ambas inclusive), y cantidad de reservas distintas que
    // tuvieron al menos un pago en ese rango. Tambien cuenta pagos de
    // reservas canceladas -- esa plata entro igual a la caja ese dia. Un
    // ComentarioDia no esta ligado a ninguna reserva, asi que solo aporta
    // al monto, no al conteo.
    private static function montoYConteo(string $desde, string $hasta): array
    {
        $pagos = (new Pago())->resumenEntreFechas($desde, $hasta);
        $comentarios = (new ComentarioDia())->totalesEntreFechas($desde, $hasta);
        $montoComentarios = bcadd($comentarios['yape'], $comentarios['efectivo'], 2);
        return [bcadd($pagos['monto'], $montoComentarios, 2), $pagos['reservas']];
    }

    // Lista de {fecha, yape, efectivo} para cada dia entre $desde y $hasta
    // (ambas inclusive), sumando Pago + ComentarioDia, en orden
    // cronologico, con '0.00' en los dias sin ninguno de los dos.
    private static function ingresosDiarios(string $desde, string $hasta): array
    {
        $porDia = [];
        for ($cursor = $desde; $cursor <= $hasta; $cursor = self::sumarDias($cursor, 1)) {
            $porDia[$cursor] = ['yape' => '0.00', 'efectivo' => '0.00'];
        }

        foreach ((new Pago())->porDiaYMetodoEntreFechas($desde, $hasta) as $fila) {
            $porDia[$fila['dia']][$fila['metodo']] = bcadd((string) $fila['total'], '0', 2);
        }
        foreach ((new ComentarioDia())->porDiaEntreFechas($desde, $hasta) as $fila) {
            $porDia[$fila['fecha']]['yape'] = bcadd($porDia[$fila['fecha']]['yape'], (string) $fila['yape'], 2);
            $porDia[$fila['fecha']]['efectivo'] = bcadd($porDia[$fila['fecha']]['efectivo'], (string) $fila['efectivo'], 2);
        }

        ksort($porDia);
        $resultado = [];
        foreach ($porDia as $fecha => $datos) {
            $resultado[] = ['fecha' => $fecha, 'yape' => $datos['yape'], 'efectivo' => $datos['efectivo']];
        }
        return $resultado;
    }

    private static function ingresosPorCancha(string $desde, string $hasta): array
    {
        $pagoModelo = new Pago();
        $totalesPorCancha = $pagoModelo->totalesPorCanchaEntreFechas($desde, $hasta);
        $campoCompleto = $pagoModelo->totalCompletoEntreFechas($desde, $hasta);

        $resultado = [];
        foreach ([1, 2, 3, 4] as $numero) {
            $resultado[] = ['cancha' => "Cancha {$numero}", 'monto' => $totalesPorCancha[$numero]];
        }
        $resultado[] = ['cancha' => 'Campo completo', 'monto' => $campoCompleto];
        return $resultado;
    }

    private static function sumarDias(string $fecha, int $dias): string
    {
        $objeto = new \DateTime($fecha);
        $objeto->modify(($dias >= 0 ? '+' : '') . $dias . ' day');
        return $objeto->format('Y-m-d');
    }
}
