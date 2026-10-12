import http from "node:http";

// Local test process only. Fault controls never enter application code or routes.
const upstream = process.env.E2E_SUPABASE_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):55621$/.test(upstream ?? "")) throw new Error("Local cover test upstream required");
let fault = null;
const matches = (url, method, kind) => kind === "download" ? method === "GET" && url.startsWith("/storage/v1/object/authenticated/event-cover-uploads/")
  : kind === "publish" ? method === "POST" && url.startsWith("/storage/v1/object/event-covers/")
  : kind === "commit" ? url === "/rest/v1/rpc/finish_event_cover_upload"
  : kind === "metadata" ? url === "/rest/v1/rpc/mutate_event_cover" : false;
http.createServer(async (request, response) => {
  if (request.url === "/health") { response.end("ok"); return; }
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  if (request.url === "/__fault" && request.method === "POST") {
    const next = JSON.parse(body.toString());
    if (!next || !["download", "publish", "commit", "metadata", "reset"].includes(next.kind) || !["fail", "hang", "late", "lost", undefined].includes(next.mode)) { response.writeHead(400); response.end(); return; }
    fault = next.kind === "reset" ? null : next; response.end("ok"); return;
  }
  const selected = fault && matches(request.url, request.method, fault.kind) ? fault : null;
  if (selected) fault = null; // One request per fault, all subsequent recovery calls are real.
  if (selected?.mode === "fail") { response.writeHead(503, { "Content-Type": "application/json" }); response.end('{"error":"test_fault"}'); return; }
  if (selected?.mode === "hang") { request.socket.once("close", () => response.destroy()); return; }
  try {
    const headers = { ...request.headers }; delete headers.host; delete headers.connection;
    const result = await fetch(new URL(request.url, upstream), { method: request.method, headers, ...(body.length ? { body } : {}) });
    const bytes = Buffer.from(await result.arrayBuffer());
    if (selected?.mode === "late") { request.socket.once("close", () => response.destroy()); return; }
    if (selected?.mode === "lost") { response.destroy(); return; }
    const resultHeaders = Object.fromEntries(result.headers); delete resultHeaders["content-encoding"]; delete resultHeaders["transfer-encoding"];
    resultHeaders["content-length"] = String(bytes.length);
    response.writeHead(result.status, resultHeaders); response.end(bytes);
  } catch { response.writeHead(503); response.end(); }
}).listen(3102, "127.0.0.1");
