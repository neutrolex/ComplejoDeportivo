-- ============================================================================
-- Actualizacion incremental (4 del dia): agrega reservas.estado_pago --
-- estado manual (Pendiente / Pagado / Falta) que la persona a cargo elige a
-- mano en un adelanto, en vez de que la app calcule cuanto falta pagar
-- (el precio real de la cancha puede variar por negociacion/horario).
-- Correr una sola vez contra la base ya existente.
-- ============================================================================

ALTER TABLE `reservas`
  ADD COLUMN `estado_pago` ENUM('pendiente', 'pagado', 'falta') NOT NULL DEFAULT 'pendiente' AFTER `es_adelanto`;
