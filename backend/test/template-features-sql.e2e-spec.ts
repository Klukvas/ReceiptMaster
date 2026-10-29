/** Opt-in only: never uses .env, default ORM config or a real application database. */
import "reflect-metadata";
import { randomUUID } from "crypto";
import { join } from "path";
import { Client } from "pg";
import { ConfigService } from "@nestjs/config";
import { DataSource, EntityManager } from "typeorm";
import sharp = require("sharp");
import { installTenantContext } from "../src/common/tenancy/tenant-data-source";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { DocumentUploadFencing1792100000002 } from "../src/config/migrations/1792100000002-DocumentUploadFencing";
import { DocumentStorageLeases1792100000001 } from "../src/config/migrations/1792100000001-DocumentStorageLeases";
import { DocumentConfiguration1792100000000 } from "../src/config/migrations/1792100000000-DocumentConfiguration";
import { DocumentAssetsService } from "../src/modules/settings/services/document-assets.service";
import { DocumentConfigService } from "../src/modules/settings/services/document-config.service";
import { DocumentPreset } from "../src/modules/settings/entities/document-preset.entity";
import { DocumentAsset } from "../src/modules/settings/entities/document-asset.entity";
import { UserSettings } from "../src/modules/settings/entities/user-settings.entity";
import { UserSubscription } from "../src/modules/subscription/entities/user-subscription.entity";
import { User } from "../src/modules/users/entities/user.entity";
import { LogoStorageService } from "../src/common/services/logo-storage.service";
import { CacheService } from "../src/common/services/cache.service";
import {
  TEMPLATE_CLUSTER,
  connectIsolatedAdmin,
  createRestrictedRole,
  describeIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

describeIsolatedPostgres(
  "document config isolated PostgreSQL migration/RLS/concurrency",
  TEMPLATE_CLUSTER,
  (connection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const database = `template_features_${suffix}`,
      role = `template_runtime_${suffix}`;
    const entities = [join(__dirname, "../src/**/*.entity.ts")];
    let admin: Client,
      owner: DataSource,
      runtime: DataSource,
      documents: DocumentConfigService,
      assets: DocumentAssetsService;
    let tenant: string, otherTenant: string;
    const objects = new Map<string, Buffer>();
    beforeAll(async () => {
      admin = await connectIsolatedAdmin(connection);
      await admin.query(`CREATE DATABASE "${database}"`);
      owner = new DataSource({
        type: "postgres",
        ...typeormCredentials(connection),
        database,
        entities,
        synchronize: true,
      });
      await owner.initialize();
      // Reconstruct the old schema, then execute the actual additive migration.
      await owner.query(
        `ALTER TABLE receipts DROP COLUMN active_revision, DROP COLUMN active_snapshot, DROP COLUMN pending_snapshot, DROP COLUMN pending_html, DROP COLUMN pending_id, DROP COLUMN pending_expected_revision, DROP COLUMN replacement_status, DROP COLUMN replacement_error, DROP COLUMN active_logo_asset_id, DROP COLUMN pending_logo_asset_id`,
      );
      await owner.query(
        `ALTER TABLE user_settings DROP COLUMN document_config, DROP COLUMN document_config_revision, DROP COLUMN logo_asset_id`,
      );
      await owner.query(`DROP TABLE document_presets`);
      await owner.query(`DROP TABLE document_assets`);
      const runner = owner.createQueryRunner();
      await runner.query("DROP TABLE IF EXISTS document_artifacts");
      await new DocumentConfiguration1792100000000().up(runner);
      await runner.startTransaction();
      await new DocumentStorageLeases1792100000001().up(runner);
      // synchronize created the asset fencing columns before the old-schema reconstruction;
      // DocumentConfiguration recreated assets without them, and artifacts were dropped.
      await new DocumentUploadFencing1792100000002().up(runner);
      await runner.commitTransaction();
      await runner.release();
      const rolePassword = await createRestrictedRole(admin, role);
      await owner.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await owner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
      );
      await owner.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`,
      );
      runtime = installTenantContext(
        new DataSource({
          type: "postgres",
          host: connection.host,
          port: connection.port,
          username: role,
          password: rolePassword,
          database,
          entities,
          extra: { max: 6, options: "-c statement_timeout=10000" },
        }),
      );
      await runtime.initialize();
      const storage = new LogoStorageService(
        new ConfigService({
          LOGOS_BUCKET: "synthetic",
          S3_ENDPOINT: "http://unused.invalid",
        }),
      );
      storage.uploadImmutable = async (bytes, userId, id) => {
        const key = `logos/${userId}/${id}.png`;
        objects.set(key, bytes);
        return key;
      };
      storage.readImmutable = async (key) => {
        const bytes = objects.get(key);
        if (!bytes) throw new Error("Synthetic object missing");
        return bytes;
      };
      storage.userHasLogo = async () => false;
      assets = new DocumentAssetsService(runtime, storage);
      documents = new DocumentConfigService(runtime, assets, {
        del: async () => undefined,
      } as unknown as CacheService);
    }, 30000);
    beforeEach(async () => {
      tenant = randomUUID();
      otherTenant = randomUUID();
      for (const id of [tenant, otherTenant]) {
        await owner
          .getRepository(User)
          .save({ id, email: `${id}@fixture.invalid`, password: "synthetic" });
        await owner
          .getRepository(UserSubscription)
          .save({ user_id: id, plan: "business" });
      }
    });
    afterAll(async () => {
      if (runtime?.isInitialized) await runtime.destroy();
      if (owner?.isInitialized) await owner.destroy();
      if (admin) {
        await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
        await admin.query(`DROP ROLE IF EXISTS "${role}"`);
        await admin.end();
      }
    });
    const inTenant = <T>(operation: () => Promise<T>) =>
      runWithTenant(tenant, operation);
    it("migration applies both RLS clauses and rollback restores the old schema", async () => {
      const policies = await owner.query(
        `SELECT tablename, qual, with_check FROM pg_policies WHERE tablename IN ('document_assets','document_presets')`,
      );
      expect(policies).toHaveLength(2);
      for (const policy of policies) {
        expect(policy.qual).toContain("app.current_user_id");
        expect(policy.with_check).toContain("app.current_user_id");
      }
      const flags = await owner.query(
        `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('document_assets','document_presets')`,
      );
      expect(
        flags.every((row) => row.relrowsecurity && row.relforcerowsecurity),
      ).toBe(true);
      const runner = owner.createQueryRunner();
      await runner.startTransaction();
      try {
        await new DocumentUploadFencing1792100000002().down(runner);
        await new DocumentStorageLeases1792100000001().down(runner);
        const inactiveTenant = randomUUID();
        await runner.query(
          `INSERT INTO document_assets(user_id,object_key,sha256,bytes,width,height,state,lease_expires_at) VALUES($1,$2,$3,1,1,1,'ready',now())`,
          [
            inactiveTenant,
            `logos/${inactiveTenant}/upgrade.png`,
            "a".repeat(64),
          ],
        );
        await runner.query(`GRANT CREATE ON SCHEMA public TO "${role}"`);
        await runner.query(`ALTER TABLE document_assets OWNER TO "${role}"`);
        await runner.query(`SET LOCAL ROLE "${role}"`);
        expect(await runner.query(`SELECT id FROM document_assets`)).toEqual(
          [],
        );
        await new DocumentStorageLeases1792100000001().up(runner);
        expect(
          await runner.query(
            `SELECT user_id FROM document_storage_sweeps WHERE user_id=$1`,
            [inactiveTenant],
          ),
        ).toEqual([{ user_id: inactiveTenant }]);
        expect(
          await runner.query(
            `SELECT policyname FROM pg_policies WHERE policyname='document_assets_backfill'`,
          ),
        ).toEqual([]);
        await new DocumentStorageLeases1792100000001().down(runner);
        await runner.query(`RESET ROLE`);
        await new DocumentConfiguration1792100000000().down(runner);
        expect(
          await runner.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name='user_settings' AND column_name='document_config'`,
          ),
        ).toEqual([]);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });
    it("restricted role cannot select or insert another tenant's presets/assets", async () => {
      expect(
        await runtime.query(
          "SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
        ),
      ).toEqual([{ name: role, rolsuper: false, rolbypassrls: false }]);
      expect(
        await runtime.query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user",
        ),
      ).toEqual([]);
      const version = await runWithTenant(otherTenant, () =>
        documents.read(otherTenant),
      );
      const preset = await runWithTenant(otherTenant, () =>
        documents.savePreset(otherTenant, {
          config: version.config,
          name: "Foreign",
          logoAction: "remove",
        }),
      );
      await inTenant(async () => {
        expect(await runtime.getRepository(DocumentPreset).find()).toEqual([]);
        await expect(documents.preset(tenant, preset.id)).rejects.toThrow(
          "Preset not found",
        );
        await expect(
          runtime.getRepository(DocumentPreset).save({
            user_id: otherTenant,
            name: "Forbidden",
            config: version.config,
            revision: 1,
          }),
        ).rejects.toThrow(/row-level security/i);
        await expect(
          runtime.getRepository(DocumentAsset).save({
            user_id: otherTenant,
            object_key: "forbidden",
            sha256: "a".repeat(64),
            bytes: 1,
            width: 1,
            height: 1,
            state: "ready",
            lease_expires_at: new Date(),
          }),
        ).rejects.toThrow(/row-level security/i);
      });
    });
    it("actual account CAS serializes concurrent saves with one winner", async () => {
      const version = await inTenant(() => documents.read(tenant));
      const attempts = await Promise.allSettled(
        ["A", "B"].map((name) =>
          inTenant(() =>
            documents.save(
              tenant,
              {
                config: {
                  ...version.config,
                  company: { ...version.config.company, companyName: name },
                },
                logoAction: "remove",
              },
              0,
            ),
          ),
        ),
      );
      expect(
        attempts.filter((value) => value.status === "fulfilled"),
      ).toHaveLength(1);
      expect((await inTenant(() => documents.read(tenant))).revision).toBe(1);
    });
    it("preset count/name/revision checks serialize under real advisory/row locks", async () => {
      const { config } = await inTenant(() => documents.read(tenant));
      for (let index = 0; index < 19; index++)
        await inTenant(() =>
          documents.savePreset(tenant, {
            name: `Preset ${index}`,
            config,
            logoAction: "remove",
          }),
        );
      const attempts = await Promise.allSettled(
        ["Twenty A", "Twenty B"].map((name) =>
          inTenant(() =>
            documents.savePreset(tenant, {
              name,
              config,
              logoAction: "remove",
            }),
          ),
        ),
      );
      expect(
        attempts.filter((value) => value.status === "fulfilled"),
      ).toHaveLength(1);
      expect(await inTenant(() => documents.listPresets(tenant))).toHaveLength(
        20,
      );
      const first = (await inTenant(() => documents.listPresets(tenant)))[0];
      await expect(
        inTenant(() =>
          documents.deletePreset(tenant, first.id, first.revision + 1),
        ),
      ).rejects.toThrow("Configuration changed");
    });
    it("real DB rollback after immutable upload leaves the old settings/logo pointer intact", async () => {
      const png = await sharp({
          create: { width: 8, height: 8, channels: 3, background: "blue" },
        })
          .png()
          .toBuffer(),
        file = { buffer: png, mimetype: "image/png" } as Express.Multer.File;
      const version = await inTenant(() => documents.read(tenant));
      const saved = await inTenant(() =>
        documents.save(
          tenant,
          { config: version.config, logoAction: "replace" },
          0,
          file,
        ),
      );
      const transaction = runtime.transaction.bind(runtime);
      const injection = jest
        .spyOn(
          runtime as unknown as {
            transaction: (
              operation: (manager: EntityManager) => Promise<unknown>,
            ) => Promise<unknown>;
          },
          "transaction",
        )
        .mockImplementationOnce((callback) =>
          transaction(async (manager) => {
            await callback(manager);
            throw new Error("Synthetic commit rollback");
          }),
        );
      await expect(
        inTenant(() =>
          documents.save(
            tenant,
            {
              config: { ...saved.config, footerTitle: "rollback" },
              logoAction: "replace",
            },
            1,
            file,
          ),
        ),
      ).rejects.toThrow("Synthetic commit rollback");
      injection.mockRestore();
      expect(await inTenant(() => documents.read(tenant))).toEqual(saved);
      expect(
        await inTenant(() => assets.read(tenant, saved.config.logo.assetId)),
      ).toEqual(await assets.normalize(file));
    });
    it("tenant-qualified logo references reject a foreign account attachment", async () => {
      const id = randomUUID();
      await runWithTenant(otherTenant, () =>
        runtime.getRepository(DocumentAsset).save({
          id,
          user_id: otherTenant,
          object_key: `logos/${otherTenant}/${id}.png`,
          sha256: "a".repeat(64),
          bytes: 1,
          width: 1,
          height: 1,
          state: "ready",
          lease_expires_at: new Date(Date.now() + 86400000),
        }),
      );
      await inTenant(async () => {
        const { config } = await documents.read(tenant);
        await documents.save(tenant, { config, logoAction: "remove" }, 0);
        await expect(
          runtime
            .getRepository(UserSettings)
            .update({ userId: tenant }, { logo_asset_id: id }),
        ).rejects.toThrow("Invalid logo owner");
        expect(await runtime.getRepository(DocumentAsset).find()).toEqual([]);
        const own = await runtime.getRepository(DocumentAsset).save({
          user_id: tenant,
          object_key: `logos/${tenant}/own.png`,
          sha256: "a".repeat(64),
          bytes: 1,
          width: 1,
          height: 1,
          state: "ready",
          lease_expires_at: new Date(),
        });
        await runtime
          .getRepository(UserSettings)
          .update({ userId: tenant }, { logo_asset_id: own.id });
        await expect(
          runtime
            .getRepository(UserSettings)
            .update({ userId: tenant }, { userId: otherTenant }),
        ).rejects.toThrow("Invalid logo owner");
      });
    });
  },
);
