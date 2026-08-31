<?php

declare(strict_types=1);

namespace App\Support;

// Router minimo por regex, sin dependencias externas. Cada ruta guarda su
// metodo HTTP, un patron tipo '/reservas/{id}' y un callable que recibe
// los parametros nombrados capturados de la URL.
class Router
{
    /** @var list<array{metodo: string, patron: string, handler: callable}> */
    private array $rutas = [];

    public function get(string $ruta, callable $handler): void
    {
        $this->agregar('GET', $ruta, $handler);
    }

    public function post(string $ruta, callable $handler): void
    {
        $this->agregar('POST', $ruta, $handler);
    }

    public function put(string $ruta, callable $handler): void
    {
        $this->agregar('PUT', $ruta, $handler);
    }

    public function patch(string $ruta, callable $handler): void
    {
        $this->agregar('PATCH', $ruta, $handler);
    }

    public function delete(string $ruta, callable $handler): void
    {
        $this->agregar('DELETE', $ruta, $handler);
    }

    private function agregar(string $metodo, string $ruta, callable $handler): void
    {
        // '{id}' -> grupo nombrado que solo matchea segmentos sin '/'.
        $patron = preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $ruta);
        $this->rutas[] = ['metodo' => $metodo, 'patron' => "#^{$patron}$#", 'handler' => $handler];
    }

    public function despachar(string $metodo, string $path): void
    {
        foreach ($this->rutas as $ruta) {
            if ($ruta['metodo'] !== $metodo) {
                continue;
            }
            if (preg_match($ruta['patron'], $path, $coincidencias)) {
                $parametros = array_filter(
                    $coincidencias,
                    fn ($clave) => !is_int($clave),
                    ARRAY_FILTER_USE_KEY
                );
                ($ruta['handler'])($parametros);
                return;
            }
        }
        Response::error('Ruta no encontrada.', 404);
    }
}
