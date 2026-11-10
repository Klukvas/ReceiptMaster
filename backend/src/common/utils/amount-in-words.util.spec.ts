import { amountInWords } from "./amount-in-words.util";

// Expected strings are written from grammar rules, not copied from output.
// Cents are used as input: 100 cents = 1 major unit.
describe("amountInWords", () => {
  describe("UAH uk", () => {
    it.each([
      [0, "Нуль гривень 00 копійок"],
      [100, "Одна гривня 00 копійок"],
      [200, "Дві гривні 00 копійок"],
      [500, "П’ять гривень 00 копійок"],
      [1100, "Одинадцять гривень 00 копійок"],
      [1200, "Дванадцять гривень 00 копійок"],
      [2100, "Двадцять одна гривня 00 копійок"],
      [10100, "Сто одна гривня 00 копійок"],
      [100000, "Одна тисяча гривень 00 копійок"],
      [200000, "Дві тисячі гривень 00 копійок"],
      [500000, "П’ять тисяч гривень 00 копійок"],
      [100000100, "Один мільйон одна гривня 00 копійок"],
      [
        123456700,
        "Один мільйон двісті тридцять чотири тисячі п’ятсот шістдесят сім гривень 00 копійок",
      ],
      [250, "Дві гривні 50 копійок"],
      [100000000000, "Один мільярд гривень 00 копійок"],
      [100000000000000, "Один трильйон гривень 00 копійок"],
    ])("%i cents -> %s", (cents, expected) => {
      expect(amountInWords(cents, "UAH", "uk")).toBe(expected);
    });

    it.each([
      [1, "Нуль гривень 01 копійка"],
      [2, "Нуль гривень 02 копійки"],
      [5, "Нуль гривень 05 копійок"],
      [11, "Нуль гривень 11 копійок"],
      [21, "Нуль гривень 21 копійка"],
      [50, "Нуль гривень 50 копійок"],
      [99, "Нуль гривень 99 копійок"],
    ])("minor units %i -> %s", (cents, expected) => {
      expect(amountInWords(cents, "UAH", "uk")).toBe(expected);
    });

    it("does not throw for Number.MAX_SAFE_INTEGER and spells it correctly", () => {
      expect(amountInWords(Number.MAX_SAFE_INTEGER, "UAH", "uk")).toBe(
        "Дев’яносто трильйонів сімдесят один мільярд дев’ятсот дев’яносто два мільйони п’ятсот сорок сім тисяч чотириста дев’ять гривень 91 копійка",
      );
    });

    it("uses the typographic apostrophe U+2019, never ASCII", () => {
      const text = amountInWords(500, "UAH", "uk");
      expect(text).toContain("’");
      expect(text).not.toContain("'");
    });
  });

  describe("UAH ru", () => {
    it.each([
      [0, "Ноль гривен 00 копеек"],
      [100, "Одна гривна 00 копеек"],
      [200, "Две гривны 00 копеек"],
      [500, "Пять гривен 00 копеек"],
      [1100, "Одиннадцать гривен 00 копеек"],
      [1200, "Двенадцать гривен 00 копеек"],
      [2100, "Двадцать одна гривна 00 копеек"],
      [10100, "Сто одна гривна 00 копеек"],
      [100000, "Одна тысяча гривен 00 копеек"],
      [200000, "Две тысячи гривен 00 копеек"],
      [500000, "Пять тысяч гривен 00 копеек"],
      [100000100, "Один миллион одна гривна 00 копеек"],
      [200000000000, "Два миллиарда гривен 00 копеек"],
      [100000000000, "Один миллиард гривен 00 копеек"],
      [100000000000000, "Один триллион гривен 00 копеек"],
      [1, "Ноль гривен 01 копейка"],
      [2, "Ноль гривен 02 копейки"],
      [5, "Ноль гривен 05 копеек"],
      [11, "Ноль гривен 11 копеек"],
      [21, "Ноль гривен 21 копейка"],
      [50, "Ноль гривен 50 копеек"],
      [99, "Ноль гривен 99 копеек"],
    ])("%i cents -> %s", (cents, expected) => {
      expect(amountInWords(cents, "UAH", "ru")).toBe(expected);
    });

    it("does not throw for Number.MAX_SAFE_INTEGER", () => {
      expect(amountInWords(Number.MAX_SAFE_INTEGER, "UAH", "ru")).toBe(
        "Девяносто триллионов семьдесят один миллиард девятьсот девяносто два миллиона пятьсот сорок семь тысяч четыреста девять гривен 91 копейка",
      );
    });
  });

  describe("UAH en", () => {
    it.each([
      [0, "Zero hryvnias 00 kopiykas"],
      [100, "One hryvnia 00 kopiykas"],
      [200, "Two hryvnias 00 kopiykas"],
      [500, "Five hryvnias 00 kopiykas"],
      [1100, "Eleven hryvnias 00 kopiykas"],
      [1200, "Twelve hryvnias 00 kopiykas"],
      [2100, "Twenty-one hryvnias 00 kopiykas"],
      [10100, "One hundred one hryvnias 00 kopiykas"],
      [100000, "One thousand hryvnias 00 kopiykas"],
      [200000, "Two thousand hryvnias 00 kopiykas"],
      [500000, "Five thousand hryvnias 00 kopiykas"],
      [100000100, "One million one hryvnias 00 kopiykas"],
      [100000000000, "One billion hryvnias 00 kopiykas"],
      [100000000000000, "One trillion hryvnias 00 kopiykas"],
      [101, "One hryvnia 01 kopiyka"],
      [102, "One hryvnia 02 kopiykas"],
      [105, "One hryvnia 05 kopiykas"],
      [111, "One hryvnia 11 kopiykas"],
      [121, "One hryvnia 21 kopiykas"],
      [150, "One hryvnia 50 kopiykas"],
      [199, "One hryvnia 99 kopiykas"],
    ])("%i cents -> %s", (cents, expected) => {
      expect(amountInWords(cents, "UAH", "en")).toBe(expected);
    });

    it("does not use 'and'", () => {
      expect(amountInWords(10100, "UAH", "en")).not.toMatch(/\band\b/);
    });

    it("does not throw for Number.MAX_SAFE_INTEGER", () => {
      expect(amountInWords(Number.MAX_SAFE_INTEGER, "UAH", "en")).toBe(
        "Ninety trillion seventy-one billion nine hundred ninety-two million five hundred forty-seven thousand four hundred nine hryvnias 91 kopiykas",
      );
    });
  });

  describe("other currencies in uk", () => {
    it.each([
      ["USD", 100, "Один долар 00 центів"],
      ["USD", 200, "Два долари 00 центів"],
      ["USD", 500, "П’ять доларів 00 центів"],
      ["USD", 1100, "Одинадцять доларів 00 центів"],
      ["USD", 2100, "Двадцять один долар 00 центів"],
      ["USD", 100000, "Одна тисяча доларів 00 центів"],
      ["USD", 100000100, "Один мільйон один долар 00 центів"],
      ["USD", 101, "Один долар 01 цент"],
      ["USD", 102, "Один долар 02 центи"],
      ["USD", 105, "Один долар 05 центів"],
      ["USD", 111, "Один долар 11 центів"],
      ["EUR", 100, "Один євро 00 центів"],
      ["EUR", 200, "Два євро 00 центів"],
      ["EUR", 500, "П’ять євро 00 центів"],
      ["EUR", 502, "П’ять євро 02 центи"],
      ["PLN", 100, "Один злотий 00 грошів"],
      ["PLN", 200, "Два злоті 00 грошів"],
      ["PLN", 500, "П’ять злотих 00 грошів"],
      ["PLN", 101, "Один злотий 01 грош"],
      ["PLN", 102, "Один злотий 02 гроші"],
      ["PLN", 105, "Один злотий 05 грошів"],
      ["GBP", 100, "Один фунт стерлінгів 00 пенсів"],
      ["GBP", 200, "Два фунти стерлінгів 00 пенсів"],
      ["GBP", 500, "П’ять фунтів стерлінгів 00 пенсів"],
      ["GBP", 101, "Один фунт стерлінгів 01 пенс"],
      ["GBP", 102, "Один фунт стерлінгів 02 пенси"],
    ])("%s %i cents -> %s", (currency, cents, expected) => {
      expect(amountInWords(cents, currency, "uk")).toBe(expected);
    });
  });

  describe("other currencies in ru and en", () => {
    it.each([
      ["USD", "ru", 200, "Два доллара 00 центов"],
      ["USD", "ru", 502, "Пять долларов 02 цента"],
      ["PLN", "ru", 200, "Два злотых 00 грошей"],
      ["GBP", "ru", 200, "Два фунта стерлингов 00 пенсов"],
      ["USD", "en", 101, "One dollar 01 cent"],
      ["USD", "en", 202, "Two dollars 02 cents"],
      ["GBP", "en", 101, "One pound sterling 01 penny"],
      ["GBP", "en", 202, "Two pounds sterling 02 pence"],
    ])("%s/%s %i cents -> %s", (currency, language, cents, expected) => {
      expect(amountInWords(cents, currency, language as "ru" | "en")).toBe(
        expected,
      );
    });
  });

  describe("currency without a name table (CHF)", () => {
    it.each([
      ["uk", 4545, "Сорок п’ять CHF 45/100"],
      ["ru", 4545, "Сорок пять CHF 45/100"],
      ["en", 4545, "Forty-five CHF 45/100"],
      ["uk", 0, "Нуль CHF 00/100"],
      ["en", 100, "One CHF 00/100"],
    ])("%s %i cents -> %s", (language, cents, expected) => {
      expect(amountInWords(cents, "CHF", language as "uk" | "ru" | "en")).toBe(
        expected,
      );
    });
  });

  describe("invalid input", () => {
    it.each([
      ["negative", -1, "UAH"],
      ["fractional", 1.5, "UAH"],
      ["NaN", Number.NaN, "UAH"],
      ["Infinity", Infinity, "UAH"],
      ["beyond safe integer", Number.MAX_SAFE_INTEGER + 1, "UAH"],
      ["lowercase currency", 100, "uah"],
      ["too short currency", 100, "UA"],
      ["too long currency", 100, "UAHH"],
      ["empty currency", 100, ""],
      ["currency with padding", 100, " UAH"],
      ["numeric currency", 100, "123"],
    ])("throws RangeError for %s", (_label, cents, currency) => {
      expect(() => amountInWords(cents, currency, "uk")).toThrow(RangeError);
    });

    it("throws RangeError for non-number cents", () => {
      expect(() =>
        amountInWords("100" as unknown as number, "UAH", "uk"),
      ).toThrow(RangeError);
      expect(() =>
        amountInWords(null as unknown as number, "UAH", "uk"),
      ).toThrow(RangeError);
    });
  });
});
