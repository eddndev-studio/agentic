-- AlterTable
ALTER TABLE "Bot" ADD COLUMN "notificationSessionId" TEXT;
ALTER TABLE "Bot" ADD COLUMN "notificationEvents" TEXT[] DEFAULT ARRAY[]::TEXT[];
