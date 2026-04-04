-- Clean slate: drop all existing worker-related data
DELETE FROM "WorkerPeriod";
DELETE FROM "Income" WHERE "workerId" IS NOT NULL;
DELETE FROM "AdAccount" WHERE "workerId" IS NOT NULL;
DELETE FROM "Worker";

-- Drop old userId column and constraints
ALTER TABLE "Worker" DROP CONSTRAINT IF EXISTS "Worker_userId_fkey";
DROP INDEX IF EXISTS "Worker_userId_idx";
ALTER TABLE "Worker" DROP COLUMN IF EXISTS "userId";

-- Add membershipId column
ALTER TABLE "Worker" ADD COLUMN "membershipId" TEXT;

-- Create unique constraint and index
CREATE UNIQUE INDEX "Worker_membershipId_key" ON "Worker"("membershipId");
CREATE INDEX "Worker_membershipId_idx" ON "Worker"("membershipId");

-- Add foreign key to Membership
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
