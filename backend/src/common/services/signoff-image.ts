import sharp = require("sharp");
import { ApiErrors } from "../errors/ApiError";

export type SignoffKind = "signature" | "stamp";

export const SIGNOFF_KINDS: readonly SignoffKind[] = ["signature", "stamp"];

const KIB = 1024;

export const SIGNOFF_LIMITS = {
  maxUploadBytes: 2 * KIB * KIB,
  minSide: 32,
  maxSide: 4096,
  maxInputPixels: 16_777_216,
  box: {
    signature: { width: 800, height: 300 },
    stamp: { width: 600, height: 600 },
  },
  maxOutputBytes: 256 * KIB,
} as const;

const REJECTION =
  "Use a PNG or JPEG image, 32 to 4096 px on each side, up to 2 MB";
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const JPEG_SIGNATURE = Buffer.from("ffd8ff", "hex");
const ACCEPTED_MIME: Readonly<Record<"png" | "jpeg", readonly string[]>> = {
  png: ["image/png"],
  jpeg: ["image/jpeg", "image/jpg"],
};

/** The account's current signature and stamp, as read for one render. */
export type SignoffSource = Partial<
  Record<SignoffKind, { assetId: string; bytes: Buffer }>
>;

export interface NormalizedSignoff {
  png: Buffer;
  width: number;
  height: number;
}

/** Decides by the first bytes only, so SVG, GIF and WebP never reach the decoder. */
function sniffFormat(bytes: Buffer): "png" | "jpeg" | undefined {
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
    return "png";
  if (bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE))
    return "jpeg";
  return undefined;
}

/**
 * An animated PNG carries an `acTL` chunk ahead of the first image data. libvips would
 * quietly decode its first frame, so the chunk list is read here instead.
 */
function isAnimatedPng(png: Buffer): boolean {
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    offset += 12 + length;
  }
  return false;
}

async function render(
  source: Buffer,
  box: { width: number; height: number },
): Promise<{ png: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(source, {
    limitInputPixels: SIGNOFF_LIMITS.maxInputPixels,
    failOn: "warning",
    animated: false,
    pages: 1,
  })
    // Applies the EXIF orientation. Metadata (EXIF, GPS, ICC) is not carried over: sharp
    // drops it unless asked, and nothing here asks.
    .rotate()
    .resize({ fit: "inside", withoutEnlargement: true, ...box })
    .png({ compressionLevel: 9 })
    .timeout({ seconds: 3 })
    .toBuffer({ resolveWithObject: true });
  return { png: data, width: info.width, height: info.height };
}

/**
 * Turns an uploaded signature or stamp into the one stored form: a metadata-free PNG that
 * fits the kind's box. Everything is checked in memory and nothing is fetched or executed.
 * Any refusal is the same 400, so the response tells an attacker nothing about the decoder.
 */
export async function normalizeSignoffImage(
  bytes: Buffer,
  declaredMime: string | undefined,
  kind: SignoffKind,
): Promise<NormalizedSignoff> {
  try {
    if (bytes.length < 1 || bytes.length > SIGNOFF_LIMITS.maxUploadBytes)
      throw new Error("size");
    const sniffed = sniffFormat(bytes);
    if (
      !sniffed ||
      !declaredMime ||
      !ACCEPTED_MIME[sniffed].includes(declaredMime)
    )
      throw new Error("format");
    if (sniffed === "png" && isAnimatedPng(bytes)) throw new Error("animated");

    const metadata = await sharp(bytes, {
      limitInputPixels: SIGNOFF_LIMITS.maxInputPixels,
      failOn: "warning",
      animated: false,
      pages: 1,
    }).metadata();
    const { width, height } = metadata;
    if (
      metadata.format !== sniffed ||
      (metadata.pages ?? 1) > 1 ||
      !width ||
      !height ||
      Math.min(width, height) < SIGNOFF_LIMITS.minSide ||
      Math.max(width, height) > SIGNOFF_LIMITS.maxSide
    )
      throw new Error("dimensions");

    const box = SIGNOFF_LIMITS.box[kind];
    let result = await render(bytes, box);
    if (result.png.length > SIGNOFF_LIMITS.maxOutputBytes) {
      result = await render(result.png, {
        width: Math.max(1, Math.floor(result.width / 2)),
        height: Math.max(1, Math.floor(result.height / 2)),
      });
    }
    if (result.png.length > SIGNOFF_LIMITS.maxOutputBytes)
      throw new Error("output");
    return result;
  } catch {
    throw ApiErrors.VALIDATION_ERROR(kind, REJECTION);
  }
}
