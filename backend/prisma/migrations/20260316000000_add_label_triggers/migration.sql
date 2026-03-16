-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('TEXT', 'LABEL');

-- CreateEnum
CREATE TYPE "LabelAction" AS ENUM ('ADD', 'REMOVE');

-- AlterTable
ALTER TABLE "Trigger" ADD COLUMN     "labelAction" "LabelAction",
ADD COLUMN     "labelName" TEXT,
ADD COLUMN     "triggerType" "TriggerType" NOT NULL DEFAULT 'TEXT',
ALTER COLUMN "keyword" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Template" ADD COLUMN "messageDelay" INTEGER NOT NULL DEFAULT 0;
