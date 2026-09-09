<?php

declare(strict_types=1);

namespace App\Support;

// Helpers puros de horario, sin acceso a base de datos -- traduccion
// directa de las funciones homonimas en reservas/servicios.py del backend
// Django original. hora_fin='00:00' se trata siempre como "medianoche =
// fin del dia operativo", nunca como el inicio de un rango de 24 horas
// (PostgreSQL/MySQL no tienen un valor de hora para las 24:00).
class Horario
{
    public static function fechaValida(?string $texto): bool
    {
        if ($texto === null || $texto === '') {
            return false;
        }
        $fecha = \DateTime::createFromFormat('Y-m-d', $texto);
        return $fecha !== false && $fecha->format('Y-m-d') === $texto;
    }

    public static function minutosDesdeMedianoche(string $hora, bool $esFin = false): int
    {
        $partes = explode(':', $hora);
        $horas = (int) ($partes[0] ?? 0);
        $minutos = (int) ($partes[1] ?? 0);
        if ($esFin && $horas === 0 && $minutos === 0) {
            return 24 * 60;
        }
        return $horas * 60 + $minutos;
    }

    public static function horaDesdeMinutos(int $minutos): string
    {
        $minutos %= 24 * 60;
        return sprintf('%02d:%02d', intdiv($minutos, 60), $minutos % 60);
    }

    public static function seSolapan(string $inicioA, string $finA, string $inicioB, string $finB): bool
    {
        $aIni = self::minutosDesdeMedianoche($inicioA);
        $aFin = self::minutosDesdeMedianoche($finA, true);
        $bIni = self::minutosDesdeMedianoche($inicioB);
        $bFin = self::minutosDesdeMedianoche($finB, true);
        return $aIni < $bFin && $aFin > $bIni;
    }

    // Parte [horaInicio, horaFin) en tramos de a lo sumo 1 hora cada uno,
    // contados desde horaInicio -- el ultimo tramo se queda con lo que
    // sobre si la duracion total no es multiplo de 60 minutos.
    public static function segmentosDeUnaHora(string $horaInicio, string $horaFin): array
    {
        $inicioMin = self::minutosDesdeMedianoche($horaInicio);
        $finMin = self::minutosDesdeMedianoche($horaFin, true);
        $segmentos = [];
        $cursor = $inicioMin;
        while ($cursor < $finMin) {
            $siguiente = min($cursor + 60, $finMin);
            $segmentos[] = [self::horaDesdeMinutos($cursor), self::horaDesdeMinutos($siguiente)];
            $cursor = $siguiente;
        }
        return $segmentos;
    }
}
