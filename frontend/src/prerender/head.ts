import { DEFAULT_TITLE } from "../components/seo/constants";

/** On every head tag the build wrote for a prerendered page, so the app can tell them from its own. */
export const PRERENDERED_ATTRIBUTE = "data-prerendered";

/**
 * Returns `<head>` to what any other page of the app starts from, once the live page has added
 * its own tags. React adds those next to the prerendered ones rather than reusing them, so the
 * build's copies would otherwise sit there twice and then describe the wrong page after the
 * first navigation. They are removed, except the `<title>`: it is reset to the site's default
 * and kept, as index.html's is, to title pages that set none (the dashboard).
 */
export function resetPrerenderedHead(): void {
  for (const tag of document.head.querySelectorAll(`[${PRERENDERED_ATTRIBUTE}]`)) {
    if (tag instanceof HTMLTitleElement) {
      tag.textContent = DEFAULT_TITLE;
      tag.removeAttribute(PRERENDERED_ATTRIBUTE);
    } else {
      tag.remove();
    }
  }
}
