import { EntityManager } from "typeorm";
import {
  DEFAULT_DOCUMENT_TIME_ZONE,
  isIanaTimeZone,
} from "../settings/document-config";

/**
 * The zone the account's documents are dated in (`document_config.formatting.timeZone`),
 * `Europe/Kyiv` for an account that never saved a configuration. A stored value that is not
 * an IANA zone name (including a fixed offset such as "+05:00") falls back to the default rather than failing the request.
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
  return row?.zone && isIanaTimeZone(row.zone)
    ? row.zone
    : DEFAULT_DOCUMENT_TIME_ZONE;
}
