import { Languages, Moon, Sun } from "lucide-react";
import { useTheme } from "../../contexts/useTheme";
import { languages } from "../../lib/languages";
import { useTranslation } from "../../hooks/useTranslation";

const BUTTON_CLASS =
  "flex w-full items-center justify-center rounded-lg p-2.5 pointer-coarse:min-h-11 text-content-tertiary transition-colors duration-150 motion-reduce:transition-none hover:bg-surface-alt hover:text-content-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]";

/** Icon-only theme and language buttons for the collapsed (68 px) desktop sidebar. */
export const SidebarCompactControls = () => {
  const { theme, toggleTheme } = useTheme();
  const { t, changeLanguage, currentLanguage } = useTranslation();

  const currentIndex = languages.findIndex((lang) => lang.code === currentLanguage);
  const current = languages[Math.max(currentIndex, 0)];
  const next = languages[(Math.max(currentIndex, 0) + 1) % languages.length];
  // The tooltip names the current value; activating the button switches to the next one.
  const languageLabel = `${t("common.language")}: ${current.name}`;

  return (
    <div className="mb-3 space-y-1">
      <button
        type="button"
        onClick={toggleTheme}
        className={BUTTON_CLASS}
        title={t("common.toggleTheme")}
        aria-label={t("common.toggleTheme")}
        aria-pressed={theme === "dark"}
      >
        {theme === "dark" ? (
          <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
        ) : (
          <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        onClick={() => changeLanguage(next.code)}
        className={BUTTON_CLASS}
        title={languageLabel}
        aria-label={languageLabel}
        data-testid="sidebar-language-cycle"
      >
        <Languages className="h-[18px] w-[18px]" aria-hidden="true" />
        <span className="sr-only">{current.shortName}</span>
      </button>
    </div>
  );
};
