import { QueryFailedError } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";
import { getDataSourceToken, getRepositoryToken } from "@nestjs/typeorm";
import { Order, OrderStatus } from "../orders/entities/order.entity";
import { PdfStorageService } from "../../common/services/pdf-storage.service";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { legacyConfig } from "../settings/document-config";
import { DocumentConfigService } from "../settings/services/document-config.service";
import type { User } from "../users/entities/user.entity";
import { DOCUMENTS_RETAINED_PER_TYPE } from "./document-retention";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "./entities/receipt.entity";
import { RECEIPT_GENERATION_QUEUE } from "./receipt-generation.processor";
import { ReceiptOutboxService } from "./receipt-outbox.service";
import { ReceiptsService } from "./receipts.service";
import { DocumentRenderService } from "./services/document-render.service";
import { ReceiptArtifactService } from "./services/receipt-artifact.service";
import { ReceiptSnapshotService } from "./services/receipt-snapshot.service";

const user = { id: "user-1" } as User;
const RESERVE = /SET "returned_qty" = "returned_qty" \+ \$4/;
const RELEASE = /SET "returned_qty" = "returned_qty" - \$4/;
const REMAINING = /"qty" - "returned_qty" AS remaining/;

/** In-memory stand-in for the order_items ledger; UPDATEs answer in the driver's `[rows, count]` shape. */
class FakeLedger {
  constructor(readonly lines: Map<string, { qty: number; returned: number }>) {}
  readonly statements: string[] = [];

  query = jest.fn(async (sql: string, params: unknown[]) => {
    this.statements.push(sql);
    if (RESERVE.test(sql)) {
      const [id, , , qty] = params as [string, string, string, number];
      const line = this.lines.get(id);
      if (!line || line.returned + qty > line.qty) return [[], 0];
      line.returned += qty;
      return [[{ id }], 1];
    }
    if (RELEASE.test(sql)) {
      const [id, , , qty] = params as [string, string, string, number];
      const line = this.lines.get(id);
      if (!line || line.returned < qty) return [[], 0];
      line.returned -= qty;
      return [[{ id }], 1];
    }
    if (REMAINING.test(sql)) {
      const ids = (params as [string, string, string[]])[2];
      return ids
        .filter((id) => this.lines.has(id))
        .map((id) => ({
          id,
          remaining: this.lines.get(id).qty - this.lines.get(id).returned,
        }));
    }
    return [{ value: 1, prefix: "", padding: 6, include_year: true }];
  });

  returned = (id: string) => this.lines.get(id).returned;
}

describe("ReceiptsService goods return notes", () => {
  let service: ReceiptsService;
  let receiptsRepo: { findOne: jest.Mock; count: jest.Mock };
  let dataSource: {
    manager: {
      query: jest.Mock;
      createQueryBuilder: jest.Mock;
      findOneOrFail: jest.Mock;
    };
    transaction: jest.Mock;
  };
  let snapshots: Record<string, jest.Mock>;
  let artifacts: { lockRetirements: jest.Mock; retire: jest.Mock };
  let outbox: { dispatch: jest.Mock };
  let ledger: FakeLedger;
  let saved: Array<Record<string, unknown>>;
  let nextNumber: number;
  /** What the duplicate lookup finds: notes created moments ago for this order. */
  let recentNotes: Array<Record<string, unknown>>;

  const recentNotesQuery = () => {
    const query: Record<string, jest.Mock> = {};
    for (const name of ["addSelect", "where", "andWhere"])
      query[name] = jest.fn(() => query);
    query.getMany = jest.fn(async () => recentNotes);
    return query;
  };

  const order = {
    id: "order-1",
    status: OrderStatus.CONFIRMED,
    user_id: user.id,
  } as Order;

  const snapshotWith = (
    lines: Array<{ orderItemId: string; qty: number }>,
  ) => ({
    config: legacyConfig(null),
    document: { details: { returnLines: lines } },
  });

  /** The generation transaction, running against the fake ledger. */
  const wireTransaction = (extra: Record<string, jest.Mock> = {}) => {
    const manager = {
      findOne: jest.fn(async (entity) => (entity === Order ? order : null)),
      findOneOrFail: jest.fn(async () => ({ id: "row", status: "processing" })),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (entity, value) => {
        if (entity === Receipt) saved.push(value);
        return { id: `row-${saved.length}`, ...value };
      }),
      query: ledger.query,
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(recentNotesQuery),
      ...extra,
    };
    dataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );
    return manager;
  };

  const prepareReturning = (
    lines: Array<{ orderItemId: string; qty: number }>,
  ) =>
    snapshots.prepare.mockImplementation(
      async (_u: string, _o: string, number: () => Promise<string>) => ({
        html: "frozen",
        number: await number(),
        snapshot: snapshotWith(lines),
      }),
    );

  const issue = (lines: Array<{ orderItemId: string; qty: number }>) => {
    prepareReturning(lines);
    return service.generateDocument(
      "order-1",
      user,
      DocumentType.RETURN_NOTE,
      { logoAction: "keep" },
      { lines },
    );
  };

  beforeEach(async () => {
    ledger = new FakeLedger(
      new Map([
        ["item-a", { qty: 3, returned: 0 }],
        ["item-b", { qty: 1, returned: 0 }],
      ]),
    );
    saved = [];
    recentNotes = [];
    nextNumber = 0;
    receiptsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    };
    dataSource = {
      manager: {
        createQueryBuilder: jest.fn(recentNotesQuery),
        findOneOrFail: jest.fn(async () => ({ id: "first-note" })),
        query: jest.fn(async (sql: string) => {
          // Number counter: bump on draw, give back on release.
          if (/\+ 1/.test(sql))
            return [
              {
                value: ++nextNumber,
                prefix: "",
                padding: 6,
                include_year: true,
              },
            ];
          if (/- 1/.test(sql)) {
            nextNumber -= 1;
            return [{ value: nextNumber }];
          }
          return [];
        }),
      },
      transaction: jest.fn(),
    };
    snapshots = {
      internal: jest.fn(),
      preflight: jest.fn().mockResolvedValue(undefined),
      prepare: jest.fn(),
      validatePrepared: jest.fn().mockResolvedValue(order),
      candidate: jest.fn().mockReturnValue({ pending_id: "candidate" }),
      releaseLogo: jest.fn(),
    };
    artifacts = {
      lockRetirements: jest.fn(async (rows) => rows),
      retire: jest.fn().mockResolvedValue(undefined),
    };
    outbox = { dispatch: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        { provide: ReceiptArtifactService, useValue: artifacts },
        { provide: ReceiptSnapshotService, useValue: snapshots },
        { provide: DocumentConfigService, useValue: {} },
        { provide: DocumentRenderService, useValue: {} },
        { provide: ReceiptOutboxService, useValue: outbox },
        { provide: getRepositoryToken(Receipt), useValue: receiptsRepo },
        { provide: PdfStorageService, useValue: {} },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: getQueueToken(RECEIPT_GENERATION_QUEUE), useValue: outbox },
      ],
    }).compile();
    service = module.get(ReceiptsService);
  });

  describe("issuing", () => {
    it("inserts a new numbered row and counts the quantities, with no slot lookups", async () => {
      const manager = wireTransaction();
      await issue([{ orderItemId: "item-a", qty: 2 }]);

      expect(saved).toEqual([
        expect.objectContaining({
          document_type: DocumentType.RETURN_NOTE,
          status: ReceiptStatus.PROCESSING,
          number: expect.stringMatching(/-000001$/),
        }),
      ]);
      expect(ledger.returned("item-a")).toBe(2);
      // Neither the live-row lookup nor the voided-slot check applies to a type with no slot.
      expect(receiptsRepo.findOne).not.toHaveBeenCalled();
      expect(receiptsRepo.count).not.toHaveBeenCalled();
      expect(manager.findOne).not.toHaveBeenCalledWith(
        Receipt,
        expect.anything(),
      );
      // Creating the row neither counts nor evicts: retention runs at promotion.
      expect(manager.count).not.toHaveBeenCalled();
      expect(outbox.dispatch).toHaveBeenCalledTimes(1);
    });

    it("lets one order carry a second note for what is left", async () => {
      wireTransaction();
      await issue([{ orderItemId: "item-a", qty: 2 }]);
      await issue([{ orderItemId: "item-a", qty: 1 }]);
      expect(saved).toHaveLength(2);
      expect(ledger.returned("item-a")).toBe(3);
    });

    it("refuses the second note that would return more than was sold, and hands the number back", async () => {
      wireTransaction();
      await issue([{ orderItemId: "item-a", qty: 2 }]);
      expect(nextNumber).toBe(1);

      const refusal: ApiErrorResponse = await issue([
        { orderItemId: "item-b", qty: 1 },
        { orderItemId: "item-a", qty: 2 },
      ]).then(
        () => {
          throw new Error("expected a refusal");
        },
        (error: ApiErrorResponse) => error,
      );

      expect(refusal).toBeInstanceOf(ApiErrorResponse);
      expect(refusal.errorCode).toBe("RETURN_QUANTITY_EXCEEDED");
      expect(refusal.statusCode).toBe(422);
      expect(refusal.toJSON()).toMatchObject({
        items: [{ orderItemId: "item-a", requested: 2, remaining: 1 }],
      });
      expect(saved).toHaveLength(1);
      expect(nextNumber).toBe(1);
      expect(outbox.dispatch).toHaveBeenCalledTimes(1);
    });

    it("walks lines in id order so concurrent notes cannot deadlock", async () => {
      wireTransaction();
      await issue([
        { orderItemId: "item-b", qty: 1 },
        { orderItemId: "item-a", qty: 1 },
      ]);
      const reserved = ledger.query.mock.calls
        .filter(([sql]) => RESERVE.test(sql))
        .map(([, params]) => params[0]);
      expect(reserved).toEqual(["item-a", "item-b"]);
    });

    it("counts quantities only after the order is locked and validated", async () => {
      const sequence: string[] = [];
      snapshots.validatePrepared.mockImplementation(async () => {
        sequence.push("validate");
        return order;
      });
      wireTransaction();
      ledger.query.mockImplementation(async (sql: string) => {
        if (RESERVE.test(sql)) sequence.push("reserve");
        return [[{ id: "item-a" }], 1];
      });
      await issue([{ orderItemId: "item-a", qty: 1 }]);
      expect(sequence).toEqual(["validate", "reserve"]);
    });

    it("refuses a draft or cancelled order before any number or quantity is touched", async () => {
      wireTransaction();
      snapshots.preflight.mockRejectedValue(
        new ApiErrorResponse("no", "ORDER_CANNOT_BE_MODIFIED", 400),
      );
      await expect(
        issue([{ orderItemId: "item-a", qty: 1 }]),
      ).rejects.toMatchObject({ errorCode: "ORDER_CANNOT_BE_MODIFIED" });
      expect(snapshots.prepare).not.toHaveBeenCalled();
      expect(nextNumber).toBe(0);
      expect(ledger.returned("item-a")).toBe(0);
    });

    it("refuses an order that changed status inside the transaction", async () => {
      wireTransaction();
      snapshots.validatePrepared.mockResolvedValue({
        ...order,
        status: OrderStatus.CANCELLED,
      });
      await expect(
        issue([{ orderItemId: "item-a", qty: 1 }]),
      ).rejects.toMatchObject({ errorCode: "ORDER_CANNOT_BE_MODIFIED" });
      expect(ledger.returned("item-a")).toBe(0);
    });
  });

  describe("a double submit", () => {
    const lines = [{ orderItemId: "item-a", qty: 2 }];
    const firstNote = (reason?: string) => ({
      id: "first-note",
      document_type: DocumentType.RETURN_NOTE,
      active_snapshot: null,
      pending_snapshot: {
        document: {
          details: {
            returnLines: [...lines].reverse(),
            ...(reason ? { returnReason: reason } : {}),
          },
        },
      },
    });

    it("returns the first note without preflight, a number or the ledger", async () => {
      recentNotes = [firstNote("Брак")];
      const manager = wireTransaction();
      prepareReturning(lines);

      const result = await service.generateDocument(
        "order-1",
        user,
        DocumentType.RETURN_NOTE,
        { logoAction: "keep" },
        { lines, reason: "Брак" },
      );

      expect(result).toEqual({ id: "first-note" });
      expect(snapshots.preflight).not.toHaveBeenCalled();
      expect(snapshots.prepare).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(manager.query).not.toHaveBeenCalled();
      expect(ledger.returned("item-a")).toBe(0);
    });

    it.each([
      ["another reason", [firstNote("Брак")], lines, "Інше"],
      [
        "no reason where the first had one",
        [firstNote("Брак")],
        lines,
        undefined,
      ],
      [
        "another quantity",
        [firstNote()],
        [{ orderItemId: "item-a", qty: 1 }],
        undefined,
      ],
      ["no recent note", [], lines, undefined],
    ])("issues a new note for %s", async (_name, found, requested, reason) => {
      recentNotes = found;
      wireTransaction();

      prepareReturning(requested);
      await service.generateDocument(
        "order-1",
        user,
        DocumentType.RETURN_NOTE,
        { logoAction: "keep" },
        { lines: requested, ...(reason ? { reason } : {}) },
      );

      expect(snapshots.prepare).toHaveBeenCalled();
      expect(ledger.returned("item-a")).toBe(requested[0].qty);
    });

    it("also answers with the first note when it only shows up under the order lock", async () => {
      const manager = wireTransaction();
      manager.createQueryBuilder.mockImplementation(() => {
        const query = recentNotesQuery();
        query.getMany.mockResolvedValue([firstNote()]);
        return query;
      });
      manager.findOneOrFail.mockResolvedValue({
        id: "first-note",
        status: "processing",
      });

      const result = await issue(lines);

      expect(result).toMatchObject({ id: "first-note" });
      expect(ledger.returned("item-a")).toBe(0);
      expect(saved).toEqual([]);
      // The number drawn for the losing request is handed back.
      expect(nextNumber).toBe(0);
    });

    it("does not put this call's signature warning on the first note it returns", async () => {
      const manager = wireTransaction();
      manager.createQueryBuilder.mockImplementation(() => {
        const query = recentNotesQuery();
        query.getMany.mockResolvedValue([firstNote()]);
        return query;
      });
      manager.findOneOrFail.mockResolvedValue({
        id: "first-note",
        status: "processing",
      });
      snapshots.prepare.mockImplementation(
        async (_u: string, _o: string, number: () => Promise<string>) => ({
          html: "frozen",
          number: await number(),
          snapshot: snapshotWith(lines),
          signoffUnavailable: ["signature"],
        }),
      );

      const result = await service.generateDocument(
        "order-1",
        user,
        DocumentType.RETURN_NOTE,
        { logoAction: "keep" },
        { lines },
      );

      expect(result).toMatchObject({ id: "first-note" });
      expect(result).not.toHaveProperty("warnings");
    });
  });

  describe("giving a drawn number back", () => {
    const numberCollision = () =>
      new QueryFailedError("insert", [], {
        code: "23505",
        constraint: "IDX_receipts_user_type_number",
      } as never);

    it("does not give it back when COMMIT fails: it may have landed", async () => {
      const manager = wireTransaction();
      dataSource.transaction.mockImplementation(async (callback) => {
        await callback(manager);
        throw new Error("connection lost during COMMIT");
      });

      await expect(issue([{ orderItemId: "item-a", qty: 1 }])).rejects.toThrow(
        "COMMIT",
      );

      expect(nextNumber).toBe(1);
    });

    it("gives it back when the transaction body fails and rolls back", async () => {
      wireTransaction();
      snapshots.validatePrepared.mockRejectedValue(new Error("Order changed"));

      await expect(issue([{ orderItemId: "item-a", qty: 1 }])).rejects.toThrow(
        "Order changed",
      );

      expect(nextNumber).toBe(0);
    });

    it("gives it back when the failure comes before the transaction", async () => {
      wireTransaction();
      snapshots.prepare.mockImplementation(
        async (_u: string, _o: string, number: () => Promise<string>) => {
          await number();
          throw new Error("logo upload failed");
        },
      );

      await expect(
        service.generateDocument(
          "order-1",
          user,
          DocumentType.RETURN_NOTE,
          { logoAction: "keep" },
          { lines: [{ orderItemId: "item-a", qty: 1 }] },
        ),
      ).rejects.toThrow("logo upload failed");

      expect(nextNumber).toBe(0);
    });

    it("on a number collision keeps the counter, repairs it, and retries once with a fresh number", async () => {
      wireTransaction();
      dataSource.transaction.mockImplementationOnce(async () => {
        throw numberCollision();
      });

      await issue([{ orderItemId: "item-a", qty: 1 }]);

      // Drew 1, collided (not released: that would hand out 1 again), drew 2 on the retry.
      expect(nextNumber).toBe(2);
      expect(saved).toHaveLength(1);
      expect(saved[0].number).toMatch(/-000002$/);
      expect(ledger.statements.some((sql) => /regexp_match/.test(sql))).toBe(
        true,
      );
    });

    it("answers 409 when the retry collides too", async () => {
      const manager = wireTransaction();
      dataSource.transaction
        .mockReset()
        .mockImplementationOnce(async () => {
          throw numberCollision();
        })
        .mockImplementationOnce(async (callback) => callback(manager)) // the repair
        .mockImplementationOnce(async () => {
          throw numberCollision();
        })
        .mockImplementation(async (callback) => callback(manager));

      await expect(
        issue([{ orderItemId: "item-a", qty: 1 }]),
      ).rejects.toMatchObject({ status: 409 });
      expect(saved).toHaveLength(0);
    });
  });

  describe("retention", () => {
    it("never evicts anything when a note row is created, and never touches the ledger", async () => {
      const manager = wireTransaction({
        count: jest.fn().mockResolvedValue(DOCUMENTS_RETAINED_PER_TYPE),
        find: jest.fn().mockResolvedValue([{ id: "old-0", user_id: user.id }]),
      });
      ledger.lines.get("item-a").returned = 2;
      ledger.query.mockClear();

      await issue([{ orderItemId: "item-b", qty: 1 }]);

      expect(manager.delete).not.toHaveBeenCalled();
      expect(artifacts.retire).not.toHaveBeenCalled();
      expect(ledger.returned("item-a")).toBe(2);
      expect(ledger.statements.some((sql) => RELEASE.test(sql))).toBe(false);
    });
  });

  describe("voiding", () => {
    const voidingManager = (receipt: Partial<Receipt>) => ({
      findOne: jest.fn(async (entity) => (entity === Order ? order : receipt)),
      findOneOrFail: jest.fn(async () => ({ ...receipt, status: "void" })),
      update: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
      query: ledger.query,
    });
    const note = (
      document_type = DocumentType.RETURN_NOTE,
    ): Partial<Receipt> => ({
      id: "note-1",
      order_id: "order-1",
      number: "2026-000001",
      document_type,
      status: ReceiptStatus.GENERATED,
    });

    it("gives the quantities back and lets them be returned again", async () => {
      wireTransaction();
      await issue([{ orderItemId: "item-a", qty: 3 }]);
      await expect(
        issue([{ orderItemId: "item-a", qty: 1 }]),
      ).rejects.toMatchObject({ errorCode: "RETURN_QUANTITY_EXCEEDED" });

      const manager = voidingManager(note());
      snapshots.internal.mockResolvedValue({
        document_type: DocumentType.RETURN_NOTE,
        active_snapshot: snapshotWith([{ orderItemId: "item-a", qty: 3 }]),
        pending_snapshot: null,
      });
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager),
      );
      await service.voidReceipt("note-1", user, "wrong goods");
      expect(ledger.returned("item-a")).toBe(0);

      wireTransaction();
      await issue([{ orderItemId: "item-a", qty: 2 }]);
      expect(ledger.returned("item-a")).toBe(2);
    });

    it("reads the lines of a note that never finished from its pending snapshot", async () => {
      ledger.lines.get("item-b").returned = 1;
      snapshots.internal.mockResolvedValue({
        document_type: DocumentType.RETURN_NOTE,
        active_snapshot: null,
        pending_snapshot: snapshotWith([{ orderItemId: "item-b", qty: 1 }]),
      });
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(
          voidingManager({ ...note(), status: ReceiptStatus.PROCESSING }),
        ),
      );
      await service.voidReceipt("note-1", user, "stuck");
      expect(ledger.returned("item-b")).toBe(0);
    });

    it("still voids when nothing is left to release", async () => {
      snapshots.internal.mockResolvedValue({
        document_type: DocumentType.RETURN_NOTE,
        active_snapshot: snapshotWith([{ orderItemId: "item-a", qty: 2 }]),
      });
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(voidingManager(note())),
      );
      await expect(
        service.voidReceipt("note-1", user, "x"),
      ).resolves.toMatchObject({ status: "void" });
      expect(ledger.returned("item-a")).toBe(0);
    });

    it("warns, and still voids, when a live note has no readable lines", async () => {
      snapshots.internal.mockResolvedValue({
        document_type: DocumentType.RETURN_NOTE,
        active_snapshot: null,
        pending_snapshot: null,
      });
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(voidingManager(note())),
      );
      const warn = jest
        .spyOn(
          (service as unknown as { logger: { warn: () => void } }).logger,
          "warn",
        )
        .mockImplementation();
      await expect(
        service.voidReceipt("note-1", user, "x"),
      ).resolves.toMatchObject({ status: "void" });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("note-1"));
    });

    it("does not release a second time when a failed note is voided", async () => {
      ledger.lines.get("item-a").returned = 1;
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(voidingManager({ ...note(), status: ReceiptStatus.FAILED })),
      );
      await service.voidReceipt("note-1", user, "x");
      expect(snapshots.internal).not.toHaveBeenCalled();
      expect(ledger.returned("item-a")).toBe(1);
    });

    it("refuses to retry a failed note, whose quantities are already free", async () => {
      snapshots.internal.mockResolvedValue({
        ...note(),
        status: ReceiptStatus.FAILED,
        active_revision: 0,
      });
      await expect(
        service.regenerateReceiptPdf("note-1", user),
      ).rejects.toThrow(/cannot be retried/);
    });

    it("leaves the ledger alone when any other document is voided", async () => {
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(voidingManager(note(DocumentType.INVOICE))),
      );
      ledger.lines.get("item-a").returned = 2;
      await service.voidReceipt("invoice-1", user, "x");
      expect(snapshots.internal).not.toHaveBeenCalled();
      expect(ledger.returned("item-a")).toBe(2);
    });

    it("does not release quantities when the order is cancelled", async () => {
      ledger.lines.get("item-a").returned = 2;
      const manager = {
        find: jest.fn().mockResolvedValue([
          {
            id: "note-1",
            user_id: user.id,
            active_logo_asset_id: null,
            pending_logo_asset_id: null,
          },
        ]),
        update: jest.fn(),
        query: ledger.query,
      };
      await expect(
        service.voidForCancellation(manager as never, "order-1", user.id),
      ).resolves.toBe(1);
      expect(ledger.statements).toEqual([]);
      expect(ledger.returned("item-a")).toBe(2);
    });
  });
});
