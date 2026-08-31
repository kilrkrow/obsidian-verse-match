import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HttpSearchBackend,
  LocalCacheBackend,
  decideKind,
  parseSearchResponse,
  type SearchMatch,
} from "./search-backend";
import type { IndexedVerse } from "./helloao";

const fixture = {
  translation: "eng_kjv",
  abbr: "KJV",
  query: "For God so loved the world",
  matches: [
    {
      book: "John",
      chapter: 3,
      verse: 16,
      text: "For God so loved the world, that he gave his only begotten Son, ...",
      score: 0.97,
      token: "{John 3:16}",
    },
  ],
};

test("parseSearchResponse accepts scope JSON", () => {
  const r = parseSearchResponse(fixture, "fallback");
  assert.equal(r.translation, "eng_kjv");
  assert.equal(r.abbr, "KJV");
  assert.equal(r.query, "For God so loved the world");
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].book, "John");
  assert.equal(r.matches[0].chapter, 3);
  assert.equal(r.matches[0].verse, 16);
  assert.equal(r.matches[0].token, "{John 3:16}");
  assert.equal(r.matches[0].score, 0.97);
});

test("parseSearchResponse rejects missing matches", () => {
  assert.throws(() => parseSearchResponse({ translation: "eng_kjv" }, "q"));
  assert.throws(() => parseSearchResponse(null, "q"));
  assert.throws(() => parseSearchResponse({ matches: [{ book: "John" }] }, "q"));
});

test("HttpSearchBackend uses requestFn fixture", async () => {
  const backend = new HttpSearchBackend("https://verseapi.org", async (url) => {
    assert.ok(url.startsWith("https://verseapi.org/search?"));
    assert.ok(url.includes("q="));
    assert.ok(url.includes("translation=eng_kjv"));
    assert.ok(url.includes("limit=8"));
    return { status: 200, json: fixture };
  });
  const r = await backend.search("For God so loved the world", "eng_kjv", 8);
  assert.equal(r.matches[0].token, "{John 3:16}");
  assert.equal(decideKind(r.matches), "exact");
});

test("HttpSearchBackend throws on non-2xx", async () => {
  const backend = new HttpSearchBackend("https://verseapi.org", async () => {
    return { status: 500, json: {} };
  });
  await assert.rejects(() => backend.search("q", "eng_kjv"));
});

test("LocalCacheBackend maps classify onto SearchMatch tokens", async () => {
  const index: IndexedVerse[] = [
    {
      bookId: "JHN",
      book: "John",
      chapter: 3,
      verse: 16,
      text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    },
  ];
  const backend = new LocalCacheBackend({
    loadIndex: async () => index,
    abbrFor: () => "KJV",
    defaultAbbr: "KJV",
  });
  const r = await backend.search(
    "For God so loved the world, that he gave his only begotten Son",
    "eng_kjv",
    8
  );
  assert.equal(r.abbr, "KJV");
  assert.equal(r.matches[0].token, "{John 3:16}");
  assert.equal(decideKind(r.matches), "exact");
});

test("decideKind none / choice / exact", () => {
  assert.equal(decideKind([]), "none");
  const exact: SearchMatch[] = [
    { book: "John", chapter: 3, verse: 16, text: "x", score: 0.97, token: "{John 3:16}" },
    { book: "John", chapter: 3, verse: 17, text: "y", score: 0.5, token: "{John 3:17}" },
  ];
  assert.equal(decideKind(exact), "exact");
  const choice: SearchMatch[] = [
    { book: "Psalm", chapter: 1, verse: 1, text: "a", score: 0.9, token: "{Psalm 1:1}" },
    { book: "Psalm", chapter: 1, verse: 2, text: "b", score: 0.88, token: "{Psalm 1:2}" },
  ];
  assert.equal(decideKind(choice), "choice");
});
