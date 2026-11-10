import { ConflictException } from "@nestjs/common";
import { DocumentSignoffService } from "./document-signoff.service";

const USER = "user-1";
const ASSET = "asset-1";

function build(readSignoff: jest.Mock) {
  const db = {
    manager: {
      query: jest
        .fn()
        .mockResolvedValue([
          { signature_asset_id: ASSET, stamp_asset_id: null },
        ]),
    },
  };
  const service = new DocumentSignoffService(
    db as never,
    { readSignoff } as never,
    {} as never,
  );
  return service;
}

/** Runs `load` to the end with the retry pauses skipped. */
async function loadWithTimers(service: DocumentSignoffService) {
  const pending = service.load(USER);
  await jest.runAllTimersAsync();
  return pending;
}

describe("DocumentSignoffService.load", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("keeps the image when storage fails once and then answers", async () => {
    const bytes = Buffer.from("png");
    const readSignoff = jest
      .fn()
      .mockRejectedValueOnce(new Error("storage blip"))
      .mockResolvedValue(bytes);

    const load = await loadWithTimers(build(readSignoff));

    expect(readSignoff).toHaveBeenCalledTimes(2);
    expect(load.source.signature).toEqual({ assetId: ASSET, bytes });
    expect(load.unavailable).toEqual([]);
  });

  it("gives up after three failed reads and reports the image as unavailable", async () => {
    const readSignoff = jest.fn().mockRejectedValue(new Error("storage down"));

    const load = await loadWithTimers(build(readSignoff));

    expect(readSignoff).toHaveBeenCalledTimes(3);
    expect(load.source).toEqual({});
    expect(load.unavailable).toEqual(["signature"]);
    expect(load.pointers.signature).toBe(ASSET);
  });

  it("does not retry an image that is known to be bad", async () => {
    const readSignoff = jest
      .fn()
      .mockRejectedValue(new ConflictException("Image integrity check failed"));

    const load = await loadWithTimers(build(readSignoff));

    expect(readSignoff).toHaveBeenCalledTimes(1);
    expect(load.unavailable).toEqual(["signature"]);
  });
});
