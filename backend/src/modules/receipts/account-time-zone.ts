import { EntityManager } from "typeorm";
import { DEFAULT_DOCUMENT_TIME_ZONE } from "../settings/document-config";

function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone the account's documents are dated in (`document_config.formatting.timeZone`),
 * `Europe/Kyiv` for an account that never saved a configuration. A stored value that is not
 * a known zone falls back to the default rather than failing the request.
 */
export async function accountTimeZone(
  manager: EntityManager,
  userId: string,
): Promise<string> {
  const [row]: Array<{ zone: string | null }> = await manager.query(
    `SELECT "document_config" -> 'formatting' ->> 'timeZone' AS zone
     FROM "user_settings" WHERE "userId" = $1`,
    [userId],
  );
  return row?.zone && isValidZone(row.zone)
    ? row.zone
    : DEFAULT_DOCUMENT_TIME_ZONE;
}
