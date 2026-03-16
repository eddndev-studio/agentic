-- Add new JSON column
ALTER TABLE "Bot" ADD COLUMN "notificationChannels" JSONB DEFAULT '[]';

-- Migrate existing data: combine sessionIds + events + labels into per-channel config
UPDATE "Bot"
SET "notificationChannels" = (
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'sessionId', sid,
            'events', "notificationEvents",
            'labels', "notificationLabels"
        )
    ), '[]'::jsonb)
    FROM unnest("notificationSessionIds") AS sid
)
WHERE array_length("notificationSessionIds", 1) > 0;

-- Drop old columns
ALTER TABLE "Bot" DROP COLUMN "notificationSessionIds";
ALTER TABLE "Bot" DROP COLUMN "notificationEvents";
ALTER TABLE "Bot" DROP COLUMN "notificationLabels";
