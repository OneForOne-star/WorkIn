-- WorkIn · Borra los datos de prueba creados por 06_datos_prueba.sql
-- (todo lo que lleva [PRUEBA] o el correo @prueba.workin.cl). No toca el trabajador trabajador.prueba@example.com
-- ni lo que hayas creado tú sin esa marca.
SET NAMES utf8mb4;

CREATE TEMPORARY TABLE tmp_users AS SELECT id FROM users WHERE email LIKE '%@prueba.workin.cl';
CREATE TEMPORARY TABLE tmp_shifts AS SELECT id FROM shifts WHERE title LIKE '[PRUEBA]%';
CREATE TEMPORARY TABLE tmp_att AS
  SELECT t.id FROM attendances t JOIN shift_assignments a ON a.id = t.shift_assignment_id WHERE a.shift_id IN (SELECT id FROM tmp_shifts);
CREATE TEMPORARY TABLE tmp_periods AS
  SELECT DISTINCT payment_period_id AS id FROM attendances WHERE id IN (SELECT id FROM tmp_att) AND payment_period_id IS NOT NULL;

-- Períodos cerrados con asistencias de prueba: se deshacen (lo que no es de prueba vuelve a quedar sin cerrar)
DELETE FROM payment_statements WHERE payment_period_id IN (SELECT id FROM tmp_periods) OR user_id IN (SELECT id FROM tmp_users);
UPDATE attendances SET payment_period_id = NULL WHERE payment_period_id IN (SELECT id FROM tmp_periods);
DELETE FROM payment_periods WHERE id IN (SELECT id FROM tmp_periods);

DELETE FROM notifications WHERE user_id IN (SELECT id FROM tmp_users) OR shift_id IN (SELECT id FROM tmp_shifts);
DELETE FROM personal_access_tokens WHERE tokenable_type LIKE '%User' AND tokenable_id IN (SELECT id FROM tmp_users);
DELETE FROM overtime_hours WHERE attendance_id IN (SELECT id FROM tmp_att);
DELETE FROM attendances WHERE id IN (SELECT id FROM tmp_att);
DELETE FROM shift_assignments WHERE shift_id IN (SELECT id FROM tmp_shifts) OR user_id IN (SELECT id FROM tmp_users);
DELETE FROM shifts WHERE id IN (SELECT id FROM tmp_shifts);
DELETE FROM locations WHERE name LIKE '[PRUEBA]%';
DELETE FROM company_workers WHERE user_id IN (SELECT id FROM tmp_users);
DELETE FROM disqualifications WHERE user_id IN (SELECT id FROM tmp_users);
DELETE FROM rut_lookup_attempts WHERE user_id IN (SELECT id FROM tmp_users);
-- El historial de auditoría no se puede editar: si un usuario de prueba dejó registros (por ejemplo aceptó un pago),
-- no se borra; queda desactivado y fuera de la bolsa.
DELETE FROM users WHERE id IN (SELECT id FROM tmp_users) AND id NOT IN (SELECT user_id FROM audit_logs WHERE user_id IS NOT NULL);
UPDATE users SET is_active = 0, email = CONCAT('borrado', id, '@prueba.workin.cl'), phone = '+56900000000'
 WHERE id IN (SELECT id FROM tmp_users);
DELETE FROM rates WHERE name LIKE '[PRUEBA]%';

DROP TEMPORARY TABLE tmp_periods; DROP TEMPORARY TABLE tmp_att; DROP TEMPORARY TABLE tmp_shifts; DROP TEMPORARY TABLE tmp_users;
