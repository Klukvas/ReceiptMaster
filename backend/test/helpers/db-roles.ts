import { readFileSync } from "fs";
import { join } from "path";
import { DataSource } from "typeorm";

const ROLE_SCRIPTS = join(__dirname, "../../db/roles");

export type DatabaseRoleNames = {
  readonly owner: string;
  readonly app: string;
  readonly backup: string;
};

export type RoleScript =
  | "01-roles.sql"
  | "02-ownership.sql"
  | "03-grants.sql"
  | "04-verify.sql";

/**
 * The production script with only its role names swapped. Roles are global to a
 * cluster, so suites use their own names while still running the exact SQL an
 * operator runs.
 */
export function roleScript(
  script: RoleScript,
  names: DatabaseRoleNames,
): string {
  return readFileSync(join(ROLE_SCRIPTS, script), "utf8")
    .replace(/\brm_owner\b/g, names.owner)
    .replace(/\brm_app\b/g, names.app)
    .replace(/\brm_backup\b/g, names.backup);
}

/** Gives a suite-owned runtime role the production grants; the admin owns the tables here. */
export async function applyRuntimeGrants(
  admin: DataSource,
  adminUser: string,
  runtimeRole: string,
): Promise<void> {
  await admin.query(
    roleScript("03-grants.sql", {
      owner: adminUser,
      app: runtimeRole,
      backup: adminUser,
    }),
  );
}
