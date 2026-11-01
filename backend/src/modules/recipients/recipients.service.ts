import { Injectable } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository } from "@nestjs/typeorm";
import { Raw, Repository } from "typeorm";
import { Recipient } from "./entities/recipient.entity";
import { Order } from "../orders/entities/order.entity";
import { CreateRecipientDto } from "./dto/create-recipient.dto";
import { UpdateRecipientDto } from "./dto/update-recipient.dto";
import { PaginationDto, SortOrder } from "../../common/dto/pagination.dto";
import { PaginatedResponse } from "../../common/interfaces/paginated-response.interface";
import { User } from "../users/entities/user.entity";
import { normalizeEmail } from "../../common/dto/normalized-email";
import { containsPattern } from "../../common/utils/like-pattern.util";
import {
  IdempotentCreateResult,
  createIdempotently,
} from "../../common/idempotency/idempotent-create";
import { assertNoNullForRequiredFields } from "../../common/utils/null-fields.util";

const RECIPIENT_SORTABLE_COLUMNS: Record<string, string> = {
  name: "recipient.name",
  email: "recipient.email",
  phone: "recipient.phone",
  created_at: "recipient.created_at",
};

/** null clears these nullable contact columns; name is NOT NULL. */
const CLEARABLE_FIELDS: ReadonlySet<string> = new Set([
  "email",
  "phone",
  "address",
]);

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
    await this.assertEmailAvailable(createRecipientDto.email, user);
    const recipient = this.recipientsRepository.create({
      ...createRecipientDto,
      user_id: user.id,
    });
    return this.recipientsRepository.save(recipient);
  }

  private async assertEmailAvailable(
    email: string | undefined,
    user: User,
    excludeRecipientId?: string,
  ): Promise<void> {
    if (!email) return;

    const duplicate = await this.recipientsRepository.findOne({
      where: {
        user_id: user.id,
        email: Raw((alias) => `LOWER(${alias}) = :email`, {
          email: normalizeEmail(email),
        }),
      },
    });

    if (duplicate && duplicate.id !== excludeRecipientId) {
      throw ApiErrors.RECIPIENT_ALREADY_EXISTS(email);
    }
  }

  /** A repeated Idempotency-Key replays the first create instead of adding a duplicate. */
  async createWithIdempotencyKey(
    createRecipientDto: CreateRecipientDto,
    user: User,
    idempotencyKey: string,
  ): Promise<IdempotentCreateResult<Recipient>> {
    return this.recipientsRepository.manager.transaction((manager) =>
      createIdempotently(
        manager,
        { scope: "recipient", key: idempotencyKey, userId: user.id },
        () =>
          manager.save(
            manager.create(Recipient, {
              ...createRecipientDto,
              user_id: user.id,
            }),
          ),
      ),
    );
  }

  async findAll(
    pagination: PaginationDto,
    user: User,
  ): Promise<
    PaginatedResponse<
      Recipient & { total_spent_cents: number; order_count: number }
    >
  > {
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
        { search: containsPattern(search) },
      );
    }

    const sortColumn =
      RECIPIENT_SORTABLE_COLUMNS[sortBy] || "recipient.created_at";
    const direction = sortOrder === SortOrder.ASC ? "ASC" : "DESC";
    queryBuilder.orderBy(sortColumn, direction);

    const raw = await queryBuilder
      .offset(offset)
      .limit(limit)
      .getRawAndEntities();
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
    assertNoNullForRequiredFields(updateRecipientDto, CLEARABLE_FIELDS);
    const recipient = await this.findOne(id, user);
    await this.assertEmailAvailable(updateRecipientDto.email, user, id);
    Object.assign(recipient, updateRecipientDto);
    return this.recipientsRepository.save(recipient);
  }

  async remove(id: string, user: User): Promise<void> {
    const recipient = await this.findOne(id, user);

    // orders.recipient_id cascades, so a soft-deleted order counts too: deleting
    // past it would purge kept history, or fail on its receipt's foreign key.
    const hasOrders = await this.recipientsRepository.manager.exists(Order, {
      where: { recipient_id: id, user_id: user.id },
      withDeleted: true,
    });

    if (hasOrders) {
      throw ApiErrors.RECIPIENT_HAS_ORDERS(id);
    }

    await this.recipientsRepository.remove(recipient);
  }
}
