import { NestExpressApplication } from "@nestjs/platform-express";

/**
 * Production clients reach the API only through the frontend nginx
 * (docker-compose.production.yml exposes the backend to it alone), which
 * appends the peer address to X-Forwarded-For. Trusting exactly that one hop
 * makes `req.ip` — and so every per-IP throttle — the client nginx saw, while
 * entries the client wrote itself stay untrusted. Without it every request
 * appears to come from nginx and all clients share one throttle bucket.
 */
export const TRUSTED_PROXY_HOPS = 1;

export function trustReverseProxy(app: NestExpressApplication): void {
  app.set("trust proxy", TRUSTED_PROXY_HOPS);
}
