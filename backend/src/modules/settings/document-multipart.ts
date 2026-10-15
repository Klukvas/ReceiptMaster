import {
  BadRequestException,
  PayloadTooLargeException,
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  mixin,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
import { Readable } from "stream";
import { of } from "rxjs";
import { DOCUMENT_BODY_LIMIT, readDocumentBody } from "./document-body-stream";
import { z } from "zod";
import { RequiredShape, parseConfig } from "./document-config";
/** Multer bounds are enforced while streaming, before image decoding. */
export const DocumentMultipart = () => {
  const Upload = FileInterceptor("logo", {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
      fields: 1,
      parts: 3,
      fieldSize: 64 * 1024,
      fieldNameSize: 30,
      headerPairs: 40,
    },
    fileFilter: (_request, file, callback) => {
      if (
        ![
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/gif",
          "image/svg+xml",
        ].includes(file.mimetype)
      )
        return callback(
          new BadRequestException("Use PNG, JPEG, GIF or SVG"),
          false,
        );
      callback(null, true);
    },
  });
  return mixin(
    class implements NestInterceptor {
      private readonly upload = new Upload();
      async intercept(context: ExecutionContext, next: CallHandler) {
        const request = context.switchToHttp().getRequest<Request>();
        if (
          Number(request.headers["content-length"] || 0) > DOCUMENT_BODY_LIMIT
        )
          throw new PayloadTooLargeException(
            "Document request must be at most 6 MiB",
          );
        if (!/^multipart\//i.test(request.headers["content-type"] || ""))
          return this.upload.intercept(context, next);
        const bytes = await readDocumentBody(request);
        // Multer installs its parser before replay begins. Preserve the original HTTP
        // request for auth/tenant/controller state; publish parsed fields only on success.
        const replay = Object.assign(Readable.from([bytes]), {
          headers: request.headers,
          method: request.method,
          body: undefined as unknown,
          file: undefined as Express.Multer.File | undefined,
        });
        const http = context.switchToHttp();
        const parsingContext = Object.create(context) as ExecutionContext;
        parsingContext.switchToHttp = () => ({
          getRequest: <T>() => replay as T,
          getResponse: <T>() => http.getResponse<T>(),
          getNext: <T>() => http.getNext<T>(),
        });
        try {
          await this.upload.intercept(parsingContext, {
            handle: () => of(undefined),
          });
          request.body = replay.body;
          request.file = replay.file;
        } finally {
          replay.destroy();
        }
        return next.handle();
      }
    },
  );
};
export function documentPayload<S extends z.ZodTypeAny>(
  schema: S,
  body: unknown,
  file?: Express.Multer.File,
): RequiredShape<z.output<S>> {
  let value = body;
  if (body && typeof body === "object" && "payload" in body) {
    if (
      Object.keys(body).length !== 1 ||
      typeof body.payload !== "string" ||
      Buffer.byteLength(body.payload) > 65536
    )
      throw new BadRequestException("Invalid draft payload");
    try {
      value = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException("Invalid draft JSON");
    }
  }
  const parsed = parseConfig(schema, value);
  const action =
    parsed && typeof parsed === "object" && "logoAction" in parsed
      ? parsed.logoAction
      : "keep";
  if ((action === "replace") !== Boolean(file))
    throw new BadRequestException(
      "Replacement requires one logo; keep/remove must have no file",
    );
  return parsed;
}
