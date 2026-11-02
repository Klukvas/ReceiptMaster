import { useAfterDelay } from "../../hooks/useAfterDelay";
import { useTranslation } from "../../hooks/useTranslation";
import { cn } from "../ui/primitives/cn";

const SPINNER_DELAY_MS = 200;

const Spinner = ({ className }: { className: string }) => {
  const { t } = useTranslation();
  // The space is held from the first frame; the spinner only paints if loading drags on.
  const isVisible = useAfterDelay(SPINNER_DELAY_MS);

  return (
    <div
      role="status"
      className={cn("flex items-center justify-center", className)}
    >
      {isVisible && (
        <div className="h-8 w-8 animate-spin motion-reduce:animate-none rounded-full border-b-2 border-accent-base" />
      )}
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
};

/** Full-page loading state: a route chunk on its way, or a reload in progress. */
export const PageSpinner = () => <Spinner className="h-screen" />;

/** Loading state for the content area of the app shell (sidebar stays visible). */
export const ContentSpinner = () => <Spinner className="min-h-[50vh]" />;
