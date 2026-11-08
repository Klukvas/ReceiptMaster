import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { ImageUp, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { ErrorCode, parseApiError } from "../../lib/api-errors";
import type { SignoffImage, SignoffKind } from "../../lib/api";
import {
  SIGNOFF_ACCEPTED_TYPES,
  SIGNOFF_MAX_BYTES,
  signoffFileProblem,
} from "../../lib/signoff-file";
import {
  useDeleteSignoff,
  useSignoffPreviewUrl,
  useUploadSignoff,
} from "../../hooks/useSignoff";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";
import { ConfirmModal } from "../ui/ConfirmModal";
import { FieldError } from "../ui/FieldError";

const HTTP_TOO_LARGE = 413;
const HTTP_RATE_LIMITED = 429;
const HTTP_SERVER_ERROR = 500;

const PROBLEM_MESSAGE_KEY = {
  empty: "signoff.errors.empty",
  type: "signoff.errors.type",
  size: "signoff.errors.tooLarge",
} as const;

// A transparent PNG needs a visible backdrop to be judged; a checkerboard shows both the gaps and the ink.
const CHECKERBOARD_STYLE = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "conic-gradient(#e5e7eb 25%, transparent 0 50%, #e5e7eb 0 75%, transparent 0)",
  backgroundSize: "16px 16px",
} as const;

type SignoffUploaderProps = {
  kind: SignoffKind;
  image: SignoffImage | null;
};

const kilobytes = (bytes: number): number => Math.max(1, Math.round(bytes / 1024));

/** Upload, preview and removal of one image (signature or stamp). */
export function SignoffUploader({ kind, image }: SignoffUploaderProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const upload = useUploadSignoff(kind);
  const remove = useDeleteSignoff(kind);
  const preview = useSignoffPreviewUrl(kind, image);
  const label = t(`signoff.${kind}`);
  const inputId = `signoff-${kind}-file`;
  const errorId = `signoff-${kind}-error`;

  const uploadErrorMessage = (cause: unknown): string => {
    const status = isAxiosError(cause) ? cause.response?.status : undefined;
    if (status === HTTP_TOO_LARGE) return t("signoff.errors.tooLarge");
    if (status === HTTP_RATE_LIMITED) {
      // The server's wait time, when it sent one, rather than a guess.
      const parsed = parseApiError(cause);
      return parsed.code === ErrorCode.RATE_LIMITED ? parsed.message : t("errors.rateLimited");
    }
    // A 5xx body is the server's English text; the user can only try again.
    if (status !== undefined && status >= HTTP_SERVER_ERROR) return t("signoff.errors.server");
    return parseApiError(cause).message;
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const problem = signoffFileProblem(file);
    if (problem) {
      setError(t(PROBLEM_MESSAGE_KEY[problem]));
      return;
    }
    setError(null);
    upload.mutate(file, {
      onSuccess: () => toast.success(t("signoff.uploaded", { kind: label })),
      onError: (cause) => setError(uploadErrorMessage(cause)),
    });
  };

  const confirmDelete = () => {
    remove.mutate(undefined, {
      onSuccess: () => {
        setIsConfirmingDelete(false);
        setError(null);
        toast.success(t("signoff.deleted", { kind: label }));
        // The Delete button is gone now, so the dialog cannot hand focus back to it.
        setTimeout(() => pickerButtonRef.current?.focus(), 0);
      },
      onError: (cause) => {
        setIsConfirmingDelete(false);
        setError(uploadErrorMessage(cause));
      },
    });
  };

  return (
    <div
      className="rounded-lg border border-[var(--color-border)] p-4"
      data-testid={`signoff-${kind}`}
    >
      <h4 className="text-sm font-semibold text-content">{label}</h4>
      <p className="mt-1 text-xs text-content-tertiary">{t(`signoff.${kind}Hint`)}</p>

      <div
        className="mt-3 flex min-h-32 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] p-3"
        style={CHECKERBOARD_STYLE}
      >
        {preview.url ? (
          <img
            src={preview.url}
            alt={t("signoff.previewAlt", { kind: label })}
            className="max-h-32 max-w-full object-contain"
          />
        ) : (
          <p className="rounded bg-white/90 px-2 py-1 text-center text-xs text-neutral-600">
            {image
              ? preview.hasFailed
                ? t("signoff.previewFailed")
                : t("common.loading")
              : t("signoff.none")}
          </p>
        )}
      </div>
      {image && (
        <p className="mt-2 text-xs text-content-tertiary">
          {t("signoff.meta", {
            width: image.width,
            height: image.height,
            size: kilobytes(image.bytes),
          })}
        </p>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        hidden
        accept={SIGNOFF_ACCEPTED_TYPES.join(",")}
        aria-label={t("signoff.chooseFile", { kind: label })}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          ref={pickerButtonRef}
          type="button"
          size="sm"
          variant="outline"
          loading={upload.isPending}
          softDisabled
          aria-describedby={error ? errorId : undefined}
          onClick={() => inputRef.current?.click()}
        >
          <ImageUp className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {image ? t("signoff.replace") : t("signoff.upload")}
        </Button>
        {image && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={upload.isPending}
            onClick={() => setIsConfirmingDelete(true)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t("common.delete")}
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-content-tertiary">
        {t("signoff.limits", { max: SIGNOFF_MAX_BYTES / (1024 * 1024) })}
      </p>
      <FieldError id={errorId} message={error ?? undefined} />

      <ConfirmModal
        isOpen={isConfirmingDelete}
        onClose={() => setIsConfirmingDelete(false)}
        onConfirm={confirmDelete}
        isLoading={remove.isPending}
        title={t("signoff.deleteTitle", { kind: label })}
        message={t("signoff.deleteMessage")}
        confirmLabel={t("common.delete")}
      />
    </div>
  );
}
