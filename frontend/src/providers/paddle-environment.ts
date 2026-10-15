import type { Environments } from "@paddle/paddle-js";

export function resolvePaddleEnvironment(
  configured: string | undefined,
  isProduction: boolean,
): Environments {
  const environment = configured || (isProduction ? "production" : "sandbox");
  if (environment !== "production" && environment !== "sandbox") {
    throw new Error("Paddle environment must be production or sandbox");
  }
  return environment;
}
