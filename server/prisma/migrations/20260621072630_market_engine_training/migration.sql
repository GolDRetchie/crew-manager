-- AlterTable
ALTER TABLE "SquadMember" ADD COLUMN     "altRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "isGeneric" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorldMembership" ADD COLUMN     "capCond" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "capD" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "capP" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "capS" INTEGER NOT NULL DEFAULT 8;

-- CreateTable
CREATE TABLE "Training" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "squadMemberId" TEXT,
    "stat" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketListing" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "altRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "p" INTEGER NOT NULL,
    "d" INTEGER NOT NULL,
    "s" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "listedDay" INTEGER NOT NULL,
    "tenure" INTEGER NOT NULL DEFAULT 3,
    "saleAt" INTEGER,
    "saleDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Training_membershipId_idx" ON "Training"("membershipId");

-- CreateIndex
CREATE INDEX "MarketListing_worldId_idx" ON "MarketListing"("worldId");

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "WorldMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
