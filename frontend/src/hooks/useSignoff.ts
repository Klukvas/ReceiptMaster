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

type LoadedPreview = { assetId: string; url: string };

/**
 * The stored image as an object URL for an <img>. The endpoint needs the bearer token, so a plain
 * src cannot reach it. The URL is revoked when the image changes or the component unmounts.
 */
export function useSignoffPreviewUrl(kind: SignoffKind, image: SignoffImage | null) {
  // assetId changes on every upload, so it identifies the bytes to show.
  const assetId = image?.assetId ?? null;
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null);
  const [failedAssetId, setFailedAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) return;
    let isCurrent = true;
    let objectUrl: string | null = null;
    settingsApi
      .getSignoffImage(kind)
      .then((response) => {
        if (!isCurrent) return;
        objectUrl = URL.createObjectURL(response.data);
        setLoaded({ assetId, url: objectUrl });
      })
      .catch(() => {
        if (isCurrent) setFailedAssetId(assetId);
      });
    return () => {
      isCurrent = false;
      if (!objectUrl) return;
      URL.revokeObjectURL(objectUrl);
      // Going back to an earlier asset must not briefly render its revoked URL.
      const revoked = objectUrl;
      setLoaded((previous) => (previous?.url === revoked ? null : previous));
    };
  }, [kind, assetId]);

  // A URL revoked by the cleanup above must never be rendered, so it is matched to the current
  // asset instead of being cleared in the effect: the replaced file shows the loading state, not a broken image.
  return {
    url: assetId && loaded?.assetId === assetId ? loaded.url : null,
    hasFailed: assetId !== null && failedAssetId === assetId,
  };
}
