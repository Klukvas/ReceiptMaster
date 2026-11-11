import { pdfDisposition } from "./content-disposition";
import { Controller, Get, Header, Param, Res, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { ReceiptsService } from "./receipts.service";

// Share links are capability URLs; they must not be indexed.
const ROBOTS_NOINDEX = "noindex, nofollow";
// ...and a shared proxy or CDN must not keep a copy that outlives a revoked link.
const NO_STORE = "private, no-store";

@ApiTags("public-receipts")
@Controller("public/receipts")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class PublicReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get(":token")
  @Header("X-Robots-Tag", ROBOTS_NOINDEX)
  @Header("Cache-Control", NO_STORE)
  @ApiOperation({ summary: "Get public receipt data by token (no auth)" })
  @ApiResponse({ status: 200, description: "Receipt data returned" })
  @ApiResponse({ status: 404, description: "Receipt not found or revoked" })
  async getPublicReceipt(@Param("token") token: string) {
    return this.receiptsService.getPublicReceipt(token);
  }

  @Get(":token/pdf")
  @ApiOperation({ summary: "Download public receipt PDF by token (no auth)" })
  @ApiResponse({ status: 200, description: "PDF file returned" })
  @ApiResponse({ status: 404, description: "Receipt not found or revoked" })
  async getPublicReceiptPdf(
    @Param("token") token: string,
    @Res() res: Response,
  ) {
    // Set before the lookup: with @Res() Nest does not apply @Header, and error
    // responses must carry it too. Errors go to GlobalExceptionFilter, which keeps
    // these headers and answers `{ error, errorCode }` like every other route.
    res.set({ "X-Robots-Tag": ROBOTS_NOINDEX, "Cache-Control": NO_STORE });
    const { buffer, filename } =
      await this.receiptsService.getPublicReceiptPdf(token);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfDisposition(filename),
      "Content-Length": buffer.length.toString(),
    });

    res.send(buffer);
  }
}
