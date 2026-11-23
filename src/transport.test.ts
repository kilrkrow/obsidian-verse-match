import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { UnsafeRedirectError, safeRequest } from "./safe-request";
import { createTransport } from "./transport";

function listen(handler: Parameters<typeof createServer>[1]): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

test("desktop transport returns 3xx unfollowed and safeRequest refuses a non-allowed hop", async () => {
  (globalThis as { require?: unknown }).require = createRequire(import.meta.url);
  try {
    const seen: string[] = [];
    const { server, base } = await listen((req, res) => {
      seen.push(req.url ?? "");
      if (req.url?.startsWith("/redir")) {
        res.writeHead(302, { location: "http://example.invalid/search" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ matches: [] }));
    });
    try {
      const transport = createTransport();
      const raw = await transport(`${base}/redir`);
      assert.equal(raw.status, 302);
      assert.equal(raw.location, "http://example.invalid/search");
      await assert.rejects(() => safeRequest(`${base}/redir`, transport), UnsafeRedirectError);
      const ok = await safeRequest(`${base}/ok`, transport);
      assert.equal(ok.status, 200);
      assert.deepEqual(ok.json, { matches: [] });
      assert.deepEqual(seen, ["/redir", "/redir", "/ok"]);
    } finally {
      server.close();
    }
  } finally {
    delete (globalThis as { require?: unknown }).require;
  }
});