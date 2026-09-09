-- ============================================================================
-- Actualizacion incremental (5 del dia): agrega comentarios_dia.
-- cuenta_en_total -- permite que la nota automatica de "se registro un
-- adelanto" muestre el monto real (badge automatico, sin editar a mano)
-- sin que ese dinero se duplique en el total del dia (ya se cuenta por su
-- Pago real). Correr una sola vez contra la base ya existente.
-- ============================================================================

ALTER TABLE `comentarios_dia`
  ADD COLUMN `cuenta_en_total` TINYINT(1) NOT NULL DEFAULT 1 AFTER `academia_deuda_resultante`;
