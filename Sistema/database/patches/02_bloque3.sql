-- WorkIn · Parche 02 (bloque 3: bolsa, ofertas, asistencia)
-- Ejecutar en phpMyAdmin sobre la base de WorkIn. Se puede correr más de una vez.

-- Datos descriptivos del turno (lo que el trabajador ve en la oferta)
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS title       VARCHAR(120) NULL COMMENT 'Ej.: Peoneta de descarga' AFTER location_id,
  ADD COLUMN IF NOT EXISTS notes       VARCHAR(500) NULL COMMENT 'Indicaciones para el trabajador' AFTER title,
  ADD COLUMN IF NOT EXISTS is_night    TINYINT(1) NOT NULL DEFAULT 0 AFTER slots,
  ADD COLUMN IF NOT EXISTS is_holiday  TINYINT(1) NOT NULL DEFAULT 0 AFTER is_night;

-- Para saber a quién ya se le avisó de una oferta (y no repetir correos)
CREATE INDEX IF NOT EXISTS idx_notif_type_shift_user ON notifications (type, shift_id, user_id);

-- Búsqueda de ofertas visibles por empresa y estado
CREATE INDEX IF NOT EXISTS idx_cw_company_status ON company_workers (company_id, status);
