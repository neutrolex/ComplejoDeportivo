<?php

declare(strict_types=1);

namespace App\Support;

// Excepcion para cortar un controller/middleware con una respuesta HTTP
// especifica (401, 403, 404, 400...) sin sembrar `exit` por todos lados.
// El handler global en public/index.php la distingue de un error real y
// responde con el mensaje y status que trae, en vez del 500 generico.
class HttpException extends \RuntimeException
{
    public function __construct(string $mensaje, private readonly int $status = 400)
    {
        parent::__construct($mensaje);
    }

    public function status(): int
    {
        return $this->status;
    }
}
