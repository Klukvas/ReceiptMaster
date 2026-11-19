import { CreemClient } from "./creem.client";

const makeClient = (environment: string | undefined = "test") =>
  new CreemClient({
    get: (key: string) =>
      ({ CREEM_API_KEY: "creem_test_key", CREEM_ENVIRONMENT: environment })[
        key
      ],
  } as never);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("CreemClient", () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, "fetch");
  });
  afterEach(() => fetchMock.mockRestore());

  it("posts a checkout to the test API with the user in the metadata", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ checkout_url: "https://checkout.creem.io/ch_1" }),
    );

    const url = await makeClient().createCheckout({
      productId: "prod_1",
      userId: "user-1",
      customerEmail: "buyer@example.test",
      successUrl: "https://app.example.test/settings?tab=subscription",
    });

    expect(url).toBe("https://checkout.creem.io/ch_1");
    const [requestUrl, init] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe("https://test-api.creem.io/v1/checkouts");
    expect(init?.headers).toMatchObject({ "x-api-key": "creem_test_key" });
    expect(JSON.parse(String(init?.body))).toEqual({
      product_id: "prod_1",
      request_id: "user-1",
      success_url: "https://app.example.test/settings?tab=subscription",
      customer: { email: "buyer@example.test" },
      metadata: { userId: "user-1" },
    });
  });

  it("uses the production API only when the environment says so", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ customer_portal_link: "https://creem.io/portal/x" }),
    );

    await makeClient("production").createPortalLink("cust_1");
    await makeClient(undefined).createPortalLink("cust_1");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.creem.io/v1/customers/billing",
      "https://test-api.creem.io/v1/customers/billing",
    ]);
  });

  it.each([
    ["an error status", () => jsonResponse({ message: ["Forbidden"] }, 403)],
    ["a response without a URL", () => jsonResponse({ id: "ch_1" })],
    [
      "a URL that is not https",
      () => jsonResponse({ checkout_url: "javascript:alert(1)" }),
    ],
  ])("answers 502 without provider detail on %s", async (_name, respond) => {
    fetchMock.mockResolvedValue(respond());

    const failure = makeClient()
      .createCheckout({
        productId: "prod_1",
        userId: "user-1",
        customerEmail: "buyer@example.test",
        successUrl: "https://app.example.test/",
      })
      .catch((error: unknown) => error);

    await expect(failure).resolves.toMatchObject({
      errorCode: "PAYMENT_PROVIDER_FAILED",
      statusCode: 502,
      error: "Payment provider request failed",
    });
  });

  it("answers 502 when the network call fails", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));

    await expect(makeClient().createPortalLink("cust_1")).rejects.toMatchObject(
      { errorCode: "PAYMENT_PROVIDER_FAILED" },
    );
  });
});
