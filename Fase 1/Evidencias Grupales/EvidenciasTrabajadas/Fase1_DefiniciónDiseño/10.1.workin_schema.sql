-- =====================================================================
-- Proyecto WorkIn - PTY4614 Capstone
-- Modelo de base de datos
--
-- Motor       : MySQL 8 / MariaDB 10.11
-- Framework   : Laravel (convenciones de nomenclatura)
-- Codificacion: utf8mb4 (soporta tildes y la letra n con virgulilla)
-- Alojamiento : cPanel
--
-- Convenciones aplicadas:
--   - Nombres de tabla en ingles, plural y minusculas (requisito de Laravel)
--   - Clave primaria `id` en todas las tablas
--   - Claves foraneas con el patron `<tabla_singular>_id`
--   - Campos `created_at` y `updated_at` en las tablas con historial
--   - Campo `deleted_at` para borrado logico (SoftDeletes de Laravel)
--   - Todas las tablas en minusculas: cPanel corre sobre Linux y
--     distingue mayusculas de minusculas en los nombres de tabla
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;

-- ---------------------------------------------------------------------
-- roles
-- Perfiles de usuario definidos en la entrevista (E.1, E.2)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id`          TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(30)  NOT NULL COMMENT 'trabajador, encargado, administrador',
  `description` VARCHAR(150) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- users
-- Una sola tabla de personas. El perfil se define por `role_id`.
-- RF-07 (enrolamiento con RUT y nombre), RF-22 (tres perfiles),
-- RF-16 / RN-07 (ciclo de pago quincenal o mensual)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rut`            VARCHAR(12)  NOT NULL COMMENT 'Sin puntos y con guion: 12345678-9',
  `first_name`     VARCHAR(60)  NOT NULL,
  `last_name`      VARCHAR(60)  NOT NULL,
  `email`          VARCHAR(120) NULL,
  `phone`          VARCHAR(20)  NULL,
  `password`       VARCHAR(255) NULL COMMENT 'Hash bcrypt de Laravel',
  `role_id`        TINYINT UNSIGNED NOT NULL,
  `payment_cycle`  ENUM('quincenal','mensual') NULL COMMENT 'Solo trabajadores. D.5',
  `is_active`      TINYINT(1)   NOT NULL DEFAULT 1,
  `enrolled_at`    DATETIME     NULL COMMENT 'Fecha de enrolamiento presencial. A.1',
  `enrolled_by`    INT UNSIGNED NULL COMMENT 'Encargado que realizo el enrolamiento',
  `remember_token` VARCHAR(100) NULL,
  `created_at`     TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP    NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`     TIMESTAMP    NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_rut`   (`rut`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `fk_users_role`     (`role_id`),
  KEY `fk_users_enrolled` (`enrolled_by`),
  CONSTRAINT `fk_users_role`     FOREIGN KEY (`role_id`)     REFERENCES `roles` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_users_enrolled` FOREIGN KEY (`enrolled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- disqualifications
-- Inhabilitacion de trabajadores con motivo. RF-21 / RN-10 (F.3)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `disqualifications`;
CREATE TABLE `disqualifications` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`         INT UNSIGNED NOT NULL,
  `reason`          ENUM('veto_empresa','conflictos','falta_compromiso','otro') NOT NULL,
  `detail`          VARCHAR(255) NULL,
  `disqualified_by` INT UNSIGNED NOT NULL,
  `starts_at`       DATE NOT NULL,
  `ends_at`         DATE NULL COMMENT 'NULL = indefinida',
  `created_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_disq_user` (`user_id`),
  KEY `fk_disq_by`   (`disqualified_by`),
  CONSTRAINT `fk_disq_user` FOREIGN KEY (`user_id`)         REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_disq_by`   FOREIGN KEY (`disqualified_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- rates
-- Tarifas vigentes. Evita repetir el monto en cada asistencia.
-- RF-14 / RN-06: $15.000 liquidos por turno y $4.000 por hora extra (D.1, D.3)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `rates`;
CREATE TABLE `rates` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `shift_amount`         INT UNSIGNED NOT NULL COMMENT 'Monto liquido por turno',
  `overtime_hour_amount` INT UNSIGNED NOT NULL COMMENT 'Monto liquido por hora extra',
  `valid_from`           DATE NOT NULL,
  `valid_to`             DATE NULL COMMENT 'NULL = tarifa vigente',
  `created_at`           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_rates_validity` (`valid_from`,`valid_to`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- shifts
-- Turnos publicados. RF-01 (B.2), RF-19 (F.2)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `shifts`;
CREATE TABLE `shifts` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `shift_date`          DATE NOT NULL,
  `start_time`          TIME NOT NULL,
  `end_time`            TIME NOT NULL,
  `location`            VARCHAR(120) NOT NULL COMMENT 'Lugar segun el sector. B.2',
  `slots`               SMALLINT UNSIGNED NOT NULL COMMENT 'Cupos disponibles',
  `status`              ENUM('publicado','cerrado','cancelado','finalizado') NOT NULL DEFAULT 'publicado',
  `cancellation_reason` VARCHAR(255) NULL,
  `cancelled_at`        DATETIME NULL,
  `created_by`          INT UNSIGNED NOT NULL COMMENT 'Encargado que publica',
  `created_at`          TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`          TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_shifts_date`   (`shift_date`),
  KEY `fk_shifts_author` (`created_by`),
  CONSTRAINT `fk_shifts_author` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_shifts_slots`  CHECK (`slots` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- shift_assignments
-- Convocatoria y confirmacion. RF-03, RF-04, RF-06 (B.3 a B.7)
--
-- `shift_date` se repite aqui a proposito: permite crear el indice unico
-- que impide dos turnos al mismo trabajador el mismo dia (RF-20 / RN-08, F.1)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `shift_assignments`;
CREATE TABLE `shift_assignments` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `shift_id`     INT UNSIGNED NOT NULL,
  `user_id`      INT UNSIGNED NOT NULL,
  `shift_date`   DATE NOT NULL COMMENT 'Copia de shifts.shift_date para la regla de un turno por dia',
  `status`       ENUM('convocado','confirmado','rechazado','liberado') NOT NULL DEFAULT 'convocado',
  `invited_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `responded_at` DATETIME NULL,
  `invited_by`   INT UNSIGNED NOT NULL COMMENT 'Encargado que convoca',
  `created_at`   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assign_shift_user` (`shift_id`,`user_id`),
  UNIQUE KEY `uq_assign_user_date`  (`user_id`,`shift_date`),
  KEY `fk_assign_shift`  (`shift_id`),
  KEY `fk_assign_by`     (`invited_by`),
  CONSTRAINT `fk_assign_shift` FOREIGN KEY (`shift_id`)   REFERENCES `shifts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assign_user`  FOREIGN KEY (`user_id`)    REFERENCES `users`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assign_by`    FOREIGN KEY (`invited_by`) REFERENCES `users`  (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- payment_periods
-- Periodo de liquidacion por trabajador. RF-15, RF-16, RF-17 (D.5, D.6)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `payment_periods`;
CREATE TABLE `payment_periods` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`               INT UNSIGNED NOT NULL,
  `cycle`                 ENUM('quincenal','mensual') NOT NULL,
  `start_date`            DATE NOT NULL,
  `end_date`              DATE NOT NULL,
  `total_shifts`          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `total_overtime_hours`  DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `total_amount`          INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Monto liquido calculado',
  `status`                ENUM('borrador','enviado','aceptado','pagado') NOT NULL DEFAULT 'borrador',
  `sent_at`               DATETIME NULL COMMENT 'Envio del resumen por correo. RF-17',
  `accepted_at`           DATETIME NULL,
  `created_at`            TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_period_user_range` (`user_id`,`start_date`,`end_date`),
  CONSTRAINT `fk_period_user`  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_period_range` CHECK (`end_date` >= `start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- attendances
-- Marcaje individual de entrada y salida. RF-08, RF-09, RF-10 (C.1, C.2, C.9)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `attendances`;
CREATE TABLE `attendances` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `shift_assignment_id` INT UNSIGNED NOT NULL,
  `check_in_at`         DATETIME NULL,
  `check_in_method`     ENUM('qr','manual') NULL COMMENT 'manual = marcado por el encargado. RF-10',
  `check_in_by`         INT UNSIGNED NULL,
  `check_out_at`        DATETIME NULL,
  `check_out_method`    ENUM('qr','manual') NULL,
  `check_out_by`        INT UNSIGNED NULL,
  `comments`            TEXT NULL,
  `rate_id`             INT UNSIGNED NULL COMMENT 'Tarifa aplicada al liquidar',
  `payment_period_id`   INT UNSIGNED NULL,
  `created_at`          TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`          TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_assignment` (`shift_assignment_id`),
  KEY `fk_att_in_by`  (`check_in_by`),
  KEY `fk_att_out_by` (`check_out_by`),
  KEY `fk_att_rate`   (`rate_id`),
  KEY `fk_att_period` (`payment_period_id`),
  CONSTRAINT `fk_att_assignment` FOREIGN KEY (`shift_assignment_id`) REFERENCES `shift_assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_in_by`      FOREIGN KEY (`check_in_by`)         REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_att_out_by`     FOREIGN KEY (`check_out_by`)        REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_att_rate`       FOREIGN KEY (`rate_id`)             REFERENCES `rates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_att_period`     FOREIGN KEY (`payment_period_id`)   REFERENCES `payment_periods` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ck_att_times`      CHECK (`check_out_at` IS NULL OR `check_in_at` IS NULL OR `check_out_at` > `check_in_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- overtime_hours
-- Horas extra autorizadas con un dia de anticipacion. RF-11 (C.6)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `overtime_hours`;
CREATE TABLE `overtime_hours` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `attendance_id` INT UNSIGNED NOT NULL,
  `hours`         DECIMAL(4,2) NOT NULL,
  `authorized_by` INT UNSIGNED NOT NULL COMMENT 'Encargado que autoriza',
  `authorized_at` DATETIME NOT NULL,
  `comments`      VARCHAR(255) NULL,
  `created_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_ot_attendance` (`attendance_id`),
  KEY `fk_ot_author`     (`authorized_by`),
  CONSTRAINT `fk_ot_attendance` FOREIGN KEY (`attendance_id`) REFERENCES `attendances` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ot_author`     FOREIGN KEY (`authorized_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_ot_hours`      CHECK (`hours` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- audit_logs
-- Historial de modificaciones. RF-13 (C.8, C.10)
-- Es el requisito central del proyecto: deja constancia de quien
-- modifico un registro, cuando y que valor tenia antes.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `auditable_type` VARCHAR(60) NOT NULL COMMENT 'Tabla afectada, por ejemplo attendances',
  `auditable_id`   INT UNSIGNED NOT NULL COMMENT 'Registro afectado',
  `action`         ENUM('crear','modificar','eliminar') NOT NULL,
  `field_name`     VARCHAR(60) NULL,
  `old_value`      TEXT NULL,
  `new_value`      TEXT NULL,
  `reason`         VARCHAR(255) NULL,
  `user_id`        INT UNSIGNED NOT NULL COMMENT 'Quien realizo el cambio',
  `created_at`     TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_audit_target` (`auditable_type`,`auditable_id`),
  KEY `fk_audit_user`   (`user_id`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- notifications
-- Aviso de convocatoria y de cancelacion. RF-02, RF-19
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `type`       ENUM('convocatoria','cancelacion','resumen_periodo','otro') NOT NULL,
  `title`      VARCHAR(120) NOT NULL,
  `message`    TEXT NOT NULL,
  `shift_id`   INT UNSIGNED NULL,
  `sent_at`    DATETIME NULL,
  `read_at`    DATETIME NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_notif_user`  (`user_id`),
  KEY `fk_notif_shift` (`shift_id`),
  CONSTRAINT `fk_notif_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notif_shift` FOREIGN KEY (`shift_id`) REFERENCES `shifts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- Datos iniciales (no contienen informacion personal)
-- =====================================================================

INSERT INTO `roles` (`id`,`name`,`description`) VALUES
(1,'trabajador',   'Consulta sus propios turnos, asistencia y montos. No modifica registros.'),
(2,'encargado',    'Publica turnos, convoca trabajadores, toma asistencia y registra horas extra.'),
(3,'administrador','Rol que desempena contabilidad. Liquida periodos y corrige asistencia.');

INSERT INTO `rates` (`shift_amount`,`overtime_hour_amount`,`valid_from`,`valid_to`) VALUES
(15000, 4000, '2026-01-01', NULL);

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- Notas de implementacion
--
-- 1. RNF-04 (G.3): los registros deben conservarse al menos 3 anos.
--    Por eso se usa borrado logico (`deleted_at`) y no DELETE fisico
--    en users, shifts y attendances.
--
-- 2. RF-20 / RN-08 (F.1): la regla de un turno por dia queda garantizada
--    por el indice unico `uq_assign_user_date` en shift_assignments.
--
-- 3. RF-14 (D.1, D.3): los montos son liquidos y viven en `rates`,
--    no repetidos en cada asistencia. `attendances.rate_id` guarda la
--    tarifa aplicada para que una liquidacion pasada no cambie si la
--    tarifa se actualiza.
--
-- 4. RF-13 (C.8, C.10): toda modificacion de asistencia debe escribir
--    en `audit_logs`. En Laravel conviene resolverlo con un observer
--    del modelo Attendance.
--
-- 5. RNF-06: `users` contiene datos personales (RUT, correo). El acceso
--    debe restringirse por rol y no exponerse en la API publica.
-- =====================================================================
