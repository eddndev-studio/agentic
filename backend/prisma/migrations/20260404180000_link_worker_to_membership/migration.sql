-- AlterTable: Replace userId with membershipId on Worker
ALTER TABLE "Worker" ADD COLUMN "membershipId" TEXT;

-- Drop old userId foreign key and index
ALTER TABLE "Worker" DROP CONSTRAINT IF EXISTS "Worker_userId_fkey";
DROP INDEX IF EXISTS "Worker_userId_idx";
ALTER TABLE "Worker" DROP COLUMN IF EXISTS "userId";

-- Create new index and unique constraint
CREATE UNIQUE INDEX "Worker_membershipId_key" ON "Worker"("membershipId");
CREATE INDEX "Worker_membershipId_idx" ON "Worker"("membershipId");

-- Add foreign key to Membership
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
