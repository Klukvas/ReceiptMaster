import { Controller, Delete, Get, Post } from "@nestjs/common";
import {
  ApiExcludeController,
  ApiExcludeEndpoint,
  OpenAPIObject,
} from "@nestjs/swagger";
import {
  describeContractDrift,
  listControllerRoutes,
  listDocumentedOperations,
  multisetDifference,
  routeKey,
  serializeDocument,
} from "./openapi-contract";

@Controller("things")
class ThingsController {
  @Get()
  list() {}
  @Get(":id")
  one() {}
  @Post(":id/notes/:noteId")
  note() {}
  @Delete(["a", "b"])
  many() {}
  @Post("hook")
  @ApiExcludeEndpoint()
  hidden() {}
  helper() {}
}

@Controller()
class RootController {
  @Get("health")
  health() {}
}

@ApiExcludeController()
@Controller("internal")
class InternalController {
  @Get()
  secret() {}
}

const doc = (
  paths: OpenAPIObject["paths"],
  schemas: Record<string, unknown> = {},
): OpenAPIObject => ({
  openapi: "3.0.0",
  info: { title: "t", version: "1" },
  paths,
  components: { schemas },
});

describe("routeKey", () => {
  it.each([
    [
      "GET",
      "settings",
      "document-presets/:id",
      "GET /settings/document-presets/{id}",
    ],
    ["GET", "/", "health", "GET /health"],
    ["POST", "receipts", "/", "POST /receipts"],
    ["GET", "/", "/", "GET /"],
  ])("%s %s + %s", (method, base, path, expected) => {
    expect(routeKey(method, base, path)).toBe(expected);
  });
});

describe("listControllerRoutes", () => {
  it("lists routed handlers once per path, skipping Swagger exclusions", () => {
    expect(
      listControllerRoutes([
        ThingsController,
        RootController,
        InternalController,
        ThingsController,
      ]).sort(),
    ).toEqual(
      [
        "GET /things",
        "GET /things/{id}",
        "POST /things/{id}/notes/{noteId}",
        "DELETE /things/a",
        "DELETE /things/b",
        "GET /health",
      ].sort(),
    );
  });
});

describe("listDocumentedOperations / multisetDifference", () => {
  it("compares routes and operations as multisets", () => {
    const documented = listDocumentedOperations(
      doc({ "/x": { get: {} as never, post: {} as never } }),
    );
    expect(documented).toEqual(["GET /x", "POST /x"]);
    expect(multisetDifference(["GET /x", "GET /x"], documented)).toEqual([
      "GET /x",
    ]);
    expect(multisetDifference(documented, ["GET /x"])).toEqual(["POST /x"]);
  });
});

describe("describeContractDrift", () => {
  it("names added, removed and changed operations and components", () => {
    const stored = doc(
      { "/a": { get: { responses: {} } }, "/gone": { get: { responses: {} } } },
      { Dto: { type: "object", properties: { a: { type: "string" } } } },
    );
    const fresh = doc(
      {
        "/a": { get: { responses: {}, summary: "changed" } },
        "/new": { post: { responses: {} } },
      },
      {
        Dto: { type: "object", properties: { a: {}, b: { type: "string" } } },
        Added: {},
      },
    );
    expect(describeContractDrift(stored, fresh)).toEqual([
      "  + operation POST /new",
      "  - operation GET /gone",
      "  ~ operation GET /a",
      "  + component Added",
      "  ~ component Dto (+b, ~a)",
    ]);
  });

  it("still reports a difference that is only formatting", () => {
    expect(describeContractDrift(doc({}), doc({}))).toHaveLength(1);
  });

  it("serialises with two-space indentation and a final newline", () => {
    expect(serializeDocument(doc({}))).toMatch(/^\{\n {2}"openapi".*\n\}\n$/s);
  });
});
