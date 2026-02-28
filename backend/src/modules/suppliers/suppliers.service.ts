import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Supplier } from "./entities/supplier.entity";
import { Product } from "../products/entities/product.entity";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";
import { PaginationDto, SortOrder } from "../../common/dto/pagination.dto";
import { PaginatedResponse } from "../../common/interfaces/paginated-response.interface";
import { ApiErrors } from "../../common/errors/ApiError";
import { User } from "../users/entities/user.entity";

const SUPPLIER_SORTABLE_COLUMNS: Record<string, string> = {
  name: "supplier.name",
  email: "supplier.email",
  contact_person: "supplier.contact_person",
  created_at: "supplier.created_at",
};

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private suppliersRepository: Repository<Supplier>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
  ) {}

  async create(
    createSupplierDto: CreateSupplierDto,
    user: User,
  ): Promise<Supplier> {
    const { productIds, contactPerson, ...rest } = createSupplierDto;

    const supplier = this.suppliersRepository.create({
      ...rest,
      contact_person: contactPerson,
      user_id: user.id,
    });

    if (productIds?.length) {
      supplier.products = await this.productsRepository.findBy({
        id: In(productIds),
        user_id: user.id,
      });
    }

    return this.suppliersRepository.save(supplier);
  }

  async findAll(
    pagination: PaginationDto,
    user: User,
  ): Promise<PaginatedResponse<Supplier & { product_count: number }>> {
    const {
      offset = 0,
      limit = 10,
      search,
      sortBy,
      sortOrder = SortOrder.DESC,
    } = pagination;

    const queryBuilder = this.suppliersRepository
      .createQueryBuilder("supplier")
      .leftJoin("supplier.products", "product")
      .addSelect("COUNT(product.id)", "product_count")
      .where("supplier.user_id = :userId", { userId: user.id })
      .groupBy("supplier.id");

    if (search?.trim()) {
      queryBuilder.andWhere(
        "(supplier.name ILIKE :search OR supplier.email ILIKE :search OR supplier.contact_person ILIKE :search)",
        { search: `%${search.trim()}%` },
      );
    }

    const sortColumn =
      SUPPLIER_SORTABLE_COLUMNS[sortBy] || "supplier.created_at";
    const direction = sortOrder === SortOrder.ASC ? "ASC" : "DESC";
    queryBuilder.orderBy(sortColumn, direction);

    const total = await queryBuilder.getCount();

    const raw = await queryBuilder
      .offset(offset)
      .limit(limit)
      .getRawAndEntities();

    const data = raw.entities.map((entity, i) => ({
      ...entity,
      product_count: parseInt(raw.raw[i]?.product_count || "0", 10),
    }));

    return { data, total, offset, limit };
  }

  async findOne(id: string, user: User): Promise<Supplier> {
    const supplier = await this.suppliersRepository.findOne({
      where: { id, user_id: user.id },
      relations: ["products"],
    });

    if (!supplier) {
      throw ApiErrors.SUPPLIER_NOT_FOUND(id);
    }

    return supplier;
  }

  async update(
    id: string,
    updateSupplierDto: UpdateSupplierDto,
    user: User,
  ): Promise<Supplier> {
    const supplier = await this.findOne(id, user);
    const { productIds, contactPerson, ...rest } = updateSupplierDto;

    Object.assign(supplier, rest);

    if (contactPerson !== undefined) {
      supplier.contact_person = contactPerson;
    }

    if (productIds !== undefined) {
      supplier.products = productIds.length
        ? await this.productsRepository.findBy({
            id: In(productIds),
            user_id: user.id,
          })
        : [];
    }

    return this.suppliersRepository.save(supplier);
  }

  async remove(id: string, user: User): Promise<void> {
    const supplier = await this.findOne(id, user);
    await this.suppliersRepository.remove(supplier);
  }
}
