import { createHash } from "crypto";
import {
  REPLAY_GRACE_MS,
  familyOf,
  hashRefreshToken,
  isReplay,
} from "./refresh-tokens";

describe("refresh token helpers", () => {
  const now = new Date("2026-10-30T12:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("hashes to the hex SHA-256 PostgreSQL computes for the backfill", () => {
    const token = "ab".repeat(64);

    expect(hashRefreshToken(token)).toBe(
      createHash("sha256").update(token, "utf8").digest("hex"),
    );
    expect(hashRefreshToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  describe("isReplay", () => {
    it("never treats a token that no rotation redeemed as a replay", () => {
      // Live, expired, or revoked by logout, a password change or a family
      // revocation — and rows revoked before redeemed_at existed.
      expect(isReplay({ redeemed_at: null }, now)).toBe(false);
    });

    it("treats a token redeemed within the grace window as a lost race", () => {
      expect(isReplay({ redeemed_at: ago(1) }, now)).toBe(false);
      expect(isReplay({ redeemed_at: ago(REPLAY_GRACE_MS) }, now)).toBe(false);
    });

    it("treats a token redeemed after this request started as a lost race", () => {
      expect(isReplay({ redeemed_at: ago(-500) }, now)).toBe(false);
    });

    it("treats a token redeemed longer ago than the window as a replay", () => {
      expect(isReplay({ redeemed_at: ago(REPLAY_GRACE_MS + 1) }, now)).toBe(
        true,
      );
    });
  });

  it("puts a rolled-back image's family-less row at the root of its own family", () => {
    expect(familyOf({ id: "row-1", family_id: null })).toBe("row-1");
    expect(familyOf({ id: "row-2", family_id: "family-1" })).toBe("family-1");
  });
});
