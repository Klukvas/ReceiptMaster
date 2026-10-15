import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { IncomingMessage } from "http";

export const DOCUMENT_BODY_LIMIT = 6 * 1024 * 1024;

/** Capture the entire raw multipart envelope before parsing. This bounded buffer also
 * counts preamble/epilogue, which Multer's per-part limits cannot see. Register all
 * listeners before starting flow; an aborted request never reaches the parser. */
export function readDocumentBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const cleanup = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("aborted", onAbort);
      request.off("close", onClose);
      // IncomingMessage can emit error after aborted. Keep the error handler until
      // close on failure, so client disconnects cannot become unhandled errors.
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      chunks.length = 0;
      request.once("close", () => request.off("error", onError));
      reject(error);
      if (!request.destroyed) request.resume();
    };
    const onError = () =>
      fail(new BadRequestException("Incomplete document request"));
    const onAbort = () =>
      fail(new BadRequestException("Document request aborted"));
    const onClose = () => {
      if (!request.complete) onAbort();
    };
    const onData = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > DOCUMENT_BODY_LIMIT)
        return fail(
          new PayloadTooLargeException(
            "Document request must be at most 6 MiB",
          ),
        );
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      request.off("error", onError);
      resolve(Buffer.concat(chunks, bytes));
    };
    request.on("error", onError);
    request.once("aborted", onAbort);
    request.once("close", onClose);
    request.once("end", onEnd);
    request.on("data", onData);
    if (request.aborted || request.destroyed) onAbort();
  });
}
