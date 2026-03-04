import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Paintbrush, Check, Loader2 } from "lucide-react";
import { settingsApi } from "../../lib/api";
import { useTranslation } from "../../hooks/useTranslation";
import {
  useReceiptDesignSettings,
  RECEIPT_DESIGN_QUERY_KEY,
} from "../../hooks/useReceiptDesignSettings";

const PRESET_COLORS = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
];

export const PrimaryColorPicker = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [color, setColor] = useState("#3B82F6");

  const { data, isLoading } = useReceiptDesignSettings();

  useEffect(() => {
    if (data?.primaryColor) {
      setColor(data.primaryColor);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (newColor: string) => settingsApi.updatePrimaryColor(newColor),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...RECEIPT_DESIGN_QUERY_KEY],
      });
    },
  });

  const isValidHex = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const debouncedMutate = useCallback(
    (newColor: string) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        mutation.mutate(newColor);
      }, 300);
    },
    [mutation],
  );

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    if (isValidHex(newColor)) {
      mutation.mutate(newColor);
    }
  };

  const handleColorSliderChange = (newColor: string) => {
    setColor(newColor);
    if (isValidHex(newColor)) {
      debouncedMutate(newColor);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-content-tertiary" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-elevated p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/20">
          <Paintbrush className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-content">
            {t("settings.primaryColor", "Brand Color")}
          </h3>
          <p className="text-xs text-content-tertiary">
            {t(
              "settings.primaryColorDescription",
              "Used in the Branded template for accent elements",
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex gap-2 flex-wrap">
          {PRESET_COLORS.map((preset) => (
            <button
              key={preset}
              onClick={() => handleColorChange(preset)}
              className="relative h-8 w-8 rounded-full border-2 transition-all"
              style={{
                backgroundColor: preset,
                borderColor:
                  color === preset ? "var(--color-text)" : "transparent",
              }}
            >
              {color === preset && (
                <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => handleColorSliderChange(e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border-0 p-0"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => {
              const val = e.target.value;
              setColor(val);
              if (isValidHex(val)) {
                mutation.mutate(val);
              }
            }}
            placeholder="#3B82F6"
            maxLength={7}
            className="w-24 rounded-lg border border-[var(--color-border)] bg-elevated px-2.5 py-1.5 text-sm text-content font-mono"
          />
        </div>

        {mutation.isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-content-tertiary" />
        )}
      </div>
    </div>
  );
};
