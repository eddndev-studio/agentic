-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "waLabelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "predefinedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLabel" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Label_botId_idx" ON "Label"("botId");

-- CreateIndex
CREATE UNIQUE INDEX "Label_botId_waLabelId_key" ON "Label"("botId", "waLabelId");

-- CreateIndex
CREATE INDEX "SessionLabel_sessionId_idx" ON "SessionLabel"("sessionId");

-- CreateIndex
CREATE INDEX "SessionLabel_labelId_idx" ON "SessionLabel"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionLabel_sessionId_labelId_key" ON "SessionLabel"("sessionId", "labelId");

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLabel" ADD CONSTRAINT "SessionLabel_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLabel" ADD CONSTRAINT "SessionLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;
