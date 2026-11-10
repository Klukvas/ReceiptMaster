import type { TFunction } from "i18next";

const KYIV_ZONES: ReadonlySet<string> = new Set(["Europe/Kyiv", "Europe/Kiev"]);
const UNIVERSAL_ZONES: ReadonlySet<string> = new Set(["UTC", "Etc/UTC", "Etc/GMT", "GMT", "Etc/Universal"]);

/** "GMT+2" for the zone right now, or "" when the browser cannot tell. */
const offsetOf = (timeZone: string): string => {
  try {
    return (
      new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "shortOffset" })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
};

/**
 * The account's document time zone the way a person says it ("за київським часом"), instead of an
 * IANA id or "UTC". Unknown zones fall back to their city and current offset ("Warsaw (GMT+1)").
 */
export function timeZonePhrase(t: TFunction, timeZone: string): string {
  if (KYIV_ZONES.has(timeZone)) return t("documentsPage.timeZoneKyiv");
  if (UNIVERSAL_ZONES.has(timeZone)) return t("documentsPage.timeZoneUniversal");
  const city = (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
  const offset = offsetOf(timeZone);
  return t("documentsPage.timeZoneCity", { city: offset ? `${city} (${offset})` : city });
}
