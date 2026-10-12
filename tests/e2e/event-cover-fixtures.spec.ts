import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { coverFixture, generateCoverFixtures, maxCoverBytes } from "./event-cover-fixtures";

test("cover fixtures have valid codecs, exact byte boundaries and oriented dimensions", async () => {
  await generateCoverFixtures();
  for (const [name, format] of [["minimum.jpeg", "jpeg"], ["minimum.png", "png"], ["minimum.webp", "webp"], ["exact-5mib.png", "png"], ["text-actl.png", "png"]]) {
    const bytes = await coverFixture(name);
    const image = sharp(bytes, { failOn: "warning" });
    const metadata = await image.metadata();
    expect(metadata.format).toBe(format);
    expect(metadata.autoOrient).toEqual({ width: 640, height: 360 });
    await image.stats();
  }
  expect((await coverFixture("exact-5mib.png")).length).toBe(maxCoverBytes);
  expect((await coverFixture("over-5mib.png")).length).toBe(maxCoverBytes + 1);
  for (let orientation = 1; orientation <= 8; orientation++) {
    const metadata = await sharp(await coverFixture(`exif-${orientation}.jpeg`)).metadata();
    expect(metadata.orientation).toBe(orientation);
    expect(metadata.autoOrient).toEqual(orientation >= 5 ? { width: 800, height: 1200 } : { width: 1200, height: 800 });
  }
  for (const name of ["animated-one.png", "animated.png", "animated-one.webp", "animated.webp"])
    await sharp(await coverFixture(name), { animated: true, failOn: "warning" }).stats();
});
