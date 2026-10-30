import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from "typeorm";
import { ApiHideProperty, ApiProperty } from "@nestjs/swagger";
import { Order } from "./order.entity";
import { Product } from "../../products/entities/product.entity";
import { User } from "../../users/entities/user.entity";

@Entity("order_items")
@Check(
  "CHK_order_items_unit_cost_non_negative",
  `"unit_cost_cents" IS NULL OR "unit_cost_cents" >= 0`,
)
@Index(["order_id"])
@Index(["product_id"])
export class OrderItem {
  @ApiProperty()
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty()
  @Column({ type: "uuid" })
  order_id: string;

  @ApiProperty()
  @Column({ type: "uuid" })
  product_id: string;

  @ApiProperty()
  @Column({ type: "varchar", length: 255 })
  product_name: string;

  @ApiProperty()
  @Column({ type: "integer" })
  unit_price_cents: number;

  @ApiProperty()
  @Column({ type: "integer" })
  qty: number;

  @ApiProperty()
  @Column({ type: "integer" })
  line_total_cents: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "Purchase cost per unit captured when the draft line was written; null when unknown (lines created before cost snapshots)",
  })
  @Column({ type: "integer", nullable: true })
  unit_cost_cents: number | null;

  @ApiHideProperty()
  @Column({ type: "uuid" })
  user_id: string;

  @ApiHideProperty()
  @ManyToOne(() => User, (user) => user.orderItems)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ApiHideProperty()
  @ManyToOne(() => Order, (order) => order.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order: Order;

  @ApiHideProperty()
  @ManyToOne(() => Product, (product) => product.order_items, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "product_id" })
  product: Product;
}
