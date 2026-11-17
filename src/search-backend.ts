import type { IndexedVerse } from "./helloao";
import { classify, formatToken } from "./classifier";
import { API_URL_REJECTED_NOTICE, isAllowedApiUrl } from "./url-policy";
import { UnsafeRedirectError } from "./safe-request";

export interface SearchMatch {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  score: number;
  token: string;
}

export interface SearchResult {
  translation: string;
  abbr: string;
  query: string;
  matches: SearchMatch[];
}

export interface SearchBackend {
  search(query: string, translationId: string, limit?: number): Promise<SearchResult>;
}

/** Same unique-strong rule as classify: top >= 0.88 and (no second, gap >= 0.08, or second < 0.8). */
export function decideKind(matches: SearchMatch[]): "exact" | "choice" | "none" {
  if (!matches.length) return "none";
  const top = matches[0];
  const second = matches[1];
  const uniqueStrong =
    top.score >= 0.88 && (!second || top.score - second.score >= 0.08 || second.score < 0.8);
  if (uniqueStrong) return "exact";
  return "choice";
}

export interface LocalCacheBackendOpts {
  loadIndex: (translationId: string) => Promise<IndexedVerse[]>;
  abbrFor: (translationId: string) => string;
  defaultAbbr: string;
}

export class LocalCacheBackend implements SearchBackend {
  constructor(private readonly opts: LocalCacheBackendOpts) {}

  async search(query: string, translationId: string, limit = 8): Promise<SearchResult> {
    const index = await this.opts.loadIndex(translationId);
    const abbr = this.opts.abbrFor(translationId);
    const result = classify(query, index, limit);
    const matches: SearchMatch[] = result.candidates.map((c) => ({
      book: c.verse.book,
      chapter: c.verse.chapter,
      verse: c.verse.verse,
      text: c.verse.text,
      score: c.score,
      token: formatToken(c.verse, abbr, this.opts.defaultAbbr),
    }));
    return {
      translation: translationId,
      abbr,
      query,
      matches,
    };
  }
}

export type RequestFn = (url: string) => Promise<{ status: number; json: unknown }>;

export class HttpSearchBackend implements SearchBackend {
  constructor(
    private readonly baseUrl: string,
    private readonly requestFn: RequestFn
  ) {}

  async search(query: string, translationId: string, limit = 8): Promise<SearchResult> {
    if (!isAllowedApiUrl(this.baseUrl)) {
      throw new Error(API_URL_REJECTED_NOTICE);
    }
    const base = this.baseUrl.trim().replace(/\/+$/, "");
    const url =
      `${base}/search?q=${encodeURIComponent(query)}` +
      `&translation=${encodeURIComponent(translationId)}` +
      `&limit=${limit}`;
    const res = await this.requestFn(url);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Search API ${res.status}`);
    }
    return parseSearchResponse(res.json, query);
  }
}

function isSearchMatch(m: unknown): m is SearchMatch {
  if (!m || typeof m !== "object") return false;
  const row = m as Record<string, unknown>;
  return (
    typeof row.book === "string" &&
    typeof row.chapter === "number" &&
    typeof row.verse === "number" &&
    typeof row.text === "string" &&
    typeof row.score === "number" &&
    typeof row.token === "string"
  );
}

/** Brace reference only, e.g. {John 3:16}, {1 John 1:9-10}, {Psalm 23:1, KJV}. */
const TOKEN_RE = /^\{[1-3]? ?[A-Za-z][A-Za-z .]{0,39} \d{1,3}:\d{1,3}(-\d{1,3})?(, ?[A-Z0-9_]{1,16})?\}$/;
/** Short plain book name, e.g. John, 1 Samuel, Song of Solomon. */
const BOOK_RE = /^[1-3]? ?[A-Za-z][A-Za-z .]{0,39}$/;
/** Translation abbreviation, e.g. KJV, BSB. */
const ABBR_RE = /^[A-Za-z0-9_]{1,16}$/;

function isRefNumber(n: number): boolean {
  return Number.isInteger(n) && n > 0 && n < 1000;
}

/** Content checks for a Custom API match; anything that fails is dropped. */
export function isSafeMatch(m: SearchMatch): boolean {
  return (
    m.token.length <= 64 &&
    TOKEN_RE.test(m.token) &&
    BOOK_RE.test(m.book) &&
    isRefNumber(m.chapter) &&
    isRefNumber(m.verse) &&
    Number.isFinite(m.score) &&
    m.text.length <= 4000
  );
}

export function parseSearchResponse(json: unknown, fallbackQuery: string): SearchResult {
  if (!json || typeof json !== "object") {
    throw new Error("Search API: invalid JSON");
  }
  const o = json as Record<string, unknown>;
  if (!Array.isArray(o.matches)) {
    throw new Error("Search API: missing matches");
  }
  const matches: SearchMatch[] = [];
  for (const m of o.matches) {
    if (!isSearchMatch(m)) {
      throw new Error("Search API: bad match shape");
    }
    if (!isSafeMatch(m)) continue;
    matches.push({
      book: m.book,
      chapter: m.chapter,
      verse: m.verse,
      text: m.text,
      score: m.score,
      token: m.token,
    });
  }
  return {
    translation: typeof o.translation === "string" ? o.translation : "",
    abbr: typeof o.abbr === "string" && ABBR_RE.test(o.abbr) ? o.abbr : "",
    query: typeof o.query === "string" ? o.query : fallbackQuery,
    matches,
  };
}

/**
 * Uses `primary` until it fails once, then `fallback` for the rest of the run.
 * Shows one notice: the redirect refusal message, or a generic failure.
 */
export class FallbackSearchBackend implements SearchBackend {
  private useFallback = false;
  private noticed = false;

  constructor(
    private readonly primary: SearchBackend,
    private readonly fallback: SearchBackend,
    private readonly notify: (msg: string) => void
  ) {}

  async search(query: string, translationId: string, limit?: number): Promise<SearchResult> {
    if (this.useFallback) return this.fallback.search(query, translationId, limit);
    try {
      return await this.primary.search(query, translationId, limit);
    } catch (e) {
      this.useFallback = true;
      if (!this.noticed) {
        this.noticed = true;
        this.notify(e instanceof UnsafeRedirectError ? e.message : "Custom API failed; using local cache.");
      }
      return this.fallback.search(query, translationId, limit);
    }
  }
}