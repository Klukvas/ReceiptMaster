import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ApiHideProperty, ApiProperty } from "@nestjs/swagger";
import { OrderItem } from "../../orders/entities/order-item.entity";
import { User } from "../../users/entities/user.entity";
import { Supplier } from "../../suppliers/entities/supplier.entity";

export enum Currency {
  UAH = "UAH",
}

// Partial unique index (user_id, name) WHERE deleted_at IS NULL
// управляется миграцией 1762500000000-AddProductSoftDelete
@Entity("products")
export class Product {
  @ApiProperty()
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty()
  @Column({ type: "varchar", length: 255 })
  name: string;

  @ApiProperty()
  @Column({ type: "integer" })
  purchase_price_cents: number;

  @ApiProperty()
  @Column({ type: "integer" })
  sale_price_cents: number;

  @ApiProperty()
  @Column({ type: "integer", default: 0 })
  quantity: number;

  @ApiProperty({ enum: Currency })
  @Column({ type: "enum", enum: Currency, default: Currency.UAH })
  currency: Currency;

  @ApiHideProperty()
  @Column({ type: "uuid" })
  user_id: string;

  @ApiHideProperty()
  @ManyToOne(() => User, (user) => user.products)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: "uuid", nullable: true, default: null })
  supplier_id?: string | null;

  @ApiHideProperty()
  @ManyToOne(() => Supplier, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "supplier_id" })
  supplier?: Supplier;

  @ApiProperty()
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updated_at: Date;

  @ApiHideProperty()
  @DeleteDateColumn()
  deleted_at?: Date;

  @ApiHideProperty()
  @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
  order_items: OrderItem[];
}
