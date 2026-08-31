<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\DisponibilidadService;
use App\Support\HttpException;
use App\Support\Horario;
use App\Support\Response;

// GET /api/publico/disponibilidad/, sin autenticacion -- la usa la web
// publica de horarios.
class DisponibilidadPublicaController
{
    public static function get(): void
    {
        $fecha = $_GET['fecha'] ?? null;
        if ($fecha === null || $fecha === '') {
            throw new HttpException('Falta el parametro fecha.', 400);
        }
        if (!Horario::fechaValida($fecha)) {
            throw new HttpException('Formato de fecha invalido, use YYYY-MM-DD.', 400);
        }
        Response::json(DisponibilidadService::grillaPublica($fecha));
    }
}
