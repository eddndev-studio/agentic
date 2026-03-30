-- CreateTable
CREATE TABLE "ConnectToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectToken_token_key" ON "ConnectToken"("token");

-- CreateIndex
CREATE INDEX "ConnectToken_token_idx" ON "ConnectToken"("token");

-- CreateIndex
CREATE INDEX "ConnectToken_botId_idx" ON "ConnectToken"("botId");

-- AddForeignKey
ALTER TABLE "ConnectToken" ADD CONSTRAINT "ConnectToken_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
