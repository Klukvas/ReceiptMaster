import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from "typeorm";
import { ApiHideProperty, ApiProperty } from "@nestjs/swagger";
import { User } from "../../users/entities/user.entity";
import { Product } from "../../products/entities/product.entity";

@Entity("suppliers")
export class Supplier {
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
  @Column({ type: "varchar", length: 255, nullable: true })
  contact_person?: string;

  @ApiProperty({ required: false })
  @Column({ type: "text", nullable: true })
  notes?: string;

  @ApiHideProperty()
  @Column({ type: "uuid" })
  user_id: string;

  @ApiHideProperty()
  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ApiProperty({ type: () => [Product] })
  @ManyToMany(() => Product)
  @JoinTable({
    name: "supplier_products",
    joinColumn: { name: "supplier_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "product_id", referencedColumnName: "id" },
  })
  products: Product[];

  @ApiProperty()
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updated_at: Date;
}
