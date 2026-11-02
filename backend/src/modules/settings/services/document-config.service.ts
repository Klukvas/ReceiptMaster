import { UserSubscription } from "../../subscription/entities/user-subscription.entity";
import { PLAN_LIMITS } from "../../subscription/config/plans.config";
import { ApiErrors } from "../../../common/errors/ApiError";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { UserSettings } from "../entities/user-settings.entity";
import { DocumentPreset } from "../entities/document-preset.entity";
import { DocumentAssetsService } from "./document-assets.service";
import { CacheService } from "../../../common/services/cache.service";
import {
  ConfigSelection,
  DocumentConfig,
  DocumentDraft,
  documentConfigSchema,
  legacyColumns,
  legacyConfig,
  mergeConfig,
  parseConfig,
} from "../document-config";

/** Lets the UI tell a stale-revision conflict (compare and reload) apart from other 409s. */
export const DOCUMENT_REVISION_CONFLICT = "DOCUMENT_REVISION_CONFLICT";

export const MAX_DOCUMENT_PRESETS = 20;
export const MAX_CONFIG_REVISION = 2147483646;
export type ConfigVersion = { config: DocumentConfig; revision: number };
@Injectable()
export class DocumentConfigService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly assets: DocumentAssetsService,
    private readonly cache: CacheService,
  ) {}

  async assertTemplate(
    userId: string,
    templateId: string,
    manager = this.db.manager,
  ): Promise<void> {
    const subscription = await manager.findOne(UserSubscription, {
      where: { user_id: userId },
    });
    const allowed =
      PLAN_LIMITS[subscription?.plan || "free"].allowedTemplateIds;
    if (allowed && !allowed.includes(templateId))
      throw ApiErrors.TEMPLATE_PLAN_RESTRICTED(templateId);
  }
  async read(
    userId: string,
    manager = this.db.manager,
  ): Promise<ConfigVersion> {
    const row = await manager.findOne(UserSettings, { where: { userId } });
    return {
      config: row?.document_config
        ? parseConfig(documentConfigSchema, row.document_config)
        : legacyConfig(row),
      revision: row?.document_config_revision || 0,
    };
  }
  async lock(userId: string, manager: EntityManager): Promise<UserSettings> {
    // Serialize all account and preset writes, including the first insert and quota checks.
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
      [userId],
    );
    const row = await manager.findOne(UserSettings, {
      where: { userId },
      lock: { mode: "pessimistic_write" },
    });
    return (
      row ||
      manager.save(UserSettings, manager.create(UserSettings, { userId }))
    );
  }
  private checkRevision(actual: number, expected: number): void {
    if (actual !== expected)
      throw new ConflictException({
        message:
          "Configuration changed. Reload saved settings or keep your draft and retry after comparing.",
        errorCode: DOCUMENT_REVISION_CONFLICT,
        revision: actual,
      });
    if (actual >= MAX_CONFIG_REVISION)
      throw new ConflictException("Configuration revision limit reached");
  }
  private async commit(
    userId: string,
    config: DocumentConfig,
    expected: number,
    manager: EntityManager,
  ): Promise<ConfigVersion> {
    const row = await this.lock(userId, manager);
    this.checkRevision(row.document_config_revision || 0, expected);
    await this.assertTemplate(userId, config.templateId, manager);
    await this.assets.attach(userId, config.logo.assetId, manager);
    if (row.logo_asset_id !== config.logo.assetId)
      await this.assets.release(userId, row.logo_asset_id, manager);
    await manager.update(
      UserSettings,
      { id: row.id, userId },
      {
        ...legacyColumns(config),
        document_config: config,
        logo_asset_id: config.logo.assetId,
        document_config_revision: expected + 1,
      },
    );
    return { config, revision: expected + 1 };
  }
  async save(
    userId: string,
    draft: DocumentDraft,
    expected: number,
    file?: Express.Multer.File,
  ): Promise<ConfigVersion> {
    const config = parseConfig(documentConfigSchema, draft.config);
    this.checkRevision((await this.read(userId)).revision, expected);
    await this.assertTemplate(userId, config.templateId);
    const assetId = await this.assets.stage(userId, draft, file);
    const committed = await this.db.transaction((manager) =>
      this.commit(
        userId,
        { ...config, logo: { ...config.logo, assetId } },
        expected,
        manager,
      ),
    );
    await this.cache.del(`settings:${userId}`).catch(() => undefined);
    return committed;
  }
  async patchLegacy(
    userId: string,
    updates: Partial<UserSettings>,
  ): Promise<void> {
    const current = await this.read(userId);
    const legacyAssetId =
      current.revision === 0
        ? await this.assets.stage(userId, {
            config: current.config,
            logoAction: "keep",
          })
        : null;
    await this.db.transaction(async (manager) => {
      const row = await this.lock(userId, manager);
      const next = { ...row, ...updates };
      const base = row.document_config || {
        ...legacyConfig(row),
        logo: { ...legacyConfig(row).logo, assetId: legacyAssetId },
      };
      const mapped = legacyConfig(next);
      const config = parseConfig(documentConfigSchema, {
        ...base,
        ...mapped,
        logo: base.logo,
        visibility: base.visibility,
        formatting: base.formatting,
      });
      await this.assertTemplate(userId, config.templateId, manager);
      await this.commit(
        userId,
        config,
        row.document_config_revision || 0,
        manager,
      );
    });
    await this.cache.del(`settings:${userId}`).catch(() => undefined);
  }
  async listPresets(userId: string) {
    return this.db.getRepository(DocumentPreset).find({
      where: { user_id: userId },
      select: { id: true, name: true, revision: true, updated_at: true },
      order: { name: "ASC" },
    });
  }
  async preset(
    userId: string,
    id: string,
    manager = this.db.manager,
  ): Promise<DocumentPreset> {
    const preset = await manager
      .getRepository(DocumentPreset)
      .createQueryBuilder("preset")
      .addSelect("preset.config")
      .where("preset.id = :id AND preset.user_id = :userId", { id, userId })
      .getOne();
    if (!preset) throw new NotFoundException("Preset not found");
    return preset;
  }
  async savePreset(
    userId: string,
    draft: DocumentDraft & { name: string },
    id?: string,
    expected?: number,
    file?: Express.Multer.File,
  ) {
    await this.assertTemplate(userId, draft.config.templateId);
    const assetId = await this.assets.stage(userId, draft, file);
    return this.db.transaction(async (manager) => {
      await this.lock(userId, manager);
      const existing = id ? await this.preset(userId, id, manager) : undefined;
      await this.assertTemplate(userId, draft.config.templateId, manager);
      if (existing) this.checkRevision(existing.revision, expected);
      else if (
        (await manager.count(DocumentPreset, { where: { user_id: userId } })) >=
        MAX_DOCUMENT_PRESETS
      )
        throw new ConflictException("Maximum 20 presets");
      const duplicate = await manager.findOne(DocumentPreset, {
        where: { user_id: userId, name: draft.name },
      });
      if (duplicate && duplicate.id !== id)
        throw new ConflictException("A preset with this name already exists");
      await this.assets.attach(userId, assetId, manager);
      if (existing?.logo_asset_id !== assetId)
        await this.assets.release(userId, existing?.logo_asset_id, manager);
      const config = {
        ...draft.config,
        logo: { ...draft.config.logo, assetId },
      };
      const saved = await manager.save(
        DocumentPreset,
        manager.create(DocumentPreset, {
          ...existing,
          user_id: userId,
          name: draft.name,
          config,
          logo_asset_id: assetId,
          revision: (existing?.revision || 0) + 1,
        }),
      );
      return {
        id: saved.id,
        name: saved.name,
        revision: saved.revision,
        config,
      };
    });
  }
  async deletePreset(
    userId: string,
    id: string,
    expected: number,
  ): Promise<void> {
    await this.db.transaction(async (manager) => {
      await this.lock(userId, manager);
      const preset = await this.preset(userId, id, manager);
      this.checkRevision(preset.revision, expected);
      await this.assets.release(userId, preset.logo_asset_id, manager);
      await manager.delete(DocumentPreset, {
        id,
        user_id: userId,
        revision: expected,
      });
    });
  }
  async resolve(userId: string, selection: ConfigSelection) {
    const account = await this.read(userId);
    const preset = selection.presetId
      ? await this.preset(userId, selection.presetId)
      : undefined;
    if (preset && preset.revision !== selection.presetRevision)
      throw new ConflictException(
        "Preset changed. Reload it before generating.",
      );
    const config = parseConfig(
      documentConfigSchema,
      mergeConfig(
        selection.config || preset?.config || account.config,
        selection.overrides,
      ),
    );
    await this.assertTemplate(userId, config.templateId);
    return {
      config,
      revision: account.revision,
      preset: preset ? { id: preset.id, revision: preset.revision } : undefined,
    };
  }
}
