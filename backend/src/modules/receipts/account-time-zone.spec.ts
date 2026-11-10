import { accountTimeZone } from "./account-time-zone";

const zoneOf = async (stored: string | null | undefined) =>
  accountTimeZone(
    {
      query: jest
        .fn()
        .mockResolvedValue(stored === undefined ? [] : [{ zone: stored }]),
    } as never,
    "user-1",
  );

describe("accountTimeZone", () => {
  it("uses the saved IANA zone", async () => {
    expect(await zoneOf("America/New_York")).toBe("America/New_York");
  });

  it.each([null, undefined, "", "Not/AZone", "+05:00", "-03:00"])(
    "falls back to Europe/Kyiv for %p",
    async (stored) => {
      expect(await zoneOf(stored)).toBe("Europe/Kyiv");
    },
  );
});
