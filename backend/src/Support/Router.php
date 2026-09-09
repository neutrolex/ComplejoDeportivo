<?php

declare(strict_types=1);

namespace App\Support;

use App\Middleware\AuthMiddleware;

// Router minimo por regex, sin dependencias externas. Cada ruta guarda su
// metodo HTTP, un patron tipo '/reservas/{id}' y un callable que recibe
// los parametros nombrados capturados de la URL y, si la ruta es
// protegida, la fila del usuario autenticado.
//
// $protegida por defecto es true en las cuatro rutas: mismo criterio que
// DEFAULT_PERMISSION_CLASSES=IsAuthenticated en el settings.py original
// (fallar cerrado si una ruta nueva se olvida marcar como publica, en vez
// de quedar expuesta sin querer).
class Router
{
    /** @var list<array{metodo: string, patron: string, handler: callable, protegida: bool}> */
    private array $rutas = [];

    public function get(string $ruta, callable $handler, bool $protegida = true): void
    {
        $this->agregar('GET', $ruta, $handler, $protegida);
    }

    public function post(string $ruta, callable $handler, bool $protegida = true): void
    {
        $this->agregar('POST', $ruta, $handler, $protegida);
    }

    public function put(string $ruta, callable $handler, bool $protegida = true): void
    {
        $this->agregar('PUT', $ruta, $handler, $protegida);
    }

    public function patch(string $ruta, callable $handler, bool $protegida = true): void
    {
        $this->agregar('PATCH', $ruta, $handler, $protegida);
    }

    public function delete(string $ruta, callable $handler, bool $protegida = true): void
    {
        $this->agregar('DELETE', $ruta, $handler, $protegida);
    }

    private function agregar(string $metodo, string $ruta, callable $handler, bool $protegida): void
    {
        // '{id}' -> grupo nombrado que solo matchea segmentos sin '/'.
        $patron = preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $ruta);
        $this->rutas[] = [
            'metodo' => $metodo,
            'patron' => "#^{$patron}$#",
            'handler' => $handler,
            'protegida' => $protegida,
        ];
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
                $usuario = $ruta['protegida'] ? AuthMiddleware::requerirUsuario() : null;
                ($ruta['handler'])($parametros, $usuario);
                return;
            }
        }
        Response::error('Ruta no encontrada.', 404);
    }
}
