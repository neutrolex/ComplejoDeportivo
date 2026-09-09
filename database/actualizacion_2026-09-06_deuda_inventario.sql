-- ============================================================================
-- Actualizacion incremental para bases de datos ya existentes (no re-importar
-- schema.sql: eso borraria los datos). Agrega:
--   1. academias.deuda_actual        (saldo manual que se resta al marcar un
--                                      comentario del dia como pago de esa
--                                      academia)
--   2. comentarios_dia.academia_id   (vinculo opcional comentario -> academia)
--   3. tabla inventario              (materiales del complejo)
-- Correr una sola vez contra la base ya existente (phpMyAdmin o
-- mysql < database/actualizacion_2026-09-06_deuda_inventario.sql).
-- ============================================================================

ALTER TABLE `academias`
  ADD COLUMN `deuda_actual` DECIMAL(7,2) NOT NULL DEFAULT 0.00 AFTER `color`;

ALTER TABLE `comentarios_dia`
  ADD COLUMN `academia_id` BIGINT UNSIGNED NULL AFTER `creado_por_id`,
  ADD CONSTRAINT `fk_comentarios_dia_academia`
    FOREIGN KEY (`academia_id`) REFERENCES `academias` (`id`) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS `inventario` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(150) NOT NULL,
  `cantidad` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
