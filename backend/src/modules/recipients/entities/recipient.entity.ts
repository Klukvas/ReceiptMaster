import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { Order } from "../../orders/entities/order.entity";

@Entity("recipients")
export class Recipient {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  email?: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  phone?: string;

  @Column({ type: "text", nullable: true })
  address?: string;

  @Column({ type: "varchar", length: 50, nullable: true, unique: true })
  telegram_user_id?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  username?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  first_name?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  last_name?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Order, (order) => order.recipient)
  orders: Order[];
}
