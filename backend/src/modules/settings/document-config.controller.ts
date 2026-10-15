import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { DocumentConfigService } from "./services/document-config.service";
import { DocumentMultipart, documentPayload } from "./document-multipart";
import { z } from "zod";
import {
  parseConfig,
  presetCreateSchema,
  presetUpdateSchema,
  revisionSchema,
  saveSchema,
} from "./document-config";

@Controller("settings")
@UseGuards(JwtAuthGuard)
export class DocumentConfigController {
  constructor(private readonly documents: DocumentConfigService) {}
  @Get("document-config")
  async read(
    @Request() req: { user: { id: string } },
    @Query() query: unknown = {},
  ) {
    parseConfig(z.object({}).strict(), query);
    return { data: await this.documents.read(req.user.id) };
  }
  @Put("document-config")
  @UseInterceptors(DocumentMultipart())
  async save(
    @Request() req: { user: { id: string } },
    @Body() body: unknown,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const draft = documentPayload(saveSchema, body, file);
    return {
      data: await this.documents.save(
        req.user.id,
        draft,
        draft.expectedRevision,
        file,
      ),
    };
  }
  @Get("document-presets")
  async list(
    @Request() req: { user: { id: string } },
    @Query() query: unknown = {},
  ) {
    parseConfig(z.object({}).strict(), query);
    return { data: await this.documents.listPresets(req.user.id) };
  }
  @Get("document-presets/:id")
  async preset(
    @Request() req: { user: { id: string } },
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: unknown = {},
  ) {
    parseConfig(z.object({}).strict(), query);
    const value = await this.documents.preset(req.user.id, id);
    return {
      data: {
        id: value.id,
        name: value.name,
        revision: value.revision,
        config: value.config,
      },
    };
  }
  @Post("document-presets")
  @UseInterceptors(DocumentMultipart())
  async create(
    @Request() req: { user: { id: string } },
    @Body() body: unknown,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return {
      data: await this.documents.savePreset(
        req.user.id,
        documentPayload(presetCreateSchema, body, file),
        undefined,
        undefined,
        file,
      ),
    };
  }
  @Put("document-presets/:id")
  @UseInterceptors(DocumentMultipart())
  async update(
    @Request() req: { user: { id: string } },
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const draft = documentPayload(presetUpdateSchema, body, file);
    return {
      data: await this.documents.savePreset(
        req.user.id,
        draft,
        id,
        draft.expectedRevision,
        file,
      ),
    };
  }
  @Delete("document-presets/:id")
  async remove(
    @Request() req: { user: { id: string } },
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { expectedRevision } = parseConfig(revisionSchema, body);
    await this.documents.deletePreset(req.user.id, id, expectedRevision);
    return { data: { deleted: true } };
  }
}
