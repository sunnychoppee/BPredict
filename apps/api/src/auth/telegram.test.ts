import { describe, expect, it } from "vitest";
import { signTelegramInitData, verifyTelegramInitData, TelegramInitDataError } from "./telegram";

const TOKEN = "123456:TEST_TOKEN_abc";
const NOW = 1_800_000_000_000; // ms
const user = { id: 42, first_name: "Sean", username: "sean", language_code: "zh-hant" };

function make(overrides: Record<string, string> = {}, token = TOKEN) {
  return signTelegramInitData(
    {
      query_id: "AAH",
      user: JSON.stringify(user),
      auth_date: String(Math.floor(NOW / 1000) - 10),
      ...overrides,
    },
    token,
  );
}

describe("verifyTelegramInitData", () => {
  it("accepts a correctly signed payload", () => {
    const { user: u } = verifyTelegramInitData(make(), TOKEN, { now: () => NOW });
    expect(u.id).toBe(42);
    expect(u.username).toBe("sean");
  });

  it("rejects a payload signed with another bot token", () => {
    expect(() => verifyTelegramInitData(make({}, "999:OTHER"), TOKEN, { now: () => NOW })).toThrow(TelegramInitDataError);
  });

  it("rejects tampered fields", () => {
    const signed = make();
    const tampered = signed.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
    expect(tampered).not.toBe(signed);
    expect(() => verifyTelegramInitData(tampered, TOKEN, { now: () => NOW })).toThrow("bad signature");
  });

  it("rejects stale auth_date", () => {
    const old = make({ auth_date: String(Math.floor(NOW / 1000) - 3600) });
    expect(() => verifyTelegramInitData(old, TOKEN, { now: () => NOW })).toThrow("expired");
  });

  it("rejects missing hash", () => {
    expect(() => verifyTelegramInitData("user=%7B%7D&auth_date=1", TOKEN)).toThrow("missing hash");
  });
});
