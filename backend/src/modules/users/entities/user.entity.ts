import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { ApiHideProperty } from "@nestjs/swagger";
import { Product } from "../../products/entities/product.entity";
import { Recipient } from "../../recipients/entities/recipient.entity";
import { Order } from "../../orders/entities/order.entity";
import { OrderItem } from "../../orders/entities/order-item.entity";
import { Receipt } from "../../receipts/entities/receipt.entity";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @ApiHideProperty()
  @Column()
  password: string;

  @Column({ default: true })
  isActive: boolean;

  @ApiHideProperty()
  @OneToMany(() => Product, (product) => product.user)
  products: Product[];

  @ApiHideProperty()
  @OneToMany(() => Recipient, (recipient) => recipient.user)
  recipients: Recipient[];

  @ApiHideProperty()
  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];

  @ApiHideProperty()
  @OneToMany(() => OrderItem, (orderItem) => orderItem.user)
  orderItems: OrderItem[];

  @ApiHideProperty()
  @OneToMany(() => Receipt, (receipt) => receipt.user)
  receipts: Receipt[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
