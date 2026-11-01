import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";

/** What a user sees instead of a blank page; the error itself stays in the console. */
export const ErrorFallback = () => {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 h-screen px-6 text-center bg-surface"
    >
      <h1 className="text-lg font-semibold text-content">
        {t("appError.title")}
      </h1>
      <p className="max-w-md text-sm text-content-secondary">
        {t("appError.description")}
      </p>
      <Button onClick={() => window.location.reload()}>
        {t("appError.reload")}
      </Button>
    </div>
  );
};
