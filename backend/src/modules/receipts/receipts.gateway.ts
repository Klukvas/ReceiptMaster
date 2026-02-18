import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

export interface ReceiptProgressPayload {
  receiptId: string;
  orderId: string;
  progress: number;
  stage: string;
}

export interface ReceiptCompletedPayload {
  receiptId: string;
  orderId: string;
  pdfUrl?: string;
  receiptNumber: string;
}

export interface ReceiptFailedPayload {
  receiptId: string;
  orderId: string;
  error: string;
}

@WebSocketGateway({
  namespace: "/receipts",
  cors: {
    origin: "*",
    credentials: true,
  },
})
export class ReceiptsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ReceiptsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>("JWT_SECRET"),
      });

      const userId = payload.sub;
      if (!userId) {
        client.disconnect();
        return;
      }

      (client as any).userId = userId;
      client.join(`user:${userId}`);
      this.logger.log(`Client ${client.id} joined room user:${userId}`);
    } catch (error) {
      this.logger.warn(`Client ${client.id} auth failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  emitProgress(userId: string, payload: ReceiptProgressPayload): void {
    this.server.to(`user:${userId}`).emit("receipt.progress", payload);
  }

  emitCompleted(userId: string, payload: ReceiptCompletedPayload): void {
    this.server.to(`user:${userId}`).emit("receipt.completed", payload);
  }

  emitFailed(userId: string, payload: ReceiptFailedPayload): void {
    this.server.to(`user:${userId}`).emit("receipt.failed", payload);
  }
}
