-- AlterTable
ALTER TABLE "GlobalSettings" ALTER COLUMN "startingFunds" SET DEFAULT 30000000;

-- AlterTable
ALTER TABLE "World" ADD COLUMN     "hostId" TEXT,
ADD COLUMN     "recruitsUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorldMembership" ADD COLUMN     "captain" TEXT,
ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SquadMember" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "p" INTEGER NOT NULL,
    "d" INTEGER NOT NULL,
    "s" INTEGER NOT NULL,
    "cond" INTEGER NOT NULL DEFAULT 100,
    "boughtPrice" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SquadMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SquadMember_membershipId_idx" ON "SquadMember"("membershipId");

-- AddForeignKey
ALTER TABLE "SquadMember" ADD CONSTRAINT "SquadMember_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "WorldMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
