-- WorkIn · Parche 03: lleva la base que quedó con el esquema v1 al esquema v2 (+ columnas del bloque 3).
-- Conserva: roles, planes, empresas, usuarios, auditoría y sesiones.
-- Recrea (vacías): tarifas, lugares, bolsa, turnos, postulaciones, asistencias, horas extra,
-- períodos y liquidaciones, notificaciones, inhabilitaciones e intentos de RUT.
-- Solo hay datos de prueba en esas tablas; si ya tuvieras datos reales ahí, NO ejecutes este parche.
-- Ejecutar en phpMyAdmin (pestaña SQL) con la base de WorkIn seleccionada.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TRIGGER IF EXISTS trg_sa_bi;
DROP TRIGGER IF EXISTS trg_sa_bu;
DROP PROCEDURE IF EXISTS sp_validate_confirmation;

DROP TABLE IF EXISTS rut_lookup_attempts, disqualifications, notifications, payment_statements,
  overtime_hours, attendances, payment_periods, shift_assignments, shifts, company_workers, locations, rates;

-- ---------------------------------------------------------------------
-- 4. Tarifas y lugares
-- ---------------------------------------------------------------------
CREATE TABLE rates (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id           BIGINT UNSIGNED NOT NULL,
  name                 VARCHAR(80) NOT NULL,
  shift_amount         INT UNSIGNED NOT NULL COMMENT 'Pago por turno',
  overtime_hour_amount INT UNSIGNED NOT NULL COMMENT 'Pago por hora extra',
  valid_from           DATE NOT NULL,
  valid_to             DATE NULL COMMENT 'NULL = vigente',
  created_at           TIMESTAMP NULL DEFAULT NULL,
  updated_at           TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_rates_company_valid (company_id, valid_from, valid_to),
  CONSTRAINT fk_rates_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT ck_rates_valid CHECK (valid_to IS NULL OR valid_to >= valid_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE locations (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id  BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(120) NOT NULL,
  address     VARCHAR(255) NULL,
  qr_secret   CHAR(64) NOT NULL COMMENT 'Secreto con el que se firma el QR dinámico (cambia cada 5 min)',
  display_token_hash CHAR(64) NULL COMMENT 'Hash del enlace secreto de la pantalla que muestra el QR',
  display_token_rotated_at TIMESTAMP NULL DEFAULT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NULL DEFAULT NULL,
  updated_at  TIMESTAMP NULL DEFAULT NULL,
  deleted_at  TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_locations_company_id (company_id, id),
  UNIQUE KEY uq_locations_company_name (company_id, name),
  CONSTRAINT fk_locations_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. Bolsa de trabajadores (empresa <-> trabajador)
--   La persona se registra primero; luego la empresa la invita por RUT.
--   invited:  la empresa invitó, la persona aún no responde
--   active:   aceptó; recibe las ofertas de esta empresa
--   declined: rechazó la invitación
--   inactive: la empresa la pausó
--   left:     la persona salió de la bolsa
-- ---------------------------------------------------------------------
CREATE TABLE company_workers (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id    BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  status        ENUM('invited','active','declined','inactive','left') NOT NULL DEFAULT 'invited',
  priority      ENUM('alta','media','baja') NOT NULL DEFAULT 'media',
  rate_id       BIGINT UNSIGNED NULL COMMENT 'Tarifa propia; NULL = tarifa vigente de la empresa',
  invited_by    BIGINT UNSIGNED NOT NULL,
  invited_at    TIMESTAMP NULL DEFAULT NULL,
  responded_at  TIMESTAMP NULL DEFAULT NULL,
  created_at    TIMESTAMP NULL DEFAULT NULL,
  updated_at    TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cw_company_user (company_id, user_id),
  KEY idx_cw_user_status (user_id, status),
  CONSTRAINT fk_cw_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_cw_user    FOREIGN KEY (user_id)    REFERENCES users (id),
  CONSTRAINT fk_cw_rate    FOREIGN KEY (rate_id)    REFERENCES rates (id),
  CONSTRAINT fk_cw_invited FOREIGN KEY (invited_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. Turnos y convocatoria
-- ---------------------------------------------------------------------
CREATE TABLE shifts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id    BIGINT UNSIGNED NOT NULL,
  location_id   BIGINT UNSIGNED NOT NULL,
  created_by    BIGINT UNSIGNED NOT NULL,
  starts_at     DATETIME NOT NULL,
  ends_at       DATETIME NOT NULL COMMENT 'Permite turnos que cruzan la medianoche',
  slots         SMALLINT UNSIGNED NOT NULL COMMENT 'Cupos',
  status        ENUM('draft','published','cancelled','closed') NOT NULL DEFAULT 'published',
  published_at  TIMESTAMP NULL DEFAULT NULL,
  low_priority_visible_at DATETIME NULL COMMENT 'Desde cuándo la ven los de prioridad baja; NULL = de inmediato',
  cancellation_reason VARCHAR(255) NULL,
  cancelled_at  TIMESTAMP NULL DEFAULT NULL,
  cancelled_by  BIGINT UNSIGNED NULL,
  created_at    TIMESTAMP NULL DEFAULT NULL,
  updated_at    TIMESTAMP NULL DEFAULT NULL,
  deleted_at    TIMESTAMP NULL DEFAULT NULL,
  archived_at   TIMESTAMP NULL DEFAULT NULL COMMENT 'Pasó los 2 años de acceso normal',
  PRIMARY KEY (id),
  UNIQUE KEY uq_shifts_company_id (company_id, id),
  KEY idx_shifts_company_start (company_id, starts_at),
  KEY idx_shifts_status_start (status, starts_at),
  CONSTRAINT fk_shifts_location FOREIGN KEY (company_id, location_id) REFERENCES locations (company_id, id),
  CONSTRAINT fk_shifts_creator  FOREIGN KEY (created_by)   REFERENCES users (id),
  CONSTRAINT fk_shifts_canceller FOREIGN KEY (cancelled_by) REFERENCES users (id),
  CONSTRAINT ck_shifts_time  CHECK (ends_at > starts_at),
  CONSTRAINT ck_shifts_slots CHECK (slots >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shift_assignments (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id    BIGINT UNSIGNED NOT NULL,
  shift_id      BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  status        ENUM('applied','accepted','rejected','withdrawn','cancelled','no_show') NOT NULL DEFAULT 'applied',
  applied_at    TIMESTAMP NULL DEFAULT NULL,
  decided_by    BIGINT UNSIGNED NULL COMMENT 'Admin que aceptó o rechazó',
  decided_at    TIMESTAMP NULL DEFAULT NULL,
  withdrawn_at  TIMESTAMP NULL DEFAULT NULL,
  created_at    TIMESTAMP NULL DEFAULT NULL,
  updated_at    TIMESTAMP NULL DEFAULT NULL,
  archived_at   TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sa_company_id (company_id, id),
  UNIQUE KEY uq_sa_shift_user (shift_id, user_id),
  KEY idx_sa_user_status (user_id, status, shift_id),
  CONSTRAINT fk_sa_shift   FOREIGN KEY (company_id, shift_id) REFERENCES shifts (company_id, id),
  CONSTRAINT fk_sa_user    FOREIGN KEY (user_id)    REFERENCES users (id),
  CONSTRAINT fk_sa_decider FOREIGN KEY (decided_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. Liquidación
-- ---------------------------------------------------------------------
CREATE TABLE payment_periods (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id           BIGINT UNSIGNED NOT NULL,
  cycle                ENUM('quincenal','mensual') NOT NULL,
  start_date           DATE NOT NULL,
  end_date             DATE NOT NULL,
  status               ENUM('open','closed','sent') NOT NULL DEFAULT 'open',
  total_shifts         INT UNSIGNED NOT NULL DEFAULT 0,
  total_overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  total_amount         INT UNSIGNED NOT NULL DEFAULT 0,
  closed_by            BIGINT UNSIGNED NULL,
  closed_at            TIMESTAMP NULL DEFAULT NULL,
  sent_at              TIMESTAMP NULL DEFAULT NULL,
  created_at           TIMESTAMP NULL DEFAULT NULL,
  updated_at           TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pp_company_range (company_id, start_date, end_date),
  CONSTRAINT fk_pp_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_pp_closer  FOREIGN KEY (closed_by)  REFERENCES users (id),
  CONSTRAINT ck_pp_range CHECK (end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attendances (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NOT NULL,
  shift_assignment_id   BIGINT UNSIGNED NOT NULL,
  check_in_at           DATETIME NULL,
  check_in_method       ENUM('qr','manual') NULL,
  check_in_by           BIGINT UNSIGNED NULL COMMENT 'Quien marcó de respaldo',
  check_out_at          DATETIME NULL,
  check_out_method      ENUM('qr','manual') NULL,
  check_out_by          BIGINT UNSIGNED NULL,
  rate_id               BIGINT UNSIGNED NOT NULL COMMENT 'Tarifa aplicada: un pago pasado no cambia si la tarifa sube',
  payment_period_id     BIGINT UNSIGNED NULL,
  comments              VARCHAR(255) NULL,
  created_at            TIMESTAMP NULL DEFAULT NULL,
  updated_at            TIMESTAMP NULL DEFAULT NULL,
  deleted_at            TIMESTAMP NULL DEFAULT NULL,
  archived_at           TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_att_company_id (company_id, id),
  UNIQUE KEY uq_att_assignment (shift_assignment_id),
  KEY idx_att_period (payment_period_id),
  CONSTRAINT fk_att_assignment FOREIGN KEY (company_id, shift_assignment_id) REFERENCES shift_assignments (company_id, id),
  CONSTRAINT fk_att_rate   FOREIGN KEY (rate_id) REFERENCES rates (id),
  CONSTRAINT fk_att_period FOREIGN KEY (payment_period_id) REFERENCES payment_periods (id),
  CONSTRAINT fk_att_in_by  FOREIGN KEY (check_in_by)  REFERENCES users (id),
  CONSTRAINT fk_att_out_by FOREIGN KEY (check_out_by) REFERENCES users (id),
  CONSTRAINT ck_att_order CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at > check_in_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE overtime_hours (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id    BIGINT UNSIGNED NOT NULL,
  attendance_id BIGINT UNSIGNED NOT NULL,
  hours         DECIMAL(4,2) NOT NULL,
  authorized_by BIGINT UNSIGNED NOT NULL,
  authorized_at TIMESTAMP NULL DEFAULT NULL,
  comments      VARCHAR(255) NULL,
  created_at    TIMESTAMP NULL DEFAULT NULL,
  updated_at    TIMESTAMP NULL DEFAULT NULL,
  deleted_at    TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_ot_attendance (attendance_id),
  CONSTRAINT fk_ot_attendance FOREIGN KEY (company_id, attendance_id) REFERENCES attendances (company_id, id),
  CONSTRAINT fk_ot_auth FOREIGN KEY (authorized_by) REFERENCES users (id),
  CONSTRAINT ck_ot_hours CHECK (hours > 0 AND hours <= 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Resumen por trabajador y período: lo que el trabajador revisa antes de la boleta
CREATE TABLE payment_statements (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id        BIGINT UNSIGNED NOT NULL,
  payment_period_id BIGINT UNSIGNED NOT NULL,
  user_id           BIGINT UNSIGNED NOT NULL,
  total_shifts      INT UNSIGNED NOT NULL DEFAULT 0,
  overtime_hours    DECIMAL(6,2) NOT NULL DEFAULT 0,
  total_amount      INT UNSIGNED NOT NULL DEFAULT 0,
  status            ENUM('pending','sent','accepted','disputed') NOT NULL DEFAULT 'pending',
  sent_at           TIMESTAMP NULL DEFAULT NULL,
  responded_at      TIMESTAMP NULL DEFAULT NULL,
  dispute_comment   VARCHAR(500) NULL,
  created_at        TIMESTAMP NULL DEFAULT NULL,
  updated_at        TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ps_period_user (payment_period_id, user_id),
  KEY idx_ps_user_status (user_id, status),
  CONSTRAINT fk_ps_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_ps_period  FOREIGN KEY (payment_period_id) REFERENCES payment_periods (id),
  CONSTRAINT fk_ps_user    FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. Notificaciones, inhabilitaciones y auditoría
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  company_id  BIGINT UNSIGNED NULL,
  shift_id    BIGINT UNSIGNED NULL,
  type        VARCHAR(40)  NOT NULL,
  title       VARCHAR(120) NOT NULL,
  message     VARCHAR(500) NOT NULL,
  sent_at     TIMESTAMP NULL DEFAULT NULL,
  read_at     TIMESTAMP NULL DEFAULT NULL,
  created_at  TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_notif_user_read (user_id, read_at),
  CONSTRAINT fk_notif_user    FOREIGN KEY (user_id)    REFERENCES users (id),
  CONSTRAINT fk_notif_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_notif_shift   FOREIGN KEY (shift_id)   REFERENCES shifts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE disqualifications (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id       BIGINT UNSIGNED NOT NULL,
  user_id          BIGINT UNSIGNED NOT NULL,
  reason           VARCHAR(80)  NOT NULL,
  detail           VARCHAR(500) NULL,
  disqualified_by  BIGINT UNSIGNED NOT NULL,
  starts_at        DATETIME NOT NULL,
  ends_at          DATETIME NULL COMMENT 'NULL = indefinida',
  created_at       TIMESTAMP NULL DEFAULT NULL,
  updated_at       TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_dq_company_user (company_id, user_id, ends_at),
  CONSTRAINT fk_dq_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_dq_user    FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_dq_by      FOREIGN KEY (disqualified_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Intentos de invitar por RUT (límite: 5 búsquedas sin resultado por admin; ver consulta b)
CREATE TABLE rut_lookup_attempts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id    BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL COMMENT 'Admin que buscó',
  rut_searched  VARCHAR(12) NOT NULL,
  found         TINYINT(1) NOT NULL,
  created_at    TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_rla_user_found (user_id, found, created_at),
  CONSTRAINT fk_rla_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_rla_user    FOREIGN KEY (user_id)    REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Columnas del bloque 3
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS title       VARCHAR(120) NULL COMMENT 'Ej.: Peoneta de descarga' AFTER location_id,
  ADD COLUMN IF NOT EXISTS notes       VARCHAR(500) NULL COMMENT 'Indicaciones para el trabajador' AFTER title,
  ADD COLUMN IF NOT EXISTS is_night    TINYINT(1) NOT NULL DEFAULT 0 AFTER slots,
  ADD COLUMN IF NOT EXISTS is_holiday  TINYINT(1) NOT NULL DEFAULT 0 AFTER is_night;
CREATE INDEX IF NOT EXISTS idx_notif_type_shift_user ON notifications (type, shift_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cw_company_status ON company_workers (company_id, status);

-- El rol 3 pasa a llamarse company_owner
UPDATE roles SET name = 'company_owner', description = 'Dueño de la empresa en WorkIn: crea admins y reinicia sus contraseñas' WHERE id = 3;

DELIMITER $$

-- Valida una ACEPTACIÓN contra TODAS las empresas: sin solapamiento de
-- horario y sin superar los cupos. Se ignora el tenant a propósito.
CREATE PROCEDURE sp_validate_confirmation(
  IN p_shift_id BIGINT UNSIGNED, IN p_user_id BIGINT UNSIGNED, IN p_exclude_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_start DATETIME;
  DECLARE v_end   DATETIME;
  DECLARE v_slots SMALLINT UNSIGNED;
  DECLARE v_n     INT;

  SELECT starts_at, ends_at, slots INTO v_start, v_end, v_slots
    FROM shifts WHERE id = p_shift_id;

  SELECT COUNT(*) INTO v_n
    FROM shift_assignments a
    JOIN shifts s ON s.id = a.shift_id
   WHERE a.user_id = p_user_id
     AND a.status = 'accepted'
     AND a.id <> p_exclude_id
     AND s.deleted_at IS NULL AND s.status <> 'cancelled'
     AND s.starts_at < v_end AND v_start < s.ends_at;
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SHIFT_OVERLAP';
  END IF;

  SELECT COUNT(*) INTO v_n
    FROM shift_assignments
   WHERE shift_id = p_shift_id AND status = 'accepted' AND id <> p_exclude_id;
  IF v_n >= v_slots THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SHIFT_FULL';
  END IF;
END$$

CREATE TRIGGER trg_sa_bi BEFORE INSERT ON shift_assignments FOR EACH ROW
BEGIN
  IF NEW.status = 'accepted' THEN
    CALL sp_validate_confirmation(NEW.shift_id, NEW.user_id, 0);
  END IF;
END$$

CREATE TRIGGER trg_sa_bu BEFORE UPDATE ON shift_assignments FOR EACH ROW
BEGIN
  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    CALL sp_validate_confirmation(NEW.shift_id, NEW.user_id, NEW.id);
  END IF;
END$$
DELIMITER ;
