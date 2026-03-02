import { RequestIdMiddleware } from "./request-id.middleware";

describe("RequestIdMiddleware", () => {
  let middleware: RequestIdMiddleware;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
  });

  it("should use existing x-request-id header if present", () => {
    const req = { headers: { "x-request-id": "existing-id-123" } } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req["requestId"]).toBe("existing-id-123");
    expect(res.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      "existing-id-123",
    );
    expect(next).toHaveBeenCalled();
  });

  it("should generate a new UUID if no x-request-id header", () => {
    const req = { headers: {} } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req["requestId"]).toBeDefined();
    expect(typeof req["requestId"]).toBe("string");
    expect(req["requestId"].length).toBeGreaterThan(0);
    expect(res.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      req["requestId"],
    );
    expect(next).toHaveBeenCalled();
  });

  it("should set requestId on the response header", () => {
    const req = { headers: {} } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      expect.any(String),
    );
  });

  it("should call next()", () => {
    const req = { headers: {} } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
