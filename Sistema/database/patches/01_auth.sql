-- WorkIn · Parche 01 (autenticación). Ejecutar UNA vez en phpMyAdmin sobre la base de WorkIn.
SET NAMES utf8mb4;

-- Tabla que usa Laravel para los enlaces de recuperación de contraseña
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  email      VARCHAR(190) NOT NULL,
  token      VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fecha en que la persona aceptó términos y aviso de privacidad
ALTER TABLE users
  ADD COLUMN terms_accepted_at TIMESTAMP NULL DEFAULT NULL AFTER phone_verified_at;
