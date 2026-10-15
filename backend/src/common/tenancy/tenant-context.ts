import { AsyncLocalStorage } from "async_hooks";

export type TenantContext =
  | { userId: string; publicToken?: never }
  | { publicToken: string; userId?: never };
export const tenantStore = new AsyncLocalStorage<TenantContext>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function runWithTenant<T>(userId: string, callback: () => T): T {
  if (!UUID.test(userId)) throw new Error("Invalid tenant identifier");
  return tenantStore.run({ userId }, callback);
}

export function runWithPublicToken<T>(
  publicToken: string,
  callback: () => T,
): T {
  if (!/^[a-f0-9]{64}$/.test(publicToken))
    throw new Error("Invalid receipt token");
  return tenantStore.run({ publicToken }, callback);
}

export function assertTenantContext(context: TenantContext): void {
  if (context.userId !== undefined) {
    if (!UUID.test(context.userId) || context.publicToken !== undefined)
      throw new Error("Invalid tenant context");
  } else if (
    typeof context.publicToken !== "string" ||
    !/^[a-f0-9]{64}$/.test(context.publicToken)
  ) {
    throw new Error("Invalid public receipt context");
  }
}
