import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { eventCoverConfig } from "./event-cover-config.mjs";
import { maxEventCoverBytes } from "./event-cover";
import type { ValidatedEventCover } from "./event-cover-types";
import { EventCoverError, coverUnavailable } from "./event-cover-errors";

type CoverDecoder = (bytes: Buffer, options: { failOn: "warning"; limitInputPixels: false }) => {
  metadata: () => Promise<Pick<Metadata, "format" | "pages" | "autoOrient">>;
  stats: () => Promise<unknown>;
};

const invalid = () => new EventCoverError(422, "El archivo está dañado. Elige otra imagen.");
const animated = () => new EventCoverError(422, "La portada debe ser una imagen sin animación.");
let activeDecodes = 0;
const queue: { grant: () => void; expired: () => boolean }[] = [];

function releaseDecode() {
  activeDecodes--;
  while (queue.length) {
    const next = queue.shift()!;
    if (!next.expired()) { next.grant(); return; }
  }
}

async function acquireDecode(deadline: number) {
  if (Date.now() >= deadline) throw coverUnavailable();
  if (activeDecodes < eventCoverConfig.decodeConcurrency) { activeDecodes++; return; }
  await new Promise<void>((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; const index = queue.indexOf(item); if (index >= 0) queue.splice(index, 1); reject(coverUnavailable()); }, deadline - Date.now());
    const item = { expired: () => expired || Date.now() >= deadline, grant: () => {
      clearTimeout(timer);
      activeDecodes++;
      if (Date.now() >= deadline) { expired = true; reject(coverUnavailable()); releaseDecode(); return; }
      resolve();
    } };
    queue.push(item);
  });
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectPng(bytes: Buffer) {
  let offset = 8; let sawHeader = false; let sawData = false; let sawEnd = false;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throw invalid();
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) throw invalid();
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) throw invalid();
    if (!sawHeader && (type !== "IHDR" || length !== 13)) throw invalid();
    if (type === "IHDR") { if (sawHeader) throw invalid(); sawHeader = true; }
    if (type === "acTL" || type === "fcTL" || type === "fdAT") throw animated();
    if (type === "IDAT") sawData = true;
    offset += length + 12;
    if (type === "IEND") { if (length !== 0 || offset !== bytes.length) throw invalid(); sawEnd = true; break; }
  }
  if (!sawHeader || !sawData || !sawEnd) throw invalid();
}

function inspectWebp(bytes: Buffer) {
  if (bytes.length < 20 || bytes.readUInt32LE(4) + 8 !== bytes.length) throw invalid();
  let offset = 12; let sawImage = false;
  while (offset < bytes.length) {
    if (bytes.length - offset < 8) throw invalid();
    const type = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    if (length > bytes.length - offset - 8 || length + (length % 2) > bytes.length - offset - 8) throw invalid();
    if (type === "ANIM" || type === "ANMF") throw animated();
    if (type === "VP8X") {
      if (length !== 10) throw invalid();
      const flags = bytes[offset + 8];
      if (flags & 2) throw animated();
      if ((flags & 0xc1) || bytes.subarray(offset + 9, offset + 12).some((byte) => byte !== 0)) throw invalid();
    }
    if (type === "VP8 " || type === "VP8L") sawImage = true;
    if (length % 2 && bytes[offset + 8 + length] !== 0) throw invalid();
    offset += 8 + length + (length % 2);
  }
  if (!sawImage || offset !== bytes.length) throw invalid();
}

export async function validateEventCover(bytes: Buffer, deadline: number, dependencies: { decode?: CoverDecoder; decodeTimeoutMs?: number } = {}): Promise<ValidatedEventCover> {
  if (!bytes.length) throw invalid();
  if (bytes.length > maxEventCoverBytes) throw new EventCoverError(413, "La portada supera el máximo de 5 MiB.");
  let format: "jpeg" | "png" | "webp";
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") { format = "png"; inspectPng(bytes); }
  else if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") { format = "webp"; inspectWebp(bytes); }
  else if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) format = "jpeg";
  else throw new EventCoverError(422, "Elige una imagen JPEG, PNG o WebP sin animación.");
  await acquireDecode(deadline);
  // Race bounds the response; the native job owns its slot until it really settles.
  // stats decodes every pixel without allocating an unnecessary raw output buffer.
  const work = (async () => {
    const image = (dependencies.decode ?? sharp)(bytes, { failOn: "warning", limitInputPixels: false });
    const metadata = await image.metadata();
    if (metadata.format !== format) throw invalid();
    if ((metadata.pages ?? 1) > 1) throw animated();
    const { width, height } = metadata.autoOrient;
    if (width < 640 || height < 360) throw new EventCoverError(422, "La portada debe tener al menos 640 × 360 px después de orientarla.");
    await image.stats();
    return { mediaType: `image/${format}` as ValidatedEventCover["mediaType"], byteSize: bytes.length, width, height,
      contentHash: createHash("sha256").update(bytes).digest("hex") };
  })().catch((error) => {
    if (error instanceof EventCoverError) throw error;
    if (/memory|alloc|resource|timeout|timed out|out of|too large|limit/i.test(String(error))) throw coverUnavailable();
    throw invalid();
  }).finally(releaseDecode);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(coverUnavailable()), Math.max(1, Math.min(dependencies.decodeTimeoutMs ?? eventCoverConfig.decodeTimeoutMs, deadline - Date.now())));
    })]);
  } finally { clearTimeout(timer); }
}
