-- WorkIn · Parche 04: cada turno guarda la tarifa con la que se publicó (queda fija).
-- Agrega a shifts: rate_id (referencia) y una copia de nombre y montos (para que el historial no cambie nunca).
-- Los turnos que ya existían reciben la tarifa más reciente de su empresa (son datos de prueba).
-- Ejecutar en phpMyAdmin (pestaña SQL) con la base de WorkIn seleccionada.

SET NAMES utf8mb4;

ALTER TABLE shifts
  ADD COLUMN rate_id               BIGINT UNSIGNED NULL AFTER created_by,
  ADD COLUMN rate_name             VARCHAR(80)  NULL AFTER rate_id,
  ADD COLUMN shift_amount          INT UNSIGNED NULL COMMENT 'Pago por turno, fijado al crear la oferta' AFTER rate_name,
  ADD COLUMN overtime_hour_amount  INT UNSIGNED NULL COMMENT 'Pago por hora extra, fijado al crear la oferta' AFTER shift_amount,
  ADD KEY idx_shifts_rate (rate_id),
  ADD CONSTRAINT fk_shifts_rate FOREIGN KEY (rate_id) REFERENCES rates (id);

-- Turnos existentes: primero la tarifa que ya usaron sus asistencias, si no, la más reciente de la empresa.
UPDATE shifts s
SET s.rate_id = COALESCE(
  (SELECT a.rate_id FROM attendances a
     JOIN shift_assignments sa ON sa.id = a.shift_assignment_id AND sa.shift_id = s.id
    ORDER BY a.id LIMIT 1),
  (SELECT r.id FROM rates r WHERE r.company_id = s.company_id ORDER BY r.valid_from DESC, r.id DESC LIMIT 1)
)
WHERE s.rate_id IS NULL;

UPDATE shifts s
JOIN rates r ON r.id = s.rate_id
SET s.rate_name = r.name, s.shift_amount = r.shift_amount, s.overtime_hour_amount = r.overtime_hour_amount
WHERE s.shift_amount IS NULL;
