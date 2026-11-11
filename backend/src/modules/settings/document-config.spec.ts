import { followDocumentLanguage, legacyConfig } from "./document-config";
import { UserSettings } from "./entities/user-settings.entity";

describe("legacyConfig (an account without a saved document configuration)", () => {
  it.each([
    ["en", "en-US", "h12"],
    ["uk", "uk-UA", "h23"],
    ["ru", "ru-RU", "h23"],
  ] as const)(
    "writes numbers and times the way %s documents do",
    (language, numberLocale, hourCycle) => {
      const { formatting } = legacyConfig({
        templateLanguage: language,
      } as UserSettings);
      expect(formatting).toMatchObject({ numberLocale, hourCycle });
    },
  );

  it("starts a brand-new account in English with English numbers", () => {
    expect(legacyConfig(null).formatting.numberLocale).toBe("en-US");
  });

  it("still treats the old ru-RU default of a saved config as unchosen", () => {
    const saved = {
      ...legacyConfig(null).formatting,
      numberLocale: "ru-RU" as const,
    };
    expect(followDocumentLanguage(saved, "en", "uk").numberLocale).toBe(
      "uk-UA",
    );
  });
});
