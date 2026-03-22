import { Injectable } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Product } from "./entities/product.entity";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { PaginationDto, SortOrder } from "../../common/dto/pagination.dto";
import { PaginatedResponse } from "../../common/interfaces/paginated-response.interface";
import { User } from "../users/entities/user.entity";
import { SubscriptionService } from "../subscription/subscription.service";

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
    private subscriptionService: SubscriptionService,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    user: User,
  ): Promise<Product> {
    await this.subscriptionService.assertCanCreateProduct(user.id);

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
