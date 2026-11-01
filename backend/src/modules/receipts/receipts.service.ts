import { DocumentConfigService } from "../settings/services/document-config.service";
import {
  DocumentRenderService,
  sampleOrder,
} from "./services/document-render.service";
import { ConflictException, Optional } from "@nestjs/common";
import { ConfigSelection } from "../settings/document-config";
import { ReceiptSnapshotService } from "./services/receipt-snapshot.service";
import { ReceiptArtifactService } from "./services/receipt-artifact.service";
import { Injectable, Logger } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource, EntityManager, IsNull } from "typeorm";
import { Receipt, ReceiptStatus } from "./entities/receipt.entity";
import { Order, OrderStatus } from "../orders/entities/order.entity";
import {
  PdfGeneratorService,
  ReceiptStyle,
} from "./services/pdf-generator.service";
import { PdfStorageService } from "../../common/services/pdf-storage.service";
import { User } from "../users/entities/user.entity";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { ConfigService } from "@nestjs/config";
import { SettingsService } from "../settings/services/settings.service";

import { ReceiptGenerationOutbox } from "./entities/receipt-generation-outbox.entity";
import { ReceiptOutboxService } from "./receipt-outbox.service";
import { runWithPublicToken } from "../../common/tenancy/tenant-context";

const execFileAsync = promisify(execFile);

/** Only allow alphanumeric, hyphens, underscores, dots, and spaces in printer names */
const SAFE_PRINTER_NAME = /^[a-zA-Z0-9_\-. ]+$/;

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);
  private readonly MAX_RECEIPTS = 10;
  /** A PROCESSING receipt older than this is treated as stuck and may be retried. */

  constructor(
    @InjectRepository(Receipt)
    private receiptsRepository: Repository<Receipt>,
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private pdfGeneratorService: PdfGeneratorService,
    private pdfStorageService: PdfStorageService,
    @InjectDataSource()
    private dataSource: DataSource,
    private configService: ConfigService,
    private settingsService: SettingsService,
    private receiptOutbox: ReceiptOutboxService,
    @Optional() private readonly snapshots?: ReceiptSnapshotService,
    @Optional() private readonly artifacts?: ReceiptArtifactService,
    @Optional() private readonly documents?: DocumentConfigService,
    @Optional() private readonly renders?: DocumentRenderService,
  ) {}

  private getReceiptStyleFromTemplateId(templateId: string): ReceiptStyle {
    switch (templateId) {
      case "standard":
        return ReceiptStyle.STANDARD;
      case "compact":
        return ReceiptStyle.COMPACT;
      case "classic":
        return ReceiptStyle.CLASSIC;
      case "modern":
        return ReceiptStyle.MODERN;
      case "elegant":
        return ReceiptStyle.ELEGANT;
      case "vintage":
        return ReceiptStyle.VINTAGE;
      case "tech":
        return ReceiptStyle.TECH;
      case "wave":
        return ReceiptStyle.WAVE;
      case "minimal":
        return ReceiptStyle.MINIMAL;
      case "corporate":
        return ReceiptStyle.CORPORATE;
      case "thermal":
        return ReceiptStyle.THERMAL;
      case "dark":
        return ReceiptStyle.DARK;
      case "branded":
        return ReceiptStyle.BRANDED;
      case "delivery":
        return ReceiptStyle.DELIVERY;
      case "proforma":
        return ReceiptStyle.PROFORMA;
      default:
        this.logger.warn(
          `Unknown template ID: ${templateId}, falling back to COMPACT`,
        );
        return ReceiptStyle.COMPACT;
    }
  }

  async generateReceipt(
    orderId: string,
    user: User,
    selection: ConfigSelection = { logoAction: "keep" },
    file?: Express.Multer.File,
  ): Promise<Receipt> {
    const prior = await this.receiptsRepository.findOne({
      where: { order_id: orderId, user_id: user.id },
    });
    if (prior?.status === ReceiptStatus.PROCESSING && prior.generation_id)
      return prior;
    if (
      prior &&
      [ReceiptStatus.GENERATED, ReceiptStatus.VOID].includes(prior.status)
    )
      throw ApiErrors.RECEIPT_ALREADY_EXISTS(orderId);
    const previous = prior
      ? await this.snapshots.internal(prior.id, user.id)
      : undefined;
    const explicitConfig = Boolean(
      selection.config ||
        selection.presetId ||
        selection.overrides ||
        file ||
        selection.logoAction !== "keep",
    );
    const retryFrozen =
      previous?.pending_snapshot && previous.pending_html && !explicitConfig;
    if (previous && !previous.pending_snapshot && !explicitConfig)
      throw new ConflictException({
        errorCode: "RECONSTRUCTION_REQUIRED",
        message:
          "No frozen candidate exists. Customize this document explicitly to reconstruct it.",
      });
    const number =
      prior?.number ||
      (await this.generateReceiptNumber(this.dataSource.manager));
    const prepared = retryFrozen
      ? undefined
      : await this.snapshots.prepare(
          user.id,
          orderId,
          number,
          selection,
          file,
          previous?.pending_snapshot?.order,
        );
    if (prepared && previous && !previous.pending_snapshot?.order)
      prepared.snapshot = { ...prepared.snapshot, reconstructed: true };
    const receipt = await this.dataSource.transaction(async (manager) => {
      // Serialize tenant quota, then order identity and source validation. No external I/O here.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
        [user.id],
      );
      const order = prepared
        ? await this.snapshots.validatePrepared(
            user.id,
            orderId,
            prepared,
            manager,
          )
        : await manager.findOne(Order, {
            where: { id: orderId, user_id: user.id },
            lock: { mode: "pessimistic_write" },
          });
      if (!order || order.status !== OrderStatus.CONFIRMED)
        throw ApiErrors.ORDER_CANNOT_BE_MODIFIED(orderId);
      const existing = await manager.findOne(Receipt, {
        where: { order_id: orderId, user_id: user.id },
      });
      if (
        existing?.status === ReceiptStatus.PROCESSING &&
        existing.generation_id
      )
        return existing;
      if (
        existing &&
        [ReceiptStatus.GENERATED, ReceiptStatus.VOID].includes(existing.status)
      )
        throw ApiErrors.RECEIPT_ALREADY_EXISTS(orderId);
      if (previous && existing?.generation_id !== previous.generation_id)
        throw new ConflictException("Generation changed; refresh and retry");
      const generationId = crypto.randomUUID();
      const candidate = prepared
        ? this.snapshots.candidate(prepared, existing?.active_revision || 0)
        : {};
      let result: Receipt;
      if (existing) {
        await manager.update(
          Receipt,
          { id: existing.id, user_id: user.id },
          {
            ...candidate,
            status: ReceiptStatus.PROCESSING,
            progress: 0,
            error_message: null,
            generation_id: generationId,
            generation_started_at: new Date(),
          },
        );
        result = await manager.findOneOrFail(Receipt, {
          where: { id: existing.id, user_id: user.id },
        });
      } else {
        await this.cleanupOldReceipts(manager, user.id);
        result = await manager.save(
          Receipt,
          manager.create(Receipt, {
            ...candidate,
            order_id: orderId,
            number,
            status: ReceiptStatus.PROCESSING,
            active_revision: 0,
            progress: 0,
            user_id: user.id,
            generation_id: generationId,
            generation_started_at: new Date(),
          }),
        );
      }
      await manager.save(
        ReceiptGenerationOutbox,
        manager.create(ReceiptGenerationOutbox, {
          id: crypto.randomUUID(),
          receipt_id: result.id,
          order_id: orderId,
          user_id: user.id,
          generation_id: generationId,
          published_at: null,
        }),
      );
      return result;
    });
    void this.receiptOutbox.dispatch();
    return receipt;
  }

  async generateCompactReceipt(orderId: string, user: User): Promise<Receipt> {
    // Delegates to generateReceipt — template style is determined by user settings
    return this.generateReceipt(orderId, user);
  }

  async generateStandardReceipt(orderId: string, user: User): Promise<Receipt> {
    // Delegates to generateReceipt — template style is determined by user settings
    return this.generateReceipt(orderId, user);
  }

  async generateTestReceipt(user: User): Promise<Buffer> {
    const { config } = await this.documents.read(user.id);
    await this.documents.assertTemplate(user.id, config.templateId);
    return this.renders.preview(
      user.id,
      { config, logoAction: "keep" },
      sampleOrder(user.id),
    );
  }

  async voidReceipt(id: string, user: User, reason: string): Promise<Receipt> {
    return this.dataSource.transaction(async (manager) => {
      const observed = await manager.findOne(Receipt, {
        where: { id, user_id: user.id },
      });
      if (!observed) throw ApiErrors.RECEIPT_NOT_FOUND(id);
      // Same order -> receipt lock order as candidate promotion and replacement.
      await manager.findOne(Order, {
        where: { id: observed.order_id, user_id: user.id },
        lock: { mode: "pessimistic_write" },
      });
      const receipt = await manager.findOne(Receipt, {
        where: { id, user_id: user.id },
        lock: { mode: "pessimistic_write" },
      });

      if (!receipt) {
        throw ApiErrors.RECEIPT_NOT_FOUND(id);
      }

      if (receipt.status === ReceiptStatus.VOID) {
        throw ApiErrors.BAD_REQUEST(`Receipt ${id} is already voided`);
      }

      // Void the receipt and revoke any public share link (immutable update)
      await manager.update(
        Receipt,
        { id: receipt.id, user_id: user.id },
        {
          status: ReceiptStatus.VOID,
          voided_at: new Date(),
          void_reason: reason,
          public_token: null,
          replacement_status: null,
          replacement_error: null,
          pending_id: null,
          pending_snapshot: null,
          pending_html: null,
          pending_logo_asset_id: null,
          pending_expected_revision: null,
        },
      );
      const savedReceipt = await manager.findOneOrFail(Receipt, {
        where: { id: receipt.id, user_id: user.id },
        relations: ["order"],
      });

      // Unlock the order so it can be modified again
      await manager.update(
        Order,
        { id: receipt.order_id, user_id: user.id },
        { is_locked: false },
      );

      this.logger.log(
        `Receipt ${receipt.number} voided. Order ${receipt.order_id} unlocked.`,
      );

      return savedReceipt;
    });
  }

  async findAll(
    user: User,
    options?: { offset?: number; limit?: number },
  ): Promise<{
    data: Receipt[];
    total: number;
    offset: number;
    limit: number;
  }> {
    const offset = options?.offset ?? 0;
    const limit = Math.min(options?.limit ?? 20, 100);

    const [data, total] = await this.receiptsRepository.findAndCount({
      where: { user_id: user.id },
      relations: ["order", "order.recipient"],
      order: { created_at: "DESC" },
      skip: offset,
      take: limit,
    });

    return { data, total, offset, limit };
  }

  /**
   * How close the account is to the retention cap and which receipt the next one would
   * replace, so the UI can ask before an old receipt (and its public link) disappears.
   */
  async getRetention(user: User): Promise<{
    limit: number;
    count: number;
    replaces: { id: string; number: string; order_id: string } | null;
  }> {
    const where = { user_id: user.id, status: ReceiptStatus.GENERATED };
    const count = await this.receiptsRepository.count({ where });
    if (count < this.MAX_RECEIPTS) {
      return { limit: this.MAX_RECEIPTS, count, replaces: null };
    }

    const oldest = await this.receiptsRepository.findOne({
      where,
      order: { created_at: "ASC", id: "ASC" },
    });
    return {
      limit: this.MAX_RECEIPTS,
      count,
      replaces: oldest
        ? { id: oldest.id, number: oldest.number, order_id: oldest.order_id }
        : null,
    };
  }

  async findOne(id: string, user: User): Promise<Receipt> {
    const receipt = await this.receiptsRepository.findOne({
      where: { id, user_id: user.id },
      relations: ["order", "order.recipient", "order.items"],
    });
    if (!receipt) {
      throw ApiErrors.RECEIPT_NOT_FOUND(id);
    }
    return receipt;
  }

  async getReceiptPdf(
    id: string,
    user: User,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const receipt = await this.findOne(id, user);

    const filename = `receipt-${receipt.number}.pdf`;
    if (!receipt.pdf_path)
      return {
        buffer: await this.artifacts.repair(receipt.id, user.id),
        filename,
      };
    if (receipt.pdf_path.startsWith("object-storage://")) {
      const parsed = this.pdfStorageService.parseObjectStoragePath(
        receipt.pdf_path,
      );
      if (!parsed)
        throw ApiErrors.VALIDATION_ERROR("pdf_path", "Invalid stored PDF path");
      if (await this.pdfStorageService.fileExists(parsed.bucket, parsed.key)) {
        return {
          buffer: await this.pdfStorageService.downloadFile(
            parsed.bucket,
            parsed.key,
          ),
          filename,
        };
      }
    } else {
      try {
        return { buffer: await fs.readFile(receipt.pdf_path), filename };
      } catch (error) {
        if (
          !(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          throw error;
      }
    }
    this.logger.warn(
      `PDF missing for ${receipt.id}; repairing from frozen content`,
    );
    return {
      buffer: await this.artifacts.repair(receipt.id, user.id),
      filename,
    };
  }

  async regenerateReceiptPdf(
    id: string,
    user: User,
    input: {
      mode?: "reproduce" | "replace";
      expectedActiveRevision?: number;
      confirmReconstruction?: boolean;
      selection?: ConfigSelection;
    } = {},
    file?: Express.Multer.File,
  ): Promise<Receipt> {
    const original = await this.snapshots.internal(id, user.id);
    if (
      ![ReceiptStatus.GENERATED, ReceiptStatus.FAILED].includes(original.status)
    )
      throw new ConflictException("Document is not ready for replacement");
    const revision = original.active_revision || 0;
    if (
      input.expectedActiveRevision !== undefined &&
      input.expectedActiveRevision !== revision
    )
      throw new ConflictException("Document changed. Reload before replacing.");
    const mode = input.mode || "reproduce";
    if (mode === "replace" && input.expectedActiveRevision === undefined)
      throw new ConflictException("Expected active revision is required");
    if (
      mode === "replace" &&
      !original.active_snapshot?.order &&
      !original.pending_snapshot?.order &&
      !input.confirmReconstruction
    )
      throw new ConflictException({
        errorCode: "RECONSTRUCTION_REQUIRED",
        message:
          "Confirm reconstruction with current transaction data; historical fidelity is unavailable.",
      });
    const prepared =
      mode === "replace"
        ? await this.snapshots.prepare(
            user.id,
            original.order_id,
            original.number,
            input.selection || { logoAction: "keep" },
            file,
            original.active_snapshot?.order || original.pending_snapshot?.order,
          )
        : undefined;
    if (
      prepared &&
      !original.active_snapshot?.order &&
      !original.pending_snapshot?.order
    )
      prepared.snapshot = { ...prepared.snapshot, reconstructed: true };
    const frozen =
      prepared ||
      (original.pending_snapshot &&
      original.pending_html &&
      (original.replacement_status === "failed" ||
        original.status === ReceiptStatus.FAILED)
        ? { html: original.pending_html, snapshot: original.pending_snapshot }
        : this.snapshots.active(original));
    const result = await this.dataSource.transaction(async (manager) => {
      if (prepared) {
        const order = await this.snapshots.validatePrepared(
          user.id,
          original.order_id,
          prepared,
          manager,
        );
        if (original.status === ReceiptStatus.GENERATED && !order.is_locked)
          throw new ConflictException(
            "Order must remain locked during replacement",
          );
      }
      const receipt = await manager.findOne(Receipt, {
        where: { id, user_id: user.id },
        lock: { mode: "pessimistic_write" },
      });
      if (
        !receipt ||
        receipt.status !== original.status ||
        (receipt.active_revision || 0) !== revision ||
        receipt.generation_id !== original.generation_id ||
        receipt.replacement_status === "processing"
      )
        throw new ConflictException(
          "Document changed or replacement is running. Reload before replacing.",
        );
      const generationId = crypto.randomUUID();
      await manager.update(
        Receipt,
        { id, user_id: user.id },
        {
          ...this.snapshots.candidate(frozen, revision),
          generation_id: generationId,
          generation_started_at: new Date(),
          ...(receipt.status === ReceiptStatus.GENERATED
            ? {
                replacement_status: "processing" as const,
                replacement_error: null,
              }
            : {
                status: ReceiptStatus.PROCESSING,
                progress: 0,
                error_message: null,
              }),
        },
      );
      await manager.save(
        ReceiptGenerationOutbox,
        manager.create(ReceiptGenerationOutbox, {
          id: crypto.randomUUID(),
          receipt_id: id,
          order_id: receipt.order_id,
          user_id: user.id,
          generation_id: generationId,
          published_at: null,
        }),
      );
      return manager.findOneOrFail(Receipt, {
        where: { id, user_id: user.id },
      });
    });
    void this.receiptOutbox.dispatch();
    return result;
  }

  private async generateReceiptNumber(manager: EntityManager): Promise<string> {
    const result: Array<{ receipt_number: string }> = await manager.query(
      "SELECT generate_receipt_number() as receipt_number",
    );
    return result[0].receipt_number;
  }

  /** Retire immutable keys transactionally; the scheduled collector handles storage after grace. */
  private async cleanupOldReceipts(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const total = await manager.count(Receipt, {
      where: { status: ReceiptStatus.GENERATED, user_id: userId },
    });
    if (total < this.MAX_RECEIPTS) return;
    const old = await manager.find(Receipt, {
      where: { user_id: userId, status: ReceiptStatus.GENERATED },
      select: [
        "id",
        "user_id",
        "pdf_path",
        "active_logo_asset_id",
        "pending_logo_asset_id",
      ],
      order: { created_at: "ASC", id: "ASC" },
      take: total - (this.MAX_RECEIPTS - 1),
    });
    const locked = await this.artifacts.lockRetirements(old, userId, manager);
    for (const receipt of locked) await this.artifacts.retire(receipt, manager);
    for (const receipt of locked)
      await manager.delete(Receipt, {
        id: receipt.id,
        user_id: userId,
        status: ReceiptStatus.GENERATED,
      });
  }

  async getAvailablePrinters(): Promise<{ printers: string[] }> {
    try {
      const platform = process.platform;
      let stdout: string;

      if (platform === "darwin" || platform === "linux") {
        const result = await execFileAsync("lpstat", ["-p"]);
        stdout = result.stdout;
        // Parse "printer <name> ..." lines
        const printers = stdout
          .split("\n")
          .filter((line) => line.includes("printer"))
          .map((line) => line.split(/\s+/)[1])
          .filter((name) => name && name.length > 0);
        return { printers };
      } else if (platform === "win32") {
        const result = await execFileAsync("powershell", [
          "-Command",
          "Get-Printer | Select-Object -ExpandProperty Name",
        ]);
        stdout = result.stdout;
        const printers = stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        return { printers };
      }

      return { printers: [] };
    } catch (error) {
      this.logger.error("Error getting printers:", error);
      return { printers: [] };
    }
  }

  async printReceipt(
    receiptId: string,
    user: User,
    printerName?: string,
  ): Promise<{ success: boolean; message: string }> {
    let tempFilePath: string | null = null;

    try {
      const receipt = await this.findOne(receiptId, user);

      if (!receipt.pdf_path) {
        throw ApiErrors.FILE_NOT_FOUND(receiptId);
      }

      // Проверяем существование файла
      try {
        if (receipt.pdf_path.startsWith("object-storage://")) {
          const parsed = this.pdfStorageService.parseObjectStoragePath(
            receipt.pdf_path,
          );
          if (!parsed) {
            throw ApiErrors.VALIDATION_ERROR(
              "pdf_path",
              `Invalid object storage path: ${receipt.pdf_path}`,
            );
          }
          const exists = await this.pdfStorageService.fileExists(
            parsed.bucket,
            parsed.key,
          );
          if (!exists) {
            throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
          }
        } else {
          await fs.access(receipt.pdf_path);
        }
      } catch {
        throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
      }

      let filePathToPrint = receipt.pdf_path;

      if (receipt.pdf_path.startsWith("object-storage://")) {
        const parsed = this.pdfStorageService.parseObjectStoragePath(
          receipt.pdf_path,
        );
        if (!parsed) {
          throw ApiErrors.VALIDATION_ERROR(
            "pdf_path",
            `Invalid object storage path: ${receipt.pdf_path}`,
          );
        }

        const fileBuffer = await this.pdfStorageService.downloadFile(
          parsed.bucket,
          parsed.key,
        );
        tempFilePath = path.join(
          process.cwd(),
          "temp",
          `receipt-${receipt.number}-${Date.now()}.pdf`,
        );

        await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
        await fs.writeFile(tempFilePath, fileBuffer);
        filePathToPrint = tempFilePath;
      }

      // Validate printer name to prevent injection
      if (printerName && !SAFE_PRINTER_NAME.test(printerName)) {
        throw ApiErrors.VALIDATION_ERROR(
          "printer",
          "Invalid printer name. Only alphanumeric characters, hyphens, underscores, dots, and spaces are allowed.",
        );
      }

      const platform = process.platform;
      let cmd: string;
      let args: string[];

      if (platform === "darwin") {
        cmd = "lpr";
        args = printerName
          ? ["-P", printerName, filePathToPrint]
          : [filePathToPrint];
      } else if (platform === "linux") {
        cmd = "lp";
        args = printerName
          ? ["-d", printerName, filePathToPrint]
          : [filePathToPrint];
      } else if (platform === "win32") {
        cmd = "powershell";
        args = [
          "-Command",
          `Start-Process -FilePath '${filePathToPrint.replace(/'/g, "''")}' -Verb Print -WindowStyle Hidden`,
        ];
      } else {
        throw ApiErrors.BAD_REQUEST(
          `Unsupported operating system: ${platform}`,
        );
      }

      this.logger.log(
        `Printing receipt ${receipt.number} via ${cmd} ${args.join(" ")}`,
      );
      const { stderr } = await execFileAsync(cmd, args);

      if (stderr && !stderr.includes("warning")) {
        this.logger.error("Print command stderr:", stderr);
        throw ApiErrors.RECEIPT_PRINT_FAILED(receiptId);
      }

      this.logger.log(`Receipt ${receipt.number} sent to printer successfully`);
      return {
        success: true,
        message: `Чек ${receipt.number} отправлен на печать${printerName ? ` (принтер: ${printerName})` : ""}`,
      };
    } catch (error) {
      this.logger.error("Error printing receipt:", error);
      return {
        success: false,
        message: "Ошибка при печати чека. Попробуйте ещё раз.",
      };
    } finally {
      // Always clean up temp file, even on error
      if (tempFilePath) {
        fs.unlink(tempFilePath).catch((err) => {
          this.logger.warn(
            `Failed to delete temporary file ${tempFilePath}: ${err.message}`,
          );
        });
      }
    }
  }

  async generatePublicToken(
    receiptId: string,
    user: User,
  ): Promise<{ token: string; url: string }> {
    const receipt = await this.receiptsRepository.findOne({
      where: { id: receiptId, user_id: user.id },
    });

    if (!receipt) {
      throw ApiErrors.RECEIPT_NOT_FOUND(receiptId);
    }

    if (receipt.status !== ReceiptStatus.GENERATED) {
      throw ApiErrors.BAD_REQUEST(
        "Only generated receipts can be shared publicly",
      );
    }

    const frontendUrl = this.configService.get<string>(
      "FRONTEND_URL",
      "http://localhost:5173",
    );

    // If already has a token, return it
    if (receipt.public_token) {
      return {
        token: receipt.public_token,
        url: `${frontendUrl}/r/${receipt.public_token}`,
      };
    }

    const token = crypto.randomBytes(32).toString("hex");

    const updated = await this.receiptsRepository.update(
      {
        id: receipt.id,
        user_id: user.id,
        status: ReceiptStatus.GENERATED,
        public_token: IsNull(),
      },
      { public_token: token },
    );
    if (updated.affected) return { token, url: `${frontendUrl}/r/${token}` };
    const current = await this.receiptsRepository.findOne({
      where: {
        id: receipt.id,
        user_id: user.id,
        status: ReceiptStatus.GENERATED,
      },
    });
    if (!current?.public_token)
      throw ApiErrors.BAD_REQUEST("Receipt changed while creating share link");
    return {
      token: current.public_token,
      url: `${frontendUrl}/r/${current.public_token}`,
    };
  }

  async revokePublicToken(receiptId: string, user: User): Promise<Receipt> {
    const receipt = await this.receiptsRepository.findOne({
      where: { id: receiptId, user_id: user.id },
    });

    if (!receipt) {
      throw ApiErrors.RECEIPT_NOT_FOUND(receiptId);
    }

    await this.receiptsRepository.update(
      { id: receiptId },
      { public_token: null },
    );

    this.logger.log(`Public token revoked for receipt ${receipt.number}`);

    return this.receiptsRepository.findOneOrFail({
      where: { id: receiptId },
    });
  }

  async getPublicReceipt(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw ApiErrors.NOT_FOUND("Receipt");
    return runWithPublicToken(token, () => this.findPublicReceipt(token));
  }

  private async findPublicReceipt(token: string) {
    const receipt = await this.receiptsRepository
      .createQueryBuilder("r")
      .addSelect("r.active_snapshot")
      .where("r.public_token=:token AND r.status=:status", {
        token,
        status: ReceiptStatus.GENERATED,
      })
      .getOne();
    if (!receipt) throw ApiErrors.NOT_FOUND("Receipt");
    const projection = receipt.active_snapshot?.publicProjection;
    return {
      receipt: {
        id: receipt.id,
        number: receipt.number,
        status: receipt.status,
        created_at: receipt.created_at,
        order: projection?.order || null,
      },
      companyInfo: projection?.companyInfo || {},
      formatting: projection?.formatting,
      documentLanguage: projection?.documentLanguage,
      money: projection?.money,
      metadataUnavailable: !projection,
    };
  }

  async getPublicReceiptPdf(
    token: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw ApiErrors.NOT_FOUND("Receipt");
    return runWithPublicToken(token, () => this.findPublicReceiptPdf(token));
  }

  private async findPublicReceiptPdf(
    token: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const receipt = await this.receiptsRepository.findOne({
      where: { public_token: token, status: ReceiptStatus.GENERATED },
    });

    if (!receipt) {
      throw ApiErrors.NOT_FOUND("Receipt");
    }

    if (!receipt.pdf_path) {
      throw ApiErrors.FILE_NOT_FOUND("receipt PDF");
    }

    let buffer: Buffer;

    if (receipt.pdf_path.startsWith("object-storage://")) {
      const parsed = this.pdfStorageService.parseObjectStoragePath(
        receipt.pdf_path,
      );
      if (!parsed) {
        throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
      }
      const exists = await this.pdfStorageService.fileExists(
        parsed.bucket,
        parsed.key,
      );
      if (!exists) {
        throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
      }
      buffer = await this.pdfStorageService.downloadFile(
        parsed.bucket,
        parsed.key,
      );
    } else {
      await fs.access(receipt.pdf_path);
      buffer = await fs.readFile(receipt.pdf_path);
    }

    const filename = `receipt-${receipt.number}.pdf`;
    return { buffer, filename };
  }

  async deleteReceiptFilesForOrder(
    orderId: string,
    userId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Same tenant -> order -> receipts -> assets order as creation/promotion.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
        [userId],
      );
      await manager.findOne(Order, {
        where: { id: orderId, user_id: userId },
        lock: { mode: "pessimistic_write" },
      });
      const receipts = await manager.find(Receipt, {
        where: { order_id: orderId, user_id: userId },
        select: [
          "id",
          "user_id",
          "pdf_path",
          "active_logo_asset_id",
          "pending_logo_asset_id",
        ],
      });
      const locked = await this.artifacts.lockRetirements(
        receipts,
        userId,
        manager,
        false,
      );
      for (const receipt of locked) {
        await this.artifacts.retire(receipt, manager);
        await manager.delete(Receipt, {
          id: receipt.id,
          user_id: receipt.user_id,
        });
      }
    });
  }
}
