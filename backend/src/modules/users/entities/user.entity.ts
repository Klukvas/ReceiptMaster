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

  /**
   * Last waybill number handed out to this account. Superseded by `document_counters`;
   * still kept in step by receipt-number.ts for one release.
   */
  @ApiHideProperty()
  @Column({ type: "integer", default: 0, select: false })
  receipt_counter: number;

  /**
   * Generation of this account's access tokens: each one carries it as the `tv` claim
   * and stops working once the value moves on (logout, password change). See
   * `access-token.ts`. Not selected by default, so it never reaches profile responses.
   */
  @ApiHideProperty()
  @Column({ type: "integer", default: 0, select: false })
  token_version: number;

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
