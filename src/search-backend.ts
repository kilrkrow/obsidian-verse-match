import type { IndexedVerse } from "./helloao";
import { classify, formatToken } from "./classifier";

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
    const base = this.baseUrl.replace(/\/+$/, "");
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
    abbr: typeof o.abbr === "string" ? o.abbr : "",
    query: typeof o.query === "string" ? o.query : fallbackQuery,
    matches,
  };
}
