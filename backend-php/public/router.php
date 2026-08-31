<?php

// Router para el servidor embebido de PHP en desarrollo local
// (`php -S host:puerto -t public public/router.php`). El servidor
// embebido no lee .htaccess, asi que este script reproduce el mismo
// "todo pasa por index.php" que hace Apache en produccion.
require __DIR__ . '/index.php';
