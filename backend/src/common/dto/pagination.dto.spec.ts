import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { MAX_PAGE_OFFSET, PaginationDto } from "./pagination.dto";

const errorsFor = (query: Record<string, string>) =>
  validate(plainToInstance(PaginationDto, query));

describe("PaginationDto offset", () => {
  it("accepts the largest allowed offset", async () => {
    expect(await errorsFor({ offset: String(MAX_PAGE_OFFSET) })).toHaveLength(
      0,
    );
  });

  it.each([String(MAX_PAGE_OFFSET + 1), "99999999999999", "-1"])(
    "refuses the offset %p",
    async (offset) => {
      const errors = await errorsFor({ offset });
      expect(errors.map((error) => error.property)).toEqual(["offset"]);
    },
  );
});
