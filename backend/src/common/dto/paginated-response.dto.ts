import { ApiProperty } from "@nestjs/swagger";
import { Product } from "../../modules/products/entities/product.entity";
import { Recipient } from "../../modules/recipients/entities/recipient.entity";
import { Supplier } from "../../modules/suppliers/entities/supplier.entity";
import { Order } from "../../modules/orders/entities/order.entity";
import { Receipt } from "../../modules/receipts/entities/receipt.entity";

class PaginatedMeta {
  @ApiProperty()
  total: number;

  @ApiProperty()
  offset: number;

  @ApiProperty()
  limit: number;
}

export class PaginatedProductResponse extends PaginatedMeta {
  @ApiProperty({ type: [Product] })
  data: Product[];
}

export class PaginatedRecipientResponse extends PaginatedMeta {
  @ApiProperty({ type: [Recipient] })
  data: Recipient[];
}

export class PaginatedSupplierResponse extends PaginatedMeta {
  @ApiProperty({ type: [Supplier] })
  data: Supplier[];
}

export class PaginatedOrderResponse extends PaginatedMeta {
  @ApiProperty({ type: [Order] })
  data: Order[];
}

export class PaginatedReceiptResponse extends PaginatedMeta {
  @ApiProperty({ type: [Receipt] })
  data: Receipt[];
}
