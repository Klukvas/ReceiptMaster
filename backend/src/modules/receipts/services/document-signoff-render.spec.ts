import { createHash } from "crypto";
import { SignoffSource } from "../../../common/services/signoff-image";
import { legacyConfig } from "../../settings/document-config";
import { UserSettings } from "../../settings/entities/user-settings.entity";
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
  // A Ukrainian account without a saved configuration (number locale and hour cycle follow it).
  const base = legacyConfig({ templateLanguage: "uk" } as UserSettings);
  return {
    ...base,
    templateId,
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
    "63497a71e21ca9f8814bd9e94cc57f51086137a134fa6575d36fd59bd93a4dfe",
  "act.corporate":
    "78e898950fd9d0dc942756ce4467a2d43262c349c785da62bf42253dc806969b",
  "act.minimal":
    "4c3de4687cc6d57975ff240d30bb2f0208f14296dc30cabc9132871c1a6eb7c5",
  "act.standard":
    "9f9cd8d4dac8d135485738b99b0833676b87240ae0a666b9c2191ebe7a2ce077",
  "invoice.classic":
    "442f6ed1736c3f028391bc6a6c2f847a12cc68a92be63dab2ee1dd763e181c80",
  "invoice.corporate":
    "91e33efa7dccaa17c62792bdcfcb58128e97fed6bd7bc37fcacfc35992e349ba",
  "invoice.minimal":
    "f8109bffb8884c6a77d4518ec504e0341ec6ff317fcbce40c24f5073af2ee431",
  "invoice.standard":
    "2796f233d5e5a011fd96f8e594f9bfdc957890e56a0b59fef54579f6190fbbfc",
  "quote.classic":
    "d008d25ac5016e6f12c986c1b2f93d405b7ad2dfcd79b63b997ac1c77f6dea11",
  "quote.corporate":
    "02f8d81edacbdd3389f8e9c781fafd4b71db2fea9782c76d15644be5a13f08b7",
  "quote.minimal":
    "3a44d2fa67e419f320243aaffec5127150a50acd1e0dc60b7e58e6e3554ea4cb",
  "quote.standard":
    "bd7e2d42735e3454a6ea807231ead9bd40555a3df892c53f73c3e43393ab4013",
  "waybill.classic":
    "b4c501a2268489d79926e6d7743f0eb24956b0e1330615d843a20265144828f9",
  "waybill.corporate":
    "2d2b88401d7e353c15a6cbeffe0d2d74779858cf04ca47ac1ab350d87d66b49d",
  "waybill.minimal":
    "4363f6d2d27d850e784bcff66dc45e7d20b74f019d2b925af3c1739cb7194eb9",
  "waybill.standard":
    "13871fe143f133679271ca7282f3f988f8c5653040919dbf0b12dc871ff33b5c",
};
