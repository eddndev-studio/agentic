-- AlterTable
ALTER TABLE "Bot" ADD COLUMN "notificationLabels" TEXT[] DEFAULT ARRAY[]::TEXT[];
