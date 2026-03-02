import { ReceiptsGateway } from "./receipts.gateway";

describe("ReceiptsGateway", () => {
  let gateway: ReceiptsGateway;
  let jwtService: any;
  let configService: any;
  let mockServer: any;

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
    };

    configService = {
      get: jest.fn().mockReturnValue("jwt-secret"),
    };

    gateway = new ReceiptsGateway(jwtService, configService);

    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    gateway.server = mockServer;
  });

  describe("handleConnection", () => {
    it("should authenticate client with auth token", async () => {
      jwtService.verify.mockReturnValue({ sub: "user-1" });

      const mockClient = {
        id: "client-1",
        handshake: {
          auth: { token: "valid-token" },
          headers: {},
        },
        join: jest.fn(),
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(mockClient);

      expect(jwtService.verify).toHaveBeenCalledWith("valid-token", {
        secret: "jwt-secret",
      });
      expect(mockClient.join).toHaveBeenCalledWith("user:user-1");
      expect((mockClient as any).userId).toBe("user-1");
    });

    it("should authenticate with Authorization header", async () => {
      jwtService.verify.mockReturnValue({ sub: "user-2" });

      const mockClient = {
        id: "client-2",
        handshake: {
          auth: {},
          headers: { authorization: "Bearer header-token" },
        },
        join: jest.fn(),
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(mockClient);

      expect(jwtService.verify).toHaveBeenCalledWith("header-token", {
        secret: "jwt-secret",
      });
      expect(mockClient.join).toHaveBeenCalledWith("user:user-2");
    });

    it("should disconnect client without token", async () => {
      const mockClient = {
        id: "client-3",
        handshake: {
          auth: {},
          headers: {},
        },
        join: jest.fn(),
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
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
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
    it("should emit progress event to user room", () => {
      const payload = {
        receiptId: "r1",
        orderId: "o1",
        progress: 50,
        stage: "generating_pdf",
      };

      gateway.emitProgress("user-1", payload);

      expect(mockServer.to).toHaveBeenCalledWith("user:user-1");
      expect(mockServer.emit).toHaveBeenCalledWith("receipt.progress", payload);
    });
  });

  describe("emitCompleted", () => {
    it("should emit completed event to user room", () => {
      const payload = {
        receiptId: "r1",
        orderId: "o1",
        pdfUrl: "https://s3/receipt.pdf",
        receiptNumber: "2025-000001",
      };

      gateway.emitCompleted("user-1", payload);

      expect(mockServer.to).toHaveBeenCalledWith("user:user-1");
      expect(mockServer.emit).toHaveBeenCalledWith(
        "receipt.completed",
        payload,
      );
    });
  });

  describe("emitFailed", () => {
    it("should emit failed event to user room", () => {
      const payload = {
        receiptId: "r1",
        orderId: "o1",
        error: "Generation failed",
      };

      gateway.emitFailed("user-1", payload);

      expect(mockServer.to).toHaveBeenCalledWith("user:user-1");
      expect(mockServer.emit).toHaveBeenCalledWith("receipt.failed", payload);
    });
  });
});
