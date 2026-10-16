import { Browser, chromium } from "playwright";
import { PlaywrightPdfGenerator } from "./playwright-pdf-generator.service";
jest.mock("playwright", () => ({ chromium: { launch: jest.fn() } }));
describe("shared preview browser startup", () => {
  const launch = jest.mocked(chromium.launch);
  const browser = {
    isConnected: () => true,
    close: jest.fn(),
  } as unknown as Browser;
  beforeEach(() => jest.clearAllMocks());
  it("shares one browser launch across concurrent preview requests", async () => {
    let complete: ((browser: Browser) => void) | undefined;
    launch.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const renderer = new PlaywrightPdfGenerator();
    const first = renderer.initialize(),
      second = renderer.initialize();
    expect(launch).toHaveBeenCalledTimes(1);
    if (!complete) throw new Error("Launch was not started");
    complete(browser);
    await Promise.all([first, second]);
    await renderer.cleanup();
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
  it("permits a retry after failed startup", async () => {
    launch
      .mockRejectedValueOnce(new Error("Chrome unavailable"))
      .mockResolvedValueOnce(browser);
    const renderer = new PlaywrightPdfGenerator();
    await expect(renderer.initialize()).rejects.toThrow("Chrome unavailable");
    await renderer.initialize();
    expect(launch).toHaveBeenCalledTimes(2);
    await renderer.cleanup();
  });
  it("does not launch again while its browser is connected", async () => {
    launch.mockResolvedValue(browser);
    const renderer = new PlaywrightPdfGenerator();
    await renderer.initialize();
    await renderer.initialize();
    expect(launch).toHaveBeenCalledTimes(1);
    await renderer.cleanup();
  });
  // Chromium refuses to start with --no-zygote while its sandbox is enabled,
  // which broke every receipt PDF in production on 2026-10-16.
  it("never combines --no-zygote with an enabled sandbox", async () => {
    launch.mockResolvedValue(browser);
    const renderer = new PlaywrightPdfGenerator();
    await renderer.initialize();
    const options = launch.mock.calls[0][0] ?? {};
    if (options.args?.includes("--no-zygote")) {
      expect(options.chromiumSandbox).toBe(false);
      expect(options.args).toContain("--no-sandbox");
    }
    await renderer.cleanup();
  });
});
