import {
  Injectable,
  NotFoundException,
  // ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { Product } from "./entities/product.entity";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { User } from "../users/entities/user.entity";

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async create(createProductDto: CreateProductDto, user: User): Promise<Product> {
    const product = this.productsRepository.create({
      ...createProductDto,
      user_id: user.id,
    });
    return this.productsRepository.save(product);
  }

  async findAll(
    pagination: PaginationDto,
    user: User,
  ): Promise<{ data: Product[]; total: number }> {
    const [data, total] = await this.productsRepository
      .createQueryBuilder("product")
      .where("product.user_id = :userId", { userId: user.id })
      .orderBy("product.created_at", "DESC")
      .skip(pagination.offset)
      .take(pagination.limit)
      .getManyAndCount();

    return { data, total };
  }

  async findOne(id: string, user: User): Promise<Product> {
    const product = await this.productsRepository.findOne({ 
      where: { id, user_id: user.id } 
    });
    if (!product) {
      throw new NotFoundException("Товар не найден");
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
      throw new BadRequestException(
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
}
