import { test } from "node:test";
import assert from "node:assert/strict";
import { API_URL_REJECTED_NOTICE, apiUrlValidationMessage, isAllowedApiUrl, validateApiUrlSetting } from "./url-policy";

test("isAllowedApiUrl accepts https and local http only", () => {
  assert.equal(isAllowedApiUrl("https://verseapi.org"), true);
  assert.equal(isAllowedApiUrl("  https://verseapi.org/v1/  "), true);
  assert.equal(isAllowedApiUrl("http://localhost:8787"), true);
  assert.equal(isAllowedApiUrl("http://127.0.0.1:8787/api"), true);

  assert.equal(isAllowedApiUrl("http://example.com"), false);
  assert.equal(isAllowedApiUrl("HTTP://EXAMPLE.COM"), false);
  assert.equal(isAllowedApiUrl("http://localhost.example.com"), false);
  assert.equal(isAllowedApiUrl("http://127.0.0.1.example.com"), false);
  assert.equal(isAllowedApiUrl("http://localhost@example.com"), false);
  assert.equal(isAllowedApiUrl("http://127.0.0.1@example.com"), false);
  assert.equal(isAllowedApiUrl("ftp://verseapi.org"), false);
  assert.equal(isAllowedApiUrl("file:///C:/x.json"), false);
  assert.equal(isAllowedApiUrl("verseapi.org"), false);
  assert.equal(isAllowedApiUrl(""), false);
});

test("validateApiUrlSetting refuses http://example.com with a notice", () => {
  const notices: string[] = [];
  const r = validateApiUrlSetting("http://example.com", (m) => notices.push(m));
  assert.equal(r, null);
  assert.deepEqual(notices, [API_URL_REJECTED_NOTICE]);
});

test("validateApiUrlSetting saves https and empty without a notice", () => {
  const notices: string[] = [];
  assert.equal(validateApiUrlSetting(" https://verseapi.org ", (m) => notices.push(m)), "https://verseapi.org");
  assert.equal(validateApiUrlSetting("", (m) => notices.push(m)), "");
  assert.equal(notices.length, 0);
});
test("apiUrlValidationMessage flags http://example.com only", () => {
  assert.equal(apiUrlValidationMessage("http://example.com"), API_URL_REJECTED_NOTICE);
  assert.equal(apiUrlValidationMessage("https://verseapi.org"), undefined);
  assert.equal(apiUrlValidationMessage("http://localhost:8787"), undefined);
  assert.equal(apiUrlValidationMessage(""), undefined);
});