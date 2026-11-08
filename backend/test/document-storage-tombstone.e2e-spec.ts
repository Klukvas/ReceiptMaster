import "reflect-metadata";
import { randomUUID } from "crypto";
import { DocumentArtifact } from "../src/modules/receipts/entities/document-artifact.entity";
import { User } from "../src/modules/users/entities/user.entity";
import { collectClaim } from "../src/modules/settings/services/document-storage-cleanup";
import { LATE_WRITE_WINDOW_MS } from "../src/modules/settings/services/document-storage-sweep";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import { openMigratedAppDatabase } from "./helpers/migrated-app-database";
import type { RestrictedAppDatabase } from "./helpers/restricted-app-database";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The tombstone of a PDF upload whose outcome was never learned, on the migrated schema. */
describeIsolatedPostgres(
  "failed upload tombstones on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let user: User;

    beforeAll(async () => {
      db = await openMigratedAppDatabase(connection, "befix_tombstone");
    }, 60000);

    afterAll(async () => {
      await db?.close();
    });

    beforeEach(async () => {
      user = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@tombstone.invalid`,
        password: "fixture",
      });
    });

    const tombstone = async (ageMs: number): Promise<DocumentArtifact> => {
      const id = randomUUID();
      await db.admin.query(
        `INSERT INTO document_artifacts
           (id, user_id, object_key, state, lease_expires_at, upload_pending, created_at)
         VALUES ($1, $2, $3, 'deleting', now() - interval '1 hour', true, now() - ($4 || ' milliseconds')::interval)`,
        [id, user.id, `receipts/${user.id}/${id}.pdf`, String(ageMs)],
      );
      return db.admin.manager.findOneByOrFail(DocumentArtifact, { id });
    };

    const remaining = (id: string) =>
      db.admin.getRepository(DocumentArtifact).countBy({ id });

    it("keeps the row, with a later cleanup time, while a late write is still possible", async () => {
      const row = await tombstone(2 * DAY_MS);
      const remove = jest.fn().mockResolvedValue(undefined);

      expect(await collectClaim(db.admin, DocumentArtifact, row, remove)).toBe(
        true,
      );

      expect(remove).toHaveBeenCalledTimes(1);
      expect(await remaining(row.id)).toBe(1);
      const after = await db.admin.manager.findOneByOrFail(DocumentArtifact, {
        id: row.id,
      });
      expect(after.lease_expires_at.getTime()).toBeGreaterThan(Date.now());
    });

    it("deletes the object one last time and drops the row once the window has passed", async () => {
      const row = await tombstone(LATE_WRITE_WINDOW_MS + DAY_MS);
      const remove = jest.fn().mockResolvedValue(undefined);

      expect(await collectClaim(db.admin, DocumentArtifact, row, remove)).toBe(
        true,
      );

      expect(remove).toHaveBeenCalledTimes(1);
      expect(await remaining(row.id)).toBe(0);
    });

    it("keeps the row when the storage delete fails, whatever its age", async () => {
      const row = await tombstone(LATE_WRITE_WINDOW_MS + DAY_MS);

      expect(
        await collectClaim(db.admin, DocumentArtifact, row, async () => {
          throw new Error("storage down");
        }),
      ).toBe(false);

      expect(await remaining(row.id)).toBe(1);
    });
  },
);
