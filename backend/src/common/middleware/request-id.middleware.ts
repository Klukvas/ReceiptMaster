import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import * as crypto from "crypto";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const requestId =
      (req.headers["x-request-id"] as string) || crypto.randomUUID();
    req["requestId"] = requestId;
    _res.setHeader("x-request-id", requestId);
    next();
  }
}
