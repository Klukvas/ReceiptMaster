import { DataSource, EntityManager, EntityTarget } from "typeorm";
import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  createTemplateFixture,
  TENANT,
  ORDER_ID,
} from "./template-features-fixture";
import {
  Receipt,
  ReceiptStatus,
} from "../src/modules/receipts/entities/receipt.entity";
import { DocumentArtifact } from "../src/modules/receipts/entities/document-artifact.entity";
import { DocumentAsset } from "../src/modules/settings/entities/document-asset.entity";
import { Order } from "../src/modules/orders/entities/order.entity";
type Row = Record<string, unknown>;
function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
/** Wait-for graph of explicit row/advisory locks plus UPDATE/DELETE locks.
 * Reads refetch after waits. Synthetic control flow, not PostgreSQL execution. */
class Locks {
  owners = new Map<string, string>();
  waiting = new Map<string, string>();
  wake = new Map<string, { key: string; resolve: () => void }>();
  trace: string[] = [];
  acquired?: (tx: string, key: string) => Promise<void>;
  attempted?: (tx: string, key: string) => void;
  async lock(tx: string, key: string): Promise<void> {
    this.attempted?.(tx, key);
    const owner = this.owners.get(key);
    if (owner && owner !== tx) {
      this.trace.push(`${tx} waits ${owner} on ${key}`);
      this.waiting.set(tx, owner);
      let next: string | undefined = owner;
      while (next) {
        if (next === tx) throw new Error(`DEADLOCK ${tx} <-> ${owner}`);
        next = this.waiting.get(next);
      }
      await new Promise<void>((resolve) => this.wake.set(tx, { key, resolve }));
      this.waiting.delete(tx);
      return this.lock(tx, key);
    }
    if (owner === tx) return;
    this.owners.set(key, tx);
    this.trace.push(`${tx} locks ${key}`);
    await this.acquired?.(tx, key);
  }
  release(tx: string): void {
    for (const [key, owner] of this.owners)
      if (owner === tx) this.owners.delete(key);
    this.waiting.delete(tx);
    for (const [waiter, value] of this.wake)
      if (!this.owners.has(value.key)) {
        this.wake.delete(waiter);
        value.resolve();
      }
  }
}
describe("FIX4 actual service receipt retirement wait-for graph", () => {
  let f: Awaited<ReturnType<typeof createTemplateFixture>>;
  beforeEach(async () => {
    f = await createTemplateFixture();
  });
  afterEach(async () => {
    await f.close();
  });
  async function setup() {
    const initial = await f.receipts.generateReceipt(ORDER_ID, f.user);
    await f.artifacts.execute(initial.id, TENANT, initial.generation_id);
    const frozen = await f.snapshots.internal(initial.id, TENANT);
    const b = {
      ...frozen,
      id: "B",
      order_id: "orderB",
      created_at: new Date(0),
      pdf_path: `object-storage://receipts/${TENANT}/old.pdf`,
      hash: "old",
      active_logo_asset_id: "old-active",
      pending_logo_asset_id: "old-pending",
    };
    f.memory.tables.set(Receipt.name, [
      b,
      ...Array.from({ length: 9 }, (_, i) => ({
        ...frozen,
        id: `C${i}`,
        order_id: `orderC${i}`,
        created_at: new Date(i + 1),
        pdf_path: `object-storage://receipts/${TENANT}/c${i}.pdf`,
      })),
    ]);
    await f.db.manager.save(Order, {
      ...f.memory.rows(Order)[0],
      id: "orderB",
      is_locked: true,
    });
    const candidate = {
      ...frozen,
      id: "A",
      order_id: ORDER_ID,
      status: ReceiptStatus.PROCESSING,
      active_revision: 0,
      pending_expected_revision: 0,
      generation_id: "jobA",
      pending_id: "pendingA",
      pending_html: frozen.html_snapshot,
      pending_snapshot: frozen.active_snapshot,
      pdf_path: null,
      hash: null,
      active_logo_asset_id: null,
      pending_logo_asset_id: null,
    };
    for (const id of [
      "old-active",
      "old-pending",
      "latest-active",
      "latest-pending",
    ])
      await f.db.manager.save(DocumentAsset, {
        id,
        user_id: TENANT,
        state: "ready",
      });
    return { b, candidate };
  }
  function manager(tx: string, locks: Locks): EntityManager {
    const base = f.db.manager;
    const rowLock = async (entity: { name: string }, where: Row) => {
      for (const row of f.memory
        .rows(entity)
        .filter((r) =>
          Object.entries(where).every(
            ([key, value]) => typeof value === "object" || r[key] === value,
          ),
        ))
        await locks.lock(
          tx,
          entity.name === "DocumentArtifact"
            ? `pdf:${row.object_key}`
            : `${entity.name}:${row.id || row.userId}`,
        );
    };
    return {
      ...base,
      findOne: async (
        entity: { name: string },
        options: { where: Row; lock?: unknown; select?: string[] },
      ) => {
        if (options.lock) await rowLock(entity, options.where);
        const row = await base.findOne(
          entity as EntityTarget<Row>,
          options as never,
        );
        if (row && options.select) {
          const actual = f.memory
            .rows(entity)
            .find((r) => r.id === (row as Row).id);
          return Object.fromEntries(
            options.select.map((key) => [key, actual?.[key]]),
          );
        }
        return row;
      },
      update: async (entity: { name: string }, where: Row, patch: Row) => {
        await rowLock(entity, where);
        return base.update(entity as EntityTarget<Row>, where, patch);
      },
      delete: async (entity: { name: string }, where: Row | string[]) => {
        if (Array.isArray(where))
          for (const id of where) await rowLock(entity, { id });
        else await rowLock(entity, where);
        return base.delete(entity as EntityTarget<Row>, where);
      },
      query: async (sql: string, params: unknown[] = []) => {
        if (/advisory/.test(sql)) await locks.lock(tx, `tenant:${params[0]}`);
        if (/INSERT INTO document_artifacts/.test(sql))
          await locks.lock(tx, `pdf:${params[2]}`);
        if (/INSERT INTO document_storage_sweeps/.test(sql))
          await locks.lock(tx, `sweep:${params[0]}`);
        return base.query(sql, params);
      },
    } as unknown as EntityManager;
  }
  function installTransactions(locks: Locks, txForCall: () => string) {
    // Remote upload reservation completes before content transaction; actual attach/retire/
    // release services use the manager below, including ready lease and sweep locks.
    f.leases.upload = async (_bytes, filename) => {
      await f.db.manager.save(DocumentArtifact, {
        id: filename,
        user_id: TENANT,
        object_key: `receipts/${TENANT}/${filename}`,
        state: "ready",
      });
      return {
        id: filename,
        url: filename,
        path: `object-storage://receipts/${TENANT}/${filename}`,
      };
    };
    f.db.transaction = (async (fn: (m: EntityManager) => Promise<unknown>) => {
      const tx = txForCall(),
        m = manager(tx, locks);
      try {
        return await fn(m);
      } finally {
        locks.release(tx);
      }
    }) as DataSource["transaction"];
    return (tx: string) => manager(tx, locks);
  }
  function saveTrace(
    name: string,
    locks: Locks,
    results: PromiseSettledResult<unknown>[],
  ) {
    const dir =
      process.env.TEMPLATE_EVIDENCE ||
      join(tmpdir(), "receiptmaster-template-features", "fix4");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `locks-${name}.json`),
      JSON.stringify(
        {
          trace: locks.trace,
          results: results.map((r) =>
            r.status === "fulfilled"
              ? { status: r.status }
              : { status: r.status, error: String(r.reason) },
          ),
        },
        null,
        2,
      ),
    );
  }
  it.each(["precreate", "promotion", "orderdelete"])(
    "%s eviction racing repair has no receipt/lease cycle",
    async (mode) => {
      const { candidate } = await setup();
      const locks = new Locks(),
        start = deferred(),
        attempted = deferred();
      let triggered = false;
      locks.attempted = (tx, key) => {
        if (
          tx === "R" &&
          key === (mode === "orderdelete" ? "Order:orderB" : "Receipt:B")
        )
          attempted.resolve();
      };
      locks.acquired = async (tx, key) => {
        if (
          tx === "E" &&
          !triggered &&
          (key === "Receipt:B" || key.endsWith("/old.pdf"))
        ) {
          triggered = true;
          start.resolve();
          await attempted.promise;
        }
      };
      const m = installTransactions(locks, () =>
        mode !== "precreate" && !triggered ? "E" : "R",
      );
      const repair = (async () => {
        await start.promise;
        return f.artifacts.repair("B", TENANT);
      })();
      const eviction = (async () => {
        try {
          if (mode === "precreate") {
            await (
              f.receipts as unknown as {
                cleanupOldReceipts(m: EntityManager, u: string): Promise<void>;
              }
            ).cleanupOldReceipts(m("E"), TENANT);
          } else if (mode === "orderdelete") {
            await f.receipts.deleteReceiptFilesForOrder("orderB", TENANT);
          } else {
            await f.db.manager.save(Receipt, candidate);
            await f.artifacts.execute("A", TENANT, "jobA");
          }
        } finally {
          locks.release("E");
        }
      })();
      const results = await Promise.allSettled([eviction, repair]);
      saveTrace(mode, locks, results);
      expect(
        results.some(
          (r) => r.status === "rejected" && /DEADLOCK/.test(String(r.reason)),
        ),
      ).toBe(false);
      expect(results[0].status).toBe("fulfilled");
      expect(f.memory.rows(Receipt).some((r) => r.id === "B")).toBe(false);
      expect(
        locks.trace.findIndex((s) => s === "E locks Receipt:B"),
      ).toBeLessThan(
        locks.trace.findIndex(
          (s) => s === `E locks pdf:receipts/${TENANT}/old.pdf`,
        ),
      );
      expect(
        f.memory.rows(Receipt).filter((r) => r.status === "generated").length,
      ).toBeLessThanOrEqual(10);
    },
  );
  it("refetches the new PDF after waiting on an in-flight actual repair receipt lock", async () => {
    const { b } = await setup();
    const locks = new Locks(),
      held = deferred(),
      attempted = deferred();
    locks.attempted = (tx, key) => {
      if (tx === "E" && key === "Receipt:B") attempted.resolve();
    };
    locks.acquired = async (tx, key) => {
      if (tx === "R" && key === "Receipt:B") {
        held.resolve();
        await attempted.promise;
      }
    };
    const m = installTransactions(locks, () => "R");
    const repair = f.artifacts.repair("B", TENANT);
    await held.promise;
    const eviction = (
      f.receipts as unknown as {
        cleanupOldReceipts(m: EntityManager, u: string): Promise<void>;
      }
    )
      .cleanupOldReceipts(
        {
          ...m("E"),
          count: async () => 10,
          find: async () => [b],
        } as unknown as EntityManager,
        TENANT,
      )
      .finally(() => locks.release("E"));
    const results = await Promise.allSettled([repair, eviction]);
    saveTrace("wait-refetch", locks, results);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(locks.trace).toContain("E waits R on Receipt:B");
    expect(
      locks.trace.some((s) =>
        s.startsWith(`E locks pdf:receipts/${TENANT}/repair-B-`),
      ),
    ).toBe(true);
    expect(locks.trace).not.toContain(`E locks pdf:receipts/${TENANT}/old.pdf`);
  });
  it("refetches current PDF/private refs and locks all batch IDs before any retirement", async () => {
    const { b } = await setup();
    const locks = new Locks(),
      m = installTransactions(locks, () => "R");
    const selected = [{ ...b, id: "C0" }, b];
    await f.artifacts.repair("B", TENANT);
    await f.db.manager.update(
      Receipt,
      { id: "B" },
      {
        active_logo_asset_id: "latest-active",
        pending_logo_asset_id: "latest-pending",
      },
    );
    const current = String(
      f.memory.rows(Receipt).find((r) => r.id === "B")?.pdf_path,
    ).replace("object-storage://", "");
    const overridden = {
      ...m("E"),
      count: async () => 11,
      find: async () => selected,
    } as unknown as EntityManager;
    const results = await Promise.allSettled([
      (
        f.receipts as unknown as {
          cleanupOldReceipts(m: EntityManager, u: string): Promise<void>;
        }
      ).cleanupOldReceipts(overridden, TENANT),
    ]);
    saveTrace("refetch", locks, results);
    expect(results[0].status).toBe("fulfilled");
    expect(locks.trace).toContain(`E locks pdf:${current}`);
    expect(locks.trace).not.toContain(`E locks pdf:receipts/${TENANT}/old.pdf`);
    expect(locks.trace).toContain("E locks DocumentAsset:latest-active");
    expect(locks.trace).toContain("E locks DocumentAsset:latest-pending");
    expect(locks.trace.indexOf("E locks Receipt:B")).toBeLessThan(
      locks.trace.indexOf("E locks Receipt:C0"),
    );
    expect(locks.trace.indexOf("E locks Receipt:C0")).toBeLessThan(
      locks.trace.indexOf(`E locks pdf:${current}`),
    );
    locks.release("E");
  });
});
