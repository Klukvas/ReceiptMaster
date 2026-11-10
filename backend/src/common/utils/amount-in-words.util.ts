export type DocumentLanguage = "uk" | "ru" | "en";

interface CurrencyUnit {
  // Slavic: [1, 2-4, 5+]; English: [one, other].
  readonly forms: readonly string[];
  readonly isFeminine: boolean;
}

interface CurrencyNames {
  readonly major: CurrencyUnit;
  readonly minor: CurrencyUnit;
}

interface SlavicPack {
  readonly zero: string;
  readonly ones: readonly string[];
  readonly feminineOnes: readonly string[];
  readonly teens: readonly string[];
  readonly tens: readonly string[];
  readonly hundreds: readonly string[];
  // Scales from thousand upward; thousand is always feminine.
  readonly scales: readonly (readonly string[])[];
}

const MASCULINE = { isFeminine: false } as const;
const FEMININE = { isFeminine: true } as const;

const UK: SlavicPack = {
  zero: "нуль",
  ones: [
    "",
    "один",
    "два",
    "три",
    "чотири",
    "п’ять",
    "шість",
    "сім",
    "вісім",
    "дев’ять",
  ],
  feminineOnes: ["", "одна", "дві"],
  teens: [
    "десять",
    "одинадцять",
    "дванадцять",
    "тринадцять",
    "чотирнадцять",
    "п’ятнадцять",
    "шістнадцять",
    "сімнадцять",
    "вісімнадцять",
    "дев’ятнадцять",
  ],
  tens: [
    "",
    "",
    "двадцять",
    "тридцять",
    "сорок",
    "п’ятдесят",
    "шістдесят",
    "сімдесят",
    "вісімдесят",
    "дев’яносто",
  ],
  hundreds: [
    "",
    "сто",
    "двісті",
    "триста",
    "чотириста",
    "п’ятсот",
    "шістсот",
    "сімсот",
    "вісімсот",
    "дев’ятсот",
  ],
  scales: [
    ["тисяча", "тисячі", "тисяч"],
    ["мільйон", "мільйони", "мільйонів"],
    ["мільярд", "мільярди", "мільярдів"],
    ["трильйон", "трильйони", "трильйонів"],
  ],
};

const RU: SlavicPack = {
  zero: "ноль",
  ones: [
    "",
    "один",
    "два",
    "три",
    "четыре",
    "пять",
    "шесть",
    "семь",
    "восемь",
    "девять",
  ],
  feminineOnes: ["", "одна", "две"],
  teens: [
    "десять",
    "одиннадцать",
    "двенадцать",
    "тринадцать",
    "четырнадцать",
    "пятнадцать",
    "шестнадцать",
    "семнадцать",
    "восемнадцать",
    "девятнадцать",
  ],
  tens: [
    "",
    "",
    "двадцать",
    "тридцать",
    "сорок",
    "пятьдесят",
    "шестьдесят",
    "семьдесят",
    "восемьдесят",
    "девяносто",
  ],
  hundreds: [
    "",
    "сто",
    "двести",
    "триста",
    "четыреста",
    "пятьсот",
    "шестьсот",
    "семьсот",
    "восемьсот",
    "девятьсот",
  ],
  scales: [
    ["тысяча", "тысячи", "тысяч"],
    ["миллион", "миллиона", "миллионов"],
    ["миллиард", "миллиарда", "миллиардов"],
    ["триллион", "триллиона", "триллионов"],
  ],
};

const EN_ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const EN_TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];
const EN_SCALES = ["thousand", "million", "billion", "trillion"];

const CURRENCIES: Readonly<
  Record<string, Readonly<Record<DocumentLanguage, CurrencyNames>>>
> = {
  UAH: {
    uk: {
      major: { forms: ["гривня", "гривні", "гривень"], ...FEMININE },
      minor: { forms: ["копійка", "копійки", "копійок"], ...FEMININE },
    },
    ru: {
      major: { forms: ["гривна", "гривны", "гривен"], ...FEMININE },
      minor: { forms: ["копейка", "копейки", "копеек"], ...FEMININE },
    },
    en: {
      major: { forms: ["hryvnia", "hryvnias"], ...FEMININE },
      minor: { forms: ["kopiyka", "kopiykas"], ...FEMININE },
    },
  },
  USD: {
    uk: {
      major: { forms: ["долар", "долари", "доларів"], ...MASCULINE },
      minor: { forms: ["цент", "центи", "центів"], ...MASCULINE },
    },
    ru: {
      major: { forms: ["доллар", "доллара", "долларов"], ...MASCULINE },
      minor: { forms: ["цент", "цента", "центов"], ...MASCULINE },
    },
    en: {
      major: { forms: ["dollar", "dollars"], ...MASCULINE },
      minor: { forms: ["cent", "cents"], ...MASCULINE },
    },
  },
  EUR: {
    uk: {
      major: { forms: ["євро", "євро", "євро"], ...MASCULINE },
      minor: { forms: ["цент", "центи", "центів"], ...MASCULINE },
    },
    ru: {
      major: { forms: ["евро", "евро", "евро"], ...MASCULINE },
      minor: { forms: ["цент", "цента", "центов"], ...MASCULINE },
    },
    en: {
      major: { forms: ["euro", "euros"], ...MASCULINE },
      minor: { forms: ["cent", "cents"], ...MASCULINE },
    },
  },
  PLN: {
    uk: {
      major: { forms: ["злотий", "злоті", "злотих"], ...MASCULINE },
      minor: { forms: ["грош", "гроші", "грошів"], ...MASCULINE },
    },
    ru: {
      major: { forms: ["злотый", "злотых", "злотых"], ...MASCULINE },
      minor: { forms: ["грош", "гроша", "грошей"], ...MASCULINE },
    },
    en: {
      major: { forms: ["zloty", "zlotys"], ...MASCULINE },
      minor: { forms: ["grosz", "groszy"], ...MASCULINE },
    },
  },
  GBP: {
    uk: {
      major: {
        forms: ["фунт стерлінгів", "фунти стерлінгів", "фунтів стерлінгів"],
        ...MASCULINE,
      },
      minor: { forms: ["пенс", "пенси", "пенсів"], ...MASCULINE },
    },
    ru: {
      major: {
        forms: ["фунт стерлингов", "фунта стерлингов", "фунтов стерлингов"],
        ...MASCULINE,
      },
      minor: { forms: ["пенс", "пенса", "пенсов"], ...MASCULINE },
    },
    en: {
      major: { forms: ["pound sterling", "pounds sterling"], ...MASCULINE },
      minor: { forms: ["penny", "pence"], ...MASCULINE },
    },
  },
};

// 0 -> 1, 2-4 -> 2-4 form, everything else (and 11-14) -> the "many" form.
function slavicFormIndex(count: number): number {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 2;
  if (last === 1) return 0;
  return last >= 2 && last <= 4 ? 1 : 2;
}

function pickForm(
  unit: CurrencyUnit,
  count: number,
  language: DocumentLanguage,
): string {
  const index =
    language === "en" ? (count === 1 ? 0 : 1) : slavicFormIndex(count);
  return unit.forms[index];
}

function slavicTriplet(
  value: number,
  pack: SlavicPack,
  isFeminine: boolean,
): string[] {
  const words: string[] = [pack.hundreds[Math.floor(value / 100)]];
  const rest = value % 100;
  if (rest >= 10 && rest < 20) {
    words.push(pack.teens[rest - 10]);
  } else {
    const unit = rest % 10;
    words.push(pack.tens[Math.floor(rest / 10)]);
    words.push(
      isFeminine && unit >= 1 && unit <= 2
        ? pack.feminineOnes[unit]
        : pack.ones[unit],
    );
  }
  return words.filter(Boolean);
}

function slavicWords(
  amount: number,
  pack: SlavicPack,
  isFeminine: boolean,
): string {
  if (amount === 0) return pack.zero;
  const words: string[] = [];
  const groups: number[] = [];
  for (let rest = amount; rest > 0; rest = Math.floor(rest / 1000))
    groups.push(rest % 1000);
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group === 0) continue;
    const scale = pack.scales[index - 1];
    words.push(
      ...slavicTriplet(group, pack, index === 1 || (index === 0 && isFeminine)),
    );
    if (scale) words.push(scale[slavicFormIndex(group)]);
  }
  return words.join(" ");
}

function englishTriplet(value: number): string[] {
  const words: string[] = [];
  if (value >= 100) words.push(EN_ONES[Math.floor(value / 100)], "hundred");
  const rest = value % 100;
  if (rest >= 20) {
    const unit = rest % 10;
    words.push(
      unit
        ? `${EN_TENS[Math.floor(rest / 10)]}-${EN_ONES[unit]}`
        : EN_TENS[Math.floor(rest / 10)],
    );
  } else if (rest > 0) {
    words.push(EN_ONES[rest]);
  }
  return words;
}

function englishWords(amount: number): string {
  if (amount === 0) return "zero";
  const words: string[] = [];
  const groups: number[] = [];
  for (let rest = amount; rest > 0; rest = Math.floor(rest / 1000))
    groups.push(rest % 1000);
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    if (groups[index] === 0) continue;
    words.push(...englishTriplet(groups[index]));
    if (index > 0) words.push(EN_SCALES[index - 1]);
  }
  return words.join(" ");
}

function numberWords(
  amount: number,
  language: DocumentLanguage,
  isFeminine: boolean,
): string {
  if (language === "en") return englishWords(amount);
  return slavicWords(amount, language === "uk" ? UK : RU, isFeminine);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Whole units in words, minor units as two digits: "Дві гривні 50 копійок".
// Currencies without a name table fall back to "<words> CHF 45/100".
export function amountInWords(
  cents: number,
  currency: string,
  language: DocumentLanguage,
): string {
  if (
    !Number.isSafeInteger(cents) ||
    cents < 0 ||
    !/^[A-Z]{3}$/.test(currency) ||
    !["uk", "ru", "en"].includes(language)
  )
    throw new RangeError("Invalid amount-in-words input");
  const major = Math.floor(cents / 100);
  const minor = cents % 100;
  const minorDigits = String(minor).padStart(2, "0");
  const names = CURRENCIES[currency]?.[language];
  if (!names)
    return capitalize(
      `${numberWords(major, language, false)} ${currency} ${minorDigits}/100`,
    );
  return capitalize(
    [
      numberWords(major, language, names.major.isFeminine),
      pickForm(names.major, major, language),
      minorDigits,
      pickForm(names.minor, minor, language),
    ].join(" "),
  );
}
