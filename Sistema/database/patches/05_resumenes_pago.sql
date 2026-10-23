-- WorkIn · Parche 05: respuesta de la empresa cuando un trabajador disputa su resumen de pago.
-- Ejecutar con la base de WorkIn (el script de despliegue lo hace solo).
SET NAMES utf8mb4;

ALTER TABLE payment_statements
  ADD COLUMN admin_reply VARCHAR(500) NULL COMMENT 'Respuesta de la empresa a una disputa' AFTER dispute_comment,
  ADD COLUMN replied_at  TIMESTAMP NULL DEFAULT NULL AFTER admin_reply;
