-- =====================================================================
-- WorkIn · Esquema de base de datos v2 (MariaDB 10.11, InnoDB, utf8mb4)
-- v2: postulación + aceptación, invitación por RUT con aceptación, QR dinámico,
-- prioridad por oferta, archivado y rol 'company_owner'. Pensado para una base NUEVA.
-- Multiempresa: cada tabla de negocio lleva company_id.
-- Los trabajadores son cuentas globales (RUT único) y pertenecen a la
-- "bolsa" de una o más empresas mediante company_workers.
--
-- En cPanel la base se crea desde "Bases de datos MySQL" (el nombre lleva
-- prefijo). Selecciónala en phpMyAdmin y ejecuta este archivo completo.
-- Los triggers/procedimientos usan DELIMITER: en phpMyAdmin déjalo en ";"
-- en el campo "Delimitador" y el script ya lo cambia por su cuenta.
-- =====================================================================

-- CREATE DATABASE IF NOT EXISTS workin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE workin;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Convención: dinero en pesos chilenos (INT sin decimales); fechas en la
-- zona horaria de la aplicación (America/Santiago); borrado lógico con
-- deleted_at. Ninguna FK usa CASCADE: nada se borra de verdad.

-- ---------------------------------------------------------------------
-- 1. Catálogos
-- ---------------------------------------------------------------------
CREATE TABLE roles (
  id          TINYINT UNSIGNED NOT NULL,
  name        VARCHAR(30)  NOT NULL,
  description VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE plans (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                    VARCHAR(60)  NOT NULL,
  max_shifts_per_month    INT UNSIGNED NULL COMMENT 'NULL = sin límite',
  price_monthly           INT UNSIGNED NULL COMMENT 'Por definir',
  is_active               TINYINT(1)   NOT NULL DEFAULT 1,
  created_at              TIMESTAMP NULL DEFAULT NULL,
  updated_at              TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. Empresas (clientes que compran WorkIn)
-- ---------------------------------------------------------------------
CREATE TABLE companies (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(120) NOT NULL,
  tax_id                VARCHAR(12)  NOT NULL COMMENT 'RUT de la empresa, formato 76123456-K',
  contact_email         VARCHAR(190) NOT NULL,
  contact_phone         VARCHAR(30)  NULL,
  plan_id               INT UNSIGNED NOT NULL,
  status                ENUM('active','suspended','cancelled') NOT NULL DEFAULT 'active',
  payment_cycle         ENUM('quincenal','mensual') NOT NULL DEFAULT 'mensual',
  subscription_ends_at  DATE NULL,
  created_at            TIMESTAMP NULL DEFAULT NULL,
  updated_at            TIMESTAMP NULL DEFAULT NULL,
  deleted_at            TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_companies_tax_id (tax_id),
  KEY idx_companies_status_end (status, subscription_ends_at),
  CONSTRAINT fk_companies_plan FOREIGN KEY (plan_id) REFERENCES plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. Usuarios
--   1 super_admin    -> equipo WorkIn, sin empresa
--   2 admin          -> exactamente una empresa
--   3 company_owner  -> "super admin de la empresa": exactamente una empresa
--   4 trabajador     -> sin empresa (cuenta global; su bolsa va en company_workers)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id            TINYINT UNSIGNED NOT NULL,
  company_id         BIGINT UNSIGNED NULL,
  rut                VARCHAR(10)  NOT NULL COMMENT 'Normalizado: sin puntos, con guion y DV en mayúscula (18452367-K)',
  first_name         VARCHAR(80)  NOT NULL,
  last_name          VARCHAR(80)  NOT NULL,
  email              VARCHAR(190) NOT NULL,
  phone              VARCHAR(20)  NOT NULL COMMENT 'Formato internacional: +56912345678',
  password           VARCHAR(255) NOT NULL COMMENT 'Hash generado por Laravel (bcrypt/argon2)',
  email_verified_at  TIMESTAMP NULL DEFAULT NULL,
  phone_verified_at  TIMESTAMP NULL DEFAULT NULL,
  is_active          TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at      TIMESTAMP NULL DEFAULT NULL,
  created_at         TIMESTAMP NULL DEFAULT NULL,
  updated_at         TIMESTAMP NULL DEFAULT NULL,
  deleted_at         TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_rut (rut),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_phone (phone),
  KEY idx_users_company_role (company_id, role_id),
  CONSTRAINT fk_users_role    FOREIGN KEY (role_id)    REFERENCES roles (id),
  CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT ck_users_rut_format CHECK (rut REGEXP '^[0-9]{7,8}-[0-9K]$'),
  CONSTRAINT ck_users_scope CHECK (
    (role_id IN (2,3) AND company_id IS NOT NULL) OR
    (role_id IN (1,4) AND company_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  rate_id       BIGINT UNSIGNED NULL,
  rate_name     VARCHAR(80) NULL,
  shift_amount  INT UNSIGNED NULL COMMENT 'Pago por turno, fijado al crear la oferta',
  overtime_hour_amount INT UNSIGNED NULL COMMENT 'Pago por hora extra, fijado al crear la oferta',
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
  CONSTRAINT fk_shifts_rate     FOREIGN KEY (rate_id)      REFERENCES rates (id),
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
  admin_reply       VARCHAR(500) NULL COMMENT 'Respuesta de la empresa a una disputa',
  replied_at        TIMESTAMP NULL DEFAULT NULL,
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

CREATE TABLE audit_logs (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id      BIGINT UNSIGNED NULL,
  user_id         BIGINT UNSIGNED NULL COMMENT 'Quién hizo el cambio',
  auditable_type  VARCHAR(60) NOT NULL,
  auditable_id    BIGINT UNSIGNED NOT NULL,
  action          ENUM('created','updated','deleted','restored') NOT NULL,
  field_name      VARCHAR(60) NULL,
  old_value       TEXT NULL,
  new_value       TEXT NULL,
  reason          VARCHAR(255) NULL,
  ip_address      VARCHAR(45) NULL,
  created_at      TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_audit_target (auditable_type, auditable_id),
  KEY idx_audit_company_date (company_id, created_at),
  CONSTRAINT fk_audit_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_audit_user    FOREIGN KEY (user_id)    REFERENCES users (id)
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

-- Tokens de sesión de Laravel Sanctum
CREATE TABLE personal_access_tokens (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tokenable_type VARCHAR(255) NOT NULL,
  tokenable_id   BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(255) NOT NULL,
  token          CHAR(64) NOT NULL,
  abilities      TEXT NULL,
  last_used_at   TIMESTAMP NULL DEFAULT NULL,
  expires_at     TIMESTAMP NULL DEFAULT NULL,
  created_at     TIMESTAMP NULL DEFAULT NULL,
  updated_at     TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pat_token (token),
  KEY idx_pat_tokenable (tokenable_type, tokenable_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 9. Reglas que viven en la base
-- ---------------------------------------------------------------------
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

-- El historial de auditoría no se edita ni se borra
CREATE TRIGGER trg_audit_bu BEFORE UPDATE ON audit_logs FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT_LOG_IMMUTABLE';
END$$

CREATE TRIGGER trg_audit_bd BEFORE DELETE ON audit_logs FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT_LOG_IMMUTABLE';
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- 10. Datos iniciales
-- ---------------------------------------------------------------------
INSERT INTO roles (id, name, description) VALUES
  (1, 'super_admin',   'Equipo WorkIn: crea empresas, planes y dueños de empresa'),
  (2, 'admin',         'Administrador de una empresa: bolsa, ofertas, aceptación y liquidación'),
  (3, 'company_owner', 'Dueño de la empresa en WorkIn: crea admins y reinicia sus contraseñas'),
  (4, 'trabajador',    'Postula a ofertas, marca asistencia y consulta sus pagos');

INSERT INTO plans (name, max_shifts_per_month, price_monthly, created_at, updated_at) VALUES
  ('Básico',      100,  NULL, NOW(), NOW()),
  ('Profesional', 500,  NULL, NOW(), NOW()),
  ('Premium',     NULL, NULL, NOW(), NOW());

-- Los usuarios NO se crean aquí: la contraseña debe hashearla Laravel.

-- ---------------------------------------------------------------------
-- 11. Consultas clave (referencia para la API)
-- ---------------------------------------------------------------------

-- a) Ofertas de un trabajador: bolsas activas, prioridad baja con retraso,
--    sin inhabilitaciones, sin archivados y marcando choques con turnos ya ACEPTADOS.
-- SELECT s.id, c.name AS company, s.starts_at, s.ends_at, l.name AS place,
--        s.slots - (SELECT COUNT(*) FROM shift_assignments x
--                    WHERE x.shift_id = s.id AND x.status = 'accepted') AS slots_left,
--        EXISTS (SELECT 1 FROM shift_assignments a JOIN shifts o ON o.id = a.shift_id
--                 WHERE a.user_id = :user_id AND a.status = 'accepted'
--                   AND o.starts_at < s.ends_at AND s.starts_at < o.ends_at) AS overlaps
--   FROM company_workers cw
--   JOIN shifts s    ON s.company_id = cw.company_id
--   JOIN companies c ON c.id = s.company_id AND c.status = 'active'
--   JOIN locations l ON l.id = s.location_id
--  WHERE cw.user_id = :user_id AND cw.status = 'active'
--    AND s.status = 'published' AND s.deleted_at IS NULL AND s.archived_at IS NULL
--    AND s.starts_at > NOW()
--    AND (cw.priority <> 'baja' OR s.low_priority_visible_at IS NULL OR s.low_priority_visible_at <= NOW())
--    AND NOT EXISTS (SELECT 1 FROM shift_assignments y WHERE y.shift_id = s.id AND y.user_id = cw.user_id)
--    AND NOT EXISTS (SELECT 1 FROM disqualifications d
--                     WHERE d.company_id = s.company_id AND d.user_id = cw.user_id
--                       AND d.starts_at <= NOW() AND (d.ends_at IS NULL OR d.ends_at > NOW()))
--  ORDER BY s.starts_at;

-- b) Invitar por RUT. Antes de buscar: si el admin tiene 5 o más intentos fallidos en 24 h, bloquear.
-- SELECT COUNT(*) FROM rut_lookup_attempts
--  WHERE user_id = :admin_id AND found = 0 AND created_at > NOW() - INTERVAL 24 HOUR;
-- Luego buscar al trabajador (rol 4) por RUT, registrar el intento (found 1 o 0)
-- y, si existe, crear company_workers con status 'invited'.

-- c) Aceptar una postulación (transacción; el trigger revisa choque y cupos):
-- START TRANSACTION;
--   SELECT id FROM users WHERE id = :worker_id FOR UPDATE;   -- evita carreras entre empresas
--   UPDATE shift_assignments SET status = 'accepted', decided_by = :admin_id, decided_at = NOW()
--    WHERE id = :assignment_id AND company_id = :company_id;
-- COMMIT;
-- Errores 'SHIFT_OVERLAP' / 'SHIFT_FULL' -> 409 "No disponible en ese horario" (sin nombrar a la otra empresa).

-- d) Archivado nocturno (cron): marca lo que pasó los 2 años de acceso normal.
-- UPDATE shifts SET archived_at = NOW() WHERE archived_at IS NULL AND ends_at < NOW() - INTERVAL 2 YEAR;
-- (igual para shift_assignments y attendances)
