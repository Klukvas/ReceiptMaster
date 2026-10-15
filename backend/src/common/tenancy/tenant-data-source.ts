import { Logger } from "@nestjs/common";
import { DataSource, QueryRunner } from "typeorm";
import {
  tenantStore,
  TenantContext,
  assertTenantContext,
} from "./tenant-context";

const CONTROL =
  /^\s*(?:BEGIN\b|START\s+TRANSACTION\b|COMMIT\b|ROLLBACK\b|SAVEPOINT\b|RELEASE\b|SET\s+TRANSACTION\b)/i;

const logger = new Logger("TenantDataSource");

async function discardConnection(
  runner: QueryRunner,
  cause: unknown,
): Promise<void> {
  const postgresRunner = runner as QueryRunner & {
    releasePostgresConnection?: (error: Error) => Promise<void>;
    databaseConnection?: { end: () => Promise<void> };
  };
  const failure =
    cause instanceof Error ? cause : new Error("Transaction connection failed");
  try {
    if (!postgresRunner.releasePostgresConnection)
      throw new Error("PostgreSQL connection release is unavailable");
    await postgresRunner.releasePostgresConnection(failure);
  } catch (cleanupError) {
    logger.error(
      "Failed to discard transaction connection",
      cleanupError instanceof Error
        ? cleanupError.message
        : "Connection cleanup failed",
    );
    try {
      await postgresRunner.databaseConnection?.end();
    } catch (terminationError) {
      logger.error(
        "Failed to terminate transaction connection",
        terminationError instanceof Error
          ? terminationError.message
          : "Connection termination failed",
      );
    }
  }
}

/** Install context on the connection executing the query, including SELECTs. */
export function installTenantContext(dataSource: DataSource): DataSource {
  const create = dataSource.createQueryRunner.bind(dataSource);
  dataSource.createQueryRunner = (mode) => {
    const runner = create(mode);
    const query = runner.query.bind(runner);
    let pending: Promise<unknown> = Promise.resolve();
    let transactionContext: string | undefined;
    const contextKey = (context?: TenantContext) =>
      JSON.stringify(context ?? {});
    runner.query = (
      sql: string,
      parameters?: unknown[],
      structured?: boolean,
    ) => {
      const context = tenantStore.getStore();
      const execute = async () => {
        if (context) assertTenantContext(context);
        if (CONTROL.test(sql)) {
          try {
            const result = await query(sql, parameters, structured);
            if (/^\s*(BEGIN|START\s+TRANSACTION)\b/i.test(sql))
              transactionContext = contextKey(context);
            if (/^\s*(COMMIT|ROLLBACK)\s*;?\s*$/i.test(sql))
              transactionContext = undefined;
            return result;
          } catch (error) {
            // A failed control command leaves transaction/connection state unknown.
            await discardConnection(runner, error);
            throw error;
          }
        }
        if (
          runner.isTransactionActive &&
          transactionContext !== undefined &&
          transactionContext !== contextKey(context)
        ) {
          throw new Error("Tenant context cannot change within a transaction");
        }
        if (!context && !runner.isTransactionActive)
          return query(sql, parameters, structured);
        const ownTransaction = !runner.isTransactionActive;
        let committing = false;
        try {
          if (ownTransaction) await query("BEGIN");
          else transactionContext = contextKey(context);
          await query(
            "SELECT set_config('app.current_user_id', $1, true), set_config('app.public_receipt_token', $2, true)",
            [context?.userId ?? "", context?.publicToken ?? ""],
          );
          const result = await query(sql, parameters, structured);
          if (ownTransaction) {
            committing = true;
            await query("COMMIT");
          }
          return result;
        } catch (error) {
          if (ownTransaction) {
            if (committing) await discardConnection(runner, error);
            else {
              try {
                await query("ROLLBACK");
              } catch (rollbackError) {
                await discardConnection(runner, rollbackError);
              }
            }
          }
          throw error;
        }
      };
      const result = pending.then(execute);
      pending = result.catch(() => undefined);
      return result;
    };
    runner.stream = async () => {
      throw new Error(
        "Streaming queries require explicit tenant transaction support",
      );
    };
    return runner;
  };
  return dataSource;
}
