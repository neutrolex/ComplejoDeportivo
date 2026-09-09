-- ============================================================================
-- Actualizacion incremental (6 del dia): agrega academias.tipo -- distingue
-- 'academia' (default, se puede mostrar en la web publica) de
-- 'cliente_fijo' (mismo mecanismo de horario recurrente, pero nunca se
-- muestra en la web publica). Correr una sola vez contra la base ya
-- existente.
-- ============================================================================

ALTER TABLE `academias`
  ADD COLUMN `tipo` ENUM('academia', 'cliente_fijo') NOT NULL DEFAULT 'academia' AFTER `nombre`;
