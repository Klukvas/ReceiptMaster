import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OrderItem } from '../../orders/entities/order-item.entity';

export enum Currency {
  UAH = 'UAH',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'integer' })
  purchase_price_cents: number;

  @Column({ type: 'integer' })
  sale_price_cents: number;

  @Column({ type: 'enum', enum: Currency, default: Currency.UAH })
  currency: Currency;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
  order_items: OrderItem[];
}