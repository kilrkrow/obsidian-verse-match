import type { IncomingMessage } from "http";
import { UnsafeRedirectError, type RawTransport } from "./safe-request";

const TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 2_000_000;

type NodeRequire = (id: string) => unknown;
type RequestModule = {
  request: (
    url: URL,
    opts: { method: string; headers: Record<string, string>; timeout: number },
    cb: (res: IncomingMessage) => void
  ) => {
    on: (ev: string, fn: (e?: Error) => void) => void;
    destroy: (e?: Error) => void;
    end: () => void;
  };
};

function nodeRequire(): NodeRequire | null {
  const w = (typeof window !== "undefined" ? window : globalThis) as unknown as { require?: unknown };
  return typeof w.require === "function" ? (w.require as NodeRequire) : null;
}

/** Desktop: Node http/https, which never follow redirects on their own. */
function nodeTransport(req: NodeRequire): RawTransport {
  return (url) =>
    new Promise((resolve, reject) => {
      const u = new URL(url);
      const mod = req(u.protocol === "https:" ? "https" : "http") as RequestModule;
      const r = mod.request(
        u,
        { method: "GET", headers: { accept: "application/json" }, timeout: TIMEOUT_MS },
        (res) => {
          const status = res.statusCode ?? 0;
          const loc = res.headers.location;
          const location = typeof loc === "string" ? loc : null;
          if (status >= 300 && status < 400) {
            res.resume();
            resolve({ status, location, text: "" });
            return;
          }
          const chunks: Uint8Array[] = [];
          let size = 0;
          res.on("data", (c: Uint8Array) => {
            size += c.length;
            if (size > MAX_BODY_BYTES) {
              r.destroy(new Error("Search API: response too large"));
              return;
            }
            chunks.push(c);
          });
          res.on("end", () => {
            const all = new Uint8Array(size);
            let off = 0;
            for (const c of chunks) {
              all.set(c, off);
              off += c.length;
            }
            resolve({ status, location, text: new TextDecoder("utf-8").decode(all) });
          });
          res.on("error", reject);
        }
      );
      r.on("timeout", () => r.destroy(new Error("Search API: timeout")));
      r.on("error", (e) => reject(e));
      r.end();
    });
}

/** Mobile: fetch with manual redirects; any redirect is refused because its target is hidden. */
const fetchTransport: RawTransport = async (url) => {
  const res = await fetch(url, { redirect: "manual", headers: { accept: "application/json" } });
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    throw new UnsafeRedirectError();
  }
  return { status: res.status, location: null, text: await res.text() };
};

export function createTransport(): RawTransport {
  const req = nodeRequire();
  return req ? nodeTransport(req) : fetchTransport;
}