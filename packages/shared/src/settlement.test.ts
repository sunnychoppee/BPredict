import { describe, expect, it } from "vitest";
import { computeSettlement, liveOdds, streakRate, type SettlementParams } from "./settlement";

const P: SettlementParams = {
  feeRate: 0.04,
  seedPerSide: 5000,
  streakBonus: [
    { streak: 3, rate: 0.05 },
    { streak: 5, rate: 0.1 },
    { streak: 10, rate: 0.2 },
  ],
  streakBonusCap: 20000,
};

describe("computeSettlement", () => {
  it("conserves coins: stakes + seed == payouts + destroyed", () => {
    const r = computeSettlement(
      "BANKER",
      [
        { userId: "a", side: "BANKER", amount: 10000, currentStreak: 0 },
        { userId: "b", side: "BANKER", amount: 30000, currentStreak: 0 },
        { userId: "c", side: "PLAYER", amount: 25000, currentStreak: 0 },
      ],
      P,
    );
    const paid = r.payouts.reduce((s, p) => s + p.total, 0);
    expect(paid + r.destroyed).toBe(10000 + 30000 + 25000 + P.seedPerSide);
    expect(r.fee).toBe(Math.floor(65000 * 0.04));
    expect(r.winner).toBe("BANKER");
    expect(r.payouts.map((p) => p.userId).sort()).toEqual(["a", "b"]);
  });

  it("winners get more than stake back when the losing side had money", () => {
    const r = computeSettlement(
      "PLAYER",
      [
        { userId: "a", side: "BANKER", amount: 50000, currentStreak: 0 },
        { userId: "b", side: "PLAYER", amount: 50000, currentStreak: 0 },
      ],
      P,
    );
    const b = r.payouts.find((p) => p.userId === "b")!;
    expect(b.base).toBeGreaterThan(50000);
    // (100000*0.96 + 5000) / (50000 + 5000) = 1.8364
    expect(r.payoutPerUnit).toBeCloseTo(1.8364, 3);
  });

  it("one-sided round: lone winner is paid from the seed only", () => {
    const r = computeSettlement("BANKER", [{ userId: "a", side: "BANKER", amount: 1000, currentStreak: 0 }], P);
    const a = r.payouts[0]!;
    // (1000*0.96 + 5000) / (1000 + 5000) = 0.99333 → winner gets back slightly less than stake (fee)
    expect(a.base).toBe(Math.floor(1000 * ((1000 * 0.96 + 5000) / 6000)));
    expect(a.base + r.destroyed).toBe(1000 + 5000);
  });

  it("nobody on the winning side: everything is destroyed, no payouts", () => {
    const r = computeSettlement("PLAYER", [{ userId: "a", side: "BANKER", amount: 7000, currentStreak: 0 }], P);
    expect(r.payouts).toHaveLength(0);
    expect(r.destroyed).toBe(7000 + 5000);
  });

  it("merges multiple stakes from the same user on the same side", () => {
    const r = computeSettlement(
      "BANKER",
      [
        { userId: "a", side: "BANKER", amount: 1000, currentStreak: 0 },
        { userId: "a", side: "BANKER", amount: 2000, currentStreak: 0 },
        { userId: "z", side: "PLAYER", amount: 3000, currentStreak: 0 },
      ],
      P,
    );
    expect(r.payouts).toHaveLength(1);
    expect(r.payouts[0]!.stake).toBe(3000);
  });

  it("pays streak bonus from fee, capped per user and by total fee", () => {
    const r = computeSettlement(
      "BANKER",
      [
        { userId: "hot", side: "BANKER", amount: 100000, currentStreak: 4 }, // becomes 5 → 10%
        { userId: "cold", side: "PLAYER", amount: 100000, currentStreak: 0 },
      ],
      P,
    );
    const hot = r.payouts[0]!;
    const profit = hot.base - hot.stake;
    expect(hot.streakBonus).toBe(Math.min(Math.floor(profit * 0.1), P.streakBonusCap, r.fee));
    expect(hot.streakBonus).toBeGreaterThan(0);
    expect(hot.streakBonus).toBeLessThanOrEqual(r.fee);
    const paid = r.payouts.reduce((s, p) => s + p.total, 0);
    expect(paid + r.destroyed).toBe(200000 + P.seedPerSide);
  });

  it("streak bonus never exceeds the cap", () => {
    const r = computeSettlement(
      "BANKER",
      [
        { userId: "whale", side: "BANKER", amount: 1_000_000, currentStreak: 9 }, // 10 → 20%
        { userId: "fish", side: "PLAYER", amount: 1_000_000, currentStreak: 0 },
      ],
      P,
    );
    expect(r.payouts[0]!.streakBonus).toBe(P.streakBonusCap);
  });

  it("rejects non-positive or fractional stakes", () => {
    expect(() => computeSettlement("BANKER", [{ userId: "a", side: "BANKER", amount: 0, currentStreak: 0 }], P)).toThrow();
    expect(() => computeSettlement("BANKER", [{ userId: "a", side: "BANKER", amount: 10.5, currentStreak: 0 }], P)).toThrow();
  });
});

describe("streakRate", () => {
  it("picks the highest qualifying tier", () => {
    expect(streakRate(1, P.streakBonus)).toBe(0);
    expect(streakRate(3, P.streakBonus)).toBe(0.05);
    expect(streakRate(7, P.streakBonus)).toBe(0.1);
    expect(streakRate(25, P.streakBonus)).toBe(0.2);
  });
});

describe("liveOdds", () => {
  it("empty pools show ~0.96 both sides; heavy side pays less", () => {
    const empty = liveOdds(0, 0, P);
    expect(empty.BANKER).toBeCloseTo(empty.PLAYER, 6);
    const skewed = liveOdds(90000, 10000, P);
    expect(skewed.BANKER).toBeLessThan(skewed.PLAYER);
    expect(skewed.PLAYER).toBeGreaterThan(1);
  });
});
