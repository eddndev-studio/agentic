-- CreateEnum
CREATE TYPE "TriggerTarget" AS ENUM ('FLOW', 'TOOL');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Trigger" ADD COLUMN     "targetType" "TriggerTarget" NOT NULL DEFAULT 'FLOW',
ADD COLUMN     "toolName" TEXT,
ALTER COLUMN "flowId" DROP NOT NULL;
