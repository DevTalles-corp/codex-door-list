import { cleanupEventCovers } from "../lib/event-cover-cleanup.mjs";

try {
  const result = await cleanupEventCovers(); console.log(JSON.stringify(result));
  if (result.failed || result.deferred) process.exitCode = 1;
} catch { console.error("Cover cleanup could not finish; jobs remain retryable."); process.exitCode = 1; }
