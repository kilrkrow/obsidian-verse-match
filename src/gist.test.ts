import { test } from "node:test";
import assert from "node:assert/strict";
import { findGistSpan, formatInsert, wrapGist } from "./gist";

const john = "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.";

test("gist span is the overlapping prefix of John 3:16", () => {
  const span = findGistSpan("For God so loved the world", john);
  assert.ok(span);
  const slice = john.slice(span!.start, span!.end);
  assert.equal(slice, "For God so loved the world");
});

test("no decent span returns null", () => {
  assert.equal(findGistSpan("hi", john), null);
  assert.equal(findGistSpan("qqqqxxxxzzzz yyyynnnn mmmmbbbb", john), null);
});

test("wrapGist adds == around the span", () => {
  const span = findGistSpan("For God so loved the world", john);
  const wrapped = wrapGist(john, span);
  assert.ok(wrapped.includes("==For God so loved the world=="));
  assert.ok(wrapped.includes("only begotten Son"));
});

test("formatInsert off keeps {ref}", () => {
  const s = formatInsert(
    { book: "John", chapter: 3, verse: 16, text: john, token: "{John 3:16}" },
    "For God so loved the world",
    { highlight: false, abbr: "KJV" }
  );
  assert.equal(s, "{John 3:16}");
});

test("formatInsert on bakes a bible fence with ==gist==", () => {
  const s = formatInsert(
    { book: "John", chapter: 3, verse: 16, text: john, token: "{John 3:16}" },
    "For God so loved the world",
    { highlight: true, abbr: "KJV" }
  );
  assert.ok(s.startsWith("```bible\nJohn 3:16\ntranslation: KJV\n---\n"));
  assert.ok(s.includes("16. ==For God so loved the world=="));
  assert.ok(s.trimEnd().endsWith("```"));
  assert.ok(!s.includes("[!quote]"));
  assert.ok(!s.includes("[!bible]"));
  assert.ok(!s.includes("{John 3:16}"));
});

test("formatInsert normal verse output is unchanged", () => {
  const s = formatInsert(
    { book: "John", chapter: 3, verse: 16, text: john, token: "{John 3:16}" },
    "For God so loved the world",
    { highlight: true, abbr: "KJV" }
  );
  assert.equal(
    s,
    "```bible\nJohn 3:16\ntranslation: KJV\n---\n16. ==For God so loved the world==, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.\n```"
  );
});

function assertSingleFence(s: string) {
  const lines = s.split("\n");
  const fenceLines = lines.filter((l) => /^\s*(`{3,}|~{3,})/.test(l));
  assert.equal(fenceLines.length, 2, s);
  assert.ok(/^`{3,}bible$/.test(lines[0]), s);
  assert.ok(/^`{3,}$/.test(lines[lines.length - 1]), s);
  assert.equal(lines[lines.length - 1].length, lines[0].length - "bible".length, s);
}

test("formatInsert keeps injected fence and heading inside the bible block", () => {
  const s = formatInsert(
    { book: "John", chapter: 3, verse: 16, text: "For God so loved the world\n```\n# injected", token: "{John 3:16}" },
    "For God so loved the world",
    { highlight: true, abbr: "KJV" }
  );
  assertSingleFence(s);
  assert.ok(!s.split("\n").some((l) => l.startsWith("# injected")), s);
});

test("formatInsert fence outgrows backtick runs and other line breaks", () => {
  const s = formatInsert(
    { book: "John", chapter: 3, verse: 16, text: "a ```` b\r\n````\u2028# x", token: "{John 3:16}" },
    "a b",
    { highlight: true, abbr: "KJV\n```" }
  );
  assertSingleFence(s);
  assert.ok(s.startsWith("`````bible\n"), s);
});