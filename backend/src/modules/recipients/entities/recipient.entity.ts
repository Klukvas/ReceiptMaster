import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { ApiHideProperty, ApiProperty } from "@nestjs/swagger";
import { Order } from "../../orders/entities/order.entity";
import { User } from "../../users/entities/user.entity";

@Entity("recipients")
@Index(["user_id", "phone"])
export class Recipient {
  @ApiProperty()
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty()
  @Column({ type: "varchar", length: 255 })
  name: string;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 255, nullable: true })
  email?: string;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 50, nullable: true })
  phone?: string;

  @ApiProperty({ required: false })
  @Column({ type: "text", nullable: true })
  address?: string;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 50, nullable: true, unique: true })
  telegram_user_id?: string;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 255, nullable: true })
  username?: string;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 255, nullable: true })
  first_name?: string;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 255, nullable: true })
  last_name?: string;

  @ApiHideProperty()
  @Column({ type: "uuid" })
  user_id: string;

  @ApiHideProperty()
  @ManyToOne(() => User, (user) => user.recipients)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ApiProperty()
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updated_at: Date;

  @ApiHideProperty()
  @OneToMany(() => Order, (order) => order.recipient)
  orders: Order[];
}
