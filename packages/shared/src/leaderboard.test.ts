import { describe, expect, it } from "vitest";
import { periodRange } from "./leaderboard";

// 2026-11-04 12:00 UTC = 20:00 UTC+8 (Wednesday)
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const SEASON = { seasonStart: "2026-11-02", seasonDays: 28 };

describe("periodRange", () => {
  it("day covers the current UTC+8 day", () => {
    const r = periodRange("day", SEASON, NOW);
    expect(r.from).toBe("2026-11-04");
    expect(r.to).toBe("2026-11-04");
    expect(new Date(r.endsAt).toISOString()).toBe("2026-11-04T16:00:00.000Z"); // 00:00 UTC+8 next day
  });

  it("day rolls over at 16:00 UTC", () => {
    const r = periodRange("day", SEASON, Date.UTC(2026, 10, 4, 16, 0, 0));
    expect(r.from).toBe("2026-11-05");
  });

  it("week is Monday–Sunday in UTC+8", () => {
    const r = periodRange("week", SEASON, NOW);
    expect(r.from).toBe("2026-11-02"); // Monday
    expect(r.to).toBe("2026-11-08"); // Sunday
    expect(new Date(r.endsAt).toISOString()).toBe("2026-11-08T16:00:00.000Z");
    // Sunday evening (UTC+8) is still this week; Monday 00:00 UTC+8 starts the next one.
    expect(periodRange("week", SEASON, Date.UTC(2026, 10, 8, 15, 59, 59)).from).toBe("2026-11-02");
    expect(periodRange("week", SEASON, Date.UTC(2026, 10, 8, 16, 0, 0)).from).toBe("2026-11-09");
  });

  it("season index advances every seasonDays from season_start", () => {
    const s1 = periodRange("season", SEASON, NOW);
    expect(s1.seasonNo).toBe(1);
    expect(s1.from).toBe("2026-11-02");
    expect(s1.to).toBe("2026-11-29");
    const s2 = periodRange("season", SEASON, Date.UTC(2026, 11, 1, 0, 0, 0));
    expect(s2.seasonNo).toBe(2);
    expect(s2.from).toBe("2026-11-30");
    // before season_start clamps to season 1
    expect(periodRange("season", SEASON, Date.UTC(2026, 9, 1)).seasonNo).toBe(1);
  });
});
