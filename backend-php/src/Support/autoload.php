<?php

declare(strict_types=1);

// Autoload minimo estilo PSR-4 sin Composer: App\Foo\Bar -> src/Foo/Bar.php.
spl_autoload_register(function (string $clase): void {
    $prefijo = 'App\\';
    if (!str_starts_with($clase, $prefijo)) {
        return;
    }
    $relativo = substr($clase, strlen($prefijo));
    $ruta = dirname(__DIR__) . '/' . str_replace('\\', '/', $relativo) . '.php';
    if (is_file($ruta)) {
        require $ruta;
    }
});
