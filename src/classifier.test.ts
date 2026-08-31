import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, formatToken, normalize } from "./classifier";
import type { IndexedVerse } from "./helloao";

const john316: IndexedVerse = {
  bookId: "JHN",
  book: "John",
  chapter: 3,
  verse: 16,
  text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
};

const psalm1: IndexedVerse = {
  bookId: "PSA",
  book: "Psalm",
  chapter: 1,
  verse: 1,
  text: "Blessed is the man that walketh not in the counsel of the ungodly",
};

const psalm1b: IndexedVerse = {
  bookId: "PSA",
  book: "Psalm",
  chapter: 1,
  verse: 2,
  text: "Blessed is the man that walketh not in the counsel of fools",
};

const gen11: IndexedVerse = {
  bookId: "GEN",
  book: "Genesis",
  chapter: 1,
  verse: 1,
  text: "In the beginning God created the heaven and the earth.",
};

const index: IndexedVerse[] = [john316, psalm1, psalm1b, gen11];

test("normalize strips pilcrows and punctuation", () => {
  assert.equal(normalize("For God so loved the world."), "for god so loved the world");
  assert.equal(normalize("\u00b6 For God so loved"), "for god so loved");
});

test("unique John 3:16 is exact", () => {
  const r = classify(
    "For God so loved the world, that he gave his only begotten Son",
    index
  );
  assert.equal(r.kind, "exact");
  assert.equal(r.best?.verse.book, "John");
  assert.equal(r.best?.verse.chapter, 3);
  assert.equal(r.best?.verse.verse, 16);
});

test("two close scores are choice", () => {
  const r = classify("Blessed is the man that walketh not in the counsel", index);
  assert.equal(r.kind, "choice");
  assert.ok(r.candidates.length >= 2);
});

test("short and garbage are none", () => {
  assert.equal(classify("hi", index).kind, "none");
  assert.equal(classify("qqqqxxxxzzzz yyyynnnn", index).kind, "none");
});

test("formatToken omits abbr when it matches default", () => {
  assert.equal(formatToken(john316, "KJV", "KJV"), "{John 3:16}");
  assert.equal(formatToken(john316, "BSB", "KJV"), "{John 3:16, BSB}");
});
