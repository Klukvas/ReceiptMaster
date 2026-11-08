import { pdfDisposition } from "./content-disposition";
import {
  Controller,
  Get,
  Header,
  Param,
  Res,
  Logger,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { ReceiptsService } from "./receipts.service";

// Share links are capability URLs; they must not be indexed.
const ROBOTS_NOINDEX = "noindex, nofollow";

@ApiTags("public-receipts")
@Controller("public/receipts")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class PublicReceiptsController {
  private readonly logger = new Logger(PublicReceiptsController.name);

  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get(":token")
  @Header("X-Robots-Tag", ROBOTS_NOINDEX)
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
    // responses must carry it too.
    res.set("X-Robots-Tag", ROBOTS_NOINDEX);
    try {
      const { buffer, filename } =
        await this.receiptsService.getPublicReceiptPdf(token);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfDisposition(filename),
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      });

      res.send(buffer);
    } catch (error) {
      this.logger.error("Error serving public PDF:", error);
      const statusCode = error?.statusCode ?? error?.status ?? 500;
      const isClientError = statusCode >= 400 && statusCode < 500;
      res.status(statusCode).json({
        error: isClientError
          ? (error?.message ?? "Not found")
          : "Error retrieving PDF",
      });
    }
  }
}
