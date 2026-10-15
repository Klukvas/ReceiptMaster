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
  it("does not launch again while its browser is connected and keeps sandbox enabled", async () => {
    launch.mockResolvedValue(browser);
    const renderer = new PlaywrightPdfGenerator();
    await renderer.initialize();
    await renderer.initialize();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ chromiumSandbox: true }),
    );
    expect(launch.mock.calls[0][0].args).not.toContain("--no-sandbox");
    await renderer.cleanup();
  });
});
