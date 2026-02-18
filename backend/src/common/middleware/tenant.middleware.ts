import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { tenantStore } from "../subscribers/tenant-context.subscriber";

/**
 * Middleware that wraps the remainder of each request inside an
 * AsyncLocalStorage context carrying the authenticated user's ID.
 *
 * The TenantContextSubscriber reads this value and injects
 * `SET LOCAL app.current_user_id` into every write transaction,
 * enabling PostgreSQL RLS policies to enforce tenant isolation.
 *
 * Apply AFTER authentication middleware so `req.user` is populated.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const userId = (req as any).user?.id;

    if (userId) {
      tenantStore.run({ userId }, () => next());
    } else {
      next();
    }
  }
}
