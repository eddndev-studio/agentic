-- Add autoReadReceipts column to Bot and Template (default true for backward compat)
ALTER TABLE "Bot" ADD COLUMN "autoReadReceipts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Template" ADD COLUMN "autoReadReceipts" BOOLEAN NOT NULL DEFAULT true;
