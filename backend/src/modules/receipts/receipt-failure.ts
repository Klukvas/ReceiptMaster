import { Logger } from "@nestjs/common";
import { DataSource, FindOptionsWhere } from "typeorm";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "./entities/receipt.entity";
import {
  frozenReturnLines,
  releaseReturnQuantities,
} from "./return-note-ledger";

/**
 * The one way a receipt is moved to a new state by a failure. A return note that leaves
 * PROCESSING for FAILED gives its reserved quantities back in the same transaction, and
 * only when this very UPDATE moved the row, so the release happens exactly once. Any
 * other change (a failed replacement of an issued document, any other type) is a plain
 * conditional update.
 */
export async function updateReceiptOnFailure(
  db: DataSource,
  logger: Logger,
  receipt: Pick<Receipt, "id" | "order_id" | "document_type">,
  where: FindOptionsWhere<Receipt> & { user_id: string },
  change: QueryDeepPartialEntity<Receipt>,
): Promise<boolean> {
  const releasesQuantities =
    receipt.document_type === DocumentType.RETURN_NOTE &&
    change.status === ReceiptStatus.FAILED &&
    where.status === ReceiptStatus.PROCESSING;
  if (!releasesQuantities) {
    const result = await db.manager.update(Receipt, where, change);
    return Boolean(result.affected);
  }
  return db.transaction(async (manager) => {
    const result = await manager.update(Receipt, where, change);
    if (!result.affected) return false;
    // Read after the update, from whichever snapshot is still there: the failure keeps both.
    const row = await manager
      .getRepository(Receipt)
      .createQueryBuilder("r")
      .addSelect(["r.active_snapshot", "r.pending_snapshot"])
      .where("r.id = :id AND r.user_id = :userId", {
        id: receipt.id,
        userId: where.user_id,
      })
      .getOne();
    const lines = row ? frozenReturnLines(row) : [];
    if (lines.length === 0) {
      logger.warn(
        `Return note ${receipt.id} (order ${receipt.order_id}) failed with no readable lines; its quantities were not released`,
      );
      return true;
    }
    const unreleased = await releaseReturnQuantities(
      manager,
      where.user_id,
      receipt.order_id,
      lines,
    );
    if (unreleased.length > 0)
      logger.warn(
        `Return note ${receipt.id} (order ${receipt.order_id}): ${unreleased.length} line(s) had nothing left to release`,
      );
    return true;
  });
}
