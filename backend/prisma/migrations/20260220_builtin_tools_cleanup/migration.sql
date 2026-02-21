-- AlterTable: Change Tool.flow onDelete from SetNull to Cascade
ALTER TABLE "Tool" DROP CONSTRAINT IF EXISTS "Tool_flowId_fkey";
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_flowId_fkey"
    FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cleanup: Remove BUILTIN tools (now injected at runtime, no DB record needed)
DELETE FROM "Tool" WHERE "actionType" = 'BUILTIN';

-- Cleanup: Remove orphaned FLOW tools (flowId points to deleted flow)
DELETE FROM "Tool"
WHERE "actionType" = 'FLOW'
  AND "flowId" IS NOT NULL
  AND "flowId" NOT IN (SELECT id FROM "Flow");

-- Cleanup: Remove FLOW tools with NULL flowId (orphaned by previous onDelete: SetNull)
DELETE FROM "Tool"
WHERE "actionType" = 'FLOW'
  AND "flowId" IS NULL;

-- Cleanup: Remove DISABLED tools (unused)
DELETE FROM "Tool" WHERE "status" = 'DISABLED';
