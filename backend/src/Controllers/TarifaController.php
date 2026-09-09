<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\Tarifa;
use App\Support\Response;

class TarifaController
{
    public static function list(): void
    {
        Response::json((new Tarifa())->listar());
    }
}
