-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'SUPERVISOR', 'WORKER');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE');

-- CreateTable: Organization
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateTable: Membership
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");

-- CreateTable: WorkerBot
CREATE TABLE "WorkerBot" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    CONSTRAINT "WorkerBot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkerBot_membershipId_botId_key" ON "WorkerBot"("membershipId", "botId");

-- CreateTable: Invitation
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- ═══════════════════════════════════════════════════════════════════════════════
-- Backfill: Create default org and assign existing user as OWNER
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create default organization
INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'Agentic', 'agentic', NOW(), NOW());

-- Create OWNER membership for first existing user
INSERT INTO "Membership" ("id", "userId", "orgId", "role", "createdAt")
SELECT gen_random_uuid()::text, "id", '00000000-0000-0000-0000-000000000001', 'OWNER', NOW()
FROM "User" LIMIT 1;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Add orgId columns (nullable first for backfill)
-- ═══════════════════════════════════════════════════════════════════════════════

-- AlterTable: Bot
ALTER TABLE "Bot" ADD COLUMN "orgId" TEXT;
UPDATE "Bot" SET "orgId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Bot" ALTER COLUMN "orgId" SET NOT NULL;

-- AlterTable: Template
ALTER TABLE "Template" ADD COLUMN "orgId" TEXT;
UPDATE "Template" SET "orgId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Template" ALTER COLUMN "orgId" SET NOT NULL;

-- AlterTable: Worker
ALTER TABLE "Worker" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Worker" ADD COLUMN "userId" TEXT;
UPDATE "Worker" SET "orgId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Worker" ALTER COLUMN "orgId" SET NOT NULL;

-- AlterTable: BankAccount
ALTER TABLE "BankAccount" ADD COLUMN "orgId" TEXT;
UPDATE "BankAccount" SET "orgId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "BankAccount" ALTER COLUMN "orgId" SET NOT NULL;

-- AlterTable: FinancialPeriod
ALTER TABLE "FinancialPeriod" ADD COLUMN "orgId" TEXT;
UPDATE "FinancialPeriod" SET "orgId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "FinancialPeriod" ALTER COLUMN "orgId" SET NOT NULL;

-- AlterTable: FacebookConnection
ALTER TABLE "FacebookConnection" ADD COLUMN "orgId" TEXT;
UPDATE "FacebookConnection" SET "orgId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "FacebookConnection" ALTER COLUMN "orgId" SET NOT NULL;

-- AlterTable: User (new auth fields)
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "provider" "AuthProvider" NOT NULL DEFAULT 'EMAIL';
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX "Bot_orgId_idx" ON "Bot"("orgId");
CREATE INDEX "Template_orgId_idx" ON "Template"("orgId");
CREATE INDEX "Worker_orgId_idx" ON "Worker"("orgId");
CREATE INDEX "Worker_userId_idx" ON "Worker"("userId");
CREATE INDEX "BankAccount_orgId_idx" ON "BankAccount"("orgId");
CREATE INDEX "FinancialPeriod_orgId_idx" ON "FinancialPeriod"("orgId");
CREATE INDEX "FacebookConnection_orgId_idx" ON "FacebookConnection"("orgId");

-- ═══════════════════════════════════════════════════════════════════════════════
-- Foreign Keys
-- ═══════════════════════════════════════════════════════════════════════════════

-- Membership FKs
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WorkerBot FKs
ALTER TABLE "WorkerBot" ADD CONSTRAINT "WorkerBot_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerBot" ADD CONSTRAINT "WorkerBot_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invitation FK
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- orgId FKs
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Template" ADD CONSTRAINT "Template_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialPeriod" ADD CONSTRAINT "FinancialPeriod_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacebookConnection" ADD CONSTRAINT "FacebookConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
