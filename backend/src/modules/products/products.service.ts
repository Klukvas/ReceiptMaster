import { Injectable } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { Product } from "./entities/product.entity";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { PaginationDto, SortOrder } from "../../common/dto/pagination.dto";
import { PaginatedResponse } from "../../common/interfaces/paginated-response.interface";
import { User } from "../users/entities/user.entity";

const PRODUCT_SORTABLE_COLUMNS: Record<string, string> = {
  name: "product.name",
  purchase_price_cents: "product.purchase_price_cents",
  sale_price_cents: "product.sale_price_cents",
  quantity: "product.quantity",
  created_at: "product.created_at",
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    user: User,
  ): Promise<Product> {
    const product = this.productsRepository.create({
      ...createProductDto,
      user_id: user.id,
    });
    return this.productsRepository.save(product);
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

    const sortColumn =
      PRODUCT_SORTABLE_COLUMNS[sortBy] || "product.created_at";
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

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    user: User,
  ): Promise<Product> {
    const product = await this.findOne(id, user);
    Object.assign(product, updateProductDto);
    return this.productsRepository.save(product);
  }

  async remove(id: string, user: User): Promise<void> {
    const _product = await this.findOne(id, user);

    // Проверяем, не используется ли товар в активных заказах
    const activeOrders = await this.dataSource.query(
      `
      SELECT COUNT(*) as count 
      FROM orders o 
      JOIN order_items oi ON o.id = oi.order_id 
      WHERE oi.product_id = $1 AND o.status = 'confirmed'
    `,
      [id],
    );

    if (parseInt(activeOrders[0].count) > 0) {
      throw ApiErrors.BAD_REQUEST(
        "Нельзя удалить товар, который используется в подтвержденных заказах",
      );
    }

    // Удаляем товар и связанные записи в транзакции
    await this.dataSource.transaction(async (manager) => {
      // Сначала удаляем все записи из order_items для этого товара
      await manager.query("DELETE FROM order_items WHERE product_id = $1", [
        id,
      ]);
      // Затем удаляем сам товар
      await manager.delete(Product, { id });
    });
  }

  async removeBulk(ids: string[], user: User): Promise<{ deleted: number; skipped: string[] }> {
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

  async getLowStockProducts(
    user: User,
    threshold: number = 10,
  ): Promise<Product[]> {
    return this.productsRepository
      .createQueryBuilder("product")
      .where("product.user_id = :userId", { userId: user.id })
      .andWhere("product.quantity <= :threshold", { threshold })
      .orderBy("product.quantity", "ASC")
      .getMany();
  }
}
