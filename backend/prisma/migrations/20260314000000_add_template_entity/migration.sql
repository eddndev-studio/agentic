-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "aiModel" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "aiProvider" "AIProvider" NOT NULL DEFAULT 'GEMINI',
    "systemPrompt" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "thinkingLevel" TEXT DEFAULT 'LOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Bot" ADD COLUMN     "botVariables" JSONB DEFAULT '{}',
ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "Flow" ADD COLUMN     "templateId" TEXT,
ALTER COLUMN "botId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tool" ADD COLUMN     "templateId" TEXT,
ALTER COLUMN "botId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Trigger" ADD COLUMN     "templateId" TEXT,
ALTER COLUMN "botId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "templateId" TEXT,
ALTER COLUMN "botId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Automation_templateId_idx" ON "Automation"("templateId");

-- CreateIndex
CREATE INDEX "Tool_templateId_idx" ON "Tool"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_templateId_name_key" ON "Tool"("templateId", "name");

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
