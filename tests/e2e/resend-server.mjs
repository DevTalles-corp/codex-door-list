import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const messages = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3101");
  response.setHeader("Content-Type", "application/json");

  if (request.method === "GET" && url.pathname === "/health") {
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/messages") {
    const recipient = url.searchParams.get("to");
    response.end(JSON.stringify(messages.filter((message) => message.to?.includes(recipient))));
    return;
  }

  if (request.method === "POST" && url.pathname === "/emails") {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      messages.push(message);
      response.statusCode = 200;
      response.end(JSON.stringify({ id: randomUUID() }));
    } catch {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: "invalid_email" }));
    }
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(3101, "127.0.0.1");
