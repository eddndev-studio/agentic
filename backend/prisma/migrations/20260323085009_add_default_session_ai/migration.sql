/*
  Warnings:

  - You are about to drop the column `name` on the `Client` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Bot" ADD COLUMN     "defaultSessionAi" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "name";

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "aiEnabled" SET DEFAULT false;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "defaultSessionAi" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ConversationLog_sessionId_createdAt_idx" ON "ConversationLog"("sessionId", "createdAt");
