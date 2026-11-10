// Template names come from the backend list. The delivery style keeps its identifier and wire
// value; only what the interface calls it is translated here.
const TRANSLATED_NAME_KEYS: Readonly<Record<string, string>> = {
  delivery: "settings.templateNames.delivery",
};

export function templateDisplayName(
  t: (key: string) => string,
  template: { id: string; name: string },
): string {
  const key = TRANSLATED_NAME_KEYS[template.id];
  return key ? t(key) : template.name;
}
