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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
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
import {
  ApiDataResponse,
  ApiDocumentDraftBody,
  ApiFailureResponses,
  ApiJsonBody,
} from "../../openapi/api-docs.decorators";

const REVISION_CONFLICT =
  "Revision conflict: the stored value changed since it was read; reload and retry";
const TOO_LARGE = "Request above 6 MiB or logo above 5 MiB";

@ApiTags("settings")
@ApiBearerAuth("bearer")
@Controller("settings")
@UseGuards(JwtAuthGuard)
export class DocumentConfigController {
  constructor(private readonly documents: DocumentConfigService) {}
  @Get("document-config")
  @ApiOperation({ summary: "Read the account document configuration" })
  @ApiDataResponse(200, "DocumentConfigVersionResponse", "Current revision")
  @ApiFailureResponses({ 400: "Unknown query parameter" })
  async read(
    @Request() req: { user: { id: string } },
    @Query() query: unknown = {},
  ) {
    parseConfig(z.object({}).strict(), query);
    return { data: await this.documents.read(req.user.id) };
  }
  @Put("document-config")
  @UseInterceptors(DocumentMultipart())
  @ApiOperation({ summary: "Save the account document configuration" })
  @ApiDocumentDraftBody("DocumentConfigSaveRequest")
  @ApiDataResponse(200, "DocumentConfigVersionResponse", "Committed revision")
  @ApiFailureResponses({
    400: "Invalid draft, envelope or logo",
    402: "Template not available on the current plan",
    409: REVISION_CONFLICT,
    413: TOO_LARGE,
  })
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
  @ApiOperation({ summary: "List document presets" })
  @ApiDataResponse(200, "DocumentPresetListResponse", "Preset summaries")
  @ApiFailureResponses({ 400: "Unknown query parameter" })
  async list(
    @Request() req: { user: { id: string } },
    @Query() query: unknown = {},
  ) {
    parseConfig(z.object({}).strict(), query);
    return { data: await this.documents.listPresets(req.user.id) };
  }
  @Get("document-presets/:id")
  @ApiOperation({ summary: "Read one document preset" })
  @ApiDataResponse(200, "DocumentPresetResponse", "Editable preset")
  @ApiFailureResponses({
    400: "Invalid preset ID or unknown query parameter",
    404: "Preset not found",
  })
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
  @ApiOperation({ summary: "Create a document preset" })
  @ApiDocumentDraftBody("DocumentPresetCreateRequest")
  @ApiDataResponse(201, "DocumentPresetResponse", "Created preset")
  @ApiFailureResponses({
    400: "Invalid draft, envelope or logo",
    402: "Template not available on the current plan",
    409: "Maximum 20 presets, or a preset with this name already exists",
    413: TOO_LARGE,
  })
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
  @ApiOperation({ summary: "Update a document preset" })
  @ApiDocumentDraftBody("DocumentPresetUpdateRequest")
  @ApiDataResponse(200, "DocumentPresetResponse", "Updated preset")
  @ApiFailureResponses({
    400: "Invalid preset ID, draft, envelope or logo",
    402: "Template not available on the current plan",
    404: "Preset not found",
    409: `${REVISION_CONFLICT}; or a preset with this name already exists`,
    413: TOO_LARGE,
  })
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
  @ApiOperation({ summary: "Delete a document preset" })
  @ApiJsonBody("DocumentRevisionRequest")
  @ApiDataResponse(200, "DocumentPresetDeletedResponse", "Preset deleted")
  @ApiFailureResponses({
    400: "Invalid preset ID or body",
    404: "Preset not found",
    409: REVISION_CONFLICT,
  })
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
