/**
 * Category labels of the horizontal bar charts sit in a 90px axis. Recharts wraps a long name
 * over its neighbours' rows, and a name without spaces runs off the card's left edge, so the
 * label is cut to one line; the tooltip shows the full name.
 */
export const CHART_LABEL_MAX_CHARS = 13;

const ELLIPSIS = "…";

export const truncateChartLabel = (
  label: string,
  maxChars: number = CHART_LABEL_MAX_CHARS,
): string => {
  // Code points, so an emoji or other astral character is never cut in half.
  const characters = Array.from(label);
  if (characters.length <= maxChars) return label;
  return `${characters.slice(0, maxChars - 1).join("").trimEnd()}${ELLIPSIS}`;
};
