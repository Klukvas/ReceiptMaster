// Template names come from the backend list. The delivery and corporate styles keep their
// identifiers and wire values; only what the interface calls them is translated here. The
// backend calls corporate "Corporate Invoice", yet the style also prints acts, packing lists,
// quotations and return notes, so the interface uses a type-neutral name.
const TRANSLATED_NAME_KEYS: Readonly<Record<string, string>> = {
  delivery: "settings.templateNames.delivery",
  corporate: "settings.templateNames.corporate",
};

export function templateDisplayName(
  t: (key: string) => string,
  template: { id: string; name: string },
): string {
  const key = TRANSLATED_NAME_KEYS[template.id];
  return key ? t(key) : template.name;
}
