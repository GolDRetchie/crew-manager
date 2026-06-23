-- AlterTable
ALTER TABLE "WorldMembership" ADD COLUMN     "deckColor" TEXT,
ADD COLUMN     "figurehead" TEXT DEFAULT 'none',
ADD COLUMN     "hullColor" TEXT,
ADD COLUMN     "jollyRoger" TEXT DEFAULT 'skull',
ADD COLUMN     "sailColor" TEXT,
ADD COLUMN     "shipTier" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "trimColor" TEXT;
