import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { ApiErrors } from "../../common/errors/ApiError";
import { UpdateNumberingDto } from "./dto/update-numbering.dto";
import { DocumentType } from "./entities/receipt.entity";
import { accountTimeZone } from "./account-time-zone";
import {
  DEFAULT_NUMBER_FORMAT,
  NumberFormat,
  documentYear,
  formatDocumentNumber,
} from "./receipt-number";

export interface NumberingSetting extends NumberFormat {
  documentType: DocumentType;
  /** The counter value the next document will get. */
  nextValue: number;
  /** The lowest start number that can still be requested (equals `nextValue`). */
  minStart: number;
  /** Preview of the next number in the saved format. */
  nextNumber: string;
}

interface CounterRow {
  document_type: DocumentType;
  value: number;
  prefix: string;
  padding: number;
  include_year: boolean;
}

const ALL_TYPES = Object.values(DocumentType);

function toSetting(
  documentType: DocumentType,
  format: NumberFormat,
  lastValue: number,
  year: number,
): NumberingSetting {
  const nextValue = lastValue + 1;
  return {
    documentType,
    ...format,
    nextValue,
    minStart: nextValue,
    nextNumber: formatDocumentNumber(format, nextValue, year),
  };
}

function formatOf(row: CounterRow | undefined): NumberFormat {
  return row
    ? {
        prefix: row.prefix,
        padding: Number(row.padding),
        includeYear: row.include_year,
      }
    : DEFAULT_NUMBER_FORMAT;
}

/** Per-type number format and start value, on top of `document_counters`. */
@Injectable()
export class DocumentNumberingService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(userId: string): Promise<{ types: NumberingSetting[] }> {
    const manager = this.dataSource.manager;
    const rows: CounterRow[] = await manager.query(
      `SELECT "document_type", "value", "prefix", "padding", "include_year"
       FROM "document_counters" WHERE "user_id" = $1`,
      [userId],
    );
    const legacy = await this.legacyCounter(manager, userId, false);
    const year = documentYear(
      new Date(),
      await accountTimeZone(manager, userId),
    );
    return {
      types: ALL_TYPES.map((type) => {
        const row = rows.find((candidate) => candidate.document_type === type);
        const last = Math.max(
          Number(row?.value ?? 0),
          type === DocumentType.WAYBILL ? legacy : 0,
        );
        return toSetting(type, formatOf(row), last, year);
      }),
    };
  }

  /**
   * Saves the format and, when asked, raises the counter. One transaction that takes the
   * counter row before the user row, the order `BUMP_WAYBILL_COUNTER` takes them in, so a
   * concurrent draw can neither deadlock with it nor slip a lower number past the check.
   */
  async update(
    userId: string,
    type: DocumentType,
    dto: UpdateNumberingDto,
  ): Promise<NumberingSetting> {
    return this.dataSource.transaction(async (manager) => {
      // Materializes the row so the FOR UPDATE below has something to lock.
      await manager.query(
        `INSERT INTO "document_counters" ("user_id", "document_type")
         VALUES ($1, $2) ON CONFLICT ("user_id", "document_type") DO NOTHING`,
        [userId, type],
      );
      const [counter]: Array<{ value: number }> = await manager.query(
        `SELECT "value" FROM "document_counters"
         WHERE "user_id" = $1 AND "document_type" = $2 FOR UPDATE`,
        [userId, type],
      );
      const legacy =
        type === DocumentType.WAYBILL
          ? await this.legacyCounter(manager, userId, true)
          : 0;
      const effective = Math.max(Number(counter?.value ?? 0), legacy);

      const raisedTo =
        dto.startNumber === undefined ? undefined : dto.startNumber - 1;
      if (raisedTo !== undefined && raisedTo < effective)
        throw ApiErrors.NUMBERING_START_TOO_LOW(effective + 1);

      const newValue = Math.max(effective, raisedTo ?? 0);
      await manager.query(
        `UPDATE "document_counters"
         SET "prefix" = $3, "padding" = $4, "include_year" = $5,
             "value" = GREATEST("value", $6)
         WHERE "user_id" = $1 AND "document_type" = $2`,
        [userId, type, dto.prefix, dto.padding, dto.includeYear, newValue],
      );
      if (type === DocumentType.WAYBILL && raisedTo !== undefined)
        await manager.query(
          `UPDATE "users" SET "receipt_counter" = GREATEST("receipt_counter", $2)
           WHERE "id" = $1`,
          [userId, raisedTo],
        );
      return toSetting(
        type,
        {
          prefix: dto.prefix,
          padding: dto.padding,
          includeYear: dto.includeYear,
        },
        newValue,
        documentYear(new Date(), await accountTimeZone(manager, userId)),
      );
    });
  }

  private async legacyCounter(
    manager: EntityManager,
    userId: string,
    lock: boolean,
  ): Promise<number> {
    const [user]: Array<{ receipt_counter: number }> = await manager.query(
      `SELECT "receipt_counter" FROM "users" WHERE "id" = $1${lock ? " FOR UPDATE" : ""}`,
      [userId],
    );
    return Number(user?.receipt_counter ?? 0);
  }
}
