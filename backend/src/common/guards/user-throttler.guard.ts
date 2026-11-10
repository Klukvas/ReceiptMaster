import { createHash } from "crypto";
import { ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerLimitDetail } from "@nestjs/throttler";
import { ApiErrorResponse } from "../errors/ApiError";

const THROTTLE_BUCKET = "user-throttle-bucket";

/**
 * Puts a route into a named bucket that every route with the same name shares, instead of
 * each route counting on its own (the default key includes the handler). Read by
 * `UserThrottlerGuard`; without that guard it does nothing.
 */
export const ThrottleBucket = (name: string) =>
  SetMetadata(THROTTLE_BUCKET, name);

/**
 * Counts requests per signed-in user instead of per client address, so one account behind
 * a shared proxy or office network does not eat another's budget and one account cannot
 * dodge the limit by changing address. Must run after the JWT guard; without a user (it
 * should not happen on a protected route) it falls back to the address.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId: unknown = req.user?.id;
    return typeof userId === "string" ? `user:${userId}` : String(req.ip);
  }

  protected generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    const bucket: unknown = Reflect.getMetadata(
      THROTTLE_BUCKET,
      context.getHandler(),
    );
    if (typeof bucket !== "string")
      return super.generateKey(context, suffix, name);
    return createHash("sha256")
      .update(`bucket-${bucket}-${name}-${suffix}`)
      .digest("hex");
  }

  protected async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfterSeconds = Math.max(1, detail.timeToBlockExpire);
    throw new ApiErrorResponse(
      `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
      "RATE_LIMITED",
      429,
      { retryAfterSeconds },
    );
  }
}
