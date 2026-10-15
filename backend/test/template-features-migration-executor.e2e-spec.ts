/** Installed TypeORM executor + real query builders, synthetic catalog/QueryRunner only.
 * Does not initialize a connection or certify PostgreSQL SQL/RLS execution. */
import {
  DataSource,
  MigrationInterface,
  QueryRunner,
  QueryResult,
} from "typeorm";
import { MigrationExecutor } from "typeorm/migration/MigrationExecutor";
import { DocumentConfiguration1792100000000 } from "../src/config/migrations/1792100000000-DocumentConfiguration";
import { DocumentStorageLeases1792100000001 } from "../src/config/migrations/1792100000001-DocumentStorageLeases";
import { DocumentUploadFencing1792100000002 } from "../src/config/migrations/1792100000002-DocumentUploadFencing";
import { mkdirSync, writeFileSync } from "fs";

const EVIDENCE_DIR =
  process.env.TEMPLATE_EVIDENCE ||
  "temp/template-features-20261015-225300/fix3";
mkdirSync(EVIDENCE_DIR, { recursive: true });

function seam(failAt?: string, override?: number) {
  const instances: MigrationInterface[] = [
    new DocumentConfiguration1792100000000(),
    new DocumentStorageLeases1792100000001(),
    new DocumentUploadFencing1792100000002(),
  ];
  if (override !== undefined) instances[override].transaction = true;
  const db = new DataSource({ type: "postgres", migrations: [] });
  Object.assign(db, { migrations: instances });
  const events: string[] = [];
  let catalog = {
    policies: [] as string[],
    tables: ["user_settings", "receipts"],
    migrations: [] as Array<{ id: number; timestamp: number; name: string }>,
  };
  let snapshot = structuredClone(catalog);
  const runner = {
    isTransactionActive: false,
    isReleased: false,
    data: {},
    connection: db,
    beforeMigration: async () => events.push("beforeMigration"),
    afterMigration: async () => events.push("afterMigration"),
    hasTable: async () => true,
    startTransaction: async () => {
      expect(runner.isTransactionActive).toBe(false);
      snapshot = structuredClone(catalog);
      runner.isTransactionActive = true;
      events.push("BEGIN");
    },
    commitTransaction: async () => {
      expect(
        catalog.policies.filter((p) => !p.startsWith("tenant_isolation:")),
      ).toEqual([]);
      runner.isTransactionActive = false;
      events.push("COMMIT");
    },
    rollbackTransaction: async () => {
      catalog = structuredClone(snapshot);
      runner.isTransactionActive = false;
      events.push("ROLLBACK");
    },
    query: async (
      sql: string,
      parameters: unknown[] = [],
      structured = false,
    ) => {
      events.push(sql);
      if (failAt && sql.includes(failAt))
        throw new Error("Injected backfill failure");
      let records: unknown[] = [];
      if (/SELECT .*FROM "migrations"/s.test(sql))
        records = [...catalog.migrations].reverse();
      if (/INSERT INTO "migrations"/.test(sql)) {
        expect(runner.isTransactionActive).toBe(true);
        catalog.migrations.push({
          id: catalog.migrations.length + 1,
          timestamp: Number(parameters[0]),
          name: String(parameters[1]),
        });
      }
      if (/DELETE FROM "migrations"/.test(sql))
        catalog.migrations = catalog.migrations.filter(
          (m) => m.name !== parameters[1],
        );
      const create = sql.match(/CREATE POLICY (\w+) ON (\w+)/);
      if (create) {
        expect(runner.isTransactionActive).toBe(true);
        catalog.policies.push(`${create[1]}:${create[2]}`);
      }
      const drop = sql.match(/DROP POLICY (\w+) ON (\w+)/);
      if (drop) {
        expect(catalog.policies).toContain(`${drop[1]}:${drop[2]}`);
        catalog.policies = catalog.policies.filter(
          (p) => p !== `${drop[1]}:${drop[2]}`,
        );
      }
      const table = sql.match(/CREATE TABLE (\w+)/);
      if (table) catalog.tables.push(table[1]);
      const dropTable = sql.match(/DROP TABLE (\w+)/);
      if (dropTable) {
        catalog.tables = catalog.tables.filter((t) => t !== dropTable[1]);
        catalog.policies = catalog.policies.filter(
          (p) => !p.endsWith(`:${dropTable[1]}`),
        );
      }
      if (sql.includes("SELECT DISTINCT user_id"))
        expect(catalog.policies).toContain(
          "document_assets_backfill:document_assets",
        );
      const backfill = sql.match(
        /UPDATE (document_assets|document_artifacts) SET upload_pending=false/,
      );
      if (backfill) {
        expect(catalog.policies).toContain(
          `upload_fencing_backfill_select:${backfill[1]}`,
        );
        expect(catalog.policies).toContain(
          `upload_fencing_backfill_update:${backfill[1]}`,
        );
      }
      if (!structured) return records;
      const result = new QueryResult();
      result.records = records;
      result.raw = records;
      result.affected = 1;
      return result;
    },
  };
  const queryRunner = runner as unknown as QueryRunner;
  Object.assign(queryRunner, { manager: db.createEntityManager(queryRunner) });
  const executor = new MigrationExecutor(db, queryRunner);
  return { executor, events, instances, runner, catalog: () => catalog };
}

describe("installed MigrationExecutor unchanged default all", () => {
  it("accepts all three pending migrations, removes narrow owner policies before commit, and reverts all three", async () => {
    const s = seam();
    expect(s.executor.transaction).toBe("all");
    expect(s.instances.map((m) => m.transaction)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    const applied = await s.executor.executePendingMigrations();
    expect(applied.map((m) => m.name)).toEqual(
      s.instances.map((m) => m.constructor.name),
    );
    expect(s.events.filter((e) => e === "BEGIN")).toHaveLength(1);
    expect(s.events.filter((e) => e === "COMMIT")).toHaveLength(1);
    const policies = s.events.filter((e) =>
      /CREATE POLICY (document_assets_backfill|upload_fencing_backfill)/.test(
        e,
      ),
    );
    expect(policies).toHaveLength(5);
    for (const sql of policies) {
      expect(sql).toMatch(/FOR (SELECT|UPDATE) TO CURRENT_USER USING \(true\)/);
      expect(s.events.indexOf(sql)).toBeGreaterThan(s.events.indexOf("BEGIN"));
    }
    expect(s.catalog().policies).toEqual(
      expect.arrayContaining([
        "tenant_isolation:document_assets",
        "tenant_isolation:document_artifacts",
      ]),
    );
    expect(s.events.join("\n")).not.toMatch(
      /BYPASSRLS|DISABLE ROW LEVEL SECURITY|NO FORCE ROW LEVEL SECURITY|ALTER TABLE user_settings.*ROW LEVEL/,
    );
    for (let i = 0; i < 3; i++) await s.executor.undoLastMigration();
    expect(s.catalog()).toEqual({
      policies: [],
      tables: ["user_settings", "receipts"],
      migrations: [],
    });
    expect(s.events.filter((e) => e === "BEGIN")).toHaveLength(4);
    expect(s.events.filter((e) => e === "COMMIT")).toHaveLength(4);
    writeFileSync(
      `${EVIDENCE_DIR}/migration-executor-success.json`,
      JSON.stringify(
        {
          executor: require.resolve("typeorm/migration/MigrationExecutor"),
          transaction: s.executor.transaction,
          events: s.events,
          finalCatalog: s.catalog(),
        },
        null,
        2,
      ),
    );
  });

  it.each([1, 2])(
    "actually rejects the former transaction=true override on migration %i",
    async (index) => {
      const s = seam(undefined, index);
      await expect(s.executor.executePendingMigrations()).rejects.toThrow(
        /override.*transaction|transaction.*override/i,
      );
      expect(s.events).not.toContain("BEGIN");
      expect(s.catalog().migrations).toHaveLength(0);
    },
  );

  it.each([
    "SELECT DISTINCT user_id",
    "UPDATE document_artifacts SET upload_pending=false",
  ])(
    "rolls back failure at %s with no residual policy/catalog changes",
    async (failure) => {
      const s = seam(failure);
      await expect(s.executor.executePendingMigrations()).rejects.toThrow(
        "Injected backfill failure",
      );
      expect(s.events).toContain("BEGIN");
      expect(s.events).toContain("ROLLBACK");
      expect(s.events).not.toContain("COMMIT");
      expect(s.catalog()).toEqual({
        policies: [],
        tables: ["user_settings", "receipts"],
        migrations: [],
      });
      expect(s.runner.isTransactionActive).toBe(false);
      writeFileSync(
        `${EVIDENCE_DIR}/migration-rollback-${failure.startsWith("SELECT") ? "0001" : "0002"}.json`,
        JSON.stringify(
          { events: s.events, finalCatalog: s.catalog() },
          null,
          2,
        ),
      );
    },
  );

  it.each([
    new DocumentStorageLeases1792100000001(),
    new DocumentUploadFencing1792100000002(),
  ])("rejects backfill outside a transaction", async (migration) => {
    const query = jest.fn();
    await expect(
      migration.up({
        isTransactionActive: false,
        query,
      } as unknown as QueryRunner),
    ).rejects.toThrow("requires a transaction");
    expect(query).not.toHaveBeenCalled();
  });
});
