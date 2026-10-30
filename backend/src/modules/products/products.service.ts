import { Injectable } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { Product, Currency } from "./entities/product.entity";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { InventoryValueDto } from "./dto/inventory-value.dto";
import { PaginationDto, SortOrder } from "../../common/dto/pagination.dto";
import { PaginatedResponse } from "../../common/interfaces/paginated-response.interface";
import { User } from "../users/entities/user.entity";
import { SubscriptionService } from "../subscription/subscription.service";
import {
  IdempotentCreateResult,
  createIdempotently,
} from "../../common/idempotency/idempotent-create";

const PRODUCT_SORTABLE_COLUMNS: Record<string, string> = {
  name: "product.name",
  purchase_price_cents: "product.purchase_price_cents",
  sale_price_cents: "product.sale_price_cents",
  quantity: "product.quantity",
  created_at: "product.created_at",
};

type ProductChanges = Omit<UpdateProductDto, "expectedQuantity">;

/** Stock is never written blind: quantity and expectedQuantity travel together. */
function assertStockPrecondition(
  quantity: number | undefined,
  expectedQuantity: number | undefined,
): void {
  if (quantity === undefined && expectedQuantity === undefined) return;
  if (typeof quantity !== "number" || typeof expectedQuantity !== "number") {
    throw ApiErrors.VALIDATION_ERROR(
      "expectedQuantity",
      "quantity and expectedQuantity must be sent together",
    );
  }
}

/** Every column except supplier_id is NOT NULL, so only it may be cleared. */
const CLEARABLE_FIELDS: ReadonlySet<string> = new Set(["supplier_id"]);

/** `@IsOptional` lets null through the DTO; reject it here instead of a 500. */
function assertNoNullForRequiredFields(fields: ProductChanges): void {
  const cleared = Object.entries(fields).find(
    ([key, value]) => value === null && !CLEARABLE_FIELDS.has(key),
  );
  if (cleared) {
    throw ApiErrors.VALIDATION_ERROR(
      cleared[0],
      `${cleared[0]} cannot be null`,
    );
  }
}

/** Absent fields are left alone; an explicit null (supplier_id only) is kept. */
function presentFields(fields: ProductChanges): Partial<Product> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<Product>;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    private subscriptionService: SubscriptionService,
  ) {}

  /**
   * The quota check and the insert commit together. The transaction takes only
   * the tenant's product-quota advisory lock, so it cannot deadlock with order
   * or receipt transactions that hold other tenant locks.
   */
  async create(
    createProductDto: CreateProductDto,
    user: User,
  ): Promise<Product> {
    return this.productsRepository.manager.transaction((manager) =>
      this.insertWithinQuota(manager, createProductDto, user),
    );
  }

  /**
   * A repeated Idempotency-Key replays the first create instead of adding a
   * duplicate. The key lock comes before the product-quota lock (as for order
   * create), so a replay still succeeds once the plan limit is reached.
   */
  async createWithIdempotencyKey(
    createProductDto: CreateProductDto,
    user: User,
    idempotencyKey: string,
  ): Promise<IdempotentCreateResult<Product>> {
    return this.productsRepository.manager.transaction((manager) =>
      createIdempotently(
        manager,
        { scope: "product", key: idempotencyKey, userId: user.id },
        () => this.insertWithinQuota(manager, createProductDto, user),
      ),
    );
  }

  private async insertWithinQuota(
    manager: EntityManager,
    createProductDto: CreateProductDto,
    user: User,
  ): Promise<Product> {
    await this.subscriptionService.assertCanCreateProductInTx(manager, user.id);
    const product = manager.create(Product, {
      ...createProductDto,
      user_id: user.id,
    });
    return manager.save(product);
  }

  async findAll(
    pagination: PaginationDto,
    user: User,
  ): Promise<PaginatedResponse<Product>> {
    const {
      offset = 0,
      limit = 10,
      search,
      sortBy,
      sortOrder = SortOrder.DESC,
    } = pagination;

    const queryBuilder = this.productsRepository
      .createQueryBuilder("product")
      .where("product.user_id = :userId", { userId: user.id });

    if (search && search.trim()) {
      queryBuilder.andWhere("product.name ILIKE :search", {
        search: `%${search.trim()}%`,
      });
    }

    const sortColumn = PRODUCT_SORTABLE_COLUMNS[sortBy] || "product.created_at";
    const direction = sortOrder === SortOrder.ASC ? "ASC" : "DESC";
    queryBuilder.orderBy(sortColumn, direction);

    const [data, total] = await queryBuilder
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { data, total, offset, limit };
  }

  async findOne(id: string, user: User): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id, user_id: user.id },
    });
    if (!product) {
      throw ApiErrors.PRODUCT_NOT_FOUND(id);
    }
    return product;
  }

  /**
   * Writes only the columns present in the body in one conditional UPDATE, so a
   * stale form cannot replay a full entity over stock changed by orders. A sent
   * quantity applies only while the stored stock still equals expectedQuantity;
   * an UPDATE parked behind an order's row lock re-checks after that commit.
   */
  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    user: User,
  ): Promise<Product> {
    const { expectedQuantity, ...fields } = updateProductDto;
    assertNoNullForRequiredFields(fields);
    assertStockPrecondition(fields.quantity, expectedQuantity);
    const changes = presentFields(fields);
    if (Object.keys(changes).length === 0) return this.findOne(id, user);

    const query = this.productsRepository
      .createQueryBuilder()
      .update(Product)
      .set(changes)
      .where("id = :id", { id })
      .andWhere("user_id = :userId", { userId: user.id })
      .andWhere("deleted_at IS NULL");
    if (expectedQuantity !== undefined) {
      query.andWhere("quantity = :expectedQuantity", { expectedQuantity });
    }
    const { affected } = await query.execute();
    if (!affected) {
      // A missing or soft-deleted row is a 404; an existing one lost the race.
      await this.findOne(id, user);
      throw ApiErrors.PRODUCT_QUANTITY_CONFLICT(id);
    }
    return this.findOne(id, user);
  }

  async remove(id: string, user: User): Promise<void> {
    await this.findOne(id, user);
    await this.productsRepository.softDelete({ id, user_id: user.id });
  }

  async removeBulk(
    ids: string[],
    user: User,
  ): Promise<{ deleted: number; skipped: string[] }> {
    const skipped: string[] = [];
    let deleted = 0;

    for (const id of ids) {
      try {
        await this.remove(id, user);
        deleted++;
      } catch {
        skipped.push(id);
      }
    }

    return { deleted, skipped };
  }

  /**
   * Total worth of everything in stock for a user — at both cost and retail
   * price. Soft-deleted products are excluded automatically by TypeORM.
   * All products share one currency (UAH), so a single total is returned.
   */
  async getInventoryValue(user: User): Promise<InventoryValueDto> {
    const raw = await this.productsRepository
      .createQueryBuilder("product")
      .select(
        "COALESCE(SUM(product.quantity * product.purchase_price_cents), 0)",
        "purchaseValueCents",
      )
      .addSelect(
        "COALESCE(SUM(product.quantity * product.sale_price_cents), 0)",
        "saleValueCents",
      )
      .addSelect("COALESCE(SUM(product.quantity), 0)", "totalUnits")
      .addSelect("COUNT(*)", "productCount")
      .where("product.user_id = :userId", { userId: user.id })
      .getRawOne<{
        purchaseValueCents: string;
        saleValueCents: string;
        totalUnits: string;
        productCount: string;
      }>();

    return {
      currency: Currency.UAH,
      purchaseValueCents: Number(raw?.purchaseValueCents ?? 0),
      saleValueCents: Number(raw?.saleValueCents ?? 0),
      totalUnits: Number(raw?.totalUnits ?? 0),
      productCount: Number(raw?.productCount ?? 0),
    };
  }

  async getLowStockProducts(
    user: User,
    threshold: number = 10,
    limit: number = 50,
  ): Promise<Product[]> {
    return this.productsRepository
      .createQueryBuilder("product")
      .where("product.user_id = :userId", { userId: user.id })
      .andWhere("product.quantity <= :threshold", { threshold })
      .orderBy("product.quantity", "ASC")
      .take(Math.min(limit, 100))
      .getMany();
  }
}
