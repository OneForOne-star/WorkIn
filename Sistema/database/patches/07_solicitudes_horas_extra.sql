-- Solicitudes de horas extra hechas por el trabajador, que la empresa aprueba o rechaza.
CREATE TABLE IF NOT EXISTS overtime_requests (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id         BIGINT UNSIGNED NOT NULL,
  attendance_id      BIGINT UNSIGNED NOT NULL,
  user_id            BIGINT UNSIGNED NOT NULL,
  hours              DECIMAL(4,2) NOT NULL,
  reason             VARCHAR(255) NOT NULL,
  status             ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  resolved_by        BIGINT UNSIGNED NULL,
  resolved_at        TIMESTAMP NULL DEFAULT NULL,
  resolution_comment VARCHAR(255) NULL,
  overtime_hour_id   BIGINT UNSIGNED NULL,
  created_at         TIMESTAMP NULL DEFAULT NULL,
  updated_at         TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_otr_company_status (company_id, status),
  KEY idx_otr_attendance (attendance_id),
  KEY idx_otr_user (user_id),
  CONSTRAINT fk_otr_attendance FOREIGN KEY (company_id, attendance_id) REFERENCES attendances (company_id, id),
  CONSTRAINT fk_otr_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_otr_resolver FOREIGN KEY (resolved_by) REFERENCES users (id),
  CONSTRAINT ck_otr_hours CHECK (hours > 0 AND hours <= 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
