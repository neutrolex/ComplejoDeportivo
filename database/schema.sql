-- ============================================================================
-- Complejo Deportivo — esquema MySQL / MariaDB
-- ============================================================================
-- Reconstruido desde cero a partir de los modelos Django (usuarios/models.py,
-- reservas/models.py) y sus migraciones — ver docs/migracion/01-auditoria.md.
-- No es una migración de datos: el proyecto todavía no tiene datos reales,
-- así que esto es el esquema completo listo para importar por phpMyAdmin.
--
-- Decisiones de diseño (documentadas para no repetir la discusión después):
--
-- 1. Se excluyen a propósito 'last_login', 'is_superuser' y las tablas de
--    grupos/permisos que Django agrega automáticamente via AbstractBaseUser
--    y PermissionsMixin. Ninguna vista del proyecto los usa (la autorización
--    real es el campo 'rol', chequeado a mano); recrearlos sería scaffolding
--    de Django sin ningún consumidor en la app.
-- 2. IDs en BIGINT UNSIGNED, igual que el BigAutoField que usa Django.
-- 3. Los 'choices' de Django se mapean a ENUM (más estricto que VARCHAR
--    libre, y coincide exactamente con las opciones reales del negocio).
-- 4. Sin tabla de refresh tokens: el JWT es completamente stateless en este
--    proyecto (SIMPLE_JWT rota el refresh pero sin django-rest-framework-
--    simplejwt.token_blacklist instalado, así que nunca hubo persistencia
--    de tokens en la base). El backend PHP reproduce el mismo comportamiento.
-- 5. Zona horaria: se guarda hora local America/Lima directamente en las
--    columnas DATETIME (a diferencia de Django, que internamente guarda UTC
--    con USE_TZ=True y convierte al mostrar). Como el proyecto es de un solo
--    complejo deportivo en Perú, sin usuarios en otras zonas horarias, esto
--    es más simple y evita depender de las tablas de zonas horarias de MySQL
--    (mysql_tzinfo_to_sql), que normalmente no están disponibles en hosting
--    compartido. El backend PHP debe fijar date_default_timezone_set(
--    'America/Lima') y la sesión MySQL en el mismo offset.
-- 6. Motor InnoDB en todas las tablas: imprescindible para FOREIGN KEY y
--    para el lock de fila (SELECT ... FOR UPDATE) que usa la materialización
--    de horarios de academia.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- usuarios_internos  (Django: usuarios.UsuarioInterno)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `usuarios_internos`;
CREATE TABLE `usuarios_internos` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(150) NOT NULL,
  `usuario` VARCHAR(50) NOT NULL,
  -- Hash de password_hash() (bcrypt por defecto), nunca texto plano.
  `password` VARCHAR(255) NOT NULL,
  `rol` ENUM('admin', 'recepcion') NOT NULL DEFAULT 'recepcion',
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_internos_usuario` (`usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- canchas  (Django: reservas.Cancha)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `canchas`;
CREATE TABLE `canchas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `numero` TINYINT UNSIGNED NOT NULL,
  `activa` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_canchas_numero` (`numero`),
  CONSTRAINT `chk_canchas_numero` CHECK (`numero` BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- tarifas  (Django: reservas.Tarifa)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `tarifas`;
CREATE TABLE `tarifas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `modalidad` ENUM('individual', 'completo') NOT NULL,
  `hora_inicio` TIME NOT NULL,
  -- '00:00' es un valor válido a propósito: significa "medianoche = fin del
  -- día operativo", mismo criterio especial que usa reservas/servicios.py
  -- (obtener_tarifa) en el backend Django/PHP, no una franja de 24 horas.
  `hora_fin` TIME NOT NULL,
  `precio_por_hora` DECIMAL(6,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tarifas_modalidad_hora` (`modalidad`, `hora_inicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- academias  (Django: reservas.Academia)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `academias`;
CREATE TABLE `academias` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(150) NOT NULL,
  `permiso_mostrar` TINYINT(1) NOT NULL DEFAULT 1,
  `color` VARCHAR(7) NOT NULL DEFAULT '#7c3aed',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- academia_horarios  (Django: reservas.AcademiaHorario)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `academia_horarios`;
CREATE TABLE `academia_horarios` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `academia_id` BIGINT UNSIGNED NOT NULL,
  -- Mismo criterio que date('N')-1 / weekday() de Python: Lunes=0 .. Domingo=6.
  `dia_semana` TINYINT UNSIGNED NOT NULL,
  `hora_inicio` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_academia_horarios_dia` (`dia_semana`),
  CONSTRAINT `chk_academia_horarios_dia` CHECK (`dia_semana` BETWEEN 0 AND 6),
  CONSTRAINT `fk_academia_horarios_academia`
    FOREIGN KEY (`academia_id`) REFERENCES `academias` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- academia_horario_canchas  (Django: M2M AcademiaHorario.canchas)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `academia_horario_canchas`;
CREATE TABLE `academia_horario_canchas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `academia_horario_id` BIGINT UNSIGNED NOT NULL,
  `cancha_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_academia_horario_canchas` (`academia_horario_id`, `cancha_id`),
  CONSTRAINT `fk_ahc_academia_horario`
    FOREIGN KEY (`academia_horario_id`) REFERENCES `academia_horarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ahc_cancha`
    FOREIGN KEY (`cancha_id`) REFERENCES `canchas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- reservas  (Django: reservas.Reserva)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `reservas`;
CREATE TABLE `reservas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `modalidad` ENUM('individual', 'completo') NOT NULL,
  -- Texto libre a propósito: además de nombres de clientes reales, el mismo
  -- campo se usa para bloqueos sin cliente (ej. "Mantenimiento") y para
  -- reservas materializadas de academias (nombre de la academia).
  `cliente_nombre` VARCHAR(150) NOT NULL,
  `fecha` DATE NOT NULL,
  `hora_inicio` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  `estado` ENUM('confirmada', 'cancelada', 'completada', 'ausente')
    NOT NULL DEFAULT 'confirmada',
  `precio_total` DECIMAL(7,2) NOT NULL,
  `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- NULL = reserva manual sin vínculo a una academia del catálogo.
  `academia_id` BIGINT UNSIGNED NULL,
  -- Solo se completa cuando la reserva la creó la materialización automática
  -- de un horario fijo de academia (nunca en una reserva manual).
  `academia_horario_id` BIGINT UNSIGNED NULL,
  `asignada_por_id` BIGINT UNSIGNED NOT NULL,
  -- True solo si nació del flujo "Agregar adelanto"; no se modifica después
  -- de creada (mantiene la celda negra en la grilla aunque se complete el pago).
  `es_adelanto` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_reservas_fecha` (`fecha`),
  KEY `idx_reservas_fecha_estado` (`fecha`, `estado`),
  KEY `idx_reservas_es_adelanto` (`es_adelanto`),
  CONSTRAINT `fk_reservas_academia`
    FOREIGN KEY (`academia_id`) REFERENCES `academias` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reservas_academia_horario`
    FOREIGN KEY (`academia_horario_id`) REFERENCES `academia_horarios` (`id`) ON DELETE SET NULL,
  -- RESTRICT (equivalente a PROTECT de Django): no se puede borrar un usuario
  -- interno que tenga reservas a su nombre; para eso está 'activo = 0'.
  CONSTRAINT `fk_reservas_asignada_por`
    FOREIGN KEY (`asignada_por_id`) REFERENCES `usuarios_internos` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- reserva_canchas  (Django: reservas.ReservaCancha)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `reserva_canchas`;
CREATE TABLE `reserva_canchas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reserva_id` BIGINT UNSIGNED NOT NULL,
  `cancha_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reserva_canchas` (`reserva_id`, `cancha_id`),
  CONSTRAINT `fk_reserva_canchas_reserva`
    FOREIGN KEY (`reserva_id`) REFERENCES `reservas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reserva_canchas_cancha`
    FOREIGN KEY (`cancha_id`) REFERENCES `canchas` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- pagos  (Django: reservas.Pago)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `pagos`;
CREATE TABLE `pagos` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reserva_id` BIGINT UNSIGNED NOT NULL,
  `tipo` ENUM('adelanto', 'saldo') NOT NULL,
  `monto` DECIMAL(7,2) NOT NULL,
  `metodo` ENUM('efectivo', 'yape') NOT NULL,
  `fecha_hora` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `registrado_por_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pagos_fecha_hora` (`fecha_hora`),
  KEY `idx_pagos_reserva_metodo` (`reserva_id`, `metodo`),
  CONSTRAINT `chk_pagos_monto` CHECK (`monto` >= 0),
  CONSTRAINT `fk_pagos_reserva`
    FOREIGN KEY (`reserva_id`) REFERENCES `reservas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pagos_registrado_por`
    FOREIGN KEY (`registrado_por_id`) REFERENCES `usuarios_internos` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- comentarios_dia  (Django: reservas.ComentarioDia)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `comentarios_dia`;
CREATE TABLE `comentarios_dia` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fecha` DATE NOT NULL,
  `texto` VARCHAR(500) NOT NULL,
  `monto_yape` DECIMAL(7,2) NOT NULL DEFAULT 0.00,
  `monto_efectivo` DECIMAL(7,2) NOT NULL DEFAULT 0.00,
  `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `creado_por_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comentarios_dia_fecha` (`fecha`),
  CONSTRAINT `chk_comentarios_dia_montos`
    CHECK (`monto_yape` >= 0 AND `monto_efectivo` >= 0),
  CONSTRAINT `fk_comentarios_dia_creado_por`
    FOREIGN KEY (`creado_por_id`) REFERENCES `usuarios_internos` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- Datos semilla — idénticos a reservas/migrations/0004_seed_canchas_tarifas.py
-- ============================================================================

INSERT INTO `canchas` (`numero`, `activa`) VALUES
  (1, 1), (2, 1), (3, 1), (4, 1);

INSERT INTO `tarifas` (`modalidad`, `hora_inicio`, `hora_fin`, `precio_por_hora`) VALUES
  ('individual', '08:00:00', '17:30:00', 50.00),
  ('individual', '17:30:00', '18:00:00', 60.00),
  ('individual', '18:00:00', '00:00:00', 70.00),
  ('completo',   '08:00:00', '18:00:00', 160.00),
  ('completo',   '18:00:00', '00:00:00', 180.00);
