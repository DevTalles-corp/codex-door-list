import config from "./event-cover-config.json" with { type: "json" };

export function validateEventCoverConfig(value) {
  const keys = ["decodeConcurrency", "decodeTimeoutMs", "storageRequestTimeoutMs", "processingTimeoutMs", "processingLeaseMs", "cleanupTransferMarginMs"];
  if (keys.some((key) => !Number.isSafeInteger(value[key]) || value[key] <= 0)
    || value.processingTimeoutMs < Math.max(value.decodeTimeoutMs, value.storageRequestTimeoutMs)
    || value.processingLeaseMs <= value.processingTimeoutMs || value.cleanupTransferMarginMs < 300000)
    throw new Error("Invalid event cover operational configuration");
  return Object.freeze({ ...value });
}

export const eventCoverConfig = validateEventCoverConfig(config);
