import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Recipient } from './entities/recipient.entity';
import { CreateRecipientDto } from './dto/create-recipient.dto';
import { UpdateRecipientDto } from './dto/update-recipient.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class RecipientsService {
  constructor(
    @InjectRepository(Recipient)
    private recipientsRepository: Repository<Recipient>,
  ) {}

  async create(createRecipientDto: CreateRecipientDto): Promise<Recipient> {
    const recipient = this.recipientsRepository.create(createRecipientDto);
    return this.recipientsRepository.save(recipient);
  }

  async findAll(pagination: PaginationDto): Promise<{ data: Recipient[]; total: number }> {
    const [data, total] = await this.recipientsRepository.findAndCount({
      order: { created_at: 'DESC' },
      skip: pagination.offset,
      take: pagination.limit,
    });

    return { data, total };
  }

  async findOne(id: string): Promise<Recipient> {
    const recipient = await this.recipientsRepository.findOne({ where: { id } });
    if (!recipient) {
      throw new NotFoundException('Получатель не найден');
    }
    return recipient;
  }

  async update(id: string, updateRecipientDto: UpdateRecipientDto): Promise<Recipient> {
    const recipient = await this.findOne(id);
    Object.assign(recipient, updateRecipientDto);
    return this.recipientsRepository.save(recipient);
  }

  async remove(id: string): Promise<void> {
    const recipient = await this.findOne(id);
    
    // Проверяем, есть ли у получателя заказы
    const ordersCount = await this.recipientsRepository
      .createQueryBuilder('recipient')
      .leftJoin('recipient.orders', 'order')
      .where('recipient.id = :id', { id })
      .andWhere('order.id IS NOT NULL')
      .getCount();
    
    if (ordersCount > 0) {
      throw new BadRequestException('Нельзя удалить получателя, у которого есть заказы');
    }
    
    await this.recipientsRepository.remove(recipient);
  }
}
