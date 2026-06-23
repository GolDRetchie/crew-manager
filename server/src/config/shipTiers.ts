export const SHIP_TIERS = {
  1: { name: "Dinghy",      rosterCap: 3  },  // cap = leden EXCL. kapitein
  2: { name: "Caravel",     rosterCap: 7  },
  3: { name: "Yonko-class", rosterCap: 13 },
} as const;

export const MAX_SHIP_TIER = 3;

// prijs om NAAR deze tier te upgraden
export const SHIP_UPGRADE_PRICE: Record<number, number> = {
  2: 10_000_000,
  3: 30_000_000,
};

export const SHIPWRIGHT_DISCOUNT = 0.30;

export function rosterCapForTier(tier: number): number {
  return SHIP_TIERS[(tier as 1 | 2 | 3)]?.rosterCap ?? SHIP_TIERS[1].rosterCap;
}

export function upgradePrice(toTier: number, hasShipwright: boolean): number {
  const base = SHIP_UPGRADE_PRICE[toTier] ?? 0;
  return hasShipwright ? Math.round(base * (1 - SHIPWRIGHT_DISCOUNT)) : base;
}