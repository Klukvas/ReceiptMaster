import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ListDocumentsQueryDto } from "./list-documents-query.dto";

const parse = (query: Record<string, string>) =>
  plainToInstance(ListDocumentsQueryDto, query);
const errorsOf = (query: Record<string, string>) =>
  validateSync(parse(query), { whitelist: true }).map((e) => e.property);

describe("ListDocumentsQueryDto", () => {
  it("defaults to the first page of 20", () => {
    const dto = parse({});
    expect(dto).toMatchObject({ offset: 0, limit: 20, sortOrder: "DESC" });
    expect(validateSync(dto)).toEqual([]);
  });

  it("accepts every key the client's pagination hook sends, and the filters", () => {
    const query = {
      offset: "40",
      limit: "100",
      search: "  Acme  ",
      sortBy: "number",
      sortOrder: "ASC",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      type: "invoice",
      status: "generated",
    };
    expect(errorsOf(query)).toEqual([]);
    expect(parse(query)).toMatchObject({
      offset: 40,
      limit: 100,
      search: "Acme",
      type: "invoice",
      status: "generated",
    });
  });

  it("treats a cleared filter as no filter", () => {
    const dto = parse({ type: "", status: "", startDate: "", endDate: "" });
    expect(validateSync(dto)).toEqual([]);
    expect(dto.type).toBeUndefined();
    expect(dto.endDate).toBeUndefined();
  });

  it.each([
    [{ limit: "0" }, "limit"],
    [{ limit: "101" }, "limit"],
    [{ limit: "2.5" }, "limit"],
    [{ offset: "1.5" }, "offset"],
    [{ offset: "1e30" }, "offset"],
    [{ offset: "Infinity" }, "offset"],
    [{ offset: "99999999999999999999" }, "offset"],
    [{ offset: "1000001" }, "offset"],
    [{ offset: "-1" }, "offset"],
    [{ type: "bogus" }, "type"],
    [{ status: "paid" }, "status"],
    [{ startDate: "2026-1-1" }, "startDate"],
    [{ endDate: "2026-02-30" }, "endDate"],
    [{ endDate: "2026-01-31T10:00:00Z" }, "endDate"],
    [{ search: "x".repeat(101) }, "search"],
    [{ sortOrder: "UP" }, "sortOrder"],
  ])("refuses %j", (query, property) => {
    expect(errorsOf(query)).toContain(property);
  });

  it("lets an unknown sort key through; the service ignores it", () => {
    expect(errorsOf({ sortBy: "whatever" })).toEqual([]);
  });
});

describe("ListDocumentsQueryDto through the production ValidationPipe", () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const run = (query: Record<string, string>) =>
    pipe.transform(query, { type: "query", metatype: ListDocumentsQueryDto });

  it.each(["1e30", "Infinity", "99999999999999999999", "1.5", "-1"])(
    "refuses offset=%s with a 400 instead of reaching the database",
    async (offset) => {
      await expect(run({ offset })).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it("accepts the largest offset and limit", async () => {
    await expect(
      run({ offset: "1000000", limit: "100" }),
    ).resolves.toMatchObject({ offset: 1_000_000, limit: 100 });
  });
});
