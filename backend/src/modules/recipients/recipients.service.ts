import { Injectable } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Recipient } from "./entities/recipient.entity";
import { CreateRecipientDto } from "./dto/create-recipient.dto";
import { UpdateRecipientDto } from "./dto/update-recipient.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { User } from "../users/entities/user.entity";

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
  ): Promise<{ data: Recipient[]; total: number }> {
    const [data, total] = await this.recipientsRepository.findAndCount({
      where: { user_id: user.id },
      order: { created_at: "DESC" },
      skip: pagination.offset,
      take: pagination.limit,
    });

    return { data, total };
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
