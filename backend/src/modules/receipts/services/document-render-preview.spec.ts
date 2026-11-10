import { legacyConfig } from "../../settings/document-config";
import { DocumentAssetsService } from "../../settings/services/document-assets.service";
import {
  DocumentRenderService,
  PREVIEW_GLOBAL_LIMIT,
  RenderSnapshot,
  sampleOrder,
} from "./document-render.service";
import { PlaywrightPdfGenerator } from "./playwright-pdf-generator.service";
import { TemplateService } from "./template.service";

type Deferred = { promise: Promise<undefined>; resolve: () => void };

const deferred = (): Deferred => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<undefined>((done) => {
    resolve = () => done(undefined);
  });
  return { promise, resolve };
};

/** Each preview waits on its own gate in the logo step until the test opens it. */
function previewService() {
  const gates: Deferred[] = [];
  const assets = {
    preview: jest.fn(() => {
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    }),
  } as unknown as DocumentAssetsService;
  const renderer = {
    generatePdf: jest.fn().mockResolvedValue(Buffer.from("%PDF")),
  } as unknown as PlaywrightPdfGenerator;
  const service = new DocumentRenderService(
    {} as TemplateService,
    renderer,
    assets,
  );
  jest.spyOn(service, "prepare").mockResolvedValue({
    html: "<html></html>",
    snapshot: { options: {} } as RenderSnapshot,
  });
  return { service, gates };
}

const draft = { config: legacyConfig(null), logoAction: "keep" as const };
const preview = (service: DocumentRenderService, userId: string) =>
  service.preview(userId, draft, sampleOrder(userId));
const flush = () => new Promise((done) => setImmediate(done));

describe("DocumentRenderService preview concurrency", () => {
  it("refuses a second preview of the same account while its first is rendering", async () => {
    const { service, gates } = previewService();

    const first = preview(service, "user-a");
    await expect(preview(service, "user-a")).rejects.toMatchObject({
      status: 429,
    });

    gates[0].resolve();
    await expect(first).resolves.toBeInstanceOf(Buffer);
    gates.length = 0;
    const again = preview(service, "user-a");
    await flush();
    gates[0].resolve();
    await expect(again).resolves.toBeInstanceOf(Buffer);
  });

  it("lets another account preview while one account is rendering", async () => {
    const { service, gates } = previewService();

    const first = preview(service, "user-a");
    const second = preview(service, "user-b");
    await flush();
    gates.forEach((gate) => gate.resolve());

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("still caps previews across accounts", async () => {
    const { service, gates } = previewService();

    const running = Array.from({ length: PREVIEW_GLOBAL_LIMIT }, (_, index) =>
      preview(service, `user-${index}`),
    );
    await expect(preview(service, "user-late")).rejects.toMatchObject({
      status: 429,
    });

    await flush();
    gates.forEach((gate) => gate.resolve());
    await Promise.all(running);
  });

  it("frees the account's slot when a preview fails", async () => {
    const { service, gates } = previewService();
    jest.spyOn(service, "prepare").mockRejectedValueOnce(new Error("boom"));

    const failing = preview(service, "user-a");
    await flush();
    gates[0].resolve();
    await expect(failing).rejects.toThrow("boom");

    const next = preview(service, "user-a");
    await flush();
    gates[1].resolve();
    await expect(next).resolves.toBeInstanceOf(Buffer);
  });
});
