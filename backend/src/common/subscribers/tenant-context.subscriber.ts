import { AsyncLocalStorage } from "async_hooks";
import { EventSubscriber, EntitySubscriberInterface, InsertEvent, UpdateEvent, RemoveEvent } from "typeorm";

/**
 * Async-local store that holds the current tenant (user) ID for the
 * lifetime of a single HTTP request.
 *
 * Usage from middleware / interceptor:
 *   tenantStore.run({ userId: req.user.id }, () => next());
 */
export const tenantStore = new AsyncLocalStorage<{ userId: string }>();

/**
 * TypeORM entity subscriber that injects `SET LOCAL app.current_user_id`
 * before every INSERT / UPDATE / DELETE so that PostgreSQL RLS policies
 * can enforce tenant isolation at the database level.
 *
 * `SET LOCAL` is transaction-scoped — it resets automatically when the
 * transaction commits or rolls back, preventing cross-request leakage
 * in connection-pooled environments.
 */
@EventSubscriber()
export class TenantContextSubscriber implements EntitySubscriberInterface {
  private async setTenantContext(queryRunner: { query: (q: string, p?: any[]) => Promise<any> }): Promise<void> {
    const ctx = tenantStore.getStore();
    if (ctx?.userId) {
      await queryRunner.query(
        `SET LOCAL app.current_user_id = '${ctx.userId}'`,
      );
    }
  }

  async beforeInsert(event: InsertEvent<any>): Promise<void> {
    await this.setTenantContext(event.queryRunner);
  }

  async beforeUpdate(event: UpdateEvent<any>): Promise<void> {
    await this.setTenantContext(event.queryRunner);
  }

  async beforeRemove(event: RemoveEvent<any>): Promise<void> {
    await this.setTenantContext(event.queryRunner);
  }
}
