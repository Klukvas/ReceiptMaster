import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { ApiErrors } from "../../common/errors/ApiError";
import { EnvConfig } from "../../config/env.schema";

const PRODUCTION_API_URL = "https://api.creem.io";
const TEST_API_URL = "https://test-api.creem.io";
const REQUEST_TIMEOUT_MS = 10_000;

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), "Must be an https URL");

const checkoutResponseSchema = z.object({ checkout_url: httpsUrlSchema });
const portalResponseSchema = z.object({ customer_portal_link: httpsUrlSchema });

export interface CreateCheckoutParams {
  productId: string;
  userId: string;
  customerEmail: string;
  successUrl: string;
}

/** Thin HTTP client for the two Creem endpoints the app calls. */
@Injectable()
export class CreemClient {
  private readonly logger = new Logger(CreemClient.name);

  constructor(private readonly configService: ConfigService<EnvConfig>) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get("CREEM_API_KEY"));
  }

  async createCheckout(params: CreateCheckoutParams): Promise<string> {
    const response = await this.post("/v1/checkouts", checkoutResponseSchema, {
      product_id: params.productId,
      request_id: params.userId,
      success_url: params.successUrl,
      customer: { email: params.customerEmail },
      metadata: { userId: params.userId },
    });
    return response.checkout_url;
  }

  async createPortalLink(customerId: string): Promise<string> {
    const response = await this.post(
      "/v1/customers/billing",
      portalResponseSchema,
      { customer_id: customerId },
    );
    return response.customer_portal_link;
  }

  private baseUrl(): string {
    return this.configService.get("CREEM_ENVIRONMENT") === "production"
      ? PRODUCTION_API_URL
      : TEST_API_URL;
  }

  /** Any failure, including an unexpected response shape, is logged here and answered as 502. */
  private async post<T>(
    path: string,
    responseSchema: z.ZodType<T>,
    body: unknown,
  ): Promise<T> {
    const apiKey = this.configService.get("CREEM_API_KEY");
    if (!apiKey) throw new Error("CREEM_API_KEY is not configured");

    try {
      const response = await fetch(`${this.baseUrl()}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(
          `Creem responded ${response.status}: ${await response.text()}`,
        );
      }
      return responseSchema.parse(await response.json());
    } catch (error) {
      this.logger.error(
        `Creem request POST ${path} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      throw ApiErrors.PAYMENT_PROVIDER_FAILED();
    }
  }
}
