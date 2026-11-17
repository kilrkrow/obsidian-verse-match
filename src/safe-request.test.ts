import { test } from "node:test";
import assert from "node:assert/strict";
import { REDIRECT_REFUSED_NOTICE, UnsafeRedirectError, safeRequest, type RawResponse } from "./safe-request";
import { FallbackSearchBackend, HttpSearchBackend, LocalCacheBackend } from "./search-backend";
import type { IndexedVerse } from "./helloao";

const apiBody = JSON.stringify({
  translation: "eng_kjv",
  abbr: "KJV",
  query: "q",
  matches: [{ book: "Psalm", chapter: 23, verse: 1, text: "The LORD is my shepherd", score: 0.99, token: "{Psalm 23:1}" }],
});

/** Fake transport that never follows redirects itself: each entry answers one URL prefix. */
function fakeTransport(routes: Array<[string, RawResponse]>) {
  const calls: string[] = [];
  const transport = async (url: string): Promise<RawResponse> => {
    calls.push(url);
    const hit = routes.find(([prefix]) => url.startsWith(prefix));
    if (!hit) throw new Error(`unexpected request ${url}`);
    return hit[1];
  };
  return { calls, transport };
}

const index: IndexedVerse[] = [
  {
    bookId: "JHN",
    book: "John",
    chapter: 3,
    verse: 16,
    text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
  },
];
const local = () => new LocalCacheBackend({ loadIndex: async () => index, abbrFor: () => "KJV", defaultAbbr: "KJV" });

test("https that redirects to http makes no plaintext request and falls back to local cache", async () => {
  const { calls, transport } = fakeTransport([
    ["https://api.example.org/", { status: 302, location: "http://example.com/search?q=x", text: "" }],
    ["http://example.com/", { status: 200, text: apiBody }],
  ]);
  const notices: string[] = [];
  const http = new HttpSearchBackend("https://api.example.org", (url) => safeRequest(url, transport));
  const backend = new FallbackSearchBackend(http, local(), (m) => notices.push(m));
  const r = await backend.search("For God so loved the world, that he gave his only begotten Son", "eng_kjv", 8);
  assert.ok(calls.length >= 1);
  assert.ok(calls.every((u) => u.startsWith("https://")), calls.join(" "));
  assert.equal(r.matches[0].token, "{John 3:16}");
  assert.ok(!r.matches.some((m) => m.token === "{Psalm 23:1}"));
  assert.deepEqual(notices, [REDIRECT_REFUSED_NOTICE]);
});

test("safeRequest rejects an https to http redirect before following it", async () => {
  const { calls, transport } = fakeTransport([
    ["https://api.example.org/", { status: 301, location: "http://example.com/x", text: "" }],
  ]);
  await assert.rejects(() => safeRequest("https://api.example.org/search", transport), UnsafeRedirectError);
  assert.deepEqual(calls, ["https://api.example.org/search"]);
});

test("same-host https to https redirect still returns results", async () => {
  const { calls, transport } = fakeTransport([
    ["https://api.example.org/old/", { status: 308, location: "/new/search?q=x", text: "" }],
    ["https://api.example.org/new/", { status: 200, text: apiBody }],
  ]);
  const http = new HttpSearchBackend("https://api.example.org/old", (url) => safeRequest(url, transport));
  const r = await http.search("q", "eng_kjv");
  assert.deepEqual(calls.map((u) => u.split("?")[0]), ["https://api.example.org/old/search", "https://api.example.org/new/search"]);
  assert.equal(r.matches[0].token, "{Psalm 23:1}");
});

test("https to http://127.0.0.1 follows the localhost exception", async () => {
  const { calls, transport } = fakeTransport([
    ["https://api.example.org/", { status: 307, location: "http://127.0.0.1:8787/search", text: "" }],
    ["http://127.0.0.1:8787/", { status: 200, text: apiBody }],
  ]);
  const r = await safeRequest("https://api.example.org/search", transport);
  assert.equal(r.status, 200);
  assert.equal(calls.length, 2);
});

test("https redirects to file:, data:, javascript: or look-alike hosts are refused", async () => {
  for (const location of [
    "file:///C:/x.json",
    "data:application/json,{}",
    "javascript:void(0)",
    "http://localhost.example.com/x",
    "http://127.0.0.1@example.com/x",
    "//example.com/x",
  ]) {
    const { calls, transport } = fakeTransport([["https://api.example.org/", { status: 302, location, text: "" }]]);
    if (location.startsWith("//")) {
      // Protocol-relative keeps https, so it is an allowed https hop; it must not downgrade.
      await assert.rejects(() => safeRequest("https://api.example.org/s", transport));
      assert.ok(calls.every((u) => u.startsWith("https://")), location);
      continue;
    }
    await assert.rejects(() => safeRequest("https://api.example.org/s", transport), UnsafeRedirectError, location);
    assert.equal(calls.length, 1, location);
  }
});

test("redirect loops and missing Location are errors", async () => {
  const loop = fakeTransport([["https://api.example.org/", { status: 302, location: "https://api.example.org/s", text: "" }]]);
  await assert.rejects(() => safeRequest("https://api.example.org/s", loop.transport), /too many redirects/);
  assert.ok(loop.calls.length <= 6);
  const bare = fakeTransport([["https://api.example.org/", { status: 302, text: "" }]]);
  await assert.rejects(() => safeRequest("https://api.example.org/s", bare.transport));
});