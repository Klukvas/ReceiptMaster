import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  settingsApi,
  type SignoffImage,
  type SignoffKind,
  type SignoffState,
} from "../lib/api";

export const SIGNOFF_QUERY_KEY = ["settings", "signoff"] as const;

export const useSignoff = () =>
  useQuery({
    queryKey: SIGNOFF_QUERY_KEY,
    queryFn: async () => (await settingsApi.getSignoff()).data,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: false,
  });

const withKind = (
  state: SignoffState | undefined,
  kind: SignoffKind,
  image: SignoffImage | null,
): SignoffState => ({
  signature: state?.signature ?? null,
  stamp: state?.stamp ?? null,
  [kind]: image,
});

export const useUploadSignoff = (kind: SignoffKind) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => (await settingsApi.uploadSignoff(kind, file)).data,
    onSuccess: (image) => {
      queryClient.setQueryData<SignoffState>(SIGNOFF_QUERY_KEY, (previous) =>
        withKind(previous, kind, image),
      );
    },
  });
};

export const useDeleteSignoff = (kind: SignoffKind) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await settingsApi.deleteSignoff(kind);
    },
    onSuccess: () => {
      queryClient.setQueryData<SignoffState>(SIGNOFF_QUERY_KEY, (previous) =>
        withKind(previous, kind, null),
      );
    },
  });
};

/**
 * The stored image as an object URL for an <img>. The endpoint needs the bearer token, so a plain
 * src cannot reach it. The URL is revoked when the image changes or the component unmounts.
 */
export function useSignoffPreviewUrl(kind: SignoffKind, image: SignoffImage | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  // assetId changes on every upload, so it identifies the bytes to show.
  const assetId = image?.assetId ?? null;

  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      setHasFailed(false);
      return;
    }
    let isCurrent = true;
    let objectUrl: string | null = null;
    setHasFailed(false);
    settingsApi
      .getSignoffImage(kind)
      .then((response) => {
        if (!isCurrent) return;
        objectUrl = URL.createObjectURL(response.data);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (isCurrent) setHasFailed(true);
      });
    return () => {
      isCurrent = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [kind, assetId]);

  return { url: assetId ? url : null, hasFailed };
}
