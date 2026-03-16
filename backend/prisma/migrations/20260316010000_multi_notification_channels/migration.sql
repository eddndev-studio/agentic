-- Add new array column
ALTER TABLE "Bot" ADD COLUMN "notificationSessionIds" TEXT[] NOT NULL DEFAULT '{}';

-- Migrate existing single channel to array
UPDATE "Bot" SET "notificationSessionIds" = ARRAY["notificationSessionId"]
WHERE "notificationSessionId" IS NOT NULL;

-- Drop old column
ALTER TABLE "Bot" DROP COLUMN "notificationSessionId";
