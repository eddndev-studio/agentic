-- Add contextMessages column to Bot and Template
ALTER TABLE "Bot" ADD COLUMN "contextMessages" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Template" ADD COLUMN "contextMessages" INTEGER NOT NULL DEFAULT 20;
