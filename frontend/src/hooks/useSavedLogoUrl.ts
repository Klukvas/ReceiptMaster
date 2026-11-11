import { useEffect, useState } from "react";
import { settingsApi } from "../lib/api";

/**
 * An object URL of the account's saved logo, for a thumbnail; empty while loading, when there
 * is none or when it cannot be read. GET /settings/logo needs the bearer token, which an
 * `<img src>` cannot send, so the image is fetched through the API client as a blob.
 * `assetId` is the saved logo's id: a new id fetches the new image.
 */
export function useSavedLogoUrl(assetId: string | null | undefined): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl("");
    if (!assetId) return;
    let isCurrent = true;
    let created = "";
    settingsApi
      .getLogo()
      .then((response) => {
        if (!isCurrent) return;
        created = URL.createObjectURL(response.data as Blob);
        setUrl(created);
      })
      .catch((error: unknown) => {
        // The thumbnail is a convenience; the status line still says a logo is set.
        if (isCurrent) console.warn("Saved logo thumbnail could not be loaded", error);
      });
    return () => {
      isCurrent = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [assetId]);
  return url;
}
