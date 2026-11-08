import { createHash } from "crypto";
import { SignoffSource } from "../../../common/services/signoff-image";
import { legacyConfig } from "../../settings/document-config";
import type { DocumentConfig } from "../../settings/document-config";
import { buildBuyer, buildSeller } from "../document-requisites";
import { DocumentType } from "../entities/receipt.entity";
import type { DocumentContext } from "../frozen-document";
import { getTemplateCapabilities } from "../templates/metadata";
import { DOCUMENT_LABELS } from "../templates/translations/document-labels";
import { DocumentRenderService, FrozenOrder } from "./document-render.service";
import { TemplateService } from "./template.service";

const NOW = new Date("2026-10-15T09:30:00Z");
const SIGNOFF_STYLES = ["standard", "classic", "minimal", "corporate"];
const OTHER_STYLES = [
  "compact",
  "modern",
  "elegant",
  "vintage",
  "tech",
  "wave",
  "thermal",
  "dark",
  "branded",
  "delivery",
  "proforma",
];
const STAMPED_TYPES = [
  DocumentType.INVOICE,
  DocumentType.ACT,
  DocumentType.QUOTE,
];
const UNSTAMPED_TYPES = [
  DocumentType.SALES_RECEIPT,
  DocumentType.PACKING_LIST,
  DocumentType.RETURN_NOTE,
];

const order: FrozenOrder = {
  id: "order-1",
  currency: "UAH",
  subtotal_cents: 205050,
  total_cents: 205050,
  created_at: "2026-10-14T12:34:00.000Z",
  recipient: { name: "Іван Покупець", address: "Львів" },
  items: [
    {
      product_name: "Розробка сайту",
      qty: 1,
      unit_price_cents: 150050,
      line_total_cents: 150050,
    },
    {
      product_name: "Консультація",
      qty: 2,
      unit_price_cents: 27500,
      line_total_cents: 55000,
    },
  ],
};

const configFor = (templateId: string): DocumentConfig => {
  const base = legacyConfig(null);
  return {
    ...base,
    templateId,
    documentLanguage: "uk",
    company: {
      ...base.company,
      companyName: "Продавець",
      companyTaxId: "12345678",
      companyIban: "UA213223130000026007233566001",
    },
  };
};

const contextFor = (
  type: DocumentType,
  config: DocumentConfig,
): DocumentContext => ({
  request: {
    type,
    details:
      type === DocumentType.ACT
        ? {
            contractRef: "Договір 7",
            period: { from: "2026-10-01", to: "2026-10-31" },
          }
        : type === DocumentType.QUOTE
          ? { validUntil: "2026-10-29" }
          : type === DocumentType.RETURN_NOTE
            ? { lines: [{ orderItemId: "item-1", qty: 1 }], reason: "Розмір" }
            : { dueDate: "2026-10-20" },
  },
  ...(type === DocumentType.RETURN_NOTE
    ? {
        returnSource: {
          kind: "waybill" as const,
          number: "2026-000003",
          date: "2026-10-10",
        },
      }
    : {}),
  seller: buildSeller(config.company, {
    companyLegalForm: "ТОВ",
    companyVatPayer: true,
    companyVatId: "123456789012",
    companySignatoryName: "Петренко Петро",
    companySignatoryPosition: "Директор",
  }),
  buyer: buildBuyer({ name: "Іван Покупець", legal_name: "ТОВ Іван" }),
  defaultPaymentTermDays: null,
});

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const hashOf = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const dataUri = (bytes: Buffer) =>
  `data:image/png;base64,${bytes.toString("base64")}`;

describe("signature and stamp in rendered documents", () => {
  const templates = new TemplateService();
  const renders = new DocumentRenderService(templates, undefined, undefined);
  let signoff: SignoffSource;
  let signatureUri: string;
  let stampUri: string;

  beforeAll(async () => {
    await templates.ready;
    const render = templates.renderTemplate.bind(templates);
    jest
      .spyOn(templates, "renderTemplate")
      .mockImplementation((name, data) =>
        render(name, { ...data, fontRegular: "FONT-R", fontBold: "FONT-B" }),
      );
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    // Fixed bytes (tiny valid PNGs): the digests below must not depend on an encoder.
    const signatureBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const stampBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    signoff = {
      signature: { assetId: "sig-asset", bytes: signatureBytes },
      stamp: { assetId: "stamp-asset", bytes: stampBytes },
    };
    signatureUri = dataUri(signatureBytes);
    stampUri = dataUri(stampBytes);
  });
  afterAll(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const renderTyped = (
    type: DocumentType,
    style: string,
    images?: SignoffSource,
  ) => {
    const config = configFor(style);
    return renders.prepare(
      "u1",
      config,
      order,
      "2026-000007",
      undefined,
      contextFor(type, config),
      images,
    );
  };
  const renderWaybill = (style: string, images?: SignoffSource) =>
    renders.prepare(
      "u1",
      configFor(style),
      order,
      "2026-000007",
      undefined,
      undefined,
      images,
    );

  describe("typed documents", () => {
    it.each(
      STAMPED_TYPES.flatMap((type) =>
        SIGNOFF_STYLES.map((s) => [type, s] as const),
      ),
    )(
      "%s / %s prints the signature in the seller block and the stamp beside it",
      async (type, style) => {
        const { html, snapshot } = await renderTyped(type, style, signoff);

        expect(html).toContain(
          `<img class="doc-sign-image" src="${signatureUri.replace(/=/g, "&#x3D;")}" alt="">`,
        );
        expect(html).toContain('class="doc-stamp"');
        expect(html).toContain(".doc-stamp { position: absolute;");
        expect(html).toContain('class="doc-sign-line doc-sign-line-image"');
        expect(snapshot.signoff).toEqual({
          signatureAssetId: "sig-asset",
          stampAssetId: "stamp-asset",
          signatureSha256: hashOf(signoff.signature!.bytes),
          stampSha256: hashOf(signoff.stamp!.bytes),
        });
      },
    );

    it.each(
      UNSTAMPED_TYPES.flatMap((type) =>
        SIGNOFF_STYLES.map((s) => [type, s] as const),
      ),
    )(
      "%s / %s prints the signature but no stamp, whatever was uploaded",
      async (type, style) => {
        const { html } = await renderTyped(type, style, signoff);
        expect(html).toContain('class="doc-sign-image"');
        expect(html).not.toContain('class="doc-stamp"');
      },
    );

    it.each(
      [...STAMPED_TYPES, ...UNSTAMPED_TYPES].flatMap((type) =>
        SIGNOFF_STYLES.map((s) => [type, s] as const),
      ),
    )(
      "%s / %s without images is byte-identical to a render that was never given any",
      async (type, style) => {
        const never = await renderTyped(type, style);
        const empty = await renderTyped(type, style, {});
        expect(empty.html).toBe(never.html);
        expect(never.html).not.toContain("doc-sign-image");
        expect(never.html).not.toContain("doc-stamp");
        expect("signoff" in never.snapshot).toBe(false);
        expect("signoff" in empty.snapshot).toBe(false);
      },
    );

    it("prints only the stamp when only a stamp is set", async () => {
      const { html, snapshot } = await renderTyped(
        DocumentType.INVOICE,
        "standard",
        {
          stamp: signoff.stamp,
        },
      );
      expect(html).toContain('class="doc-stamp"');
      expect(html).not.toContain('class="doc-sign-image"');
      expect(snapshot.signoff).toMatchObject({
        signatureAssetId: null,
        stampAssetId: "stamp-asset",
      });
      expect(snapshot.signoff).not.toHaveProperty("signatureSha256");
    });

    it("records ids and hashes in the snapshot, never the image bytes", async () => {
      const { snapshot } = await renderTyped(
        DocumentType.INVOICE,
        "classic",
        signoff,
      );
      const serialized = JSON.stringify(snapshot);
      expect(serialized).not.toContain(signatureUri);
      expect(serialized).not.toContain(
        signoff.signature!.bytes.toString("base64"),
      );
    });

    it("keeps the buyer's line a plain line to sign", async () => {
      const { html } = await renderTyped(DocumentType.ACT, "standard", signoff);
      expect(html).toContain('<div class="doc-sign-line"></div>');
    });
  });

  describe("waybill", () => {
    it.each(SIGNOFF_STYLES)(
      "%s prints the signature and the stamp with their captions",
      async (style) => {
        const { html, snapshot } = await renderWaybill(style, signoff);

        expect(html).toContain('<div class="signoff">');
        expect(html).toContain(`src="${signatureUri.replace(/=/g, "&#x3D;")}"`);
        expect(html).toContain(`src="${stampUri.replace(/=/g, "&#x3D;")}"`);
        expect(html).toContain(DOCUMENT_LABELS.uk.signature);
        expect(html).toContain(DOCUMENT_LABELS.uk.stamp);
        expect(html).toContain(".signoff { display: flex;");
        // Right before the footer, so it can stay with it on the last page.
        expect(html.indexOf('<div class="signoff">')).toBeLessThan(
          html.search(/class="footer(-section)?"/),
        );
        expect(snapshot.signoff).toMatchObject({
          signatureAssetId: "sig-asset",
          stampAssetId: "stamp-asset",
        });
      },
    );

    it.each(SIGNOFF_STYLES)(
      "%s without images is byte-identical to a render that was never given any",
      async (style) => {
        const never = await renderWaybill(style);
        const empty = await renderWaybill(style, {});
        expect(empty.html).toBe(never.html);
        expect(never.html).not.toContain("signoff");
        expect("signoff" in never.snapshot).toBe(false);
      },
    );

    it("prints a lone signature without a stamp column", async () => {
      const { html } = await renderWaybill("standard", {
        signature: signoff.signature,
      });
      expect(html).toContain('class="signoff-item signoff-signature"');
      expect(html).not.toContain('class="signoff-item signoff-stamp"');
    });

    it.each(OTHER_STYLES)(
      "%s (no signature block) ignores the images",
      async (style) => {
        const plain = await renderWaybill(style);
        const withImages = await renderWaybill(style, signoff);
        expect(withImages.html).toBe(plain.html);
        expect("signoff" in withImages.snapshot).toBe(false);
      },
    );
  });

  describe("capabilities", () => {
    it.each([...SIGNOFF_STYLES, ...OTHER_STYLES])(
      "%s reports whether it prints the images",
      (style) => {
        expect(getTemplateCapabilities(style).signoff).toBe(
          SIGNOFF_STYLES.includes(style),
        );
      },
    );
  });

  describe("digests with images", () => {
    // Pins the layout of the signed document; a change here is a visible change to it.
    const digests = async () => {
      const entries: Array<[string, string]> = [];
      for (const style of SIGNOFF_STYLES) {
        for (const type of STAMPED_TYPES)
          entries.push([
            `${type}.${style}`,
            sha((await renderTyped(type, style, signoff)).html),
          ]);
        entries.push([
          `waybill.${style}`,
          sha((await renderWaybill(style, signoff)).html),
        ]);
      }
      return Object.fromEntries(entries);
    };

    it("matches the recorded digests", async () => {
      expect(await digests()).toEqual(SIGNED_SHA256);
    });
  });
});

// Filled from the first green run; see "digests with images".
const SIGNED_SHA256: Record<string, string> = {
  "act.classic":
    "e7060218fb2787ad1b4ac58d61a168d3bce37b4df523bbc30d875591f23bd203",
  "act.corporate":
    "f9ba5950b6dcf04e2ce99511f845d75f3e489d640f3f6e5944bdbf7438bd42d2",
  "act.minimal":
    "d0d306400b76047115dc1d2b14db90ea68d9c8493909de68cb29cea5202c2438",
  "act.standard":
    "8217999643e6436de73c52e9b2ca71d5c817e5e0dc5740c5302e3fb46b0f85d9",
  "invoice.classic":
    "9b0fd1a4533aa453ae104e1494b318f8590fb427db94e7ae6d8c73704b3403ef",
  "invoice.corporate":
    "e28abdcfd2c097fa8fb7ea23b40eb023aaabda48ff5eb2688130ccc1d13f4328",
  "invoice.minimal":
    "4bf7f5187a6656aeb7e83176d2710f134e950dd45eab8b7df42967c6f7cff3d6",
  "invoice.standard":
    "acd544367f8901d0a7b95f092a0f6f810fb2a1145cefe78eb67226a1e5c4ff8b",
  "quote.classic":
    "17e2b5d29efa01d78f404bbc3edcf665fd021abddf4dc0d4b2c8e2587f0b489b",
  "quote.corporate":
    "8ea26176a50c391d89ad96ad86a41f4a1132387984e820ee5d76d4ef924680d2",
  "quote.minimal":
    "11a5625237893d4e2bad22ad468c6a79788bc3b27e3637394d3de67350bec760",
  "quote.standard":
    "7f9c873593283ca369b54e8661cc8c8ac4e5540464d35f461d8a148b06740a98",
  "waybill.classic":
    "c0053839aa065e7ab9bba19fffaec6a4139da848434d3fe4b9e48c1b837c4c23",
  "waybill.corporate":
    "814a4a323d17624a99d3bbc312b617aee827a1b046e57cf16f09371f00d40b03",
  "waybill.minimal":
    "e185ddc9dbe5e7e5a0ac3093db9c27885a27dc337c584073d3f97a3a62165560",
  "waybill.standard":
    "a4573c9bedeb815e675538a4117910fe6f619377eb416789aa81ffd90861e5f0",
};
