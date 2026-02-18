import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Order } from "./order.entity";
import { Product } from "../../products/entities/product.entity";
import { User } from "../../users/entities/user.entity";

@Entity("order_items")
@Index(["order_id"])
@Index(["product_id"])
export class OrderItem {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  order_id: string;

  @Column({ type: "uuid" })
  product_id: string;

  // Denormalized data at purchase time
  @Column({ type: "varchar", length: 255 })
  product_name: string;

  @Column({ type: "integer" })
  unit_price_cents: number;

  @Column({ type: "integer" })
  qty: number;

  @Column({ type: "integer" })
  line_total_cents: number;

  @Column({ type: "uuid" })
  user_id: string;

  @ManyToOne(() => User, (user) => user.orderItems)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order: Order;

  @ManyToOne(() => Product, (product) => product.order_items, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "product_id" })
  product: Product;
}
