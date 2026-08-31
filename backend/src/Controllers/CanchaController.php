<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\Cancha;
use App\Support\Response;

class CanchaController
{
    public static function list(): void
    {
        Response::json((new Cancha())->listar());
    }
}
