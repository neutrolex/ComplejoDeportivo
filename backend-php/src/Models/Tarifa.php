<?php

declare(strict_types=1);

namespace App\Models;

class Tarifa
{
    public function listar(): array
    {
        $stmt = obtenerConexionPDO()->query(
            'SELECT id, modalidad, hora_inicio, hora_fin, precio_por_hora
             FROM tarifas ORDER BY modalidad, hora_inicio'
        );
        return array_map([self::class, 'paraSalida'], $stmt->fetchAll());
    }

    // Equivalente a obtener_tarifa(): busca la tarifa que cubre una hora
    // dada para una modalidad, tratando hora_fin='00:00' como fin del dia
    // operativo (no como las 00:00 del mismo dia).
    public function obtenerParaHora(string $modalidad, string $hora): ?array
    {
        $stmt = obtenerConexionPDO()->prepare(
            'SELECT id, modalidad, hora_inicio, hora_fin, precio_por_hora FROM tarifas WHERE modalidad = :modalidad'
        );
        $stmt->execute(['modalidad' => $modalidad]);

        foreach ($stmt->fetchAll() as $fila) {
            $horaInicio = substr($fila['hora_inicio'], 0, 5);
            $horaFin = substr($fila['hora_fin'], 0, 5);
            $terminaAMedianoche = $horaFin === '00:00';
            $cubreLaHora = $horaInicio <= $hora && ($terminaAMedianoche || $hora < $horaFin);
            if ($cubreLaHora) {
                return self::paraSalida($fila);
            }
        }
        return null;
    }

    // Hora entera mas temprana entre todas las tarifas -- referencia para
    // armar la grilla de horas operativas (igual criterio que
    // horas_operativas() del original).
    public function primeraHoraOperativa(): ?int
    {
        $stmt = obtenerConexionPDO()->query('SELECT hora_inicio FROM tarifas ORDER BY hora_inicio LIMIT 1');
        $fila = $stmt->fetch();
        return $fila === false ? null : (int) substr($fila['hora_inicio'], 0, 2);
    }

    private static function paraSalida(array $fila): array
    {
        return [
            'id' => (int) $fila['id'],
            'modalidad' => $fila['modalidad'],
            'hora_inicio' => substr($fila['hora_inicio'], 0, 5),
            'hora_fin' => substr($fila['hora_fin'], 0, 5),
            'precio_por_hora' => $fila['precio_por_hora'],
        ];
    }
}
