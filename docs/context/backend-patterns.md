# Backend Patterns & Architecture

**Last Updated:** 2026-10-30

This document describes how the ReceiptMaster backend is structured, the patterns used, and how to build new features.

## Stack Overview

- **Framework:** NestJS 10
- **Database:** PostgreSQL 15+ with TypeORM 0.3
- **Auth:** Passport + JWT (RS256 keyset)
- **Job Queue:** BullMQ + ioredis
- **Validation:** class-validator, class-transformer, Zod (env)
- **API Docs:** Swagger/OpenAPI on `/api/v1/docs`
- **Node:** 20 LTS
- **Package Manager:** Yarn (monorepo workspaces). The root `yarn.lock` is authoritative; `backend/yarn.lock` and `frontend/yarn.lock` are byte-for-byte copies of it so each package's Docker build can run `yarn install --frozen-lockfile` — after any dependency change copy the root lock over both (CI fails on drift). `yarn lint` only checks; `yarn lint:fix` applies fixes.

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
├── orders-dashboard.service.ts  # Read-only cached dashboard aggregates (raw SQL)
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
  providers: [OrdersService, OrdersDashboardService, IdempotencyCleanupService],
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

      // Serialize per-user quota checks after idempotency replay
      await this.subscriptionService.assertCanCreateOrderInTx(manager, user.id);

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
    // Start with multi-tenant query (post-guard tenant context + RLS enforce user_id)
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

  // Every order write drops the tenant's cached dashboard entries (all key versions)
  private async invalidateDashboardCache(userId: string): Promise<void> {
    await this.cacheService.delByPattern(dashboardCachePattern(userId));
  }
}
```

Dashboard reads are a separate provider: `orders-dashboard.service.ts` (`OrdersDashboardService`,
injected with only `DataSource` + `CacheService`) holds the eight cached `get*` aggregates the
`/orders/dashboard/*` routes call, each wrapped in its private `cachedDashboard(key, fn)` with keys
from `dashboard-cache.ts` and profit SQL from `dashboard-profit.ts`. It never writes; invalidation
stays with the writers (`OrdersService` above, and `TelegramService` for bot-created orders).

**Conventions:**
- Inject repositories via `@InjectRepository(Entity)` and the `DataSource` for transactions
- Inject other services (cross-module) via constructor
- Always accept `user: User` and filter queries by `user.id` (multi-tenancy)
- Use TypeORM's `transaction()` for atomic operations (idempotency keys, ledger updates, etc.)
- Replay an existing idempotency response before quota checks; serialize monthly order quotas with a per-user advisory transaction lock even when no subscription row exists
- Lock live orders before stock changes; acquire affected order/product locks in deterministic ID order
- Reject duplicate products and mixed currencies on create/update; persist the old/new product union on item replacement
- Soft deletion must be explicit in raw SQL aggregates (`o.deleted_at IS NULL`), since ORM defaults do not apply to raw queries
- Use `.createQueryBuilder()` for complex queries; load relations with `leftJoinAndSelect`
- Use allowlist (e.g., `ORDER_SORTABLE_COLUMNS`) for sort column names to prevent SQL injection
- Cache expensive queries, invalidate on write (read side in `OrdersDashboardService`, invalidation in the writing service)
- Throw `ApiErrorResponse` from `common/errors/ApiError` — the global filter catches and returns it
- Never `save()` a whole entity loaded without a lock: write only the changed columns with a
  conditional `UPDATE` (QueryBuilder sets `updated_at`), and make counters such as product stock a
  precondition (`AND quantity = :expectedQuantity`, 409 on mismatch) — see `ProductsService.update`
- Check a quota and insert in **one** transaction, after taking the tenant's quota lock
- Idempotent creates go through `common/idempotency/idempotent-create.ts` (`createIdempotently`,
  used by `POST /products` and `POST /recipients`; orders keep their own older implementation).
  Inside the caller's transaction and before any other lock it validates the key (1–255 visible
  ASCII, else 400 `VALIDATION_ERROR`), takes `pg_advisory_xact_lock(hashtext(scopedKey))`, replays an
  unexpired `idempotency_keys` row for (scoped key, user) or deletes an expired one, runs the create
  and stores its JSON response with `status_code` 201 and a 24-hour `expires_at` (no migration: the
  existing table, `order_id` NULL). `scopedKey` is `<scope>:` + SHA-256 hex of the client key: it
  fits `varchar(255)` for every accepted key and never equals an order key, which is stored raw in
  the same `(key, user_id)`-unique column. The controller sets `X-Idempotency-Replayed: true` on a
  replay (`@Res({ passthrough: true })`, so interceptors still see the body); without the header the
  original create path runs unchanged. Guarantee: within 24 h, retries with one key — concurrent
  ones too — create at most one entity and get the first response. Not covered: a failed create
  stores nothing (a retry runs it again), a repeated key with a different body replays the first
  response, and the client must keep its key (the onboarding keeps it only in memory)

#### Tenant advisory locks and lock ordering

Transaction-scoped (`pg_advisory_xact_lock`) keys in use:

| Key | Taken by | Serializes |
|---|---|---|
| `hashtext(idempotencyKey)` | `OrdersService.create` with an `Idempotency-Key` | replay of one key (key-scoped, not a tenant lock) |
| `hashtext('product:' \|\| sha256(key))` / `hashtext('recipient:' \|\| sha256(key))` | `createIdempotently` (`POST /products`, `POST /recipients` with an `Idempotency-Key`) | replay of one key (key-scoped, not a tenant lock) |
| `(hashtext('order-monthly-quota'), hashtext(userId))` | `SubscriptionService.assertCanCreateOrderInTx` | monthly order quota |
| `(hashtext('product-quota'), hashtext(userId))` | `SubscriptionService.assertCanCreateProductInTx` (product create) | product quota |
| `hashtextextended(userId, 1)` | receipt generation/promotion, document-config writes, order cancel | receipts and document configuration |
| `hashtextextended(userId, 2)` | document storage cleanup | storage sweeps |

Migrations additionally hold a session-level `pg_advisory_lock` (`common/services/migration.service.ts`).

**Ordering rule** (prevents lock-order deadlocks): a transaction takes at most one tenant advisory
lock, and takes it first; row locks follow in ascending id order (`ORDER BY id … FOR UPDATE`). The
only combinations of advisory locks in use start with an idempotency key lock, which is not a tenant
lock and is always taken first: order create with a key takes key lock → order-quota lock → product
rows; product create with a key takes key lock → `product-quota`; recipient create with a key takes
only its key lock. Product create takes `product-quota` (never `hashtextextended(userId, 1)`); a
product update takes no advisory lock and at most its own row lock. Order cancel takes `hashtextextended(userId, 1)` → order row → the order's receipt rows (id
order) → logo asset rows, the same tenant → order → receipt order as generation and promotion.
Confirm, `approveBatch` (id order), edit and delete take order row locks without a tenant lock;
manual void and repair start at the order row too — none of them takes the tenant lock after a row
lock.

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
- Zod-validated bodies (`@Body() body: unknown`) are invisible to Swagger: register the schema in `src/openapi/api-components.ts` and document the route with `src/openapi/api-docs.decorators.ts` (`ApiJsonBody`, `ApiDocumentDraftBody` for the JSON/multipart draft envelope, `ApiDataResponse`, `ApiFailureResponses` for the shared `{ error, errorCode }` body)

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
- `backend/src/modules/users/users.service.ts` — `register()`, `login()`, `refreshToken()`.
  Refresh rotation is atomic: inside `refreshTokenRepository.manager.transaction` a QueryBuilder
  `UPDATE … SET revoked = true WHERE token AND revoked = false AND expires_at > now RETURNING user_id`
  redeems the token (read the rows from `UpdateResult.raw`; `manager.query` would return the driver's
  `[rows, count]` tuple), then `createRefreshToken(userId, manager)` inserts the successor in the same
  transaction. No row → 401 `UNAUTHORIZED`. `refresh_tokens` has no RLS and refresh runs without tenant context
- `backend/src/config/env.schema.ts` — `JWT_SECRET`, `JWT_EXPIRES_IN`

### Middleware (Request Context)

#### RequestIdMiddleware

Auto-generates `req.requestId` for logging and tracing. Applied globally.

#### Tenant context after authentication

`common/tenancy/tenant.interceptor.ts` is registered before the audit interceptor. Guards
populate `req.user` first, then the interceptor subscribes to the request handler inside
`runWithTenant(user.id, ...)`. Middleware cannot establish this context before JWT guards run.

`common/tenancy/tenant-context.ts` stores either a validated UUID tenant or a validated public
receipt token in AsyncLocalStorage. Receipt workers (including exhausted-failure callbacks) and
Telegram owner entry points establish their own tenant context explicitly.

#### Connection-level RLS enforcement

`common/tenancy/tenant-data-source.ts` decorates each TypeORM QueryRunner. Every contextual
query, including SELECT and raw SQL, installs parameterized transaction-local
`app.current_user_id` and `app.public_receipt_token` values on the same connection executing it.
Ordinary contextual queries use a short BEGIN/COMMIT transaction; existing service transactions
retain their atomic boundary and savepoints. Queries on a runner are serialized, transaction
context changes are rejected, and failures roll back without leaking settings through the pool.
Failed explicit transaction-control commands and uncertain COMMIT outcomes discard the physical
connection; rollback/cleanup failures preserve the original operation error.
Streaming queries fail closed until a tenant-aware streaming implementation exists.

Telegram update-id storage is provisioned by migration, with no runtime table DDL. Rollback keeps
the legacy `tg_updates` table and its idempotency history.

The earlier pre-auth TenantMiddleware and write-only TenantContextSubscriber are not registered.
Service predicates still filter by `user_id`; PostgreSQL RLS supplies a second boundary.

RLS requires a runtime database role that is neither a table owner, superuser nor BYPASSRLS.
The application does not provision or change production roles. Run migrations with a separate
privileged connection, then set `AUTO_RUN_MIGRATIONS=false` for the restricted runtime role.
The switch parses the literal strings `true` and `false`; a typo fails startup validation.
Tests use a disposable PostgreSQL cluster with a restricted non-owner role and a single pool
connection; normal database defaults are never used by the opt-in audit suite (parameters under
*Tests* below). These suites use a synthetic role they create; they are not evidence about the
roles and policies actually deployed in production, which need their own review.

Public sharing uses SELECT-only capability policies on receipts, orders, order_items and
recipients. A token grants access to exactly its generated receipt and related graph, not the
owner's other data; it grants no writes. Revoked or void receipts are inaccessible. No public
handler enters a full owner tenant context. Sharing uses a generated-status/NULL-token conditional
update, so concurrent creators receive the same winning token and cannot restore a voided status.
PDF regeneration updates only PDF fields, fenced by generated status; finishing a delayed render
cannot restore a revoked token or overwrite a concurrent void. The receipt policy does not query orders, avoiding
recursive RLS policy evaluation.

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

**Receipt rendering:** `modules/receipts/services/template.service.ts` exposes an awaited
`ready` promise for translations and fonts. `renderTemplate()` waits for it and fills
assets even if `prepareTemplateData()` was called during startup. All 15 HTML styles use
the shared Handlebars `printLayout` partial from `templates/print-layout.ts` for text
containment, logo bounds and print fragmentation. Preview fixtures use the same data
preparation and dictionaries as production.

`PlaywrightPdfGenerator` waits for `document.fonts.ready` before PDF capture. Thermal
metadata requests `contentBasedHeight`: the generator lays out at the printable roll
width and measures body height plus page margins. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
can optionally select an installed browser (for local offline verification); when unset,
Playwright uses its normal bundled Chromium. No machine-specific path is in production
code. The offline regression entry points are `backend/test/verify-receipt-templates.ts`
and `backend/test/verify-receipt-pdfs.py`; evidence belongs in a fresh
`backend/temp/receipt-fix-*` directory and requires no DB, S3, printer or external API.

**Receipt worker:** `modules/receipts/receipt-generation.processor.ts`

```typescript
export interface ReceiptGenerationJobData {
  receiptId: string;
  orderId: string;
  userId: string;
  generationId: string;
}
```

`ReceiptGenerationProcessor` runs sequentially (`concurrency: 1`) in the validated job tenant. `ReceiptSnapshotService` resolves authoritative configuration, captures transaction/recipient data, normalizes/loads immutable logos and compiles final HTML **before** durable intent. No S3 or Chromium work runs under a database lock. A short transaction rechecks account/preset revisions, locked source fingerprints, entitlement and order eligibility, then stores one pending candidate plus the identifier-only outbox entry. Tenant quota enforcement remains serialized; `MAX_RECEIPTS = 10` retains its existing eligible eviction policy.

`ReceiptArtifactService` renders only stored HTML and complete PDF options, then uploads to an immutable attempt key. Promotion checks tenant, generation, pending identity, expected active revision, confirmed/locked order and non-void lifecycle, switching all active artifact/config/template/public metadata together. It never writes public-token fields. A generated document stays generated and publicly downloadable during replacement, with separate `replacement_status`/`replacement_error`. Failed candidates remain retryable; explicit new config on a failed generation replaces its design, while a plain retry reuses the frozen candidate. The outbox recognizes replacements and reconciles exhausted jobs without destroying active PDFs.

Snapshot/HTML/pending-asset entity columns use `select: false`; internal services explicitly select them. Receipt controllers return an allowlist, and nested order receipts cannot load the large private columns by default. Public metadata explicitly selects and projects frozen visible values; it never queries live settings for new documents.

`DocumentConfigService` owns validated V1 configuration and preset persistence, optimistic revisions, narrow legacy-setting adapters and authoritative entitlement reads. `DocumentAssetsService` normalizes to a compact PNG (600 px longest side, at most 512 KiB), reserves a leased tenant asset, uploads a unique key, then attaches the pointer/config in a short transaction. Removal detaches; it never eagerly deletes. `DocumentStorageMaintenanceService` runs every minute, claiming at most ten due tenant IDs from the identifier/timing-only `document_storage_sweeps` queue, then enters each tenant context. It collects at most 25 logos and 25 PDFs per tenant, rechecking account/preset/active/pending logo references and active PDF paths under asset/lease locks before marking deleting. Attach rejects deleting state under the same locks. S3 deletion runs after the claim transaction; failures retain deleting intent for retry (tenant sweeps recur hourly). Leases and detached/superseded objects have a 24-hour grace. `DocumentArtifactsService` reserves intent before each immutable PDF upload; promotion/repair attach the ready lease and retire the former PDF in the pointer-switch transaction. Confirmed losing attempts and failed uploads expire; ambiguous commits are never eagerly deleted, and the collector retains referenced objects. Eviction schedules retirement and drops active/pending pointers transactionally, preserving MAX_RECEIPTS = 10. Legacy local filesystem files are not processed by immutable object-storage cleanup.

The additive `1792300000000-AddOrderItemUnitCost` migration adds nullable `order_items.unit_cost_cents`
with `CHK_order_items_unit_cost_non_negative` (`IS NULL OR >= 0`) and no default; on its own it left
legacy lines NULL. `ADD COLUMN … NULL` is metadata-only; the inline CHECK costs one scan of
`order_items` under the ACCESS EXCLUSIVE lock that `ADD COLUMN` already holds. `NOT VALID` + `VALIDATE`
would not shorten that lock because `scripts/deploy-production.sh` runs every pending migration in one
transaction (`transaction: 'all'`, `lock_timeout` 30 s); the table is small for this product. The
row-level `tenant_isolation_order_items` policy and table-level grants cover the new column unchanged.
Rollout: the deploy script applies it with the new image before swapping containers (it is listed in
`KNOWN_MIGRATIONS`/`EXPECTED_MIGRATIONS`); the old image ignores the column and its inserts store
NULL; rolling back the image is safe; `down` drops captured costs and must not run in production.
`test/order-item-cost-migration.e2e-spec.ts` runs the chain up to the previous release, seeds legacy
lines, then up → CHECK → restricted-role write under RLS → down → up on a fresh database.

`1792310000000-BackfillOrderItemUnitCost` adds `order_items.unit_cost_estimated` (boolean, NOT NULL,
default false) and sets every NULL `unit_cost_cents` to the same tenant's product
`purchase_price_cents` when that is ≥ 0, flagging those lines. It is an owner decision recorded in the
file: the value is an estimate, and it deliberately supersedes the "no backfill" comment in the
already-applied migration above, which stays unedited. Raw SQL so soft-deleted products are reached.
One guard fails closed: `row_security_active()` must be false for both tables in `up` and `down`,
because row security would narrow the writes and any verifying count alike (with no tenant set every
row is hidden, so a zero-row UPDATE would look like success); the chain leaves both tables ENABLE
without FORCE, so that holds for a superuser or the table owner. A line pointing at another tenant's
product does not stop the release: it is not backfilled and stays unknown. After the UPDATE, the NULL
lines whose product has a non-negative cost are exactly that set, and their count (never ids or tenant
data) is logged through Nest's `Logger`, because TypeORM's logger is off in production. `run_migration`
in the deploy script prints that one line; every other line of migration output stays unechoed. No
trigger exists on either table. `down` nulls only flagged lines, then drops the flag. The entity maps the flag with
`select: false` and `@ApiHideProperty()`, so it reaches no response, document or OpenAPI schema, and
no application code writes it; lines rewritten by a draft edit take the default. Under the deploy
script it runs in the same one-transaction path (`lock_timeout` 30 s, `statement_timeout` 180 s) with
the backend stopped, so the UPDATE has no concurrent writers. To undo it, roll back to the old image
before running `down`: TypeORM includes the defaulted column in INSERT … RETURNING, so the current
entity cannot write order lines once the column is gone.
`test/order-item-cost-backfill.e2e-spec.ts` seeds the previous release's state, then covers values and
flags, profit against the pre-change formula, a later price change, restricted-role reads, the
cross-tenant warning, the row-security refusal, and down → up.

The additive `1792100000001-DocumentStorageLeases` migration adds tenant-RLS PDF leases, bounded-cleanup indexes and the operational sweep queue; existing logo tenants are queued without scanning customer content. No migration is applied by verification.

The additive `1792100000000-DocumentConfiguration` migration adds config/revision/logo columns, tenant assets/presets, one active snapshot and one pending replacement. New tables have FORCE RLS with explicit USING/WITH CHECK and tenant-qualified asset foreign keys. A trigger validates the legacy varchar settings tenant against the asset owner. It deliberately does not retrofit unrelated settings RLS.

Preview captures the complete raw multipart envelope in a buffer capped at 6 MiB (including preamble/epilogue, independent of Content-Length), then replays it to Multer after parser setup. Oversize returns 413; incomplete/aborted requests never reach the controller. JSON paths are unchanged. Multer retains one payload ≤64 KiB, one file ≤5 MiB and bounded parts/headers. Expensive preview work remains limited to two concurrent operations. It normalizes staged images in memory and returns `private, no-store` PDF bytes without account, asset, receipt, outbox or PDF persistence. The Chrome context disables page JavaScript/service workers and blocks external/file requests. Interface language is separate from document language and bounded Intl formatting, including an explicit IANA timezone.

The existing dispatcher still publishes after commit, every 10 seconds, with stable receipt/generation job IDs and bounded Redis calls. Publication failure leaves durable intent. Jobs carry IDs only.

Jobs retry three times with exponential backoff. Workers throw for missing receipt/order rows
so transient visibility failures retry. Progress, completion and exhausted-failure writes all
match receipt, tenant, generation and PROCESSING or pending-replacement status. Superseded jobs cannot overwrite a new
manual retry. Existing queued/active generations are never reset merely because created_at is
old. The upgrade migration backfills legacy PROCESSING rows into a fresh durable generation.

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

Production with `BILLING_ENABLED=true` additionally requires nonempty `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
`PADDLE_PRO_PRICE_ID`, `PADDLE_BUSINESS_PRICE_ID`, a valid `FRONTEND_URL`, and explicitly
`PADDLE_ENVIRONMENT=production`. Missing values or sandbox mode fail startup. Development/test
may leave billing disabled. `.env.example` lists empty configuration keys; production image
selection uses an explicit immutable `IMAGE_TAG`. Test-mode boot ignores `.env` files.
If a required variable is missing, the app fails to start with a clear error.

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
     // Quota check and insert commit together under the tenant's quota lock
     return this.productsRepository.manager.transaction(async (manager) => {
       await this.subscriptionService.assertCanCreateProductInTx(manager, user.id);
       const product = manager.create(Product, { ...dto, user_id: user.id });
       return manager.save(product);
     });
   }
   ```

4. **Contract** — run `yarn openapi:export` in `backend/` and commit `backend/openapi.json`. CI (`contract-test`) runs `node dist/openapi/generate-openapi.js --check`, which fails when the code and the committed contract differ or when a routed handler is missing from the document, then regenerates the frontend types and type-checks them. The exporter boots Nest in preview mode with forced test env (`NODE_ENV=test`, no migrations, billing off, `.invalid` DB/Redis hosts): no provider, queue, cron, migration, webhook or storage client runs, so it needs no services.

5. **Tests** — See `*.spec.ts` files for patterns. Minimal expectations:
   - Unhappy path: test that the error is thrown with correct HTTP status
   - Happy path: test that the entity is saved & returned

   **API e2e** (`yarn test:e2e`, `test/e2e/*`) truncates every table. `test/helpers/test-app.ts`
   refuses to compile the app unless `NODE_ENV=test` and `DB_NAME` ends in `_test`.

   **Isolated PostgreSQL suites** — `src/common/tenancy/tenant-data-source.pg.spec.ts` (tenant
   RLS, connection-context reset, transactions, and — on a fully migrated database — delayed
   explicit/repair regeneration that cannot restore a revoked share token or undo a concurrent
   void), `test/orders-audit.e2e-spec.ts`, `test/template-features-sql.e2e-spec.ts`,
   `test/products-concurrency.e2e-spec.ts` (stock precondition writes, lock-parked conflicts,
   product-quota races and rollback), `test/refresh-rotation.e2e-spec.ts` (single-use rotation
   under concurrency, successor-insert rollback, expiry), `test/order-lifecycle.e2e-spec.ts`
   (confirm/approve/cancel races, cancel voiding documents and links, delayed workers after a
   cancel, rejected follow-ups), `test/order-profit-snapshot.e2e-spec.ts` (cost capture, profit from
   snapshots, unknown vs zero cost, daily gaps, sort order, cache versions),
   `test/idempotent-create.e2e-spec.ts` (product/recipient replay, concurrent same-key requests parked
   on the key lock, order/product/recipient keys of one value kept apart, replay at the product quota,
   refused creates not stored, expiry, other tenants, unchanged keyless create),
   `test/order-item-cost-migration.e2e-spec.ts` and `test/order-item-cost-backfill.e2e-spec.ts` — create and drop their own uniquely named
   databases and a `NOSUPERUSER NOBYPASSRLS` login role. Most of them run services as that role
   through the production tenant query context — `test/helpers/restricted-app-database.ts`
   (entity-synchronized schema plus the RLS policy migration) or `test/helpers/migrated-app-database.ts`
   (the full migration chain: functions, FORCE RLS policies, outbox and storage tables) — and park
   concurrent calls on real row/table/advisory locks, polling `pg_stat_activity` instead of sleeping.
   Teardown goes through `teardownIsolatedPostgres` /
   `destroyDataSources`: every data source is settled independently, each database is dropped
   `WITH (FORCE)`, each role is dropped and the maintenance client is closed even when an earlier
   step fails; all failures are rethrown together. `test/helpers/isolated-postgres.ts` gates them:

   | Variable | Meaning |
   |---|---|
   | `AUDIT_PG_PORT=55439` / `TEMPLATE_PG_PORT=55447` | Opt-in; must be exactly that port. The host is always `127.0.0.1` |
   | `ISOLATED_PG_USER` (alias `TEMPLATE_PG_USER`) | Required admin user of the disposable cluster; there is no OS-username fallback |
   | `ISOLATED_PG_PASSWORD` | Optional admin password |
   | `REQUIRE_PG_SUITES=1` | A missing opt-in fails instead of skipping (CI `e2e-backend` sets it) |
   | Sentinel database `receiptmaster_isolated_pg_sentinel` | Must exist in the cluster; it marks the cluster as disposable (CI creates it before the suites) |

   Without an opt-in the suites skip; an incomplete or wrong opt-in fails with the reason. Each
   suite connects to the `postgres` maintenance database first and, before creating anything,
   refuses a cluster that lacks the sentinel database or contains `market_db` — so another
   project's cluster on the same port is refused too. Locally, in a cluster started only for these
   suites, for example:
   `docker run -d --rm --name pg-isolated -p 127.0.0.1:55439:5432 -p 127.0.0.1:55447:5432 -e POSTGRES_PASSWORD=postgres postgres:15-alpine`
   (check first that nothing else listens on those ports; the cluster must be PostgreSQL 13 or newer
   because teardown uses `DROP DATABASE … WITH (FORCE)`), then
   `docker exec pg-isolated psql -U postgres -c "CREATE DATABASE receiptmaster_isolated_pg_sentinel"`,
   then from `backend/`: `ISOLATED_PG_USER=postgres ISOLATED_PG_PASSWORD=postgres AUDIT_PG_PORT=55439 TEMPLATE_PG_PORT=55447 REQUIRE_PG_SUITES=1 yarn jest src/common/tenancy/tenant-data-source.pg.spec.ts`
   and `yarn jest --config test/jest-e2e.json --runInBand orders-audit template-features-sql products-concurrency refresh-rotation order-lifecycle order-profit-snapshot order-item-cost-migration order-item-cost-backfill idempotent-create`.
   `test/isolated-postgres-teardown.e2e-spec.ts` checks the failure-safe teardown with fakes and needs
   no database.
   Evidence written by the template e2e specs defaults to `os.tmpdir()`; set `TEMPLATE_EVIDENCE` to move it.

---

## Key Takeaways

- **Multi-tenant by design:** Every service method accepts `user: User`, filters by `user_id`, and the post-guard interceptor and query-runner context enforce it at the DB level
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

### Explicit billing capability and releases

`BILLING_ENABLED` accepts only boolean true/false or exact strings `true`/`false`,
defaulting to false. Empty optional Paddle settings are accepted while OFF; ON production
requires complete keys, prices, frontend URL and explicit production environment.
`PaddleService` guards SDK construction, payment creation/portal, signature verification,
direct webhook handling and scheduled subscription downgrades. Stored entitlements and
quota enforcement remain independent. See `.github/DEPLOYMENT.md` and
`scripts/deploy-production.sh` for locked additive migration, verified backup, immutable
app-only deployment and retained-image rollback without production env rewrites.

## Settings writes and logo images

Settings use a partial TypeORM `upsert` on the existing unique `userId`: only supplied columns participate in `ON CONFLICT DO UPDATE`, so independent field saves cannot replay stale whole-row snapshots. All settings request bodies use Zod schemas in `settings/dto/settings-input.ts` and map validation issues to the existing API error envelope. Combined footer updates validate both fields before one upsert. Regression tests exercise detached in-memory snapshots, actual generated PostgreSQL SQL without a connection, and the real Nest HTTP controller against synthetic repositories.

LogoStorageService accepts validated PNG/JPEG/GIF/static SVG buffers and normalizes them through the backend runtime `sharp` dependency. Both uploads and legacy reads return real PNG bytes at the historical fixed key; reads do not mutate storage. SVG is decoded from memory without a base file, rejects active/external content, and is never served raw. Pixel/dimension/byte limits and a decoder timeout reduce abuse; they are not a hard process memory/CPU sandbox for native SVG metadata parsing.

FIX2 fencing: initial promotions take the same tenant advisory lock as creation and evict only oldest existing generated receipts when needed, so multiple queued initial candidates cannot exceed ten generated documents. Replacement reconciliation CAS includes observed processing state, active revision and pending ID; promotion/new candidates/void win. Workers emit progress only after a conditional observed-candidate claim, with no async gap before emission. Missing-path/hash repair uses SQL `IS NULL` guards.

Upload cleanup records now carry `upload_pending`, `cleanup_token` and capped retry attempts (unapplied migration `1792100000002-DocumentUploadFencing`). Across logos and PDFs, at most 25 live unexpired uploading leases per tenant may reserve intent, serialized separately from content transactions. Expired uncertain PUTs retain deleting tombstones and repeat reference-checked collection after 24 hours until the uploader settles. Deleting tombstones never consume upload capacity, including when collection extends their cleanup retry time; ordinary new uploads need no operational reconciliation. Arbitrary process suspension is not assumed to have a finite lifetime, so uncertain metadata is never forgotten by a TTL. Settlement fences expired uploaders and refreshes/recreates reference-aware cleanup intent with a new token. Collector finalization CAS cannot remove that refreshed intent. Each object failure moves its retry time by exponential backoff capped at 24 hours; each collector runs independently. No S3/browser work occurs in DB transactions. Migration backfills use temporary owner-only policies in a transaction and drop them before commit, preserving FORCE RLS. The settings logo-owner trigger covers changes to both logo pointer and tenant key.

Installed TypeORM MigrationExecutor uses its default `all` transaction mode for all three document migrations. Neither storage migration declares a per-migration transaction override; both backfill guards require an active transaction. Synthetic executor regressions cover ordered up/down, temporary owner-only SELECT/UPDATE policies removed before commit, and rollback without residual policies. Live PostgreSQL behavior remains an opt-in verification.

FIX4 retirement ordering: oldest eligible selection precedes stable-ID batch receipt locks/refetch (including select:false active/pending logo references and current PDF path), before any retirement lease or delete. Promotion/repair lock their current receipt before PDF attachment/retirement. Order-file deletion requires an explicit tenant and locks tenant before order, then the receipt batch; no external I/O runs under these locks. Synthetic wait-for regressions exercise precreation/promotion eviction against repair, stale pointer refetch and order deletion; live PostgreSQL remains opt-in.
