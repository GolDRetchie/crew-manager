-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastMissionDay" TEXT,
ADD COLUMN     "missionStreak" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlayerMission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "missionKey" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "baseline" INTEGER,
    "worldId" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'bronze',
    "data" JSONB,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerMission_userId_scope_periodKey_idx" ON "PlayerMission"("userId", "scope", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMission_userId_scope_periodKey_missionKey_key" ON "PlayerMission"("userId", "scope", "periodKey", "missionKey");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_idx" ON "InventoryItem"("userId");

-- AddForeignKey
ALTER TABLE "PlayerMission" ADD CONSTRAINT "PlayerMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
