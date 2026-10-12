import { expect, test } from "@playwright/test";
import { coverFixture, generateCoverFixtures } from "../e2e/event-cover-fixtures";
import { validateEventCover } from "../../lib/event-cover-validation";

test.beforeAll(generateCoverFixtures);

test("resource exhaustion is retryable and never becomes a pixel admission rule", async () => {
  const bytes = await coverFixture("minimum.png");
  let options: unknown;
  const result = validateEventCover(bytes, Date.now() + 1000, { decode: (_bytes, value) => {
    options = value;
    return { metadata: async () => ({ format: "png", autoOrient: { width: 17000, height: 16000 } }), stats: async () => { throw new Error("memory allocation failed"); } };
  } });
  await expect(result).rejects.toMatchObject({ status: 503 });
  expect(options).toEqual({ failOn: "warning", limitInputPixels: false });
});

test("decode timeout keeps the slot occupied until the native job settles; expired queue work never starts", async () => {
  const bytes = await coverFixture("minimum.png");
  let settle: (() => void) | undefined; let starts = 0;
  const nativeWork = new Promise<void>((resolve) => { settle = resolve; });
  const decode = () => { starts++; return { metadata: async () => ({ format: "png" as const, autoOrient: { width: 640, height: 360 } }), stats: () => nativeWork }; };
  await expect(validateEventCover(bytes, Date.now() + 1000, { decode, decodeTimeoutMs: 10 })).rejects.toMatchObject({ status: 503 });
  await expect(validateEventCover(bytes, Date.now() + 10, { decode })).rejects.toMatchObject({ status: 503 });
  expect(starts).toBe(1);
  settle!();
  await expect(validateEventCover(bytes, Date.now() + 1000, { decode })).resolves.toMatchObject({ width: 640, height: 360 });
  expect(starts).toBe(2);
});

test("expired total deadline starts no decode and genuine corruption is 422", async () => {
  let starts = 0;
  const decode = () => { starts++; throw new Error("must not start"); };
  await expect(validateEventCover(await coverFixture("minimum.png"), Date.now() - 1, { decode })).rejects.toMatchObject({ status: 503 });
  expect(starts).toBe(0);
  await expect(validateEventCover(await coverFixture("damaged.png"), Date.now() + 1000)).rejects.toMatchObject({ status: 422 });
  await expect(validateEventCover(await coverFixture("empty.jpeg"), Date.now() + 1000)).rejects.toMatchObject({ status: 422 });
  await expect(validateEventCover(await coverFixture("over-5mib.png"), Date.now() + 1000)).rejects.toMatchObject({ status: 413 });
});
