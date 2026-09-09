-- ============================================================================
-- Actualizacion incremental (3 del dia): agrega comentarios_dia.
-- academia_deuda_resultante -- foto del saldo de la academia justo despues
-- de ese pago, para poder mostrar "Debe S/X" junto al pago en el historial
-- del dia. Correr una sola vez contra la base ya existente.
-- ============================================================================

ALTER TABLE `comentarios_dia`
  ADD COLUMN `academia_deuda_resultante` DECIMAL(7,2) NULL AFTER `academia_id`;
