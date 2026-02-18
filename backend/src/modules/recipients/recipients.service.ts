import { Injectable } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Recipient } from "./entities/recipient.entity";
import { CreateRecipientDto } from "./dto/create-recipient.dto";
import { UpdateRecipientDto } from "./dto/update-recipient.dto";
import { PaginationDto, SortOrder } from "../../common/dto/pagination.dto";
import { PaginatedResponse } from "../../common/interfaces/paginated-response.interface";
import { User } from "../users/entities/user.entity";

const RECIPIENT_SORTABLE_COLUMNS: Record<string, string> = {
  name: "recipient.name",
  email: "recipient.email",
  phone: "recipient.phone",
  created_at: "recipient.created_at",
};

@Injectable()
export class RecipientsService {
  constructor(
    @InjectRepository(Recipient)
    private recipientsRepository: Repository<Recipient>,
  ) {}

  async create(
    createRecipientDto: CreateRecipientDto,
    user: User,
  ): Promise<Recipient> {
    const recipient = this.recipientsRepository.create({
      ...createRecipientDto,
      user_id: user.id,
    });
    return this.recipientsRepository.save(recipient);
  }

  async findAll(
    pagination: PaginationDto,
    user: User,
  ): Promise<PaginatedResponse<Recipient & { total_spent_cents: number; order_count: number }>> {
    const {
      offset = 0,
      limit = 10,
      search,
      sortBy,
      sortOrder = SortOrder.DESC,
    } = pagination;

    const queryBuilder = this.recipientsRepository
      .createQueryBuilder("recipient")
      .leftJoin("recipient.orders", "order", "order.status = :confirmed", {
        confirmed: "confirmed",
      })
      .addSelect("COALESCE(SUM(order.total_cents), 0)", "total_spent_cents")
      .addSelect("COUNT(order.id)", "order_count")
      .where("recipient.user_id = :userId", { userId: user.id })
      .groupBy("recipient.id");

    if (search && search.trim()) {
      queryBuilder.andWhere(
        "(recipient.name ILIKE :search OR recipient.email ILIKE :search OR recipient.phone ILIKE :search)",
        { search: `%${search.trim()}%` },
      );
    }

    const sortColumn =
      RECIPIENT_SORTABLE_COLUMNS[sortBy] || "recipient.created_at";
    const direction = sortOrder === SortOrder.ASC ? "ASC" : "DESC";
    queryBuilder.orderBy(sortColumn, direction);

    const raw = await queryBuilder.offset(offset).limit(limit).getRawAndEntities();
    const total = await queryBuilder.getCount();

    const data = raw.entities.map((entity, i) => ({
      ...entity,
      total_spent_cents: parseInt(raw.raw[i]?.total_spent_cents || "0", 10),
      order_count: parseInt(raw.raw[i]?.order_count || "0", 10),
    }));

    return { data, total, offset, limit };
  }

  async findOne(id: string, user: User): Promise<Recipient> {
    const recipient = await this.recipientsRepository.findOne({
      where: { id, user_id: user.id },
    });
    if (!recipient) {
      throw ApiErrors.RECIPIENT_NOT_FOUND(id);
    }
    return recipient;
  }

  async update(
    id: string,
    updateRecipientDto: UpdateRecipientDto,
    user: User,
  ): Promise<Recipient> {
    const recipient = await this.findOne(id, user);
    Object.assign(recipient, updateRecipientDto);
    return this.recipientsRepository.save(recipient);
  }

  async remove(id: string, user: User): Promise<void> {
    const recipient = await this.findOne(id, user);

    // Проверяем, есть ли у получателя заказы
    const ordersCount = await this.recipientsRepository
      .createQueryBuilder("recipient")
      .leftJoin("recipient.orders", "order")
      .where("recipient.id = :id", { id })
      .andWhere("order.id IS NOT NULL")
      .getCount();

    if (ordersCount > 0) {
      throw ApiErrors.BAD_REQUEST(
        "Нельзя удалить получателя, у которого есть заказы",
      );
    }

    await this.recipientsRepository.remove(recipient);
  }
}
