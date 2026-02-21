-- Remove old columns from Client
ALTER TABLE "Client" DROP COLUMN IF EXISTS "appointmentDate";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "captureLine";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "captureLinePdfPath";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "accreditationPdfPath";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "appointmentPdfPath";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "contactNumber";

-- Add CURP column
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "curp" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Client_curp_key" ON "Client"("curp");
CREATE INDEX IF NOT EXISTS "Client_curp_idx" ON "Client"("curp");

-- Make encryptedPassword optional
ALTER TABLE "Client" ALTER COLUMN "encryptedPassword" DROP NOT NULL;

-- Recreate ClientStatus enum with all new values via column swap
-- (Postgres cannot ADD VALUE + USE in same transaction, so we recreate the type)
CREATE TYPE "ClientStatus_new" AS ENUM (
    'REGISTRO_PENDIENTE',
    'PAGO_GOBIERNO_PENDIENTE',
    'PAGO_GOBIERNO_REALIZADO',
    'EXAMEN_EN_PROCESO',
    'LICENCIA_LISTA',
    'COMPLETADO'
);

ALTER TABLE "Client" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Client" ALTER COLUMN "status" TYPE "ClientStatus_new"
    USING (
        CASE "status"::text
            WHEN 'PAGO_PENDIENTE' THEN 'REGISTRO_PENDIENTE'
            WHEN 'LINEA_DE_CAPTURA_CREADA' THEN 'REGISTRO_PENDIENTE'
            WHEN 'CITA_AGENDADA' THEN 'REGISTRO_PENDIENTE'
            WHEN 'PAGADO' THEN 'REGISTRO_PENDIENTE'
            ELSE 'REGISTRO_PENDIENTE'
        END::"ClientStatus_new"
    );

DROP TYPE "ClientStatus";
ALTER TYPE "ClientStatus_new" RENAME TO "ClientStatus";
ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'REGISTRO_PENDIENTE'::"ClientStatus";
