-- Remove old columns from Client
ALTER TABLE "Client" DROP COLUMN IF EXISTS "appointmentDate";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "captureLine";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "captureLinePdfPath";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "accreditationPdfPath";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "appointmentPdfPath";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "contactNumber";

-- Add CURP column
ALTER TABLE "Client" ADD COLUMN "curp" TEXT;
CREATE UNIQUE INDEX "Client_curp_key" ON "Client"("curp");
CREATE INDEX "Client_curp_idx" ON "Client"("curp");

-- Make encryptedPassword optional
ALTER TABLE "Client" ALTER COLUMN "encryptedPassword" DROP NOT NULL;

-- Create new enum values
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'REGISTRO_PENDIENTE';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'PAGO_GOBIERNO_PENDIENTE';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'PAGO_GOBIERNO_REALIZADO';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'EXAMEN_EN_PROCESO';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'LICENCIA_LISTA';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'COMPLETADO';

-- Update existing clients to new default status
UPDATE "Client" SET status = 'REGISTRO_PENDIENTE' WHERE status IN ('PAGO_PENDIENTE', 'LINEA_DE_CAPTURA_CREADA', 'CITA_AGENDADA', 'PAGADO');

-- Rename enum: drop old values (requires recreating the type in Postgres)
-- Since Postgres doesn't support DROP VALUE, we recreate via column swap
ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'REGISTRO_PENDIENTE'::"ClientStatus";
