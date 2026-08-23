# Backend Patterns & Architecture

**Last Updated:** 2026-08-21

This document describes how the ReceiptMaster backend is structured, the patterns used, and how to build new features.

## Stack Overview

- **Framework:** NestJS 10
- **Database:** PostgreSQL 15+ with TypeORM 0.3
- **Auth:** Passport + JWT (RS256 keyset)
- **Job Queue:** BullMQ + ioredis
- **Validation:** class-validator, class-transformer, Zod (env)
- **API Docs:** Swagger/OpenAPI on `/api/v1/docs`
- **Node:** 20 LTS
- **Package Manager:** Yarn (monorepo workspaces)

Entry points:
- `backend/src/main.ts` — bootstraps NestJS, configures global pipes/CORS/Swagger
- `backend/src/app.module.ts` — root module, imports all feature modules, registers global guards/interceptors/filters
- `backend/src/config/` — env validation (Zod), database config, TypeORM ORM config, migrations

## Standard NestJS Module Anatomy

A feature module has this structure. Here's **orders** as the canonical example:

```
backend/src/modules/orders/
├── orders.module.ts        # DI container — imports entities, registers service/controller
├── orders.controller.ts    # HTTP routes — parse input, call service, return response
├── orders.service.ts       # Business logic — validates, queries DB, fires events
├── idempotency-cleanup.service.ts  # Supporting service — called by scheduler
├── dto/                    # Request/Response DTOs — validate input shape, document API
│   ├── create-order.dto.ts
│   ├── update-order.dto.ts
│   └── dashboard-response.dto.ts
└── entities/               # TypeORM entities — database schema, relations, indexes
    ├── order.entity.ts
    ├── order-item.entity.ts
    └── idempotency-key.entity.ts
```

### 1. Module Registration (`orders.module.ts`)

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, IdempotencyKey, Product, Recipient]),
    ReceiptsModule,     // Cross-module dependency
    SubscriptionModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, IdempotencyCleanupService],
  exports: [OrdersService],  // Let other modules inject OrdersService
})
export class OrdersModule {}
```

**Key points:**
- `TypeOrmModule.forFeature([...])` registers repositories (injected as `Repository<Entity>`)
- Import other modules for cross-module service injection
- Export your main service so other modules can use it

### 2. Controller — Define Routes

File: `backend/src/modules/orders/orders.controller.ts`

```typescript
@ApiTags("orders")
@ApiBearerAuth("bearer")
@Controller("orders")
@UseGuards(JwtAuthGuard)  // Protect all routes; use @Public() decorator to opt-out (not in this project)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: "Create order" })
  @ApiResponse({ status: 201, description: "...", type: Order })
  @ApiHeader({
    name: "Idempotency-Key",
    description: "Idempotency key (valid 24h)",
    required: false,
  })
  async create(
    @Body() createOrderDto: CreateOrderDto,    // Auto-validated by global ValidationPipe
    @Request() req: { user: User },            // Populated by JwtAuthGuard (Passport)
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.ordersService.create(
      createOrderDto,
      req.user,
      idempotencyKey,
    );
    if (result.isFromCache) {
      res.setHeader("X-Idempotency-Replayed", "true");
    }
    return res.status(result.statusCode).json(result.data);
  }

  @Get()
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "minAmount", required: false })
  async findAll(
    @Query() paginationDto: PaginationDto,  // { limit: 10, offset: 0, sort?: string }
    @Query() dateRange: DateRangeDto,       // { startDate?: string, endDate?: string }
    @Request() req: { user: User },
    @Query("status") status?: OrderStatus,  // Enum queries
  ): Promise<PaginatedResponse<Order>> {
    // Service handles multi-tenant scoping automatically
    return this.ordersService.findAll(paginationDto, req.user, status, ...);
  }

  @Patch(":id")
  @ApiResponse({ status: 400, description: "Cannot update order" })
  async update(
    @Param("id") id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @Request() req: { user: User },
  ) {
    return this.ordersService.update(id, updateOrderDto, req.user);
  }
}
```

**Conventions:**
- Route summary and responses in `@ApiOperation` + `@ApiResponse`
- Use `@Request() req: { user: User }` to get the authenticated user (populated by middleware)
- Input DTOs are validated by the global `ValidationPipe` — class-validator decorators on DTO properties
- Always pass `req.user` to service methods; multi-tenancy is enforced in the service layer

### 3. Service — Business Logic & Queries

File: `backend/src/modules/orders/orders.service.ts` (excerpt)

```typescript
@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemsRepository: Repository<OrderItem>,
    @InjectDataSource()
    private dataSource: DataSource,
    private receiptsService: ReceiptsService,
    private subscriptionService: SubscriptionService,
  ) {}

  // Validate input, check subscription limits, acquire advisory lock for idempotency
  async create(
    createOrderDto: CreateOrderDto,
    user: User,
    idempotencyKey?: string,
  ): Promise<IdempotencyResponse> {
    const result = await this.dataSource.transaction(async (manager) => {
      // Check subscription quota first
      await this.subscriptionService.assertCanCreateOrderInTx(manager, user.id);

      // Prevent race conditions on duplicate create requests
      if (idempotencyKey) {
        await manager.query(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          [idempotencyKey],
        );
        // Check if key already exists in this transaction
        const cachedResponse = await this.getIdempotentResponse(...);
        if (cachedResponse) {
          return { statusCode: 200, data: cachedResponse, isFromCache: true };
        }
      }

      // Create order + order items in one transaction
      const order = manager.create(Order, {
        user_id: user.id,
        recipient_id: createOrderDto.recipient_id,
        ...
      });
      await manager.save(order);

      const items = createOrderDto.items.map((item) =>
        manager.create(OrderItem, {
          order_id: order.id,
          product_id: item.product_id,
          ...
        }),
      );
      await manager.save(items);

      // Cache idempotency response
      if (idempotencyKey) {
        await manager.save(IdempotencyKey, {
          idempotency_key: idempotencyKey,
          order_id: order.id,
          response_data: order,
          created_at: new Date(Date.now() + 24 * 3600 * 1000),  // 24h TTL
        });
      }

      return { statusCode: 201, data: order, isFromCache: false };
    });

    // Invalidate dashboard cache after modification
    await this.invalidateDashboardCache(user.id);

    return result;
  }

  async findAll(
    paginationDto: PaginationDto,
    user: User,
    status?: OrderStatus,
    filters?: OrderFilters,
  ): Promise<PaginatedResponse<Order>> {
    // Start with multi-tenant query (TenantMiddleware + RLS enforces user_id)
    let query = this.ordersRepository
      .createQueryBuilder("order")
      .where("order.user_id = :userId", { userId: user.id })
      .leftJoinAndSelect("order.recipient", "recipient")
      .leftJoinAndSelect("order.items", "items")
      .leftJoinAndSelect("items.product", "product");

    // Apply optional filters
    if (status) {
      query = query.andWhere("order.status = :status", { status });
    }
    if (filters?.startDate) {
      query = query.andWhere("order.created_at >= :startDate", {
        startDate: filters.startDate,
      });
    }
    // ... more filters

    // Sorting with allowlist to prevent injection
    const sortableColumns: Record<string, string> = {
      created_at: "order.created_at",
      total_cents: "order.total_cents",
      status: "order.status",
    };
    if (paginationDto.sort && sortableColumns[paginationDto.sort]) {
      query = query.orderBy(
        sortableColumns[paginationDto.sort],
        paginationDto.sortOrder === "ASC" ? "ASC" : "DESC",
      );
    }

    // Pagination
    query = query
      .skip(paginationDto.offset || 0)
      .take(paginationDto.limit || 10);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      meta: { total, page: 0, limit: paginationDto.limit || 10 },
    };
  }

  // Cache expensive operations
  private dashboardCacheKey(method: string, userId: string, ...args: unknown[]): string {
    return `dashboard:${method}:${userId}:${JSON.stringify(args)}`;
  }

  private async invalidateDashboardCache(userId: string): Promise<void> {
    await this.cacheService.delByPattern(`dashboard:*:${userId}:*`);
  }
}
```

**Conventions:**
- Inject repositories via `@InjectRepository(Entity)` and the `DataSource` for transactions
- Inject other services (cross-module) via constructor
- Always accept `user: User` and filter queries by `user.id` (multi-tenancy)
- Use TypeORM's `transaction()` for atomic operations (idempotency keys, ledger updates, etc.)
- Use `.createQueryBuilder()` for complex queries; load relations with `leftJoinAndSelect`
- Use allowlist (e.g., `ORDER_SORTABLE_COLUMNS`) for sort column names to prevent SQL injection
- Cache expensive queries, invalidate on write
- Throw `ApiErrorResponse` from `common/errors/ApiError` — the global filter catches and returns it

### 4. DTO — Input/Output Validation

File: `backend/src/modules/orders/dto/create-order.dto.ts`

```typescript
import { Type } from "class-transformer";
import {
  IsUUID,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class OrderItemDto {
  @ApiProperty({ description: "Product UUID" })
  @IsUUID()
  product_id: string;

  @ApiProperty({ description: "Quantity" })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: "Unit price in cents" })
  @IsInt()
  @Min(0)
  unit_price_cents: number;
}

export class CreateOrderDto {
  @ApiProperty({ description: "Recipient UUID" })
  @IsUUID()
  recipient_id: string;

  @ApiProperty({ type: [OrderItemDto], description: "Order line items" })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
```

**Conventions:**
- One DTO per request/response shape
- Use class-validator decorators (`@IsUUID()`, `@IsInt()`, etc.) to validate shape and constraints
- Use `@Type()` from class-transformer to cast types (e.g., string ID to UUID)
- Use `@ApiProperty()` to document request/response in Swagger
- The global `ValidationPipe` runs automatically on all controller inputs

### 5. Entity — Database Schema

File: `backend/src/modules/orders/entities/order.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { ApiProperty, ApiHideProperty } from "@nestjs/swagger";

export enum OrderStatus {
  DRAFT = "draft",
  CONFIRMED = "confirmed",
  CANCELLED = "cancelled",
}

@Entity("orders")
@Index(["recipient_id"])                    // Query filter
@Index(["created_at"])                      // Time-range queries
@Index(["user_id", "status"])               // Multi-tenant scoping
@Index(["user_id", "created_at"])           // Listing by date
export class Order {
  @ApiProperty()
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiHideProperty()
  @Column({ type: "uuid" })
  user_id: string;

  @ApiHideProperty()
  @ManyToOne(() => User, (user) => user.orders)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ApiProperty()
  @Column({ type: "uuid" })
  recipient_id: string;

  @ApiProperty()
  @ManyToOne(() => Recipient, (recipient) => recipient.orders)
  @JoinColumn({ name: "recipient_id" })
  recipient: Recipient;

  @ApiProperty()
  @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

  @ApiProperty()
  @Column({ type: "integer" })  // in cents
  subtotal_cents: number;

  @ApiProperty()
  @Column({ type: "integer" })  // in cents
  total_cents: number;

  @ApiProperty()
  @Column({ type: "varchar", length: 3 })  // e.g., "EUR"
  currency: string;

  @ApiProperty()
  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @ApiProperty()
  @OneToMany(() => Receipt, (receipt) => receipt.order)
  receipts: Receipt[];

  @ApiProperty()
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updated_at: Date;

  @ApiProperty({ required: false })
  @DeleteDateColumn()  // Soft delete
  deleted_at?: Date;
}
```

**Conventions:**
- Columns storing money as integers in cents (no float precision issues)
- Always include `user_id` foreign key for multi-tenant queries
- Add indexes on filter/join/sort columns (scan the queries first)
- Use soft delete (`@DeleteDateColumn()`) for audit trails
- Use `cascade: true` for dependent entities (OrderItem cascades on Order delete)
- Use `@ApiProperty()` / `@ApiHideProperty()` to document Swagger schema

---

## Common Layer — Shared Infrastructure

### Guards (Authentication & Authorization)

File: `backend/src/modules/users/guards/jwt-auth.guard.ts`

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
```

This guard wraps Passport's JWT strategy. Applied to controllers:

```typescript
@UseGuards(JwtAuthGuard)  // All routes in this controller need a valid JWT
export class OrdersController { ... }
```

**JWT Strategy:** Reads Authorization header, validates signature, populates `req.user`.

File: `backend/src/modules/users/strategies/jwt.strategy.ts` (not shown, but standard Passport pattern)

**Related files:**
- `backend/src/modules/users/users.service.ts` — `register()`, `login()`, `refreshToken()`
- `backend/src/config/env.schema.ts` — `JWT_SECRET`, `JWT_EXPIRES_IN`

### Middleware (Request Context)

#### RequestIdMiddleware

Auto-generates `req.requestId` for logging and tracing. Applied globally.

#### TenantMiddleware

File: `backend/src/common/middleware/tenant.middleware.ts`

```typescript
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const userId = (req as any).user?.id;
    if (userId) {
      // Run request handler inside an AsyncLocalStorage context
      tenantStore.run({ userId }, () => next());
    } else {
      next();
    }
  }
}
```

**How it works:**
1. After authentication, the middleware wraps the request handler in `tenantStore.run({ userId }, ...)`
2. This stores `userId` in an `AsyncLocalStorage` (thread-local equivalent in Node.js)
3. The `TenantContextSubscriber` (see below) reads this on every DB operation

### Subscribers (Database Hooks)

File: `backend/src/common/subscribers/tenant-context.subscriber.ts`

```typescript
@EventSubscriber()
export class TenantContextSubscriber implements EntitySubscriberInterface {
  async beforeInsert(event: InsertEvent<any>) {
    await this.setTenantContext(event.queryRunner);
  }
  async beforeUpdate(event: UpdateEvent<any>) {
    await this.setTenantContext(event.queryRunner);
  }
  async beforeRemove(event: RemoveEvent<any>) {
    await this.setTenantContext(event.queryRunner);
  }

  private async setTenantContext(queryRunner: { query: (q: string, p?: any[]) => Promise<any> }) {
    const ctx = tenantStore.getStore();
    if (ctx?.userId) {
      await queryRunner.query(`SET LOCAL app.current_user_id = '${ctx.userId}'`);
    }
  }
}
```

**Multi-Tenancy Model:**

The backend uses **application-level** multi-tenancy with PostgreSQL **Row-Level Security (RLS)** enforcement:

1. Each entity has a `user_id` foreign key
2. Every query manually filters by `user_id = req.user.id`
3. The subscriber injects `SET LOCAL app.current_user_id = <userId>` before every write transaction
4. Database RLS policies enforce that users can only see/modify their own rows (defense in depth)

**Important:** If RLS triggers fail, the operation rolls back. This is intentional — it's a safety net for bugs.

### Interceptors (Response & Audit)

#### AuditLogInterceptor

File: `backend/src/common/interceptors/audit-log.interceptor.ts`

```typescript
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    if (!AUDIT_METHODS.has(method)) {  // Only POST, PUT, PATCH, DELETE
      return next.handle();
    }

    const user = request.user;
    const entityType = context.getClass().name.replace("Controller", "").toLowerCase();
    const entityId = request.params?.id;

    return next.handle().pipe(
      tap((responseData) => {
        this.auditLogService.log({
          userId: user?.id,
          action: this.mapAction(method, context.getHandler().name),
          entityType,
          entityId: entityId || responseData?.id,
          newValues: this.sanitize(request.body),
          ipAddress: request.ip,
          requestId: request["requestId"],
        });
      }),
    );
  }
}
```

**Behavior:**
- Logs all mutations (POST/PUT/PATCH/DELETE) to the `audit_log` table
- Sanitizes sensitive fields (password, refresh_token, etc.)
- Runs after the handler returns (in `tap()`), so it has the response data

### Filters (Global Exception Handler)

File: `backend/src/common/filters/GlobalExceptionFilter.ts`

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiErrorResponse) {
      // Our custom errors
      return response.status(exception.statusCode).json(exception.toJSON());
    }

    if (exception instanceof HttpException) {
      // NestJS validation/auth errors
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      // ... normalize to { error: string, errorCode: string }
      return response.status(status).json(errorResponse);
    }

    if (exception instanceof Error) {
      // Unexpected JS errors
      this.logger.error("Unhandled error:", exception.stack);
      return response.status(500).json({
        error: "Internal server error",
        errorCode: "INTERNAL_SERVER_ERROR",
      });
    }

    // Unknown error
    return response.status(500).json({
      error: "Unknown error",
      errorCode: "UNKNOWN_ERROR",
    });
  }
}
```

**Error Response Shape:**

All errors return:

```typescript
{
  error: string;           // User-facing message (no stack traces or SQL)
  errorCode: string;       // Machine-readable code (e.g., "ORDER_NOT_FOUND")
}
```

**Throwing Errors:**

```typescript
// From common/errors/ApiError.ts — predefined errors with proper HTTP status
throw ApiErrors.ORDER_NOT_FOUND(orderId);           // 404
throw ApiErrors.PRODUCT_LIMIT_EXCEEDED(limit);      // 402
throw ApiErrors.INVALID_CREDENTIALS();              // 401
throw ApiErrors.BAD_REQUEST("Invalid input");       // 400
```

---

## Background Jobs (BullMQ)

**Queue Setup:** `backend/src/common/modules/queue.module.ts`

```typescript
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get("REDIS_HOST", "localhost"),
          port: configService.get("REDIS_PORT", 6379),
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class QueueModule {}
```

**Processor Example:** Receipt Generation

File: `backend/src/modules/receipts/receipt-generation.processor.ts`

```typescript
export interface ReceiptGenerationJobData {
  receiptId: string;
  orderId: string;
  userId: string;
}

export const RECEIPT_GENERATION_QUEUE = "receipt-generation";

@Processor(RECEIPT_GENERATION_QUEUE, { concurrency: 1 })  // Sequential
export class ReceiptGenerationProcessor extends WorkerHost {
  async process(job: Job<ReceiptGenerationJobData>): Promise<any> {
    const { receiptId, orderId, userId } = job.data;

    try {
      // Load order + relations
      const order = await this.ordersRepository.findOne({
        where: { id: orderId, user_id: userId },
        relations: ["recipient", "items"],
      });
      if (!order) throw new Error("Order not found");

      // Generate PDF
      const pdf = await this.pdfGeneratorService.generate(order, { /* style */ });

      // Upload to S3
      const s3Url = await this.pdfStorageService.upload(receiptId, pdf);

      // Save receipt
      await this.receiptsRepository.update(receiptId, {
        status: ReceiptStatus.GENERATED,
        pdf_url: s3Url,
        progress: 100,
      });

      // Notify frontend via WebSocket
      this.receiptsGateway.emitProgress(userId, { receiptId, progress: 100 });
    } catch (error) {
      this.logger.error("Receipt generation failed", error);
      await this.receiptsRepository.update(receiptId, {
        status: ReceiptStatus.FAILED,
      });
      throw error;  // BullMQ will retry
    }
  }
}
```

**How to enqueue a job:**

```typescript
// In ReceiptsService:
await this.receiptQueue.add("receipt-generation", {
  receiptId: receipt.id,
  orderId: order.id,
  userId: user.id,
}, {
  delay: 1000,
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
});
```

**Processors registered in module:**

```typescript
@Module({
  imports: [
    BullModule.registerQueue({ name: RECEIPT_GENERATION_QUEUE }),
  ],
  providers: [ReceiptGenerationProcessor, ReceiptsService],
})
export class ReceiptsModule {}
```

---

## Error Handling Conventions

### Throw Errors Early with Context

```typescript
async findOne(id: string, user: User) {
  const order = await this.ordersRepository.findOne({
    where: { id, user_id: user.id },
  });

  if (!order) {
    throw ApiErrors.ORDER_NOT_FOUND(id);  // Throws, returns 404
  }

  return order;
}
```

### Catch and Re-throw with Context

```typescript
async generate(orderId: string, user: User): Promise<Receipt> {
  try {
    const order = await this.ordersRepository.findOneOrFail({ where: { id: orderId } });
    const pdf = await this.externalPdfService.generate(order);
    return pdf;
  } catch (error) {
    this.logger.error("PDF generation failed", { orderId, error });
    throw ApiErrors.RECEIPT_GENERATION_FAILED(orderId);  // User-friendly error
  }
}
```

### Global Filter Handles the Rest

Any unhandled error bubbles up and the `GlobalExceptionFilter` catches it, logging it and returning a 500.

---

## Environment & Configuration

File: `backend/src/config/env.schema.ts`

```typescript
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),

  // Database
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(5432),
  DB_USERNAME: z.string().default("postgres"),
  DB_PASSWORD: z.string().default("postgres"),
  DB_NAME: z.string().default("market_db"),

  // Redis (BullMQ + caching)
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),

  // JWT
  JWT_SECRET: z.string().min(32),  // Required, no default
  JWT_EXPIRES_IN: z.string().default("24h"),

  // Paddle Billing
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_PRO_PRICE_ID: z.string().optional(),
  PADDLE_BUSINESS_PRICE_ID: z.string().optional(),

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // S3 (Hetzner Object Storage)
  S3_ENDPOINT: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  LOGOS_BUCKET: z.string().optional(),
  RECEIPTS_BUCKET: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;
```

**Validation at startup:**

```typescript
// app.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  validate: (config) => {
    const result = envSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Configuration validation error: ${result.error.message}`);
    }
    return result.data;
  },
})
```

If a required variable is missing, the app fails to start with a clear error. No silent failures.

---

## DTO Composition (Pagination, Date Ranges, etc.)

Common DTOs shared across modules:

**Pagination:** `backend/src/common/dto/pagination.dto.ts`

```typescript
export class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsEnum(["ASC", "DESC"])
  @IsOptional()
  sortOrder?: SortOrder = "DESC";
}
```

**Date Range:** `backend/src/common/dto/date-range.dto.ts`

```typescript
export class DateRangeDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  // Parsed & validated versions (computed by getter)
  get startDateParsed(): Date | undefined { ... }
  get endDateParsed(): Date | undefined { ... }
}
```

**Usage in controller:**

```typescript
async findAll(
  @Query() paginationDto: PaginationDto,
  @Query() dateRange: DateRangeDto,
) {
  // Both DTOs are validated & their parsed values are available
}
```

---

## Recipe: Add a New Endpoint

1. **Create DTO** (`backend/src/modules/[feature]/dto/[action]-[entity].dto.ts`)
   ```typescript
   export class CreateProductDto {
     @IsString()
     name: string;
     // ... more fields
   }
   ```

2. **Add route to controller** (`backend/src/modules/[feature]/[feature].controller.ts`)
   ```typescript
   @Post()
   @ApiOperation({ summary: "Create product" })
   @ApiResponse({ status: 201, type: Product })
   async create(
     @Body() dto: CreateProductDto,
     @Request() req: { user: User },
   ) {
     return this.productsService.create(dto, req.user);
   }
   ```

3. **Implement service method** (`backend/src/modules/[feature]/[feature].service.ts`)
   ```typescript
   async create(dto: CreateProductDto, user: User): Promise<Product> {
     // Validate subscription limits
     await this.subscriptionService.assertCanCreateProduct(user.id);

     // Check for duplicates if needed
     const existing = await this.productsRepository.findOne({
       where: { user_id: user.id, name: dto.name },
     });
     if (existing) throw ApiErrors.PRODUCT_ALREADY_EXISTS(dto.name);

     // Create & save
     const product = this.productsRepository.create({
       user_id: user.id,
       ...dto,
     });
     await this.productsRepository.save(product);

     // Invalidate cache
     await this.cacheService.invalidateUserCache(user.id);

     return product;
   }
   ```

4. **Tests** — See `*.spec.ts` files for patterns. Minimal expectations:
   - Unhappy path: test that the error is thrown with correct HTTP status
   - Happy path: test that the entity is saved & returned

---

## Key Takeaways

- **Multi-tenant by design:** Every service method accepts `user: User`, filters by `user_id`, and the middleware + subscriber enforce it at the DB level
- **Type-safe errors:** Use `ApiErrors.*` constants; never expose internals
- **Async transactions:** For writes, use `dataSource.transaction()` to ensure atomicity and consistency
- **Cache invalidation:** On write, invalidate related cache entries to prevent stale data
- **Validation at boundaries:** DTOs validate input shape; services validate business rules
- **Cross-module imports:** If service A needs service B, import its module in A's module
- **Immutable patterns:** TypeORM handles this—use `.create()` and `.save()`, never mutate in place

---

## See Also

- [api-reference.md](./api-reference.md) — All HTTP endpoints, request/response shapes
- [business-logic.md](./business-logic.md) — Domain flows, subscriptions, billing, order lifecycle
- [frontend.md](./frontend.md) — React client, components, state management
