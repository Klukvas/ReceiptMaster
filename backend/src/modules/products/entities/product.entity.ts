import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { OrderItem } from "../../orders/entities/order-item.entity";
import { User } from "../../users/entities/user.entity";

export enum Currency {
  UAH = "UAH",
}

@Entity("products")
export class Product {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "integer" })
  purchase_price_cents: number;

  @Column({ type: "integer" })
  sale_price_cents: number;

  @Column({ type: "integer", default: 0 })
  quantity: number;

  @Column({ type: "enum", enum: Currency, default: Currency.UAH })
  currency: Currency;

  @Column({ type: "uuid" })
  user_id: string;

  @ManyToOne(() => User, (user) => user.products)
  @JoinColumn({ name: "user_id" })
  user: User;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
  order_items: OrderItem[];
}
