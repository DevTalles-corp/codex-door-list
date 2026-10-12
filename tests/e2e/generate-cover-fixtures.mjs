import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const coverFixtureDirectory = path.join(process.cwd(), "tests/e2e/fixtures/event-covers");
export const maxCoverBytes = 5_242_880;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length);
  header.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])));
  return Buffer.concat([header, data, crc]);
}

function insertPngChunk(image, type, data) {
  return Buffer.concat([image.subarray(0, 33), pngChunk(type, data), image.subarray(33)]);
}

function webpChunk(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, "ascii");
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, ...(data.length % 2 ? [Buffer.alloc(1)] : [])]);
}

function animatedWebp(image, frames) {
  const extended = Buffer.alloc(10);
  extended[0] = 2;
  extended.writeUIntLE(639, 4, 3);
  extended.writeUIntLE(359, 7, 3);
  const frame = Buffer.alloc(16);
  frame.writeUIntLE(639, 6, 3);
  frame.writeUIntLE(359, 9, 3);
  frame.writeUIntLE(100, 12, 3);
  const data = Buffer.concat([Buffer.from("WEBP"), webpChunk("VP8X", extended), webpChunk("ANIM", Buffer.alloc(6)),
    ...Array.from({ length: frames }, () => webpChunk("ANMF", Buffer.concat([frame, image.subarray(12)])))]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF");
  riff.writeUInt32LE(data.length, 4);
  return Buffer.concat([riff, data]);
}

function animatedPng(image, frames) {
  const chunks = [];
  for (let offset = 8; offset < image.length;) {
    const length = image.readUInt32BE(offset);
    chunks.push({ type: image.toString("ascii", offset + 4, offset + 8), data: image.subarray(offset + 8, offset + 8 + length) });
    offset += length + 12;
  }
  const control = Buffer.alloc(8);
  control.writeUInt32BE(frames);
  const output = [image.subarray(0, 8), pngChunk("IHDR", chunks[0].data), pngChunk("acTL", control)];
  let sequence = 0;
  for (let index = 0; index < frames; index++) {
    const frame = Buffer.alloc(26);
    frame.writeUInt32BE(sequence++, 0);
    frame.writeUInt32BE(640, 4);
    frame.writeUInt32BE(360, 8);
    frame.writeUInt16BE(1, 20);
    frame.writeUInt16BE(10, 22);
    output.push(pngChunk("fcTL", frame));
    for (const chunk of chunks.filter((chunk) => chunk.type === "IDAT")) {
      if (index === 0)
        output.push(pngChunk("IDAT", chunk.data));
      else {
        const seq = Buffer.alloc(4);
        seq.writeUInt32BE(sequence++);
        output.push(pngChunk("fdAT", Buffer.concat([seq, chunk.data])));
      }
    }
  }
  output.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(output);
}

export async function generateCoverFixtures() {
  await mkdir(coverFixtureDirectory, { recursive: true });
  const save = (name, bytes) => writeFile(path.join(coverFixtureDirectory, name), bytes);
  const make = (width = 640, height = 360, background = "#f8fafc") => sharp({ create: { width, height, channels: 4, background } });
  const png = await make().png().toBuffer();
  const webp = await make().webp({ lossless: true }).toBuffer();
  await save("minimum.png", png);
  await save("minimum.jpeg", await make().jpeg().toBuffer());
  await save("minimum.webp", webp);
  for (const [name, width, height] of [
    ["narrow", 639, 360], ["short", 640, 359], ["portrait", 640, 1200], ["square", 800, 800],
    ["wide", 12800, 360], ["tall", 640, 12800],
  ])
    await save(`${name}.png`, await make(width, height).png().toBuffer());
  for (const [name, color] of [["light", "white"], ["dark", "black"], ["transparent", "#00000000"]])
    await save(`${name}.png`, await make(640, 360, color).png().toBuffer());
  const pattern = Buffer.from(`<svg width="1280" height="720"><defs><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="white"/><rect width="16" height="16" fill="black"/><rect x="16" y="16" width="16" height="16" fill="black"/></pattern></defs><rect width="1280" height="720" fill="url(#p)"/></svg>`);
  await save("dense.png", await sharp(pattern).png().toBuffer());
  for (let orientation = 1; orientation <= 8; orientation++)
    await save(`exif-${orientation}.jpeg`, await make(1200, 800).composite([{ input: await make(300, 200, "#c53030").png().toBuffer(), left: 0, top: 0 }]).jpeg().withMetadata({ orientation }).toBuffer());
  const padding = Buffer.alloc(maxCoverBytes - png.length - 12, 65);
  padding.write("Padding\0", 0, "ascii");
  const exact = insertPngChunk(png, "tEXt", padding);
  await save("exact-5mib.png", exact);
  await save("over-5mib.png", insertPngChunk(png, "tEXt", Buffer.concat([padding, Buffer.from("A")])));
  await save("text-actl.png", insertPngChunk(png, "tEXt", Buffer.from("Comment\0acTL is text, not animation")));
  await save("animated-one.png", animatedPng(png, 1));
  await save("animated.png", animatedPng(png, 2));
  await save("animated-one.webp", animatedWebp(webp, 1));
  await save("animated.webp", animatedWebp(webp, 2));
  await save("empty.jpeg", Buffer.alloc(0));
  await save("damaged.png", png.subarray(0, Math.floor(png.length / 2)));
  await save("unsupported.gif", await make().gif().toBuffer());
  await save("unsupported.svg", pattern);
  await save("false-jpeg.jpeg", Buffer.from("This is not a JPEG image."));
  await save("jpeg-named-png.png", await make().jpeg().toBuffer());
}

export const coverFixture = (name) => readFile(path.join(coverFixtureDirectory, name));
