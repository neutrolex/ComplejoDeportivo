-- ============================================================================
-- Actualizacion incremental (2 del dia): agrega el valor 'debe' al ENUM de
-- reservas.estado. Se usa cuando una academia no paga una reserva del dia y
-- se decide registrarla como deuda (ver ReservaController::marcarDeuda) en
-- vez de dejarla pendiente de cobro indefinidamente.
-- Correr una sola vez contra la base ya existente.
-- ============================================================================

ALTER TABLE `reservas`
  MODIFY COLUMN `estado` ENUM('confirmada', 'cancelada', 'completada', 'ausente', 'debe')
    NOT NULL DEFAULT 'confirmada';
