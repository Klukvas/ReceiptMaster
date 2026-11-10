import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { ApiErrors } from "../../common/errors/ApiError";
import {
  RESET_NEEDS_YEAR_MESSAGE,
  UpdateNumberingDto,
} from "./dto/update-numbering.dto";
import { DocumentType } from "./entities/receipt.entity";
import { accountTimeZone } from "./account-time-zone";
import {
  DEFAULT_NUMBER_FORMAT,
  NumberFormat,
  documentYear,
  formatDocumentNumber,
  highestIssuedInYear,
} from "./receipt-number";

export interface NumberingSetting extends NumberFormat {
  documentType: DocumentType;
  /** The counter restarts every calendar year; the values below then describe the current year. */
  resetEveryYear: boolean;
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
  reset_every_year: boolean;
  start_number: number;
}

const ALL_TYPES = Object.values(DocumentType);

function toSetting(
  documentType: DocumentType,
  format: NumberFormat,
  lastValue: number,
  year: number,
  resetEveryYear: boolean,
): NumberingSetting {
  const nextValue = lastValue + 1;
  return {
    documentType,
    ...format,
    resetEveryYear,
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
      `SELECT "document_type", "value", "prefix", "padding", "include_year",
              "reset_every_year", "start_number"
       FROM "document_counters" WHERE "user_id" = $1`,
      [userId],
    );
    const legacy = await this.legacyCounter(manager, userId, false);
    const year = documentYear(
      new Date(),
      await accountTimeZone(manager, userId),
    );
    const yearRows: Array<{ document_type: DocumentType; value: number }> =
      await manager.query(
        `SELECT "document_type", "value" FROM "document_year_counters"
         WHERE "user_id" = $1 AND "year" = $2`,
        [userId, year],
      );
    const types: NumberingSetting[] = [];
    for (const type of ALL_TYPES) {
      const row = rows.find((candidate) => candidate.document_type === type);
      const resetEveryYear = row?.reset_every_year === true;
      const last = resetEveryYear
        ? await this.lastOfYear(
            manager,
            userId,
            type,
            year,
            row,
            yearRows.find((candidate) => candidate.document_type === type),
          )
        : Math.max(
            Number(row?.value ?? 0),
            type === DocumentType.WAYBILL ? legacy : 0,
          );
      types.push(toSetting(type, formatOf(row), last, year, resetEveryYear));
    }
    return { types };
  }

  /** Where the current year's counter stands, or would start from if no number was drawn yet. */
  private async lastOfYear(
    manager: EntityManager,
    userId: string,
    type: DocumentType,
    year: number,
    counter: Pick<CounterRow, "start_number"> | undefined,
    yearRow: { value: number } | undefined,
  ): Promise<number> {
    if (yearRow) return Number(yearRow.value);
    const issued = await highestIssuedInYear(manager, userId, type, year);
    return Math.max(Number(counter?.start_number ?? 1) - 1, issued);
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
      const [counter]: Array<CounterRow> = await manager.query(
        `SELECT "value", "reset_every_year", "start_number" FROM "document_counters"
         WHERE "user_id" = $1 AND "document_type" = $2 FOR UPDATE`,
        [userId, type],
      );
      const resetEveryYear = dto.resetEveryYear ?? counter.reset_every_year;
      if (resetEveryYear && !dto.includeYear)
        throw ApiErrors.VALIDATION_ERROR(
          "resetEveryYear",
          RESET_NEEDS_YEAR_MESSAGE,
        );
      const year = documentYear(
        new Date(),
        await accountTimeZone(manager, userId),
      );
      const yearRow = await this.lockedYearRow(manager, userId, type, year);
      const legacy =
        type === DocumentType.WAYBILL && !resetEveryYear
          ? await this.legacyCounter(manager, userId, true)
          : 0;
      // The counter the new start number is judged against: this year's while the
      // reset is on; the flat one otherwise, which (just turned off) also covers
      // the numbers this year's counter already issued.
      const effective = resetEveryYear
        ? await this.lastOfYear(manager, userId, type, year, counter, yearRow)
        : Math.max(Number(counter.value), legacy, Number(yearRow?.value ?? 0));

      const raisedTo =
        dto.startNumber === undefined ? undefined : dto.startNumber - 1;
      if (raisedTo !== undefined && raisedTo < effective)
        throw ApiErrors.NUMBERING_START_TOO_LOW(effective + 1);

      const newValue = Math.max(effective, raisedTo ?? 0);
      await manager.query(
        `UPDATE "document_counters"
         SET "prefix" = $3, "padding" = $4, "include_year" = $5,
             "reset_every_year" = $6, "start_number" = $7,
             "value" = GREATEST("value", $8)
         WHERE "user_id" = $1 AND "document_type" = $2`,
        [
          userId,
          type,
          dto.prefix,
          dto.padding,
          dto.includeYear,
          resetEveryYear,
          dto.startNumber ?? counter.start_number,
          resetEveryYear ? Number(counter.value) : newValue,
        ],
      );
      if (resetEveryYear && (yearRow || raisedTo !== undefined))
        await manager.query(
          `INSERT INTO "document_year_counters" ("user_id", "document_type", "year", "value")
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ("user_id", "document_type", "year")
           DO UPDATE SET "value" = GREATEST("document_year_counters"."value", EXCLUDED."value")`,
          [userId, type, year, newValue],
        );
      if (
        type === DocumentType.WAYBILL &&
        !resetEveryYear &&
        raisedTo !== undefined
      )
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
        year,
        resetEveryYear,
      );
    });
  }

  /** The current year's counter, locked (draws take the flat row first, then this one). */
  private async lockedYearRow(
    manager: EntityManager,
    userId: string,
    type: DocumentType,
    year: number,
  ): Promise<{ value: number } | undefined> {
    const [row]: Array<{ value: number }> = await manager.query(
      `SELECT "value" FROM "document_year_counters"
       WHERE "user_id" = $1 AND "document_type" = $2 AND "year" = $3 FOR UPDATE`,
      [userId, type, year],
    );
    return row;
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
