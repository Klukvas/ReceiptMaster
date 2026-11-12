import { ReceiptsGateway } from "./receipts.gateway";

const USER_1 = "1b0f9a8e-4c1d-4e5f-9a6b-7c8d9e0f1a2b";
const USER_2 = "2b0f9a8e-4c1d-4e5f-9a6b-7c8d9e0f1a2b";

describe("ReceiptsGateway", () => {
  let gateway: ReceiptsGateway;
  let jwtService: any;
  let configService: any;
  let userRepository: any;
  let queryBuilder: any;
  let mockServer: any;
  /** The sockets in the user's room when an event is sent. */
  let roomSockets: Array<{
    id: string;
    data: { tokenVersion?: unknown };
    disconnect: jest.Mock;
  }>;

  /** The account the one users query finds, and its stored token version. */
  const storedAccount = (
    user: { id: string; isActive: boolean } | null,
    tokenVersion = 0,
  ) =>
    queryBuilder.getRawAndEntities.mockResolvedValue({
      entities: user ? [user] : [],
      raw: user ? [{ current_token_version: tokenVersion }] : [],
    });

  const clientWithToken = (id: string, token = "valid-token") =>
    ({
      id,
      handshake: { auth: { token }, headers: {} },
      join: jest.fn(),
      data: {},
      disconnect: jest.fn(),
    }) as any;

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
    };

    configService = {
      get: jest.fn().mockReturnValue("jwt-secret"),
    };

    queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn(),
      getRawOne: jest.fn().mockResolvedValue({ token_version: 0 }),
    };
    userRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    storedAccount({ id: USER_1, isActive: true });

    gateway = new ReceiptsGateway(jwtService, configService, userRepository);

    roomSockets = [];
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      in: jest.fn().mockReturnValue({
        fetchSockets: jest.fn(async () => roomSockets),
      }),
    };

    gateway.server = mockServer;
  });

  describe("handleConnection", () => {
    it("should authenticate client with auth token", async () => {
      jwtService.verify.mockReturnValue({ sub: USER_1, tv: 0 });

      const mockClient = {
        id: "client-1",
        handshake: {
          auth: { token: "valid-token" },
          headers: {},
        },
        join: jest.fn(),
        data: {},
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(mockClient);

      expect(jwtService.verify).toHaveBeenCalledWith("valid-token", {
        secret: "jwt-secret",
      });
      expect(mockClient.join).toHaveBeenCalledWith(`user:${USER_1}`);
      expect((mockClient as any).userId).toBe(USER_1);
    });

    it("should authenticate with Authorization header", async () => {
      jwtService.verify.mockReturnValue({ sub: USER_2 });
      storedAccount({ id: USER_2, isActive: true });

      const mockClient = {
        id: "client-2",
        handshake: {
          auth: {},
          headers: { authorization: "Bearer header-token" },
        },
        join: jest.fn(),
        data: {},
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(mockClient);

      expect(jwtService.verify).toHaveBeenCalledWith("header-token", {
        secret: "jwt-secret",
      });
      expect(mockClient.join).toHaveBeenCalledWith(`user:${USER_2}`);
    });

    it("should disconnect client without token", async () => {
      const mockClient = {
        id: "client-3",
        handshake: {
          auth: {},
          headers: {},
        },
        join: jest.fn(),
        data: {},
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(mockClient.join).not.toHaveBeenCalled();
    });

    it("should disconnect client with invalid token", async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      const mockClient = {
        id: "client-4",
        handshake: {
          auth: { token: "invalid-token" },
          headers: {},
        },
        join: jest.fn(),
        data: {},
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it("should disconnect client when no userId in payload", async () => {
      jwtService.verify.mockReturnValue({ sub: undefined });

      const mockClient = {
        id: "client-5",
        handshake: {
          auth: { token: "token-no-sub" },
          headers: {},
        },
        join: jest.fn(),
        data: {},
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it("loads the account once per connection, with its token version", async () => {
      jwtService.verify.mockReturnValue({ sub: USER_1, tv: 0 });

      await gateway.handleConnection(clientWithToken("client-6"));

      expect(userRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(queryBuilder.where).toHaveBeenCalledWith("user.id = :id", {
        id: USER_1,
      });
      expect(queryBuilder.getRawAndEntities).toHaveBeenCalledTimes(1);
    });

    it("refuses a token revoked by a version bump (logout, password change)", async () => {
      jwtService.verify.mockReturnValue({ sub: USER_1, tv: 2 });
      storedAccount({ id: USER_1, isActive: true }, 3);
      const client = clientWithToken("client-7");

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it("treats a token without the claim as version 0", async () => {
      jwtService.verify.mockReturnValue({ sub: USER_1 });
      storedAccount({ id: USER_1, isActive: true }, 1);
      const stale = clientWithToken("client-8");
      await gateway.handleConnection(stale);
      expect(stale.join).not.toHaveBeenCalled();
      expect(stale.disconnect).toHaveBeenCalled();

      storedAccount({ id: USER_1, isActive: true }, 0);
      const legacy = clientWithToken("client-9");
      await gateway.handleConnection(legacy);
      expect(legacy.join).toHaveBeenCalledWith(`user:${USER_1}`);
    });

    it.each([
      ["a missing account", null],
      ["an inactive account", { id: USER_1, isActive: false }],
    ])("refuses a token of %s", async (_label, account) => {
      jwtService.verify.mockReturnValue({ sub: USER_1, tv: 0 });
      storedAccount(account);
      const client = clientWithToken("client-10");

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it("refuses a subject that is not a user id without querying", async () => {
      jwtService.verify.mockReturnValue({ sub: "user-1", tv: 0 });
      const client = clientWithToken("client-11");

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(userRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe("handleDisconnect", () => {
    it("should log disconnect", () => {
      const mockClient = { id: "client-1" } as any;

      // Should not throw
      gateway.handleDisconnect(mockClient);
    });
  });

  describe("emitProgress", () => {
    it("should emit progress event to user room", async () => {
      const payload = {
        receiptId: "r1",
        orderId: "o1",
        progress: 50,
        stage: "generating_pdf",
      };

      await gateway.emitProgress("user-1", payload);

      expect(mockServer.to).toHaveBeenCalledWith("user:user-1");
      expect(mockServer.emit).toHaveBeenCalledWith("receipt.progress", payload);
    });
  });

  describe("emitCompleted", () => {
    it("should emit completed event to user room", async () => {
      const payload = {
        receiptId: "r1",
        orderId: "o1",
        pdfUrl: "https://s3/receipt.pdf",
        receiptNumber: "2025-000001",
      };

      await gateway.emitCompleted("user-1", payload);

      expect(mockServer.to).toHaveBeenCalledWith("user:user-1");
      expect(mockServer.emit).toHaveBeenCalledWith(
        "receipt.completed",
        payload,
      );
    });
  });

  describe("emitFailed", () => {
    it("should emit failed event to user room", async () => {
      const payload = {
        receiptId: "r1",
        orderId: "o1",
        error: "Generation failed",
      };

      await gateway.emitFailed("user-1", payload);

      expect(mockServer.to).toHaveBeenCalledWith("user:user-1");
      expect(mockServer.emit).toHaveBeenCalledWith("receipt.failed", payload);
    });
  });

  describe("sockets of a revoked token", () => {
    const socket = (id: string, tokenVersion: unknown) => ({
      id,
      data: { tokenVersion },
      disconnect: jest.fn(),
    });
    const progress = {
      receiptId: "r1",
      orderId: "o1",
      progress: 10,
      stage: "queued",
    };

    it("remembers the token version a socket connected with", async () => {
      jwtService.verify.mockReturnValue({ sub: USER_1, tv: 2 });
      storedAccount({ id: USER_1, isActive: true }, 2);
      const client = {
        ...clientWithToken("client-v"),
        data: {} as Record<string, unknown>,
      };

      await gateway.handleConnection(client);

      expect(client.data.tokenVersion).toBe(2);
    });

    it("disconnects a socket whose token was revoked after it connected, then emits to the rest", async () => {
      const stale = socket("old-tab", 0);
      const current = socket("new-tab", 1);
      roomSockets = [stale, current];
      queryBuilder.getRawOne.mockResolvedValue({ token_version: 1 });

      await gateway.emitCompleted(USER_1, {
        receiptId: "r1",
        orderId: "o1",
        pdfUrl: "https://s3/receipt.pdf",
        receiptNumber: "2026-000001",
      });

      expect(stale.disconnect).toHaveBeenCalledWith(true);
      expect(current.disconnect).not.toHaveBeenCalled();
      expect(stale.disconnect.mock.invocationCallOrder[0]).toBeLessThan(
        mockServer.emit.mock.invocationCallOrder[0],
      );
    });

    it("disconnects every socket of an account that is gone", async () => {
      const orphan = socket("tab", 0);
      roomSockets = [orphan];
      queryBuilder.getRawOne.mockResolvedValue(undefined);

      await gateway.emitProgress(USER_1, progress);

      expect(orphan.disconnect).toHaveBeenCalledWith(true);
    });

    it("does not query the database when nobody of that user is connected", async () => {
      await gateway.emitProgress(USER_1, progress);

      expect(queryBuilder.getRawOne).not.toHaveBeenCalled();
      expect(mockServer.emit).toHaveBeenCalledWith(
        "receipt.progress",
        progress,
      );
    });

    it.each(["database", "socket lookup"])(
      "suppresses completed payloads when the %s recheck fails, then recovers in order",
      async (failure) => {
        const stale = socket("revoked-tab", 0);
        const current = socket("current-tab", 1);
        roomSockets = [stale, current];
        queryBuilder.getRawOne.mockResolvedValue({ token_version: 1 });
        let rejectRecheck: (error: Error) => void = () => undefined;
        let startRecheck: () => void = () => undefined;
        const recheckStarted = new Promise<void>((resolve) => {
          startRecheck = resolve;
        });
        const failedRecheck = () => {
          startRecheck();
          return new Promise<never>((_, reject) => {
            rejectRecheck = reject;
          });
        };
        if (failure === "database") {
          queryBuilder.getRawOne.mockImplementationOnce(failedRecheck);
        } else {
          mockServer
            .in(`user:${USER_1}`)
            .fetchSockets.mockImplementationOnce(failedRecheck);
        }
        const completed = {
          receiptId: "r1",
          orderId: "o1",
          pdfUrl: "https://storage.example/receipt.pdf?signature=sensitive",
          receiptNumber: "2026-000001",
        };

        const failed = gateway.emitCompleted(USER_1, completed);
        const laterProgress = gateway.emitProgress(USER_1, progress);
        const laterCompleted = gateway.emitCompleted(USER_1, completed);
        await recheckStarted;
        expect(mockServer.emit).not.toHaveBeenCalled();
        rejectRecheck(new Error("recheck unavailable"));

        await expect(
          Promise.all([failed, laterProgress, laterCompleted]),
        ).resolves.toEqual([undefined, undefined, undefined]);

        expect(mockServer.emit.mock.calls).toEqual([
          ["receipt.progress", progress],
          ["receipt.completed", completed],
        ]);
        expect(stale.disconnect).toHaveBeenCalledWith(true);
        expect(current.disconnect).not.toHaveBeenCalled();
        expect(stale.disconnect.mock.invocationCallOrder[0]).toBeLessThan(
          mockServer.emit.mock.invocationCallOrder[0],
        );
      },
    );
  });
});
