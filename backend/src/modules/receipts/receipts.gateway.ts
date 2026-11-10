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
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import {
  currentTokenVersion,
  findAccessTokenOwner,
  tokenVersionOf,
} from "../users/access-token";

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
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const corsEnv = process.env.CORS_ORIGINS;
      if (!corsEnv) {
        // No restriction configured — allow all
        callback(null, true);
        return;
      }
      const allowed = corsEnv.split(",").map((o) => o.trim());
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed`));
      }
    },
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
    @InjectRepository(User)
    private userRepository: Repository<User>,
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

      // The same check as the HTTP JwtStrategy, once per connection: a token revoked
      // by logout or a password change (stale `tv`) must not join the user's room.
      const owner = await findAccessTokenOwner(this.userRepository, payload);
      if (!owner) {
        this.logger.warn(
          `Client ${client.id} has no active account for its token, or the token was revoked`,
        );
        client.disconnect();
        return;
      }

      const userId = owner.id;

      (client as any).userId = userId;
      // Checked again before every emit: logout or a password change after this point must
      // also end this socket, not only the HTTP token.
      client.data.tokenVersion = tokenVersionOf(payload);
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

  /**
   * Per user, the last emit still in flight. Each emit first awaits the one before it, so a
   * user's events keep their order although each one checks the database first.
   */
  private readonly pendingEmits = new Map<string, Promise<void>>();

  emitProgress(userId: string, payload: ReceiptProgressPayload): Promise<void> {
    return this.emitToUser(userId, "receipt.progress", payload);
  }

  emitCompleted(
    userId: string,
    payload: ReceiptCompletedPayload,
  ): Promise<void> {
    return this.emitToUser(userId, "receipt.completed", payload);
  }

  emitFailed(userId: string, payload: ReceiptFailedPayload): Promise<void> {
    return this.emitToUser(userId, "receipt.failed", payload);
  }

  /** Never rejects; callers may fire and forget. */
  private emitToUser(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    const previous = this.pendingEmits.get(userId) ?? Promise.resolve();
    const next = previous.then(() =>
      this.sendToCurrentSockets(userId, event, payload),
    );
    this.pendingEmits.set(userId, next);
    void next.finally(() => {
      if (this.pendingEmits.get(userId) === next)
        this.pendingEmits.delete(userId);
    });
    return next;
  }

  private async sendToCurrentSockets(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    const room = `user:${userId}`;
    try {
      await this.dropRevokedSockets(room, userId);
    } catch (error) {
      // The connect-time check already held; a failed recheck must not stop progress.
      this.logger.warn(
        `Could not recheck token versions in ${room}: ${error instanceof Error ? error.message : error}`,
      );
    }
    this.server.to(room).emit(event, payload);
  }

  /**
   * Disconnects this user's sockets whose token was revoked since they connected (logout or
   * a password change bumped `users.token_version`). Only this process's sockets are seen
   * (no socket.io adapter is shared between replicas), and so are only its emits.
   */
  private async dropRevokedSockets(
    room: string,
    userId: string,
  ): Promise<void> {
    const sockets = await this.server.in(room).fetchSockets();
    if (sockets.length === 0) return;
    const current = await currentTokenVersion(this.userRepository, userId);
    for (const socket of sockets) {
      if (socket.data.tokenVersion !== current) {
        this.logger.log(`Client ${socket.id} disconnected: token revoked`);
        socket.disconnect(true);
      }
    }
  }
}
