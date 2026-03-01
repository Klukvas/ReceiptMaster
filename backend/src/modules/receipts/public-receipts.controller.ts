import { Controller, Get, Param, Res, Logger, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { ReceiptsService } from "./receipts.service";

@ApiTags("public-receipts")
@Controller("public/receipts")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class PublicReceiptsController {
  private readonly logger = new Logger(PublicReceiptsController.name);

  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get(":token")
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
    try {
      const { buffer, filename } =
        await this.receiptsService.getPublicReceiptPdf(token);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
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
