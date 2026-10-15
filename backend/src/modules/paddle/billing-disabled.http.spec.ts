import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@nestjs/typeorm";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import * as request from "supertest";
import { PaddleController } from "./paddle.controller";
import { PaddleService } from "./paddle.service";
import { SubscriptionController } from "../subscription/subscription.controller";
import { SubscriptionService } from "../subscription/subscription.service";
import { UserSubscription } from "../subscription/entities/user-subscription.entity";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { GlobalExceptionFilter } from "../../common/filters/GlobalExceptionFilter";

describe("billing disabled HTTP boundary", () => {
  let app: INestApplication;
  const repository = {
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const paidStatus = {
    plan: "business",
    paddleStatus: "active",
    hasPaddleSubscription: true,
    usage: { productsCount: 12, ordersThisMonth: 25 },
    limits: {
      maxProducts: null,
      maxOrdersPerMonth: null,
      allowedTemplateIds: null,
    },
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaddleController, SubscriptionController],
      providers: [
        PaddleService,
        { provide: ConfigService, useValue: { get: () => false } },
        { provide: getRepositoryToken(UserSubscription), useValue: repository },
        {
          provide: SubscriptionService,
          useValue: { getStatus: async () => paidStatus },
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().user = {
            id: "11111111-1111-4111-8111-111111111111",
            email: "fixture@example.test",
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());
  it("reports the public capability while preserving subscription reads", async () => {
    expect(
      (await request(app.getHttpServer()).get("/billing/config")).body,
    ).toEqual({ billingEnabled: false });
    const response = await request(app.getHttpServer()).get(
      "/subscription/status",
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual(paidStatus);
  });
  it.each([
    "/subscription/checkout",
    "/subscription/portal",
    "/paddle/webhook",
  ])("rejects %s without touching subscription data", async (path) => {
    const response = await request(app.getHttpServer())
      .post(path)
      .send({ plan: "pro" });
    expect(response.status).toBe(503);
    expect(response.body.errorCode).toBe("BILLING_DISABLED");
    expect(repository.findOne).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
